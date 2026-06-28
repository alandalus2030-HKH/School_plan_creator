-- ════════════════════════════════════════════════════════════════
-- 062 — سجل التدقيق: إغلاق الثغرات الحوكمية المتبقّية
-- ════════════════════════════════════════════════════════════════
-- بيانات حوكمية كانت تُحرَّر من المتصفح بلا تدقيق. هذا الترحيل (الإصدار
-- النهائي من audit_row_change) يضيف استنتاج school_id ويربط المُحفِّز بـ:
--   kpis · kpi_readings · subtasks · evidence_links · task_locations · qnsa_standards
-- (qnsa_standards تملك school_id مباشرةً للبنود المخصّصة.)
--
-- يبقى خارج التدقيق عمداً: audit_logs/task_transitions (سجلات بذاتها) ·
-- notifications/plan_metric_snapshots (تشغيلي آلي) · task_comments (نقاش —
-- قرار تصميمي) · school_groups/user_badges (مُغطّاة عبر طبقة API).
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION audit_row_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_old jsonb; v_new jsonb; v_rec text; v_school uuid; v_row jsonb;
BEGIN
  IF v_actor IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD); v_new := NULL; v_rec := to_jsonb(OLD)->>'id';
  ELSIF TG_OP = 'INSERT' THEN
    v_old := NULL; v_new := to_jsonb(NEW); v_rec := to_jsonb(NEW)->>'id';
  ELSE
    v_rec := to_jsonb(NEW)->>'id';
    SELECT jsonb_object_agg(k, to_jsonb(OLD)->k), jsonb_object_agg(k, to_jsonb(NEW)->k)
      INTO v_old, v_new
      FROM jsonb_object_keys(to_jsonb(NEW)) k
      WHERE to_jsonb(OLD)->k IS DISTINCT FROM to_jsonb(NEW)->k AND k NOT IN ('updated_at');
    IF v_old IS NULL THEN RETURN NEW; END IF;
  END IF;

  v_row := to_jsonb(COALESCE(NEW, OLD));
  v_school := NULLIF(COALESCE(v_row->>'school_id', ''), '')::uuid;

  IF v_school IS NULL THEN
    CASE TG_TABLE_NAME
      WHEN 'tasks' THEN
        SELECT p.school_id INTO v_school FROM plan_nodes n JOIN plans p ON p.id = n.plan_id WHERE n.id = NULLIF(v_row->>'node_id','')::uuid;
      WHEN 'plan_nodes' THEN
        SELECT school_id INTO v_school FROM plans WHERE id = NULLIF(v_row->>'plan_id','')::uuid;
      WHEN 'evidence' THEN
        SELECT p.school_id INTO v_school FROM tasks t JOIN plan_nodes n ON n.id = t.node_id JOIN plans p ON p.id = n.plan_id WHERE t.id = NULLIF(v_row->>'task_id','')::uuid;
      WHEN 'evidence_files' THEN
        SELECT p.school_id INTO v_school FROM evidence e JOIN tasks t ON t.id = e.task_id JOIN plan_nodes n ON n.id = t.node_id JOIN plans p ON p.id = n.plan_id WHERE e.id = NULLIF(v_row->>'evidence_id','')::uuid;
      WHEN 'evidence_links' THEN
        SELECT p.school_id INTO v_school FROM tasks t JOIN plan_nodes n ON n.id = t.node_id JOIN plans p ON p.id = n.plan_id WHERE t.id = NULLIF(v_row->>'task_id','')::uuid;
      WHEN 'team_members' THEN
        SELECT school_id INTO v_school FROM teams WHERE id = NULLIF(v_row->>'team_id','')::uuid;
      WHEN 'meeting_attendees' THEN
        SELECT school_id INTO v_school FROM meetings WHERE id = NULLIF(v_row->>'meeting_id','')::uuid;
      WHEN 'meeting_notes' THEN
        SELECT school_id INTO v_school FROM meetings WHERE id = NULLIF(v_row->>'meeting_id','')::uuid;
      WHEN 'subtasks' THEN
        SELECT p.school_id INTO v_school FROM tasks t JOIN plan_nodes n ON n.id = t.node_id JOIN plans p ON p.id = n.plan_id WHERE t.id = NULLIF(v_row->>'task_id','')::uuid;
      WHEN 'task_locations' THEN
        SELECT p.school_id INTO v_school FROM tasks t JOIN plan_nodes n ON n.id = t.node_id JOIN plans p ON p.id = n.plan_id WHERE t.id = NULLIF(v_row->>'task_id','')::uuid;
      WHEN 'kpis' THEN
        SELECT p.school_id INTO v_school FROM plan_nodes n JOIN plans p ON p.id = n.plan_id WHERE n.id = NULLIF(v_row->>'node_id','')::uuid;
      WHEN 'kpi_readings' THEN
        SELECT p.school_id INTO v_school FROM kpis k JOIN plan_nodes n ON n.id = k.node_id JOIN plans p ON p.id = n.plan_id WHERE k.id = NULLIF(v_row->>'kpi_id','')::uuid;
      ELSE NULL;
    END CASE;
  END IF;

  INSERT INTO audit_logs(school_id, user_id, action, table_name, record_id, old_values, new_values)
  VALUES (v_school, v_actor, lower(TG_OP), TG_TABLE_NAME, v_rec, v_old, v_new);

  RETURN COALESCE(NEW, OLD);
END; $fn$;

DO $do$
DECLARE t text;
  tables text[] := ARRAY['kpis','kpi_readings','subtasks','evidence_links','task_locations','qnsa_standards'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS zz_audit ON %I', t);
      EXECUTE format('CREATE TRIGGER zz_audit AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_row_change()', t);
    END IF;
  END LOOP;
END; $do$;

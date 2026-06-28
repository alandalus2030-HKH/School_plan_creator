-- ════════════════════════════════════════════════════════════════
-- 060 — سجل التدقيق: استنتاج school_id للجداول الأبناء
-- ════════════════════════════════════════════════════════════════
-- جداول tasks/plan_nodes/evidence/evidence_files/team_members بلا عمود
-- school_id، فكان المُحفِّز يسجّلها school_id=null فيُخفيها العارض المحصور
-- بالمدرسة. الإصلاح: استنتاج المدرسة عبر سلسلة الأب.
-- (مُحدَّث لاحقاً في 061 و062 — هذا الملف يوثّق الإصدار الأول من الاستنتاج.)
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
        SELECT p.school_id INTO v_school FROM plan_nodes n JOIN plans p ON p.id = n.plan_id
          WHERE n.id = NULLIF(v_row->>'node_id','')::uuid;
      WHEN 'plan_nodes' THEN
        SELECT school_id INTO v_school FROM plans WHERE id = NULLIF(v_row->>'plan_id','')::uuid;
      WHEN 'evidence' THEN
        SELECT p.school_id INTO v_school FROM tasks t JOIN plan_nodes n ON n.id = t.node_id JOIN plans p ON p.id = n.plan_id
          WHERE t.id = NULLIF(v_row->>'task_id','')::uuid;
      WHEN 'evidence_files' THEN
        SELECT p.school_id INTO v_school FROM evidence e JOIN tasks t ON t.id = e.task_id JOIN plan_nodes n ON n.id = t.node_id JOIN plans p ON p.id = n.plan_id
          WHERE e.id = NULLIF(v_row->>'evidence_id','')::uuid;
      WHEN 'team_members' THEN
        SELECT school_id INTO v_school FROM teams WHERE id = NULLIF(v_row->>'team_id','')::uuid;
      ELSE NULL;
    END CASE;
  END IF;

  INSERT INTO audit_logs(school_id, user_id, action, table_name, record_id, old_values, new_values)
  VALUES (v_school, v_actor, lower(TG_OP), TG_TABLE_NAME, v_rec, v_old, v_new);

  RETURN COALESCE(NEW, OLD);
END; $fn$;

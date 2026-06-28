-- ════════════════════════════════════════════════════════════════
-- 059 — سجل تدقيق شامل: مُحفِّزات قاعدة + أعمدة IP/الجهاز
-- ════════════════════════════════════════════════════════════════
-- الطبقة 1 (هذا الترحيل): مُحفِّز عام يلتقط كل كتابة مباشرة من المتصفح
--   (INSERT/UPDATE/DELETE) على الجداول الحسّاسة، مع الفاعل (auth.uid())
--   والأعمدة المتغيّرة فقط (قبل/بعد). يتجاهل الكتابة الخادمية (auth.uid()=NULL)
--   لأنها تُسجَّل من طبقة الـAPI مع IP والجهاز (lib/audit.ts).
-- الطبقة 2 (الكود): مساعد recordAudit في نقاط الـAPI.
-- ════════════════════════════════════════════════════════════════

-- (1) أعمدة «من أين»
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_created  ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user     ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_table    ON audit_logs (table_name);
CREATE INDEX IF NOT EXISTS idx_audit_school   ON audit_logs (school_id);

-- (2) دالة المُحفِّز العامة
CREATE OR REPLACE FUNCTION audit_row_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_old jsonb; v_new jsonb; v_rec text; v_school uuid;
BEGIN
  -- نسجّل فقط كتابة المستخدم المباشرة؛ الخادمي (service role) يُسجَّل من الـAPI
  IF v_actor IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD); v_new := NULL; v_rec := to_jsonb(OLD)->>'id';
  ELSIF TG_OP = 'INSERT' THEN
    v_old := NULL; v_new := to_jsonb(NEW); v_rec := to_jsonb(NEW)->>'id';
  ELSE  -- UPDATE: الأعمدة المتغيّرة فقط
    v_rec := to_jsonb(NEW)->>'id';
    SELECT jsonb_object_agg(k, to_jsonb(OLD)->k), jsonb_object_agg(k, to_jsonb(NEW)->k)
      INTO v_old, v_new
      FROM jsonb_object_keys(to_jsonb(NEW)) k
      WHERE to_jsonb(OLD)->k IS DISTINCT FROM to_jsonb(NEW)->k
        AND k NOT IN ('updated_at');
    IF v_old IS NULL THEN RETURN NEW; END IF;   -- لا تغيير فعلي
  END IF;

  v_school := NULLIF(COALESCE(to_jsonb(COALESCE(NEW, OLD))->>'school_id', ''), '')::uuid;

  INSERT INTO audit_logs(school_id, user_id, action, table_name, record_id, old_values, new_values)
  VALUES (v_school, v_actor, lower(TG_OP), TG_TABLE_NAME, v_rec, v_old, v_new);

  RETURN COALESCE(NEW, OLD);
END; $fn$;

-- (3) ربط المُحفِّز بالجداول الحسّاسة
DO $do$
DECLARE t text;
  tables text[] := ARRAY[
    'profiles','plans','plan_nodes','tasks','evidence','evidence_files',
    'roles','schools','teams','team_members','department_supervisors',
    'dropdown_options','school_calendar','school_locations','badges','motivational_quotes'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS zz_audit ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER zz_audit AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_row_change()', t);
  END LOOP;
END; $do$;

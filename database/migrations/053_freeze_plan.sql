-- ============================================================
-- الترحيل 053: تجميد الخطة (منع كل تعديل)
-- ============================================================
-- التاريخ: 2026-06-24
-- الفكرة: عمود frozen_at على plans. عند التجميد تُقفل الخطة بالكامل —
--   لا تعديل/إضافة/حذف على عناصرها (المحاور/الأهداف/المهام/المؤشرات/
--   القراءات/الأدلة). الفرض في القاعدة عبر triggers ليغطي كل المسارات
--   (عميلية مباشرة + API). إلغاء التجميد يعيد فتحها.
-- التجميد مستقل عن الاعتماد، وله صلاحية freeze_plans.
-- ملاحظة: شُغِّل عبر Supabase MCP بتاريخه — هذا الملف للتوثيق/التزامن.
-- ============================================================

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS frozen_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN plans.frozen_at IS 'وقت تجميد الخطة — NULL = غير مجمّدة. المجمّدة لا تقبل أي تعديل.';

-- دالة فحص التجميد (SECURITY DEFINER لتجاوز RLS داخل الـ trigger)
CREATE OR REPLACE FUNCTION is_plan_frozen(p_plan_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM plans WHERE id = p_plan_id AND frozen_at IS NOT NULL);
$$;

-- ── plans: امنع تعديل المحتوى أثناء التجميد، واسمح بالتجميد/إلغائه ──
CREATE OR REPLACE FUNCTION trg_freeze_plans() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.frozen_at IS NOT NULL AND NEW.frozen_at IS NOT NULL THEN
    RAISE EXCEPTION 'الخطة مجمّدة — ألغِ التجميد أولاً للتعديل';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS freeze_guard_plans ON plans;
CREATE TRIGGER freeze_guard_plans BEFORE UPDATE ON plans
  FOR EACH ROW EXECUTE FUNCTION trg_freeze_plans();

-- ── plan_nodes ──
CREATE OR REPLACE FUNCTION trg_freeze_plan_nodes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF is_plan_frozen(COALESCE(NEW.plan_id, OLD.plan_id)) THEN
    RAISE EXCEPTION 'الخطة مجمّدة — لا يمكن تعديل عناصرها';
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
DROP TRIGGER IF EXISTS freeze_guard_plan_nodes ON plan_nodes;
CREATE TRIGGER freeze_guard_plan_nodes BEFORE INSERT OR UPDATE OR DELETE ON plan_nodes
  FOR EACH ROW EXECUTE FUNCTION trg_freeze_plan_nodes();

-- ── tasks (عبر node_id → plan) ──
CREATE OR REPLACE FUNCTION trg_freeze_tasks() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE pid uuid;
BEGIN
  SELECT plan_id INTO pid FROM plan_nodes WHERE id = COALESCE(NEW.node_id, OLD.node_id);
  IF is_plan_frozen(pid) THEN
    RAISE EXCEPTION 'الخطة مجمّدة — لا يمكن تعديل مهامها';
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
DROP TRIGGER IF EXISTS freeze_guard_tasks ON tasks;
CREATE TRIGGER freeze_guard_tasks BEFORE INSERT OR UPDATE OR DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION trg_freeze_tasks();

-- ── kpis (عبر node_id → plan) ──
CREATE OR REPLACE FUNCTION trg_freeze_kpis() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE pid uuid;
BEGIN
  SELECT plan_id INTO pid FROM plan_nodes WHERE id = COALESCE(NEW.node_id, OLD.node_id);
  IF is_plan_frozen(pid) THEN
    RAISE EXCEPTION 'الخطة مجمّدة — لا يمكن تعديل مؤشراتها';
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
DROP TRIGGER IF EXISTS freeze_guard_kpis ON kpis;
CREATE TRIGGER freeze_guard_kpis BEFORE INSERT OR UPDATE OR DELETE ON kpis
  FOR EACH ROW EXECUTE FUNCTION trg_freeze_kpis();

-- ── kpi_readings (عبر kpi_id → node → plan) ──
CREATE OR REPLACE FUNCTION trg_freeze_kpi_readings() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE pid uuid;
BEGIN
  SELECT n.plan_id INTO pid FROM kpis k JOIN plan_nodes n ON n.id = k.node_id
  WHERE k.id = COALESCE(NEW.kpi_id, OLD.kpi_id);
  IF is_plan_frozen(pid) THEN
    RAISE EXCEPTION 'الخطة مجمّدة — لا يمكن إضافة قراءات';
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
DROP TRIGGER IF EXISTS freeze_guard_kpi_readings ON kpi_readings;
CREATE TRIGGER freeze_guard_kpi_readings BEFORE INSERT OR UPDATE OR DELETE ON kpi_readings
  FOR EACH ROW EXECUTE FUNCTION trg_freeze_kpi_readings();

-- ── evidence (عبر task_id → node → plan) ──
CREATE OR REPLACE FUNCTION trg_freeze_evidence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE pid uuid;
BEGIN
  SELECT n.plan_id INTO pid FROM tasks t JOIN plan_nodes n ON n.id = t.node_id
  WHERE t.id = COALESCE(NEW.task_id, OLD.task_id);
  IF is_plan_frozen(pid) THEN
    RAISE EXCEPTION 'الخطة مجمّدة — لا يمكن تعديل أدلتها';
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
DROP TRIGGER IF EXISTS freeze_guard_evidence ON evidence;
CREATE TRIGGER freeze_guard_evidence BEFORE INSERT OR UPDATE OR DELETE ON evidence
  FOR EACH ROW EXECUTE FUNCTION trg_freeze_evidence();

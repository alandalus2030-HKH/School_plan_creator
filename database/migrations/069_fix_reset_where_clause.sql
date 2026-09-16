-- ════════════════════════════════════════════════════════════════
-- 069 — إصلاح دالّة «إعادة تهيئة ما قبل الإطلاق»
-- ════════════════════════════════════════════════════════════════
-- العطل: admin_reset_tenants (الترحيل 058) تحذف الجداول بلا WHERE، وحارس
--   pg_safeupdate في Supabase يرفض الحذف الشامل برسالة:
--     «DELETE requires a WHERE clause»
--   فتُخفق الأداة كلّها. (admin_purge_school تعمل لأن حذفها مشروط بالمدرسة.)
--   العلاج: WHERE true صراحةً — نيّةُ الحذف الشامل معلنة لا مُتوهَّمة.
--
-- وعطل ثانٍ اكتُشف معه: الدالّة تعمل في session_replication_role='replica'،
--   وهذا يوقف المشغّلات **وقيود المفاتيح الأجنبية**، فلا يحدث حذفٌ بالتتالي.
--   فأُضيف plan_node_indicators (الترحيل 068) إلى قائمة الحذف صراحةً، وإلا
--   بقيت فيه صفوف يتيمة بعد المسح. ويُحذف بشرط وجوده حتى يظلّ 069 قابلاً
--   للتشغيل قبل 068 أو بعده.
--
-- ما يبقى كما كان: البذور (الأدوار العامة، قوائم قطر)، وكتالوج qnsa_standards،
--   وجداول الإطار 063–067 كلّها — الدالّة تمسح بيانات المستأجرين لا الكتالوجات.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION admin_reset_tenants(p_keep uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_ids uuid[];
BEGIN
  SET LOCAL session_replication_role = 'replica';

  SELECT array_agg(id) INTO v_ids FROM profiles WHERE id <> p_keep;  v_ids := COALESCE(v_ids,'{}'::uuid[]);

  UPDATE profiles SET school_id = NULL, active_school_id = NULL WHERE id = p_keep;

  -- الوصلة بين عقد الخطط ومؤشرات الإطار (068): لا تتالي في وضع replica
  IF to_regclass('public.plan_node_indicators') IS NOT NULL THEN
    EXECUTE 'DELETE FROM plan_node_indicators WHERE true';
  END IF;

  DELETE FROM evidence_files WHERE true; DELETE FROM evidence_links WHERE true; DELETE FROM evidence WHERE true;
  DELETE FROM task_comments  WHERE true; DELETE FROM task_transitions WHERE true;
  DELETE FROM task_locations WHERE true; DELETE FROM subtasks WHERE true;
  DELETE FROM kpi_readings   WHERE true; DELETE FROM kpis WHERE true;
  DELETE FROM plan_metric_snapshots WHERE true;
  DELETE FROM tasks WHERE true; DELETE FROM plan_nodes WHERE true; DELETE FROM plans WHERE true;
  DELETE FROM meeting_attendees WHERE true; DELETE FROM meetings WHERE true; DELETE FROM group_meetings WHERE true;
  DELETE FROM team_members WHERE true; DELETE FROM teams WHERE true;
  DELETE FROM user_badges WHERE true; DELETE FROM badges WHERE true;
  DELETE FROM department_supervisors WHERE true;
  DELETE FROM school_calendar WHERE true; DELETE FROM school_locations WHERE true;
  DELETE FROM motivational_quotes WHERE true;
  DELETE FROM notifications WHERE true;
  DELETE FROM audit_logs WHERE true;
  DELETE FROM roles WHERE school_id IS NOT NULL;     -- أبقِ الأدوار العامة (البذرة)
  DELETE FROM profiles WHERE id <> p_keep;
  DELETE FROM schools WHERE true;

  RETURN QUERY SELECT unnest(v_ids);
END; $$;

-- الصلاحيات تبقى كما ثبّتها 058 (CREATE OR REPLACE لا يمسّها): service_role وحده.

-- ════ التحقق ════
SELECT 'حذفٌ بلا WHERE في الدالّة' AS البند,
       CASE WHEN prosrc ~ 'DELETE FROM [a-z_]+\s*;' THEN '✗ باقٍ' ELSE 'لا شيء' END AS الحالة
  FROM pg_proc WHERE proname = 'admin_reset_tenants'
UNION ALL
SELECT 'حذف plan_node_indicators مذكور',
       CASE WHEN prosrc LIKE '%plan_node_indicators%' THEN 'نعم' ELSE '✗ مفقود' END
  FROM pg_proc WHERE proname = 'admin_reset_tenants'
UNION ALL
SELECT 'صلاحية التنفيذ لـ service_role',
       CASE WHEN has_function_privilege('service_role', 'admin_reset_tenants(uuid)', 'EXECUTE')
            THEN 'موجودة' ELSE '✗ مفقودة' END;
-- المتوقّع: لا شيء · نعم · موجودة

-- ════════════════════════════════════════════════════════════════
-- 058 — دوال الأدوات الإشرافية المدمّرة (حذف مدرسة قسري + إعادة تهيئة)
-- ════════════════════════════════════════════════════════════════
-- دالتان SECURITY DEFINER تُستدعيان حصراً من APIs خادمية (service role)
-- بعد حارس is_super_admin. كلتاهما:
--   • تستخدم session_replication_role='replica' داخل المعاملة → تعطّل كل
--     المحفّزات (تجميد الخطط/الأدلة…) وفرض قيود FK، فيتمّ الحذف بأي ترتيب
--     دون اصطدام بحُرّاس الحماية. (مؤكَّد أن service_role يستطيع ذلك عبر
--     SECURITY DEFINER.)
--   • تُفرّغ مراجع المستخدمين المحذوفين في صفوف المدارس الأخرى (سلامة مرجعية)
--     قبل حذف الملفات، فلا تبقى مفاتيح أجنبية معلّقة بعد المعاملة.
--   • تُعيد معرّفات المستخدمين المحذوفين ليحذف الـAPI حساباتهم في auth.users.
--
-- الصلاحيات: تُسحب من public/anon/authenticated وتُمنح لـservice_role فقط —
-- فلا يستطيع أي مستخدم متصفّح استدعاءها عبر rpc.
-- ════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- (1) حذف مدرسة واحدة قسرياً (بكل مستخدميها وبياناتها)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_purge_school(p_school uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_ids uuid[]; v_plans uuid[]; v_nodes uuid[]; v_tasks uuid[];
  v_teams uuid[]; v_meetings uuid[]; v_badges uuid[];
BEGIN
  SET LOCAL session_replication_role = 'replica';   -- تعطيل المحفّزات + فرض FK داخل المعاملة

  -- احسب كل المعرّفات أولاً (قبل أي حذف)
  SELECT array_agg(id) INTO v_ids      FROM profiles   WHERE school_id = p_school;   v_ids      := COALESCE(v_ids,      '{}'::uuid[]);
  SELECT array_agg(id) INTO v_plans    FROM plans      WHERE school_id = p_school;   v_plans    := COALESCE(v_plans,    '{}'::uuid[]);
  SELECT array_agg(id) INTO v_nodes    FROM plan_nodes WHERE plan_id  = ANY(v_plans); v_nodes   := COALESCE(v_nodes,    '{}'::uuid[]);
  SELECT array_agg(id) INTO v_tasks    FROM tasks      WHERE node_id  = ANY(v_nodes); v_tasks   := COALESCE(v_tasks,    '{}'::uuid[]);
  SELECT array_agg(id) INTO v_teams    FROM teams      WHERE school_id = p_school;   v_teams    := COALESCE(v_teams,    '{}'::uuid[]);
  SELECT array_agg(id) INTO v_meetings FROM meetings   WHERE school_id = p_school;   v_meetings := COALESCE(v_meetings, '{}'::uuid[]);
  SELECT array_agg(id) INTO v_badges   FROM badges     WHERE school_id = p_school;   v_badges   := COALESCE(v_badges,   '{}'::uuid[]);

  -- فرّغ مراجع المستخدمين المحذوفين في صفوف المدارس الأخرى (تبقى سليمة)
  UPDATE tasks SET reviewer_id=NULL          WHERE reviewer_id=ANY(v_ids)          AND NOT(id=ANY(v_tasks));
  UPDATE tasks SET created_by=NULL           WHERE created_by=ANY(v_ids)           AND NOT(id=ANY(v_tasks));
  UPDATE tasks SET updated_by=NULL           WHERE updated_by=ANY(v_ids)           AND NOT(id=ANY(v_tasks));
  UPDATE tasks SET assigned_to_user_id=NULL  WHERE assigned_to_user_id=ANY(v_ids)  AND NOT(id=ANY(v_tasks));
  UPDATE plans SET owner_id=NULL, created_by=NULL, updated_by=NULL, frozen_by=NULL, approved_by=NULL
        WHERE (owner_id=ANY(v_ids) OR created_by=ANY(v_ids) OR updated_by=ANY(v_ids) OR frozen_by=ANY(v_ids) OR approved_by=ANY(v_ids))
          AND NOT(id=ANY(v_plans));
  UPDATE subtasks SET assignee_id=NULL WHERE assignee_id=ANY(v_ids);
  UPDATE subtasks SET created_by=NULL  WHERE created_by=ANY(v_ids);
  UPDATE teams    SET leader_id=NULL   WHERE leader_id=ANY(v_ids)   AND NOT(id=ANY(v_teams));
  UPDATE evidence SET uploaded_by=NULL WHERE uploaded_by=ANY(v_ids);
  UPDATE meetings SET created_by=NULL  WHERE created_by=ANY(v_ids)  AND NOT(id=ANY(v_meetings));
  UPDATE meetings SET task_id=NULL     WHERE task_id=ANY(v_tasks)   AND NOT(id=ANY(v_meetings));
  UPDATE group_meetings SET created_by=NULL WHERE created_by=ANY(v_ids);
  UPDATE user_badges    SET granted_by=NULL WHERE granted_by=ANY(v_ids);

  -- احذف بيانات المدرسة وبصمة مستخدميها (الترتيب غير مهم تحت replica)
  DELETE FROM evidence_files WHERE evidence_id IN (SELECT id FROM evidence WHERE task_id=ANY(v_tasks));
  DELETE FROM evidence_links WHERE evidence_id IN (SELECT id FROM evidence WHERE task_id=ANY(v_tasks));
  DELETE FROM evidence       WHERE task_id=ANY(v_tasks);
  DELETE FROM task_comments  WHERE task_id=ANY(v_tasks) OR author_id=ANY(v_ids);
  DELETE FROM task_transitions WHERE task_id=ANY(v_tasks);
  DELETE FROM task_locations WHERE task_id=ANY(v_tasks);
  DELETE FROM subtasks       WHERE task_id=ANY(v_tasks);
  DELETE FROM kpi_readings   WHERE kpi_id IN (SELECT id FROM kpis WHERE node_id=ANY(v_nodes));
  DELETE FROM kpis           WHERE node_id=ANY(v_nodes);
  DELETE FROM plan_metric_snapshots WHERE plan_id=ANY(v_plans);
  DELETE FROM tasks          WHERE id=ANY(v_tasks);
  DELETE FROM plan_nodes     WHERE plan_id=ANY(v_plans);
  DELETE FROM plans          WHERE id=ANY(v_plans);
  DELETE FROM meeting_attendees WHERE meeting_id=ANY(v_meetings) OR profile_id=ANY(v_ids);
  DELETE FROM meetings       WHERE id=ANY(v_meetings);
  DELETE FROM team_members   WHERE team_id=ANY(v_teams) OR profile_id=ANY(v_ids);
  DELETE FROM teams          WHERE id=ANY(v_teams);
  DELETE FROM user_badges    WHERE badge_id=ANY(v_badges) OR profile_id=ANY(v_ids);
  DELETE FROM badges         WHERE id=ANY(v_badges);
  DELETE FROM department_supervisors WHERE school_id=p_school OR user_id=ANY(v_ids);
  DELETE FROM school_calendar    WHERE school_id=p_school;
  DELETE FROM school_locations   WHERE school_id=p_school;
  DELETE FROM motivational_quotes WHERE school_id=p_school;
  DELETE FROM roles          WHERE school_id=p_school;
  DELETE FROM group_meetings WHERE created_by=ANY(v_ids);
  DELETE FROM notifications  WHERE recipient_id=ANY(v_ids) OR sender_id=ANY(v_ids) OR team_id=ANY(v_teams);
  DELETE FROM audit_logs     WHERE user_id=ANY(v_ids) OR school_id=p_school;
  DELETE FROM profiles       WHERE id=ANY(v_ids);
  DELETE FROM schools        WHERE id=p_school;

  RETURN QUERY SELECT unnest(v_ids);
END; $$;

-- ─────────────────────────────────────────────────────────────────
-- (2) إعادة تهيئة كاملة قبل الإطلاق — حذف كل المستأجرين، إبقاء البذور
--     والمشرف p_keep وحده. (البذور: roles العامة · dropdown_options ·
--     qnsa_standards · school_groups — لا تُمَس.)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_reset_tenants(p_keep uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_ids uuid[];
BEGIN
  SET LOCAL session_replication_role = 'replica';

  SELECT array_agg(id) INTO v_ids FROM profiles WHERE id <> p_keep;  v_ids := COALESCE(v_ids,'{}'::uuid[]);

  UPDATE profiles SET school_id = NULL, active_school_id = NULL WHERE id = p_keep;

  DELETE FROM evidence_files; DELETE FROM evidence_links; DELETE FROM evidence;
  DELETE FROM task_comments;  DELETE FROM task_transitions; DELETE FROM task_locations; DELETE FROM subtasks;
  DELETE FROM kpi_readings;   DELETE FROM kpis;
  DELETE FROM plan_metric_snapshots; DELETE FROM tasks; DELETE FROM plan_nodes; DELETE FROM plans;
  DELETE FROM meeting_attendees; DELETE FROM meetings; DELETE FROM group_meetings;
  DELETE FROM team_members; DELETE FROM teams;
  DELETE FROM user_badges; DELETE FROM badges;
  DELETE FROM department_supervisors;
  DELETE FROM school_calendar; DELETE FROM school_locations; DELETE FROM motivational_quotes;
  DELETE FROM notifications;
  DELETE FROM audit_logs;
  DELETE FROM roles WHERE school_id IS NOT NULL;     -- أبقِ الأدوار العامة (البذرة)
  DELETE FROM profiles WHERE id <> p_keep;
  DELETE FROM schools;

  RETURN QUERY SELECT unnest(v_ids);
END; $$;

-- ── الصلاحيات: لخدمة الـAPI فقط ──
REVOKE ALL ON FUNCTION admin_purge_school(uuid)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION admin_reset_tenants(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_purge_school(uuid)  TO service_role;
GRANT EXECUTE ON FUNCTION admin_reset_tenants(uuid) TO service_role;

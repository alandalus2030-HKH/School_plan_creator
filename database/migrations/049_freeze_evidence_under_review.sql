-- 049_freeze_evidence_under_review.sql
-- تجميد الأدلة أثناء المراجعة: منع الإضافة/التعديل/الحذف من العميل عندما تكون
-- المهمة مرفوعة للتقييم (submitted) أو منجزة (completed).
-- المقيّم يعتمد/يرفض الدليل عبر API خادمي (service role) فلا يتأثّر بهذه السياسات.
-- (يوسّع الشرط القائم t.status <> 'completed' ليشمل submitted.)

alter policy evidence_school_insert on public.evidence
  with check (
    has_permission('manage_evidence') and exists (
      select 1 from tasks t join plan_nodes pn on pn.id = t.node_id join plans p on p.id = pn.plan_id
      where t.id = evidence.task_id and p.school_id = my_school_id()
        and t.status not in ('completed','submitted')
    )
  );

alter policy evidence_school_update on public.evidence
  using (
    has_permission('manage_evidence') and status <> 'accepted' and exists (
      select 1 from tasks t join plan_nodes pn on pn.id = t.node_id join plans p on p.id = pn.plan_id
      where t.id = evidence.task_id and p.school_id = my_school_id()
        and t.status not in ('completed','submitted')
    )
  )
  with check (
    has_permission('manage_evidence') and exists (
      select 1 from tasks t join plan_nodes pn on pn.id = t.node_id join plans p on p.id = pn.plan_id
      where t.id = evidence.task_id and p.school_id = my_school_id()
        and t.status not in ('completed','submitted')
    )
  );

alter policy evidence_school_delete on public.evidence
  using (
    has_permission('manage_evidence') and status <> 'accepted' and exists (
      select 1 from tasks t join plan_nodes pn on pn.id = t.node_id join plans p on p.id = pn.plan_id
      where t.id = evidence.task_id and p.school_id = my_school_id()
        and t.status not in ('completed','submitted')
    )
  );

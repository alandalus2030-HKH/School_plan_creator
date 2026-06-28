import { createAdminClient } from '@/lib/supabase/admin'

/**
 * تسجيل تدقيق خادمي (الطبقة 2) — للعمليات التي تمرّ عبر API بصلاحية الخادم
 * (لا يلتقطها مُحفِّز القاعدة لأن auth.uid() فارغ). يلتقط الفاعل + IP + الجهاز.
 * صامت تماماً: لا يُوقف العملية الأساسية عند الفشل.
 */
export async function recordAudit(opts: {
  req?: Request
  userId: string
  schoolId?: string | null
  action: string
  table?: string | null
  recordId?: string | null
  before?: any
  after?: any
}) {
  try {
    const admin = createAdminClient()
    let ip: string | null = null
    let ua: string | null = null
    if (opts.req) {
      const fwd = opts.req.headers.get('x-forwarded-for') || ''
      ip = fwd.split(',')[0].trim() || opts.req.headers.get('x-real-ip') || null
      ua = opts.req.headers.get('user-agent')
    }
    await admin.from('audit_logs').insert({
      user_id:    opts.userId,
      school_id:  opts.schoolId ?? null,
      action:     opts.action,
      table_name: opts.table ?? null,
      record_id:  opts.recordId ?? null,
      old_values: opts.before ?? null,
      new_values: opts.after ?? null,
      ip_address: ip,
      user_agent: ua,
    })
  } catch {
    /* تجاهل أخطاء التسجيل */
  }
}

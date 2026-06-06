import { createClient } from '@supabase/supabase-js'

/**
 * عميل Supabase بصلاحيات الخادم (Service Role)
 * يتجاوز RLS — للاستخدام في API routes و Cron jobs فقط
 * ⚠️ لا يُستخدم أبداً في كود العميل (client)
 */
export function createAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY غير مهيأ')
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * التحقق من أن الطلب قادم من Vercel Cron
 * Vercel يضيف Authorization: Bearer <CRON_SECRET> تلقائياً
 */
export function isValidCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${secret}`
}

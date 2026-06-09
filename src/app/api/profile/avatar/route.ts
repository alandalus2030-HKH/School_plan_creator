import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * الصورة الشخصية للمستخدم — رفع/إزالة (لصاحب الحساب نفسه)
 * POST   → رفع صورة (multipart) وتحديث profiles.avatar_url
 * DELETE → إزالة الصورة
 * الرفع عبر service role (يتجاوز RLS بأمان، كما في شعار المدرسة)
 */

const BUCKET = 'avatars'
const MAX = 2 * 1024 * 1024
const TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const admin = createAdminClient()

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'لم يتم إرسال ملف' }, { status: 400 })
  if (file.size > MAX) return NextResponse.json({ error: 'حجم الصورة يتجاوز 2MB' }, { status: 400 })
  if (!TYPES.includes(file.type)) return NextResponse.json({ error: 'صيغة غير مدعومة (PNG/JPG/WEBP)' }, { status: 400 })

  const ext  = (file.name.split('.').pop() || 'png').toLowerCase()
  const path = `${auth.user.id}/avatar_${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: upErr } = await admin.storage
    .from(BUCKET).upload(path, buffer, { upsert: true, contentType: file.type })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)
  const url = pub?.publicUrl || ''
  const { error } = await admin.from('profiles').update({ avatar_url: url }).eq('id', auth.user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ url })
}

export async function DELETE() {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({ avatar_url: null }).eq('id', auth.user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

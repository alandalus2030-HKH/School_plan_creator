import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json(
      { error: 'لم يتم تهيئة مفتاح الخادم. أضف SUPABASE_SERVICE_ROLE_KEY في ملف .env.local' },
      { status: 500 }
    )
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const { email, name_ar, role } = await req.json()
    if (!email) return NextResponse.json({ error: 'البريد الإلكتروني مطلوب' }, { status: 400 })

    // إرسال بريد الدعوة
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { name_ar: name_ar || email },
    })

    // إذا كان المستخدم موجوداً مسبقاً نحاول تحديث ملفه الشخصي فقط
    if (error) {
      const isExisting = error.message.toLowerCase().includes('already') ||
                         error.message.toLowerCase().includes('exists') ||
                         error.message.toLowerCase().includes('database')
      if (!isExisting) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      // ابحث عن المستخدم الموجود وحدّث دوره
      const { data: existing } = await admin.auth.admin.listUsers()
      const found = existing?.users?.find(u => u.email === email)
      if (found) {
        await admin.from('profiles').upsert({
          id: found.id, email,
          name_ar: name_ar || email,
          role: role || 'teacher',
        }, { onConflict: 'id' })
        return NextResponse.json({ ok: true, note: 'existing_user_updated' })
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // إنشاء / تحديث الملف الشخصي للمستخدم الجديد
    if (data?.user) {
      await admin.from('profiles').upsert({
        id: data.user.id,
        email,
        name_ar: name_ar || email,
        role: role || 'teacher',
      }, { onConflict: 'id' })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

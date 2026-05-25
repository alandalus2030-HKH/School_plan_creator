import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

/**
 * يحوّل اسم المستخدم → بريد إلكتروني (service role)
 * POST { username } → { email } | { error }
 */
export async function POST(req: NextRequest) {
  try {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
      console.error('[resolve-username] SUPABASE_SERVICE_ROLE_KEY غير مهيأ')
      return NextResponse.json({ error: 'server_error' }, { status: 500 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl) {
      console.error('[resolve-username] NEXT_PUBLIC_SUPABASE_URL غير مهيأ')
      return NextResponse.json({ error: 'server_error' }, { status: 500 })
    }

    let body: any = {}
    try { body = await req.json() } catch {}
    const input = (body.username ?? '').toString().trim()

    if (!input) {
      return NextResponse.json({ error: 'اسم المستخدم مطلوب' }, { status: 400 })
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    /* ── 1. المدخَل بريد إلكتروني مباشرة ── */
    if (input.includes('@')) {
      const { data, error } = await admin
        .from('profiles')
        .select('email, is_active')
        .eq('email', input)
        .maybeSingle()

      if (error) console.error('[resolve-username] email lookup error:', error.message)

      if (!data) {
        return NextResponse.json({ email: input })
      }
      if (data.is_active === false) {
        return NextResponse.json(
          { error: 'الحساب معطَّل، تواصل مع مشرف النظام' },
          { status: 403 }
        )
      }
      return NextResponse.json({ email: data.email })
    }

    /* ── 2. بحث بـ username (غير حساس لحالة الحروف) ── */
    const { data: byUsername, error: err2 } = await admin
      .from('profiles')
      .select('email, is_active')
      .ilike('username', input)
      .maybeSingle()

    if (err2) console.error('[resolve-username] username lookup error:', err2.message)

    if (byUsername) {
      if (byUsername.is_active === false) {
        return NextResponse.json(
          { error: 'الحساب معطَّل، تواصل مع مشرف النظام' },
          { status: 403 }
        )
      }
      return NextResponse.json({ email: byUsername.email })
    }

    /* ── 3. احتياط: بحث بالجزء الأول من البريد ── */
    const { data: byEmailPrefix, error: err3 } = await admin
      .from('profiles')
      .select('email, is_active')
      .ilike('email', `${input}@%`)
      .maybeSingle()

    if (err3) console.error('[resolve-username] email-prefix lookup error:', err3.message)

    if (byEmailPrefix) {
      if (byEmailPrefix.is_active === false) {
        return NextResponse.json(
          { error: 'الحساب معطَّل، تواصل مع مشرف النظام' },
          { status: 403 }
        )
      }
      return NextResponse.json({ email: byEmailPrefix.email })
    }

    /* ── لم يُوجَد ── */
    return NextResponse.json(
      { error: 'اسم المستخدم أو كلمة المرور غير صحيحة' },
      { status: 401 }
    )

  } catch (e: any) {
    console.error('[resolve-username] exception:', e?.message || e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

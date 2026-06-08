'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/components/Toast'
import {
  Building2, Loader2, Upload, ImageIcon, Save, Phone, Mail, MapPin,
  UserRound, Hash, FileText, Eye, Target, Trash2,
} from 'lucide-react'

type SchoolData = {
  id: string
  name_ar: string; name_en: string | null; logo_url: string | null
  vision_ar: string | null; mission_ar: string | null
  address: string | null; phone: string | null; email: string | null
  principal_name: string | null; ministry_number: string | null
  report_header: string | null; report_footer: string | null
}

const LOGO_BUCKET = 'school-logos'
const MAX_LOGO = 2 * 1024 * 1024 // 2MB

export default function SchoolProfile() {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [data, setData]       = useState<SchoolData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [uploading, setUploading] = useState(false)

  const load = async () => {
    setLoading(true)
    const res = await fetch('/api/school-profile')
    const json = await res.json()
    if (res.ok) setData(json.school)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const setField = (k: keyof SchoolData, v: string) =>
    setData(d => d ? { ...d, [k]: v } : d)

  /* ── رفع الشعار ── */
  const onPickLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !data) return
    if (file.size > MAX_LOGO) { toast('حجم الصورة يتجاوز 2MB', 'error'); return }
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'].includes(file.type)) {
      toast('صيغة غير مدعومة (PNG/JPG/SVG/WEBP)', 'error'); return
    }
    setUploading(true)
    const ext  = file.name.split('.').pop()
    const path = `${data.id}/logo_${Date.now()}.${ext}`
    const { error } = await supabase.storage.from(LOGO_BUCKET).upload(path, file, { upsert: true })
    if (error) { toast('تعذّر رفع الشعار: ' + error.message, 'error'); setUploading(false); return }
    const { data: pub } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path)
    setField('logo_url', pub.publicUrl)
    setUploading(false)
    toast('تم رفع الشعار — لا تنسَ الحفظ')
  }

  /* ── حفظ كل البيانات ── */
  const save = async () => {
    if (!data) return
    if (!data.name_ar?.trim()) { toast('اسم المدرسة مطلوب', 'error'); return }
    setSaving(true)
    const res = await fetch('/api/school-profile', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name_ar: data.name_ar, name_en: data.name_en, logo_url: data.logo_url,
        vision_ar: data.vision_ar, mission_ar: data.mission_ar,
        address: data.address, phone: data.phone, email: data.email,
        principal_name: data.principal_name, ministry_number: data.ministry_number,
        report_header: data.report_header, report_footer: data.report_footer,
      }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { toast(json.error || 'تعذّر الحفظ', 'error'); return }
    toast('تم حفظ بيانات المدرسة')
  }

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <Loader2 className="w-7 h-7 animate-spin" style={{ color: 'var(--maroon-600)' }} />
    </div>
  )
  if (!data) return (
    <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-400">
      تعذّر تحميل بيانات المدرسة
    </div>
  )

  const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300'
  const labelCls = 'block text-xs font-semibold text-slate-600 mb-1.5'

  return (
    <div className="space-y-5">

      {/* الهوية + الشعار */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Building2 size={18} style={{ color: 'var(--maroon-600)' }} /> هوية المدرسة
        </h3>
        <div className="flex flex-col sm:flex-row gap-5">
          {/* الشعار */}
          <div className="flex flex-col items-center gap-2 flex-shrink-0">
            <div className="w-28 h-28 rounded-2xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden bg-slate-50">
              {data.logo_url
                ? <img src={data.logo_url} alt="الشعار" className="w-full h-full object-contain" />
                : <ImageIcon size={32} className="text-slate-300" />}
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={onPickLogo} className="hidden" />
            <div className="flex gap-1">
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors disabled:opacity-50">
                {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                {uploading ? 'جارٍ الرفع' : 'رفع شعار'}
              </button>
              {data.logo_url && (
                <button onClick={() => setField('logo_url', '')} aria-label="إزالة الشعار"
                  className="text-xs px-2 py-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                  <Trash2 size={12} />
                </button>
              )}
            </div>
            <span className="text-[10px] text-slate-400">PNG/JPG/SVG · حد 2MB</span>
          </div>

          {/* الأسماء */}
          <div className="flex-1 space-y-3">
            <div>
              <label className={labelCls}>اسم المدرسة (عربي) *</label>
              <input value={data.name_ar || ''} onChange={e => setField('name_ar', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>اسم المدرسة (إنجليزي)</label>
              <input value={data.name_en || ''} onChange={e => setField('name_en', e.target.value)} dir="ltr" className={inputCls} />
            </div>
          </div>
        </div>
      </div>

      {/* الرؤية والرسالة */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Target size={18} style={{ color: 'var(--maroon-600)' }} /> الرؤية والرسالة
        </h3>
        <div className="space-y-3">
          <div>
            <label className={labelCls}><Eye size={11} className="inline ml-1" /> الرؤية</label>
            <textarea value={data.vision_ar || ''} onChange={e => setField('vision_ar', e.target.value)} rows={2} className={inputCls + ' resize-none'} />
          </div>
          <div>
            <label className={labelCls}><Target size={11} className="inline ml-1" /> الرسالة</label>
            <textarea value={data.mission_ar || ''} onChange={e => setField('mission_ar', e.target.value)} rows={2} className={inputCls + ' resize-none'} />
          </div>
        </div>
      </div>

      {/* بيانات الاتصال */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Phone size={18} style={{ color: 'var(--maroon-600)' }} /> بيانات الاتصال
        </h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className={labelCls}><MapPin size={11} className="inline ml-1" /> العنوان</label>
            <input value={data.address || ''} onChange={e => setField('address', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}><Phone size={11} className="inline ml-1" /> الهاتف</label>
            <input value={data.phone || ''} onChange={e => setField('phone', e.target.value)} dir="ltr" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}><Mail size={11} className="inline ml-1" /> البريد الإلكتروني</label>
            <input value={data.email || ''} onChange={e => setField('email', e.target.value)} dir="ltr" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}><UserRound size={11} className="inline ml-1" /> اسم المدير</label>
            <input value={data.principal_name || ''} onChange={e => setField('principal_name', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}><Hash size={11} className="inline ml-1" /> الرقم الوزاري</label>
            <input value={data.ministry_number || ''} onChange={e => setField('ministry_number', e.target.value)} dir="ltr" className={inputCls} />
          </div>
        </div>
      </div>

      {/* رأسية وتذييل التقارير */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h3 className="font-bold text-slate-800 mb-1 flex items-center gap-2">
          <FileText size={18} style={{ color: 'var(--maroon-600)' }} /> رأسية وتذييل التقارير
        </h3>
        <p className="text-[11px] text-slate-400 mb-4">تظهر في أعلى/أسفل التقارير المُصدَّرة (QNSA وغيرها)</p>
        <div className="space-y-3">
          <div>
            <label className={labelCls}>نص الرأسية</label>
            <input value={data.report_header || ''} onChange={e => setField('report_header', e.target.value)}
              placeholder="مثال: دولة قطر · وزارة التربية والتعليم والتعليم العالي" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>نص التذييل</label>
            <input value={data.report_footer || ''} onChange={e => setField('report_footer', e.target.value)}
              placeholder="مثال: تقرير معتمد من إدارة المدرسة" className={inputCls} />
          </div>
        </div>
      </div>

      {/* زر الحفظ */}
      <div className="flex justify-end">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-all hover:brightness-110 disabled:opacity-50 shadow-lg"
          style={{ background: 'var(--gradient-button)' }}>
          <Save size={16} /> {saving ? 'جارٍ الحفظ...' : 'حفظ بيانات المدرسة'}
        </button>
      </div>
    </div>
  )
}

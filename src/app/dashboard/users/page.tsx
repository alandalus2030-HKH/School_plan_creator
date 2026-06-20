'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from '@/lib/PermissionsContext'
import NoAccess from '@/components/NoAccess'
import ConfirmDialog from '@/components/ConfirmDialog'
import { toast } from '@/components/Toast'
import * as XLSX from 'xlsx'
import { Users, CheckCircle2, BookOpen, Crown, UserRound } from 'lucide-react'

/* ══════════════════════ أنواع البيانات ══════════════════════ */
type RoleItem = { code: string; name_ar: string; color: string; permissions?: string[] }

type Profile = {
  id: string
  first_name_ar: string | null
  last_name_ar:  string | null
  name_ar:       string
  nationality:   string | null
  school:        string | null
  department:    string | null
  job_title:     string | null
  phone:         string | null
  email:         string | null
  username:      string | null
  role:          string
  is_active:     boolean
  is_super_admin?: boolean | null
  created_at:    string
}

type TeamMembership = { team_id: string; is_leader: boolean }

/* ══════════════════════ صلاحيات النظام — من المرجع المركزي ══════════════════════ */
import { ALL_PERMISSIONS } from '@/lib/permissions'

/* ══════════════════════ بيانات احتياطية ══════════════════════ */
const FALLBACK_ROLES: RoleItem[] = [
  { code: 'super_admin',  name_ar: 'مشرف عام المنصة',    color: '#7c3aed' },
  { code: 'school_admin', name_ar: 'مشرف نظام المدرسة', color: '#2563eb' },
  { code: 'supervisor',   name_ar: 'مشرف',          color: '#0891b2' },
  { code: 'teacher',      name_ar: 'معلم',          color: '#059669' },
  { code: 'staff',        name_ar: 'موظف إداري',    color: '#6b7280' },
]

const FALLBACK_DEPARTMENTS = [
  'التربية الإسلامية','اللغة العربية','اللغة الإنجليزية','اللغة الألمانية',
  'اللغة الصينية','العلوم الاجتماعية','الفنون البصرية','المهارات الحياتية',
  'الدعم الأكاديمي','الرياضيات','العلوم العامة','الكيمياء','الفيزياء','الأحياء',
  'التربية البدنية','الخدمات المشتركة','الإدارة العليا','الجودة',
  'القيم والهوية الوطنية','الأنشطة','أخرى',
]

const FALLBACK_JOB_TITLES = [
  'مدير مدرسة','نائب إداري','نائب أكاديمي','منسق مادة','منسق شؤون طلبة',
  'معلم','مشرف إداري','موظف إداري','سكرتير','أخرى',
]

const FALLBACK_NATIONALITIES = [
  'قطرية','سعودية','إماراتية','كويتية','بحرينية','عُمانية','أردنية',
  'مصرية','لبنانية','سورية','عراقية','يمنية','فلسطينية','سودانية',
  'مغربية','تونسية','ليبية','جزائرية','باكستانية','هندية','بنغلاديشية',
  'فلبينية','سريلانكية','نيبالية','إندونيسية','بريطانية','أمريكية',
  'فرنسية','ألمانية','صينية','تركية','إيرانية','أخرى',
]

/* ══════════════════════ النموذج الفارغ ══════════════════════ */
const EMPTY_FORM = {
  first_name_ar:  '',
  last_name_ar:   '',
  nationality:    '',
  school:         '',
  department:     '',
  job_title:      '',
  phone:          '',
  email:          '',
  username:       '',
  role:           'teacher',
  is_active:      true,
  notif_enabled:  true,   // مدير النظام يتحكم في الإشعارات
  notif_email:    true,
}

const TABS = ['👤 بيانات المستخدم', '🔐 الحساب', '⚙️ الصلاحيات']

/* ══════════════════════ المكوّن الرئيسي ══════════════════════ */
export default function UsersPage() {
  const supabase = createClient()
  const { can, userId: myUserId, loading: permsLoading } = usePermissions()

  /* ── حالة القوائم ── */
  const [roles,         setRoles]         = useState<RoleItem[]>(FALLBACK_ROLES)
  const [departments,   setDepartments]   = useState<string[]>(FALLBACK_DEPARTMENTS)
  const [jobTitles,     setJobTitles]     = useState<string[]>(FALLBACK_JOB_TITLES)
  const [nationalities, setNationalities] = useState<string[]>(FALLBACK_NATIONALITIES)
  const [schools,       setSchools]       = useState<string[]>([])
  const [allTeams,      setAllTeams]      = useState<any[]>([])
  const [allPlans,      setAllPlans]      = useState<any[]>([])

  /* ── حالة القائمة ── */
  const [profiles,      setProfiles]      = useState<Profile[]>([])
  const [loading,       setLoading]       = useState(true)
  const [search,        setSearch]        = useState('')
  const [roleFilter,    setRoleFilter]    = useState('')
  const [schoolFilter,  setSchoolFilter]  = useState('')
  const [activeFilter,  setActiveFilter]  = useState<''|'active'|'inactive'>('')

  /* ── حالة النموذج ── */
  const [showForm,    setShowForm]    = useState(false)
  const [editProfile, setEditProfile] = useState<Profile | null>(null)
  const [form,        setForm]        = useState({ ...EMPTY_FORM })
  const [formTab,     setFormTab]     = useState(0)
  const [saving,      setSaving]      = useState(false)
  const [formError,   setFormError]   = useState('')

  /* ── كلمة المرور ── */
  const [formPassword,    setFormPassword]    = useState('')
  const [formConfirmPass, setFormConfirmPass] = useState('')
  const [showPass,        setShowPass]        = useState(false)
  const [sendingCreds,    setSendingCreds]    = useState(false)
  const [credsMsg,        setCredsMsg]        = useState('')
  const [sendingReset,    setSendingReset]    = useState(false)
  const [resetMsg,        setResetMsg]        = useState('')

  /* ── الفرق ── */
  const [formTeams, setFormTeams] = useState<TeamMembership[]>([])
  const [inviteLink, setInviteLink] = useState('')           // رابط دعوة (إنشاء بلا كلمة مرور)

  /* ── حذف ── */
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [delMsg,     setDelMsg]     = useState<{id:string; text:string} | null>(null)

  /* ── إعادة تعيين من القائمة ── */
  const [resetingId,   setResetingId]   = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState<Profile | null>(null)
  const [resetListMsg, setResetListMsg] = useState<{id:string; ok:boolean; text:string} | null>(null)

  /* ── استيراد / تصدير ── */
  const fileRef = useRef<HTMLInputElement>(null)
  const [showImport,  setShowImport]  = useState(false)
  const [importRows,  setImportRows]  = useState<any[]>([])
  const [importErrors,setImportErrors]= useState<Record<number, string[]>>({})
  const [importing,   setImporting]   = useState(false)
  const [importMsg,   setImportMsg]   = useState('')

  /* أعمدة Excel وترتيبها */
  const XLS_COLS = [
    { key: 'first_name_ar', label: 'الاسم الأول بالعربية',  dropdown: null },
    { key: 'last_name_ar',  label: 'الاسم الأخير بالعربية', dropdown: null },
    { key: 'nationality',   label: 'الجنسية',                dropdown: 'nationalities' },
    { key: 'school',        label: 'المؤسسة',                dropdown: 'schools' },
    { key: 'department',    label: 'القسم / المادة',          dropdown: 'departments' },
    { key: 'job_title',     label: 'المسمى الوظيفي',          dropdown: 'jobTitles' },
    { key: 'phone',         label: 'الهاتف',                  dropdown: null },
    { key: 'email',         label: 'البريد الإلكتروني',       dropdown: null },
    { key: 'username',      label: 'اسم الدخول',              dropdown: null },
    { key: 'role_name',     label: 'الدور',                   dropdown: 'roles' },
    { key: 'password',      label: 'كلمة المرور الافتراضية',  dropdown: null },
  ] as const

  /* ════ جلب البيانات ════ */
  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)

    // تحميل المستخدمين
    const { data: profilesData } = await supabase
      .from('profiles').select('id,first_name_ar,last_name_ar,name_ar,nationality,school,department,job_title,phone,email,username,role,is_active,is_super_admin,created_at').limit(500)
      .order('created_at', { ascending: false })
    setProfiles((profilesData || []) as Profile[])

    // قوائم منسدلة ديناميكية
    const { data: dropdowns } = await supabase
      .from('dropdown_options').select('category,value').eq('is_active', true).order('sort_order').order('value')
    if (dropdowns && dropdowns.length > 0) {
      const g: Record<string, string[]> = {}
      dropdowns.forEach(({ category, value }) => { if (!g[category]) g[category] = []; g[category].push(value) })
      if (g.department)  setDepartments(g.department)
      if (g.job_title)   setJobTitles(g.job_title)
      if (g.nationality) setNationalities(g.nationality)
      if (g.school)      setSchools(g.school)
    }

    // المدارس: جدول schools أو distinct من profiles (مع إزالة التكرار دائماً)
    const dedup = (arr: string[]) => [...new Set(arr.filter(Boolean))]
    try {
      const { data: schoolsData } = await supabase.from('schools').select('name_ar').order('name_ar')
      if (schoolsData && schoolsData.length > 0) {
        setSchools(dedup(schoolsData.map((s: any) => s.name_ar)))
      } else {
        const unique = dedup((profilesData || []).map((p: any) => p.school))
        if (unique.length > 0) setSchools(unique)
      }
    } catch {
      const unique = dedup((profilesData || []).map((p: any) => p.school))
      if (unique.length > 0) setSchools(unique)
    }

    // الأدوار
    try {
      const { data: rolesData } = await supabase.from('roles').select('code,name_ar,color,permissions').order('sort_order')
      if (rolesData && rolesData.length > 0) setRoles(rolesData as RoleItem[])
    } catch {}

    // الفرق والخطط
    const [{ data: teamsData }, { data: plansData }] = await Promise.all([
      supabase.from('teams').select('id,name_ar,color').order('name_ar'),
      supabase.from('plans').select('id,name_ar,academic_year').order('created_at', { ascending: false }),
    ])
    setAllTeams(teamsData || [])
    setAllPlans(plansData || [])

    setLoading(false)
  }

  /* ════ حفظ عضوية الفرق ════ */
  const saveTeams = async (userId: string) => {
    try {
      await supabase.from('team_members').delete().eq('profile_id', userId)
      if (formTeams.length > 0) {
        await supabase.from('team_members').insert(
          formTeams.map(m => ({ profile_id: userId, team_id: m.team_id, is_leader: m.is_leader }))
        )
      }
    } catch {}
  }

  /* ════ تحقق من قائد الفريق ════ */
  const checkLeaderConflict = async (userId: string | null): Promise<string | null> => {
    for (const m of formTeams) {
      if (!m.is_leader) continue
      try {
        const { data } = await supabase
          .from('team_members').select('profile_id').eq('team_id', m.team_id).eq('is_leader', true)
        const others = (data || []).filter((x: any) => x.profile_id !== userId)
        if (others.length > 0) {
          const team = allTeams.find(t => t.id === m.team_id)
          return `فريق "${team?.name_ar || m.team_id}" لديه قائد بالفعل`
        }
      } catch {}
    }
    return null
  }

  /* ════ فتح نموذج الإضافة ════ */
  const openCreate = () => {
    setEditProfile(null)
    setForm({ ...EMPTY_FORM })
    setFormTab(0); setFormError('')
    setFormPassword(''); setFormConfirmPass(''); setShowPass(false)
    setFormTeams([]); setCredsMsg(''); setResetMsg(''); setInviteLink('')
    setShowForm(true)
  }

  /* ════ فتح نموذج التعديل ════ */
  const openEdit = async (p: Profile) => {
    setEditProfile(p)
    setForm({
      first_name_ar: p.first_name_ar || '',
      last_name_ar:  p.last_name_ar  || '',
      nationality:   p.nationality   || '',
      school:        p.school        || '',
      department:    p.department    || '',
      job_title:     p.job_title     || '',
      phone:         p.phone         || '',
      email:         p.email         || '',
      username:      p.username      || '',
      role:          p.role,
      is_active:     p.is_active,
      notif_enabled: (p as any).notif_enabled ?? true,
      notif_email:   (p as any).notif_email   ?? true,
    })
    setFormTab(0); setFormError('')
    setFormPassword(''); setFormConfirmPass(''); setShowPass(false)
    setCredsMsg(''); setResetMsg('')
    // تحميل الفرق
    try {
      const { data } = await supabase.from('team_members').select('team_id,is_leader').eq('profile_id', p.id)
      setFormTeams((data || []).map((m: any) => ({ team_id: m.team_id, is_leader: !!m.is_leader })))
    } catch { setFormTeams([]) }
    setShowForm(true)
  }

  /* ════ حفظ المستخدم ════ */
  const saveUser = async (e: React.FormEvent) => {
    e.preventDefault()

    /* ── البريد الإلكتروني إلزامي ── */
    if (!form.email.trim()) {
      setFormError('البريد الإلكتروني مطلوب'); setFormTab(0); return
    }

    /* ── اسم الدخول إلزامي ── */
    const uname = (form.username || '').trim()
    if (!uname) {
      setFormError('اسم الدخول مطلوب — يُستخدم لتسجيل الدخول'); setFormTab(1); return
    }
    if (!/^[a-z0-9._-]+$/.test(uname)) {
      setFormError('اسم الدخول يجب أن يحتوي على أحرف إنجليزية وأرقام والرموز . _ - فقط'); setFormTab(1); return
    }

    if (!editProfile && formPassword && formPassword !== formConfirmPass) {
      setFormError('كلمتا المرور غير متطابقتين'); setFormTab(1); return
    }
    if (!editProfile && formPassword && formPassword.length < 8) {
      setFormError('كلمة المرور يجب أن تكون 8 أحرف على الأقل'); setFormTab(1); return
    }

    // تحقق من قائد الفريق
    const leaderConflict = await checkLeaderConflict(editProfile?.id || null)
    if (leaderConflict) { setFormError(leaderConflict); setFormTab(2); return }

    setSaving(true); setFormError('')
    const fullNameAr = [form.first_name_ar, form.last_name_ar].filter(Boolean).join(' ') || form.email

    if (editProfile) {
      const { error } = await supabase.from('profiles').update({
        first_name_ar: form.first_name_ar || null,
        last_name_ar:  form.last_name_ar  || null,
        name_ar:       fullNameAr,
        full_name_ar:  fullNameAr,   // يُعرض في الشريط الجانبي — يجب أن يتزامن مع name_ar
        nationality:   form.nationality   || null,
        school:        form.school        || null,
        department:    form.department    || null,
        job_title:     form.job_title     || null,
        phone:         form.phone         || null,
        email:         form.email         || null,
        username:      form.username      || null,
        role:          form.role,
        is_active:     form.is_active,
        notif_enabled: (form as any).notif_enabled ?? true,
        notif_email:   (form as any).notif_email   ?? true,
      }).eq('id', editProfile.id)
      if (error) { setFormError(error.message); setSaving(false); return }
      await saveTeams(editProfile.id)
    } else {
      const { ok: createOk, json } = await safePost('/api/users/create', {
        email:         form.email,
        first_name_ar: form.first_name_ar || null,
        last_name_ar:  form.last_name_ar  || null,
        nationality:   form.nationality   || null,
        school:        form.school        || null,
        department:    form.department    || null,
        job_title:     form.job_title     || null,
        phone:         form.phone         || null,
        username:      form.username      || null,
        role:          form.role,
        is_active:     form.is_active,
        password:      formPassword || undefined,
      })
      if (!createOk) { setFormError(json.error || 'حدث خطأ'); setSaving(false); return }
      if (json.id) { await saveTeams(json.id) }

      /* نموذج الدعوة: أُنشئ بلا كلمة مرور → ولّد رابط دعوة ليضبط كلمته بنفسه، وأبقِ النافذة لعرضه */
      if (json.id && !formPassword) {
        const { ok: lok, json: lj } = await safePost('/api/auth/reset-link', { userId: json.id })
        if (lok && lj.link) {
          setInviteLink(lj.link)
          setSaving(false); await loadAll()
          return  // النافذة تبقى مفتوحة لعرض الرابط
        }
      }
    }

    setSaving(false); setShowForm(false); await loadAll()
  }

  /* ── مساعد: استدعاء آمن لـ fetch مع JSON ── */
  const safePost = async (url: string, body: object) => {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const ct  = res.headers.get('content-type') || ''
      const json = ct.includes('application/json') ? await res.json() : {}
      return { ok: res.ok, json }
    } catch {
      return { ok: false, json: { error: 'تعذّر الاتصال بالخادم' } }
    }
  }

  /* ════ إرسال بيانات الدخول ════ */
  const sendCredentials = async () => {
    if (!form.email) return
    setSendingCreds(true); setCredsMsg('')
    const { ok, json } = await safePost('/api/auth/reset-password', { email: form.email })
    setCredsMsg(ok
      ? `✅ تم إرسال رابط تعيين كلمة المرور إلى ${form.email}`
      : `❌ ${json.error || 'حدث خطأ'}`)
    setSendingCreds(false)
  }

  /* ════ إعادة تعيين كلمة المرور (من النموذج) ════ */
  const resetPasswordForm = async () => {
    if (!editProfile?.email) return
    setSendingReset(true); setResetMsg('')
    const { ok, json } = await safePost('/api/auth/reset-password', { email: editProfile.email })
    setResetMsg(ok ? '✅ تم إرسال الرابط بنجاح' : `❌ ${json.error || 'حدث خطأ'}`)
    setSendingReset(false)
  }

  /* ════ توليد رابط إعادة تعيين ونسخه (دون بريد — يتجاوز حدّ الإرسال) ════ */
  const copyResetLink = async () => {
    if (!editProfile?.id) return
    setSendingReset(true); setResetMsg('')
    const { ok, json } = await safePost('/api/auth/reset-link', { userId: editProfile.id })
    if (ok && json.link) {
      try { await navigator.clipboard.writeText(json.link); setResetMsg('✅ نُسخ رابط إعادة التعيين — سلّمه للمستخدم') }
      catch { setResetMsg(`✅ الرابط: ${json.link}`) }
    } else {
      setResetMsg(`❌ ${json.error || 'تعذّر توليد الرابط'}`)
    }
    setSendingReset(false)
  }

  /* ════ إعادة تعيين من القائمة — توليد رابط ونسخه (بلا بريد → بلا حدّ إرسال) ════ */
  const resetPasswordList = async (p: Profile) => {
    setResetingId(p.id); setResetListMsg(null)
    const { ok, json } = await safePost('/api/auth/reset-link', { userId: p.id })
    if (ok && json.link) {
      try { await navigator.clipboard.writeText(json.link) } catch {}
      setResetListMsg({ id: p.id, ok: true, text: `✅ تم توليد رابط التعيين ونسخه — سلّمه لـ ${p.name_ar || p.email}` })
    } else {
      setResetListMsg({ id: p.id, ok: false, text: `❌ ${json.error || 'تعذّر التوليد'}` })
    }
    setResetingId(null); setConfirmReset(null)
    if (ok) setTimeout(() => setResetListMsg(null), 8000)
  }

  /* ════ تفعيل / تعطيل ════ */
  const toggleActive = async (p: Profile) => {
    const { error } = await supabase.from('profiles').update({ is_active: !p.is_active }).eq('id', p.id)
    if (error) { alert(`تعذّر تغيير حالة الحساب: ${error.message}`); return }
    setProfiles(prev => prev.map(x => x.id === p.id ? { ...x, is_active: !x.is_active } : x))
  }

  /* ════ هل الحساب محمي من الحذف؟ (طبقة الواجهة — الخادم يتحقق أيضاً) ════ */
  const isProtected = (p: Profile) =>
    !!p.is_super_admin || ['super_admin', 'school_admin', 'admin'].includes(p.role) || p.id === myUserId

  /* ════ حذف — عبر API خادمي، لا إزالة من الواجهة إلا بعد نجاح فعلي ════ */
  const deleteProfile = async (id: string) => {
    setDeletingId(id); setDelMsg(null)
    try {
      const res  = await fetch(`/api/users/${id}`, { method: 'DELETE' })
      const ct   = res.headers.get('content-type') || ''
      const json = ct.includes('application/json') ? await res.json() : {}
      if (!res.ok) {
        setDelMsg({ id, text: `❌ ${json.error || 'تعذّر حذف المستخدم'}` })
        return
      }
      setProfiles(prev => prev.filter(p => p.id !== id))
      setConfirmDel(null)
    } catch {
      setDelMsg({ id, text: '❌ تعذّر الاتصال بالخادم' })
    } finally {
      setDeletingId(null)
    }
  }

  /* ════ تصدير Excel (مع قوائم منسدلة حقيقية) ════ */
  const exportExcel = async () => {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()

    /* ── ورقة البيانات المرجعية (مخفية) ── */
    const refSheet = wb.addWorksheet('_ref')
    refSheet.state = 'veryHidden'
    const dropdownData: Record<string, string[]> = {
      nationalities, schools, departments,
      jobTitles, roles: roles.map(r => r.name_ar),
    }
    let refCol = 1
    const refRanges: Record<string, string> = {}
    for (const [key, values] of Object.entries(dropdownData)) {
      values.forEach((v, i) => { refSheet.getCell(i + 1, refCol).value = v })
      refRanges[key] = `_ref!$${colLetter(refCol)}$1:$${colLetter(refCol)}$${values.length}`
      refCol++
    }

    /* ── ورقة المستخدمين ── */
    const ws = wb.addWorksheet('المستخدمون')
    ws.views = [{ rightToLeft: true }]

    // رأس الجدول
    const headers = XLS_COLS.map(c => c.label)
    ws.addRow(headers)
    const headerRow = ws.getRow(1)
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } }
    headerRow.alignment = { horizontal: 'center' }
    headerRow.height = 22

    // عرض الأعمدة
    ws.columns = XLS_COLS.map(c => ({
      width: ['الجنسية','القسم / المادة','المسمى الوظيفي','المؤسسة'].includes(c.label) ? 22
           : ['البريد الإلكتروني'].includes(c.label) ? 28 : 18,
    }))

    // بيانات المستخدمين
    profiles.forEach((p, i) => {
      const roleName = roles.find(r => r.code === p.role)?.name_ar || p.role
      ws.addRow([
        p.first_name_ar || '', p.last_name_ar || '',
        p.nationality || '', p.school || '',
        p.department || '', p.job_title || '',
        p.phone || '', p.email || '',
        p.username || '', roleName,
      ])
      // لون صفوف متناوبة
      const row = ws.getRow(i + 2)
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFFAF5FF' : 'FFFFFFFF' } }
    })

    // إضافة قوائم منسدلة لكل خلية في الأعمدة ذات القوائم
    const totalRows = profiles.length + 1
    XLS_COLS.forEach((col, colIdx) => {
      if (!col.dropdown) return
      const range = refRanges[col.dropdown]
      if (!range) return
      for (let row = 2; row <= Math.max(totalRows, 100); row++) {
        ws.getCell(row, colIdx + 1).dataValidation = {
          type: 'list', allowBlank: true,
          formulae: [range],
          showErrorMessage: true,
          errorTitle: 'قيمة غير صالحة',
          error: `يرجى الاختيار من القائمة`,
        }
      }
    })

    // تجميد الرأس
    ws.views = [{ state: 'frozen', ySplit: 1, rightToLeft: true }]

    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'users_export.xlsx'; a.click()
    URL.revokeObjectURL(url)
  }

  /* ════ تحميل قالب الاستيراد الفارغ (مع قوائم منسدلة) ════ */
  const downloadTemplate = async () => {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()

    const refSheet = wb.addWorksheet('_ref')
    refSheet.state = 'veryHidden'
    const dropdownData: Record<string, string[]> = {
      nationalities, schools, departments,
      jobTitles, roles: roles.map(r => r.name_ar),
    }
    let refCol = 1
    const refRanges: Record<string, string> = {}
    for (const [key, values] of Object.entries(dropdownData)) {
      values.forEach((v, i) => { refSheet.getCell(i + 1, refCol).value = v })
      refRanges[key] = `_ref!$${colLetter(refCol)}$1:$${colLetter(refCol)}$${values.length}`
      refCol++
    }

    const ws = wb.addWorksheet('المستخدمون')
    ws.views = [{ rightToLeft: true }]
    ws.addRow(XLS_COLS.map(c => c.label))
    const headerRow = ws.getRow(1)
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } }
    headerRow.height = 22
    ws.columns = XLS_COLS.map(c => ({
      width: ['الجنسية','القسم / المادة','المسمى الوظيفي','المؤسسة'].includes(c.label) ? 22
           : ['البريد الإلكتروني'].includes(c.label) ? 28 : 18,
    }))

    // مثال واحد
    ws.addRow(['محمد', 'العمري', '', '', '', '', '+974', 'example@school.qa', 'mohammed.omari', ''])
    const exRow = ws.getRow(2)
    exRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F0FF' } }
    exRow.font = { italic: true, color: { argb: 'FF9CA3AF' } }

    XLS_COLS.forEach((col, colIdx) => {
      if (!col.dropdown) return
      const range = refRanges[col.dropdown]
      if (!range) return
      for (let row = 2; row <= 200; row++) {
        ws.getCell(row, colIdx + 1).dataValidation = {
          type: 'list', allowBlank: true, formulae: [range],
          showErrorMessage: true, errorTitle: 'قيمة غير صالحة',
          error: 'يرجى الاختيار من القائمة',
        }
      }
    })

    ws.views = [{ state: 'frozen', ySplit: 1, rightToLeft: true }]

    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'users_template.xlsx'; a.click()
    URL.revokeObjectURL(url)
  }

  /* ════ قراءة ملف الاستيراد ════ */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const wb   = XLSX.read(ev.target?.result, { type: 'array' })
      // ورقة البيانات هي «المستخدمون» — لا الورقة الأولى (قد تكون _ref للقوائم المرجعية)
      const sheetName = wb.SheetNames.includes('المستخدمون')
        ? 'المستخدمون'
        : (wb.SheetNames.find(n => n !== '_ref') || wb.SheetNames[0])
      const ws   = wb.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json(ws) as any[]
      setImportRows(rows); setImportErrors(validateImportRows(rows))
      setShowImport(true); setImportMsg('')
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  /* ════ التحقق من صحة صفوف الاستيراد ════ */
  const validateImportRows = (rows: any[]): Record<number, string[]> => {
    const errs: Record<number, string[]> = {}
    const roleNames = roles.map(r => r.name_ar)
    rows.forEach((row, i) => {
      const rowErrs: string[] = []
      if (!row['البريد الإلكتروني']?.toString().trim()) rowErrs.push('البريد الإلكتروني مطلوب')
      if (!row['الاسم الأول بالعربية']?.toString().trim()) rowErrs.push('الاسم الأول مطلوب')
      if (row['الجنسية'] && !nationalities.includes(row['الجنسية'])) rowErrs.push(`الجنسية "${row['الجنسية']}" غير موجودة في القائمة`)
      if (row['المؤسسة'] && schools.length > 0 && !schools.includes(row['المؤسسة'])) rowErrs.push(`المؤسسة "${row['المؤسسة']}" غير موجودة`)
      if (row['القسم / المادة'] && !departments.includes(row['القسم / المادة'])) rowErrs.push(`القسم "${row['القسم / المادة']}" غير موجود`)
      if (row['المسمى الوظيفي'] && !jobTitles.includes(row['المسمى الوظيفي'])) rowErrs.push(`المسمى "${row['المسمى الوظيفي']}" غير موجود`)
      if (row['الدور'] && !roleNames.includes(row['الدور'])) rowErrs.push(`الدور "${row['الدور']}" غير موجود`)
      const pw = row['كلمة المرور الافتراضية']?.toString().trim()
      if (pw && pw.length < 8) rowErrs.push('كلمة المرور الافتراضية يجب أن تكون 8 أحرف على الأقل')
      if (rowErrs.length) errs[i] = rowErrs
    })
    return errs
  }

  /* ════ تنفيذ الاستيراد ════ */
  const runImport = async () => {
    const validRows = importRows.filter((_, i) => !importErrors[i])
    if (validRows.length === 0) { setImportMsg('❌ لا توجد صفوف صالحة للاستيراد'); return }
    setImporting(true); setImportMsg('')
    let ok = 0
    const dup: string[] = []      // مرفوض لبريد مكرّر
    const other: string[] = []    // فشل لأسباب أخرى

    for (const row of validRows) {
      const roleCode = roles.find(r => r.name_ar === row['الدور'])?.code || 'task_assigned_employee'
      const email = row['البريد الإلكتروني']?.toString().trim() || ''
      const res = await fetch('/api/users/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          first_name_ar: row['الاسم الأول بالعربية']?.toString().trim() || '',
          last_name_ar:  row['الاسم الأخير بالعربية']?.toString().trim() || '',
          nationality:   row['الجنسية']             || null,
          school:        row['المؤسسة']              || null,
          department:    row['القسم / المادة']        || null,
          job_title:     row['المسمى الوظيفي']        || null,
          phone:         row['الهاتف']?.toString()   || null,
          username:      row['اسم الدخول']?.toString().trim().toLowerCase() || null,
          role:          roleCode,
          password:      row['كلمة المرور الافتراضية']?.toString().trim() || undefined,
        }),
      })
      if (res.ok) { ok++; continue }
      const j = await res.json().catch(() => ({}))
      const msg = (j.error || '').toString()
      // بريد مكرّر (في القاعدة أو حساب مصادقة موجود)
      if (msg.includes('البريد') && (msg.includes('مستخدم بالفعل') || msg.includes('مرتبط بحساب'))) dup.push(email || '؟')
      else other.push(`${email || '؟'}${msg ? ` (${msg})` : ''}`)
    }

    const parts: string[] = [`✅ تم إضافة ${ok} مستخدم`]
    if (dup.length)   parts.push(`⚠️ رُفض ${dup.length} لتكرار البريد: ${dup.join('، ')}`)
    if (other.length) parts.push(`❌ فشل ${other.length}: ${other.join(' · ')}`)
    setImportMsg(parts.join('  '))
    setImporting(false); await loadAll()
  }

  /* ════ مساعد رقم العمود → حرف ════ */
  const colLetter = (n: number): string => {
    let s = ''
    while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) }
    return s
  }

  /* ════ مساعدات UI ════ */
  const getRoleInfo = (code: string) =>
    roles.find(r => r.code === code) ?? { code, name_ar: code, color: '#6b7280' }

  const getRolePermissions = (code: string): string[] => {
    const r = roles.find(x => x.code === code)
    if (!r?.permissions) return []
    return Array.isArray(r.permissions) ? r.permissions : []
  }

  const filtered = profiles.filter(p => {
    const s = search.toLowerCase()
    return (!s || (p.name_ar||'').toLowerCase().includes(s) || (p.email||'').toLowerCase().includes(s) || (p.username||'').toLowerCase().includes(s))
        && (!roleFilter   || p.role   === roleFilter)
        && (!schoolFilter || p.school === schoolFilter)
        && (activeFilter === ''         ? true
          : activeFilter === 'active'   ? p.is_active === true
          :                               p.is_active === false)
  })

  const statTones: Record<string,{bg:string;fg:string;iconFg:string}> = {
    dark:   { bg: 'linear-gradient(135deg,#5a0d22,#8a1538)', fg: '#fff',    iconFg: 'rgba(255,255,255,0.8)' },
    medium: { bg: '#f4dde2',                                  fg: '#8a1538', iconFg: '#c25c74' },
    light2: { bg: '#fbf2f4',                                  fg: '#8a1538', iconFg: '#d98ea0' },
    light:  { bg: '#f4dde2',                                  fg: '#6f1029', iconFg: '#c25c74' },
  }
  const stats = [
    { label: 'إجمالي',  value: profiles.length,                                                     Icon: Users,        tone: 'dark'   },
    { label: 'نشطون',   value: profiles.filter(p => p.is_active).length,                            Icon: CheckCircle2, tone: 'medium' },
    { label: 'معلمون',  value: profiles.filter(p => p.role === 'teacher').length,                   Icon: BookOpen,     tone: 'light2' },
    { label: 'إداريون', value: profiles.filter(p => !['teacher','staff'].includes(p.role)).length,  Icon: Crown,        tone: 'light'  },
  ]

  /* ════ حماية الوصول ════ */
  if (!permsLoading && !can('manage_users')) return <NoAccess />

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full" />
    </div>
  )

  /* ════════════════════════ JSX الرئيسي ════════════════════════ */
  return (
    <div className="space-y-5">

      {/* ── رأس الصفحة ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">المستخدمون</h2>
          <p className="text-slate-500 text-sm mt-1">إدارة حسابات المستخدمين وصلاحياتهم</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={downloadTemplate}
            className="flex items-center gap-1.5 text-sm px-3 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
            📄 قالب Excel
          </button>
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 text-sm px-3 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
            📥 استيراد
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
          <button onClick={exportExcel}
            className="flex items-center gap-1.5 text-sm px-3 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
            📤 تصدير
          </button>
          <button onClick={openCreate}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-violet-200">
            ➕ إضافة مستخدم
          </button>
        </div>
      </div>

      {/* ── إحصائيات ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map(s => {
          const t = statTones[s.tone]
          return (
            <div key={s.label} className="rounded-2xl p-4 shadow-sm text-center"
              style={{ background: t.bg, color: t.fg }}>
              <s.Icon size={24} style={{ color: t.iconFg, margin: '0 auto 6px' }} />
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-xs font-medium mt-0.5 opacity-80">{s.label}</div>
            </div>
          )
        })}
      </div>

      {/* ── بحث وتصفية ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 بحث بالاسم أو البريد أو اسم الدخول..."
          className="flex-1 min-w-[200px] px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-sm" />
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-sm min-w-[130px]">
          <option value="">كل الأدوار</option>
          {roles.map(r => <option key={r.code} value={r.code}>{r.name_ar}</option>)}
        </select>
        {schools.length > 0 && (
          <select value={schoolFilter} onChange={e => setSchoolFilter(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-sm min-w-[150px]">
            <option value="">كل المؤسسات</option>
            {schools.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {/* فلتر الحالة */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl">
          {([
            { key: '',         label: 'الكل',      count: profiles.length },
            { key: 'active',   label: '✅ نشط',    count: profiles.filter(p => p.is_active).length },
            { key: 'inactive', label: '🔴 معطَّل', count: profiles.filter(p => !p.is_active).length },
          ] as const).map(tab => (
            <button key={tab.key} onClick={() => setActiveFilter(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeFilter === tab.key
                  ? 'bg-white text-violet-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}>
              {tab.label}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                activeFilter === tab.key ? 'bg-violet-100 text-violet-700' : 'bg-slate-200 text-slate-500'
              }`}>{tab.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── قائمة المستخدمين ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="flex justify-center mb-3" style={{ color: 'var(--maroon-300)' }}><UserRound size={40} /></div>
            <p className="text-slate-500 font-medium">لا يوجد مستخدمون</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {/* رأس الجدول */}
            <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <div className="col-span-4">المستخدم</div>
              <div className="col-span-2 hidden sm:block">المؤسسة</div>
              <div className="col-span-2 hidden md:block">القسم</div>
              <div className="col-span-2">الدور</div>
              <div className="col-span-2 text-left">إجراءات</div>
            </div>

            {filtered.map(p => {
              const roleInfo = getRoleInfo(p.role)
              const initials = (p.name_ar || p.email || '').trim().split(' ').map((w: string) => w[0]).slice(0,2).join('')
              return (
                <div key={p.id}>
                  {(
                    <>
                      <div className={`grid grid-cols-12 gap-2 items-center px-4 py-3 transition-colors group ${
                        p.is_active ? 'hover:bg-slate-50' : 'bg-red-50/40 hover:bg-red-50/70'
                      }`}>
                        {/* المستخدم */}
                        <div className="col-span-4 flex items-center gap-2.5 min-w-0">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 relative ${!p.is_active ? 'opacity-50' : ''}`}
                            style={{ backgroundColor: p.is_active ? roleInfo.color : '#94a3b8' }}>
                            {initials}
                            {!p.is_active && (
                              <span className="absolute -bottom-0.5 -left-0.5 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white flex items-center justify-center">
                                <span className="text-white text-[8px] font-bold">✕</span>
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className={`text-sm font-semibold truncate ${p.is_active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
                                {p.name_ar || '—'}
                              </p>
                              {!p.is_active && (
                                <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full font-semibold border border-red-200">
                                  معطَّل
                                </span>
                              )}
                            </div>
                            {p.username ? (
                              <p className={`text-xs truncate font-mono ${p.is_active ? 'text-violet-600' : 'text-slate-400'}`} dir="ltr">@{p.username}</p>
                            ) : (
                              <p className="text-xs text-red-500 truncate flex items-center gap-1">⚠️ بدون اسم دخول</p>
                            )}
                          </div>
                        </div>

                        {/* المؤسسة */}
                        <div className="col-span-2 hidden sm:block">
                          <p className={`text-xs truncate ${p.is_active ? 'text-slate-600' : 'text-slate-400'}`}>{p.school || '—'}</p>
                        </div>

                        {/* القسم */}
                        <div className="col-span-2 hidden md:block">
                          <p className={`text-xs truncate ${p.is_active ? 'text-slate-500' : 'text-slate-400'}`}>{p.department || '—'}</p>
                        </div>

                        {/* الدور */}
                        <div className="col-span-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium text-white whitespace-nowrap ${!p.is_active ? 'opacity-50' : ''}`}
                            style={{ backgroundColor: p.is_active ? roleInfo.color : '#94a3b8' }}>
                            {roleInfo.name_ar}
                          </span>
                        </div>

                        {/* إجراءات — زر التفعيل/التعطيل دائماً ظاهر */}
                        <div className="col-span-2 flex items-center gap-1 justify-end">
                          {/* زر إعادة تعيين كلمة المرور — يظهر عند hover */}
                          <button onClick={() => setConfirmReset(p)} disabled={resetingId === p.id}
                            title="إعادة تعيين كلمة المرور"
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors text-sm disabled:opacity-40 opacity-0 group-hover:opacity-100">
                            {resetingId === p.id ? '⏳' : '🔑'}
                          </button>

                          {/* زر التفعيل/التعطيل — دائماً ظاهر */}
                          <button onClick={() => toggleActive(p)}
                            title={p.is_active ? 'انقر لتعطيل الحساب' : 'انقر لتفعيل الحساب'}
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border transition-all ${
                              p.is_active
                                ? 'bg-green-50 text-green-700 border-green-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
                                : 'bg-red-50 text-red-600 border-red-200 hover:bg-green-50 hover:text-green-700 hover:border-green-200'
                            }`}>
                            {p.is_active ? '✅ نشط' : '🔴 معطَّل'}
                          </button>

                          {/* تعديل وحذف — عند hover */}
                          <button onClick={() => openEdit(p)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-50 transition-colors text-sm opacity-0 group-hover:opacity-100">✏️</button>
                          {!isProtected(p) && (
                            <button onClick={() => { setConfirmDel(p.id); setDelMsg(null) }}
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors text-sm opacity-0 group-hover:opacity-100">🗑️</button>
                          )}
                        </div>
                      </div>

                      {/* رسالة إعادة التعيين */}
                      {resetListMsg?.id === p.id && (
                        <div className={`px-4 py-2 text-xs font-medium border-t ${resetListMsg.ok ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                          {resetListMsg.text}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ══ نافذة تأكيد حذف المستخدم ══ */}
      {(() => {
        const delP = confirmDel ? profiles.find(p => p.id === confirmDel) : null
        return (
          <ConfirmDialog
            open={!!delP}
            title="حذف المستخدم"
            loading={deletingId === confirmDel}
            message={delP ? (
              <>
                سيتم حذف «<strong>{delP.name_ar}</strong>» نهائياً.
                {delMsg?.id === confirmDel && <span className="block text-red-600 font-semibold mt-1">{delMsg.text}</span>}
              </>
            ) : null}
            onConfirm={() => confirmDel && deleteProfile(confirmDel)}
            onCancel={() => { setConfirmDel(null); setDelMsg(null) }}
          />
        )
      })()}

      {/* ══ تأكيد إعادة تعيين كلمة المرور ══ */}
      <ConfirmDialog
        open={!!confirmReset}
        title="إعادة تعيين كلمة المرور"
        danger={false}
        icon="🔑"
        confirmLabel="توليد ونسخ الرابط"
        loading={!!resetingId}
        message={confirmReset ? (
          <>سيتم توليد <strong>رابط تعيين كلمة مرور جديدة</strong> لـ «<strong>{confirmReset.name_ar || confirmReset.email}</strong>» ونسخه — سلّمه للمستخدم ليضبط كلمته. (لا يُلغي كلمته الحالية حتى يستخدم الرابط.)</>
        ) : null}
        onConfirm={() => confirmReset && resetPasswordList(confirmReset)}
        onCancel={() => setConfirmReset(null)}
      />

      {/* ══════════════════════ مودال الإضافة / التعديل ══════════════════════ */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col"
            onClick={e => e.stopPropagation()}>

            {/* رأس المودال */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800">
                {editProfile ? '✏️ تعديل مستخدم' : '➕ إضافة مستخدم جديد'}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
            </div>

            {/* رابط الدعوة — يظهر بعد إنشاء مستخدم بلا كلمة مرور */}
            {inviteLink && (
              <div className="mx-5 mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                <p className="text-sm font-bold text-emerald-800 mb-1">✅ تم إنشاء المستخدم — شارك رابط الدعوة</p>
                <p className="text-xs text-emerald-700 mb-2">يفتح المستخدم هذا الرابط ليضبط كلمة مروره بنفسه (لا يلزم أن يعرفها أحد سواه):</p>
                <div className="flex items-center gap-2">
                  <input readOnly value={inviteLink} dir="ltr"
                    className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-emerald-200 bg-white text-xs text-slate-600" />
                  <button type="button"
                    onClick={() => { navigator.clipboard?.writeText(inviteLink); toast('تم نسخ رابط الدعوة') }}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-lg font-medium flex-shrink-0">📋 نسخ</button>
                  <button type="button" onClick={() => { setInviteLink(''); setShowForm(false) }}
                    className="px-3 py-2 border border-slate-200 text-slate-600 text-xs rounded-lg flex-shrink-0">تم</button>
                </div>
              </div>
            )}

            {/* تبويبات */}
            <div className="flex border-b border-slate-100 bg-slate-50">
              {TABS.map((tab, i) => (
                <button key={i} type="button" onClick={() => setFormTab(i)}
                  className={`flex-1 py-3 text-xs font-semibold transition-colors
                    ${formTab === i
                      ? 'text-violet-700 border-b-2 border-violet-600 bg-white'
                      : 'text-slate-500 hover:text-slate-700'}`}>
                  {tab}
                </button>
              ))}
            </div>

            {/* محتوى النموذج */}
            <form onSubmit={saveUser} className="flex-1 overflow-y-auto" autoComplete="off">
              <div className="p-5 space-y-4">

                {/* ══ تبويب 1: بيانات المستخدم ══ */}
                {formTab === 0 && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="الاسم الأول بالعربية *">
                        <input value={form.first_name_ar} onChange={e => setForm(d => ({ ...d, first_name_ar: e.target.value }))}
                          placeholder="مثال: محمد" className={inputCls} />
                      </Field>
                      <Field label="الاسم الأخير بالعربية *">
                        <input value={form.last_name_ar} onChange={e => setForm(d => ({ ...d, last_name_ar: e.target.value }))}
                          placeholder="مثال: العمري" className={inputCls} />
                      </Field>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label="الجنسية">
                        <select value={form.nationality} onChange={e => setForm(d => ({ ...d, nationality: e.target.value }))} className={inputCls}>
                          <option value="">— اختر —</option>
                          {nationalities.map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </Field>
                      <Field label="الجهة / المؤسسة">
                        <select value={form.school} onChange={e => setForm(d => ({ ...d, school: e.target.value }))} className={inputCls}>
                          <option value="">— اختر —</option>
                          {schools.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </Field>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label="القسم / المادة">
                        <select value={form.department} onChange={e => setForm(d => ({ ...d, department: e.target.value }))} className={inputCls}>
                          <option value="">— اختر —</option>
                          {departments.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </Field>
                      <Field label="المسمى الوظيفي">
                        <select value={form.job_title} onChange={e => setForm(d => ({ ...d, job_title: e.target.value }))} className={inputCls}>
                          <option value="">— اختر —</option>
                          {jobTitles.map(j => <option key={j} value={j}>{j}</option>)}
                        </select>
                      </Field>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label="الهاتف">
                        <input value={form.phone} onChange={e => setForm(d => ({ ...d, phone: e.target.value }))}
                          type="tel" placeholder="+974" dir="ltr" className={inputCls} />
                      </Field>
                      <Field label="البريد الإلكتروني *">
                        <input value={form.email} onChange={e => setForm(d => ({ ...d, email: e.target.value }))}
                          type="email" placeholder="example@gmail.com" dir="ltr" required
                          readOnly={!!editProfile} disabled={!!editProfile}
                          className={`${inputCls} ${editProfile ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`} />
                        {editProfile && (
                          <p className="text-xs text-slate-400 mt-1">البريد هو هوية تسجيل الدخول — لا يمكن تغييره بعد الإنشاء.</p>
                        )}
                      </Field>
                    </div>
                  </div>
                )}

                {/* ══ تبويب 2: الحساب ══ */}
                {formTab === 1 && (
                  <div className="space-y-4">

                    {/* اسم الدخول */}
                    <Field label="اسم الدخول *">
                      <div className="relative">
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 select-none text-base">👤</span>
                        <input
                          value={form.username}
                          onChange={e => setForm(d => ({
                            ...d,
                            username: e.target.value.replace(/[^a-z0-9._-]/gi, '').toLowerCase()
                          }))}
                          placeholder="مثال: hamdy.shouman"
                          dir="ltr"
                          autoComplete="off"
                          name="new-username"
                          spellCheck={false}
                          className={`w-full pr-9 pl-3 py-2.5 rounded-xl border focus:outline-none focus:ring-2 text-sm bg-white
                            ${form.username
                              ? 'border-green-300 focus:ring-green-300'
                              : 'border-red-200 focus:ring-red-300'}`} />
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        🔑 هذا ما يكتبه المستخدم عند تسجيل الدخول — أحرف إنجليزية وأرقام والرموز <span dir="ltr">. _ -</span> فقط (بدون بريد إلكتروني)
                      </p>
                    </Field>

                    {/* كلمة المرور الأولية (إنشاء فقط) */}
                    {!editProfile && (
                      <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
                        <h4 className="text-sm font-bold text-slate-700">🔒 كلمة المرور الأولية</h4>
                        <p className="text-xs text-slate-500">
                          • <strong>اتركها فارغة</strong> → يظهر <strong>رابط دعوة</strong> يضبط المستخدم به كلمته بنفسه.<br />
                          • أو عيّن <strong>كلمة مرور مؤقتة</strong> → سيُطالَب بتغييرها إجبارياً عند أول دخول.
                        </p>

                        <div className="grid grid-cols-2 gap-3">
                          <Field label="كلمة المرور">
                            <div className="relative">
                              <input type={showPass ? 'text' : 'password'} value={formPassword}
                                onChange={e => setFormPassword(e.target.value)}
                                autoComplete="new-password"
                                placeholder="8 أحرف على الأقل" dir="ltr"
                                className={inputCls} />
                              <button type="button" onClick={() => setShowPass(v => !v)}
                                className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm px-1">
                                {showPass ? '🙈' : '👁️'}
                              </button>
                            </div>
                          </Field>
                          <Field label="تأكيد كلمة المرور">
                            <input type={showPass ? 'text' : 'password'} value={formConfirmPass}
                              onChange={e => setFormConfirmPass(e.target.value)}
                              autoComplete="new-password"
                              placeholder="أعد الإدخال" dir="ltr"
                              className={inputCls} />
                          </Field>
                        </div>
                        {formPassword && formConfirmPass && formPassword !== formConfirmPass && (
                          <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">⚠️ كلمتا المرور غير متطابقتين</p>
                        )}

                        {/* إرسال بيانات الدخول */}
                        <div className="pt-1 border-t border-slate-200">
                          <p className="text-xs text-slate-500 mb-2">أو أرسل رابط تعيين كلمة المرور للبريد:</p>
                          <button type="button" onClick={sendCredentials}
                            disabled={sendingCreds || !form.email}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs rounded-xl transition-colors">
                            {sendingCreds ? '⏳ جارٍ الإرسال...' : '📧 إرسال بيانات الدخول للبريد'}
                          </button>
                          {credsMsg && (
                            <p className={`text-xs mt-2 px-3 py-2 rounded-lg ${credsMsg.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                              {credsMsg}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* إعادة تعيين كلمة المرور (تعديل فقط) */}
                    {editProfile && (
                      <div className="bg-amber-50 rounded-2xl p-4 space-y-3 border border-amber-200">
                        <h4 className="text-sm font-bold text-amber-800">🔑 إعادة تعيين كلمة المرور</h4>
                        <p className="text-xs text-amber-700">
                          سيصل رابط تعيين كلمة مرور جديدة إلى:
                          <span className="font-semibold mr-1 font-latin" dir="ltr">{editProfile.email}</span>
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button type="button" onClick={resetPasswordForm}
                            disabled={sendingReset || !editProfile.email}
                            className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs rounded-xl transition-colors">
                            {sendingReset ? '⏳ جارٍ...' : '📧 إرسال رابط بالبريد'}
                          </button>
                          <button type="button" onClick={copyResetLink}
                            disabled={sendingReset}
                            title="يولّد الرابط وينسخه دون إرسال بريد (يتجاوز حدّ الإرسال)"
                            className="flex items-center gap-2 px-4 py-2 border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50 text-xs rounded-xl transition-colors">
                            🔗 نسخ رابط إعادة التعيين
                          </button>
                        </div>
                        {resetMsg && (
                          <p className={`text-xs px-3 py-2 rounded-lg ${resetMsg.startsWith('✅') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {resetMsg}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ══ تبويب 3: الصلاحيات ══ */}
                {formTab === 2 && (
                  <div className="space-y-5">

                    {/* الدور */}
                    <div>
                      <Field label="الدور في النظام">
                        <select value={form.role} onChange={e => setForm(d => ({ ...d, role: e.target.value }))} className={inputCls}>
                          {roles.map(r => (
                            <option key={r.code} value={r.code}>{r.name_ar}</option>
                          ))}
                        </select>
                      </Field>
                    </div>

                    {/* صلاحيات الدور */}
                    <div>
                      <h4 className="text-sm font-bold text-slate-700 mb-2">🛡️ صلاحيات هذا الدور</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {ALL_PERMISSIONS.map(perm => {
                          const rolePerms = getRolePermissions(form.role)
                          const active = rolePerms.includes('all') || rolePerms.includes(perm.code)
                          return (
                            <div key={perm.code}
                              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-colors
                                ${active
                                  ? 'border-violet-200 bg-violet-50 text-violet-700'
                                  : 'border-slate-200 bg-slate-50 text-slate-400'}`}>
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${active ? 'bg-violet-500' : 'bg-slate-300'}`} />
                              <span className="flex-1">{perm.label}</span>
                              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-white text-xs font-bold
                                ${active ? 'bg-violet-500' : 'bg-slate-300'}`}>
                                {active ? '✓' : ''}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                      {getRolePermissions(form.role).includes('all') && (
                        <p className="text-xs text-violet-600 bg-violet-50 px-3 py-2 rounded-xl mt-2">
                          ⭐ هذا الدور يملك جميع الصلاحيات
                        </p>
                      )}
                      <p className="text-xs text-slate-400 mt-2">
                        لتعديل صلاحيات الدور اذهب إلى{' '}
                        <a href="/dashboard/settings" className="text-violet-600 hover:underline">الإعدادات ← الأدوار</a>
                      </p>
                    </div>

                    {/* الفرق */}
                    <div>
                      <h4 className="text-sm font-bold text-slate-700 mb-2">👥 عضوية الفرق</h4>
                      {allTeams.length === 0 ? (
                        <p className="text-xs text-slate-400 bg-slate-50 rounded-xl p-3">لا توجد فرق مُضافة حتى الآن</p>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {allTeams.map((team: any) => {
                            const membership = formTeams.find(m => m.team_id === team.id)
                            const isMember   = !!membership
                            const isLeader   = membership?.is_leader ?? false
                            return (
                              <div key={team.id}
                                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-colors
                                  ${isMember ? 'border-violet-200 bg-violet-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                                <input type="checkbox" checked={isMember}
                                  onChange={() => {
                                    if (isMember) setFormTeams(prev => prev.filter(m => m.team_id !== team.id))
                                    else setFormTeams(prev => [...prev, { team_id: team.id, is_leader: false }])
                                  }}
                                  className="w-4 h-4 accent-violet-600 cursor-pointer" />
                                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: team.color || '#6b7280' }} />
                                <span className="flex-1 text-sm text-slate-700">{team.name_ar}</span>
                                {isMember && (
                                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                    <input type="checkbox" checked={isLeader}
                                      onChange={() => setFormTeams(prev => prev.map(m =>
                                        m.team_id === team.id ? { ...m, is_leader: !m.is_leader } : m
                                      ))}
                                      className="w-3.5 h-3.5 accent-amber-500 cursor-pointer" />
                                    <span className="text-xs text-amber-700 font-semibold">⭐ قائد</span>
                                  </label>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                      <p className="text-xs text-slate-400 mt-1.5">⚠️ لا يُسمح بأكثر من قائد واحد في الفريق</p>
                    </div>

                    {/* الحالة */}
                    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <input type="checkbox" id="is_active_chk" checked={form.is_active}
                        onChange={e => setForm(d => ({ ...d, is_active: e.target.checked }))}
                        className="w-4 h-4 accent-violet-600 cursor-pointer" />
                      <label htmlFor="is_active_chk" className="text-sm font-medium text-slate-700 cursor-pointer">
                        الحساب نشط (مُفعَّل)
                      </label>
                    </div>

                    {/* إعدادات الإشعارات */}
                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-2">
                      <p className="text-xs font-semibold text-amber-800 mb-2">🔔 إعدادات الإشعارات</p>
                      <div className="flex items-center gap-3">
                        <input type="checkbox" id="notif_enabled_chk"
                          checked={(form as any).notif_enabled ?? true}
                          onChange={e => setForm(d => ({ ...d, notif_enabled: e.target.checked }))}
                          className="w-4 h-4 accent-amber-600 cursor-pointer" />
                        <label htmlFor="notif_enabled_chk" className="text-sm text-slate-700 cursor-pointer">
                          تفعيل الإشعارات لهذا المستخدم
                        </label>
                      </div>
                      <div className="flex items-center gap-3">
                        <input type="checkbox" id="notif_email_chk"
                          checked={(form as any).notif_email ?? true}
                          onChange={e => setForm(d => ({ ...d, notif_email: e.target.checked }))}
                          className="w-4 h-4 accent-amber-600 cursor-pointer" />
                        <label htmlFor="notif_email_chk" className="text-sm text-slate-700 cursor-pointer">
                          إرسال إشعارات بالبريد الإلكتروني
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* رسالة الخطأ */}
              {formError && (
                <div className="mx-5 mb-3 bg-red-50 text-red-700 px-4 py-2.5 rounded-xl text-sm border border-red-200">
                  ⚠️ {formError}
                </div>
              )}

              {/* أزرار التنقل والحفظ */}
              <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
                <div className="flex gap-2">
                  {formTab > 0 && (
                    <button type="button" onClick={() => setFormTab(t => t - 1)}
                      className="px-4 py-2 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50 transition-colors">
                      ← السابق
                    </button>
                  )}
                  {formTab < TABS.length - 1 && (
                    <button type="button" onClick={() => setFormTab(t => t + 1)}
                      className="px-4 py-2 bg-slate-100 text-slate-700 text-sm rounded-xl hover:bg-slate-200 transition-colors">
                      التالي →
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowForm(false)}
                    className="px-4 py-2 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50 transition-colors">
                    إلغاء
                  </button>
                  <button type="submit" disabled={saving}
                    className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl disabled:opacity-60 transition-colors">
                    {saving ? '⏳ جارٍ الحفظ...' : editProfile ? '💾 حفظ التعديلات' : '✅ إضافة المستخدم'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════ مودال الاستيراد ══════════════════════ */}
      {showImport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowImport(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}>

            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-800">📥 استيراد المستخدمين من Excel</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {importRows.length} صف ·{' '}
                  <span className="text-green-600 font-medium">{importRows.filter((_,i) => !importErrors[i]).length} صالح</span>
                  {Object.keys(importErrors).length > 0 && (
                    <span className="text-red-500 font-medium"> · {Object.keys(importErrors).length} به أخطاء</span>
                  )}
                </p>
              </div>
              <button onClick={() => setShowImport(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>

            <div className="flex-1 overflow-auto p-5">
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="text-xs w-full min-w-max">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-500 border-b border-slate-200 w-8">#</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-500 border-b border-slate-200">الحالة</th>
                      {XLS_COLS.map(c => (
                        <th key={c.key} className="px-3 py-2.5 text-right font-semibold text-slate-500 border-b border-slate-200 whitespace-nowrap">
                          {c.label}
                          {c.dropdown && <span className="mr-1 text-violet-400">▼</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.map((row, i) => {
                      const errs = importErrors[i] || []
                      const isValid = errs.length === 0
                      return (
                        <tr key={i} className={isValid ? 'hover:bg-green-50' : 'bg-red-50 hover:bg-red-100'}>
                          <td className="px-3 py-2 text-slate-400 font-mono border-b border-slate-100">{i + 1}</td>
                          <td className="px-3 py-2 border-b border-slate-100">
                            {isValid
                              ? <span className="text-green-600 font-semibold">✓ صالح</span>
                              : <div>
                                  <span className="text-red-600 font-semibold">✗ خطأ</span>
                                  <ul className="mt-1 space-y-0.5">
                                    {errs.map((e, j) => <li key={j} className="text-red-500">{e}</li>)}
                                  </ul>
                                </div>
                            }
                          </td>
                          {XLS_COLS.map(c => (
                            <td key={c.key} className="px-3 py-2 text-slate-700 border-b border-slate-100 whitespace-nowrap">
                              {row[c.label] ?? '—'}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {importMsg && (
                <p className={`mt-4 px-4 py-3 rounded-xl text-sm font-medium ${importMsg.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {importMsg}
                </p>
              )}
            </div>

            <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-400">
                سيتم استيراد الصفوف الصالحة فقط · الصفوف بها أخطاء ستُتجاهل
              </p>
              <div className="flex gap-2">
                <button onClick={() => setShowImport(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50">إلغاء</button>
                <button onClick={runImport} disabled={importing || importRows.filter((_,i) => !importErrors[i]).length === 0}
                  className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl disabled:opacity-60 transition-colors">
                  {importing ? '⏳ جارٍ الاستيراد...' : `✅ استيراد ${importRows.filter((_,i) => !importErrors[i]).length} مستخدم`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════ مكوّنات مساعدة ══════════════════════ */
const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-300 text-sm bg-white'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

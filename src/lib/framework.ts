import { createClient } from '@/lib/supabase/client'

/* ════════════════════════════════════════════════════════════
   قراءة إطار الاعتماد النشط (QNSA) من القاعدة — مصدر واحد.
   يحلّ محلّ جدول qnsa_standards (الكتالوج الأوّل، مسودة بلا مؤشرات).

   الإصدار يُختار بالحالة لا بالاسم: frameworks.status = 'active'.
   فيكفي تفعيل إصدار جديد في القاعدة لتتحوّل الواجهة إليه.
   ════════════════════════════════════════════════════════════ */

export type FrameworkNode = {
  id: string
  code: string          // '1' · '1.2' · '1.2.3' · '1.2.3.4'
  name_ar: string
  level: number         // 1 محور · 2 جانب · 3 معيار فرعي · 4 مؤشر أداء
}

export const FRAMEWORK_LEVEL_NAMES: Record<number, string> = {
  1: 'المعيار الرئيس', 2: 'الجانب', 3: 'المعيار الفرعي', 4: 'مؤشر الأداء',
}

/** أعمق مستوى يُختار من الإطار — المؤشر. */
export const FRAMEWORK_MAX_LEVEL = 4

/**
 * أبناء بندٍ في الإطار النشط: مستوىً واحد تحت `parentCode`.
 * المستوى الأول بلا أب (parentCode = null).
 *
 * الترشيح بسابقة الكود لا بـ parent_id: كود الابن = كود الأب + '.' + رقمه،
 * ومع تثبيت المستوى تصير السابقة مطابقةً تامّة للأبناء المباشرين — فيُقرأ
 * المستوى بطلب واحد دون معرفة معرّف الأب.
 */
export async function fetchFrameworkLevel(
  levelNum: number,
  parentCode: string | null,
): Promise<FrameworkNode[]> {
  if (levelNum < 1 || levelNum > FRAMEWORK_MAX_LEVEL) return []
  if (levelNum > 1 && !parentCode) return []

  const supabase = createClient()
  let q = supabase
    .from('framework_nodes')
    .select('id, code, name_ar, level, frameworks!inner(code, status)')
    .eq('frameworks.code', 'QNSA')
    .eq('frameworks.status', 'active')
    .eq('level', levelNum)
    .eq('is_active', true)
    .order('sort_order')

  if (levelNum > 1) q = q.like('code', `${parentCode}.%`)

  const { data, error } = await q
  if (error || !data) return []
  return data.map(({ id, code, name_ar, level }: any) => ({ id, code, name_ar, level }))
}

/** بيانات بندٍ واحد بكوده — للعرض التفصيلي (البيانات التوضيحية وأسئلة التأمل). */
export async function fetchFrameworkNode(code: string) {
  const { data } = await createClient()
    .from('framework_nodes')
    .select('id, code, name_ar, level, guidance_ar, reflection_ar, frameworks!inner(code, status)')
    .eq('frameworks.code', 'QNSA')
    .eq('frameworks.status', 'active')
    .eq('code', code)
    .maybeSingle()
  return data
}

/** أكواد بنود الإطار النشط كلّها — لتمييز البند الرسمي من المخصص. */
export async function fetchOfficialCodes(): Promise<Set<string>> {
  const { data } = await createClient()
    .from('framework_nodes')
    .select('code, frameworks!inner(code, status)')
    .eq('frameworks.code', 'QNSA')
    .eq('frameworks.status', 'active')
    .eq('is_active', true)
  return new Set((data || []).map((r: any) => r.code as string))
}

/* ════════════════════════════════════════════════════════════
   قراءة الإطار كاملاً — لصفحة عرض الإطار.
   الشجرة تُحمَّل مرّة واحدة (380 عقدة)، والتفاصيل الثقيلة
   (سلم التقدير · البيانات التوضيحية · الأدلة) تُحمَّل عند الطلب.
   ════════════════════════════════════════════════════════════ */

export type FrameworkMeta = {
  id: string; code: string; version: string
  name_ar: string; source_note: string | null; issued_at: string | null
}

export type TreeNode = FrameworkNode & { parent_id: string | null; source_page: number | null }

export type RubricRow = {
  row_index: number
  group_ar: string | null
  levels: Record<number, string>     // 5 ممتاز … 1 ضعيف
}

export type NoteItem = { sort_order: number; text_ar: string; source_page: number | null }

/** الإصدار النشط من إطار QNSA — أو null إن لم يوجد. */
export async function fetchActiveFramework(): Promise<FrameworkMeta | null> {
  const { data } = await createClient()
    .from('frameworks')
    .select('id, code, version, name_ar, source_note, issued_at')
    .eq('code', 'QNSA')
    .eq('status', 'active')
    .maybeSingle()
  return (data as FrameworkMeta) ?? null
}

/** كل عقد الإصدار (المستويات 1–4) مرتّبة عددياً بالكود. */
export async function fetchAllNodes(frameworkId: string): Promise<TreeNode[]> {
  const { data } = await createClient()
    .from('framework_nodes')
    .select('id, code, name_ar, level, parent_id, source_page')
    .eq('framework_id', frameworkId)
    .eq('is_active', true)
  const rows = (data || []) as TreeNode[]
  const key = (c: string) => c.split('.').map(n => parseInt(n, 10))
  return rows.sort((a, b) => {
    const A = key(a.code), B = key(b.code)
    for (let i = 0; i < Math.max(A.length, B.length); i++) {
      const d = (A[i] ?? -1) - (B[i] ?? -1)
      if (d) return d
    }
    return 0
  })
}

/** سلم التقدير لمعيار فرعي — صفوف، كل صفّ بمستوياته الخمسة. */
export async function fetchRubric(nodeId: string): Promise<RubricRow[]> {
  const { data } = await createClient()
    .from('framework_rubric')
    .select('row_index, level, descriptor_ar, group_ar')
    .eq('framework_node_id', nodeId)
    .order('row_index')
  const byRow = new Map<number, RubricRow>()
  for (const r of (data || []) as any[]) {
    if (!byRow.has(r.row_index)) byRow.set(r.row_index, { row_index: r.row_index, group_ar: r.group_ar, levels: {} })
    byRow.get(r.row_index)!.levels[r.level] = r.descriptor_ar
  }
  return [...byRow.values()].sort((a, b) => a.row_index - b.row_index)
}

/** البيانات التوضيحية وأسئلة التأمل لمعيار فرعي. */
export async function fetchNotes(nodeId: string): Promise<{ guidance: NoteItem[]; reflection: NoteItem[] }> {
  const { data } = await createClient()
    .from('framework_node_notes')
    .select('kind, sort_order, text_ar, source_page')
    .eq('framework_node_id', nodeId)
    .order('sort_order')
  const rows = (data || []) as any[]
  const pick = (k: string) => rows.filter(r => r.kind === k)
    .map(r => ({ sort_order: r.sort_order, text_ar: r.text_ar, source_page: r.source_page }))
  return { guidance: pick('guidance'), reflection: pick('reflection') }
}

/** نماذج الأدلة لجانب. */
export async function fetchEvidenceSamples(aspectNodeId: string): Promise<NoteItem[]> {
  const { data } = await createClient()
    .from('framework_evidence_samples')
    .select('sort_order, text_ar, source_page')
    .eq('framework_node_id', aspectNodeId)
    .order('sort_order')
  return (data || []) as NoteItem[]
}

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
 * ترتيب أكواد الإطار عدديّاً بمقاطعها — **مصدرٌ واحد** لكل قائمة.
 *
 * و`sort_order` لا يصلح وحده: هو رتبةٌ **داخل الأب** لا في الإطار كلّه
 * (1.1.1 و1.2.1 و1.3.1 كلّها = 1). فالترتيب به عبر مستوىً كامل يجمع
 * كلّ «الأوائل» معاً ثمّ كلّ «الثواني» — وهو ما ظهر في قائمة المراسي:
 * 1.2.4 · 1.3.4 · 2.1.4 … بدل 1.1.1 · 1.1.2 · 1.1.3. وأدهى منه أنّ
 * ترتيب الصفوف عند تساوي المفتاح **غير معرَّف**، فتختلف القائمة بين
 * تحميلٍ وتحميل بلا سبب ظاهر.
 *
 * والمقارنة عدديّة لا نصّية: '1.10' بعد '1.9' لا قبلها.
 */
export function compareFrameworkCodes(a: string, b: string): number {
  const A = a.split('.').map(n => parseInt(n, 10))
  const B = b.split('.').map(n => parseInt(n, 10))
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    const d = (A[i] ?? -1) - (B[i] ?? -1)
    if (d) return d
  }
  return 0
}

/** كود الجانب من كود المعيار الفرعي: '1.2.3' → '1.2'. */
export function aspectCodeOf(code: string): string {
  return code.split('.').slice(0, 2).join('.')
}

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
  return data
    .map(({ id, code, name_ar, level }: any) => ({ id, code, name_ar, level }))
    .sort((a, b) => compareFrameworkCodes(a.code, b.code))
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
  return rows.sort((a, b) => compareFrameworkCodes(a.code, b.code))
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

/**
 * كل بنود مستوىً في الإطار النشط — للقوائم **المسطّحة**: قائمةٌ واحدة
 * فيها المعايير الفرعية الستّة والسبعون، تُختار منها مباشرةً بلا تتبُّعٍ
 * لمحورٍ فجانبٍ فمعيار.
 *
 * ولم أوسّع `fetchFrameworkLevel` لتقبل أباً فارغاً بمعنى «الكلّ»، لأن
 * من دعاها بكودٍ لم يُختر بعد (`''`) يتوقّع قائمةً فارغة لا أربعة
 * وثمانين مؤشّراً — فالتسطيح نيّةٌ تُطلب صريحةً لا تُستنتج من غياب أب.
 */
export async function fetchFrameworkAllAtLevel(levelNum: number): Promise<FrameworkNode[]> {
  if (levelNum < 1 || levelNum > FRAMEWORK_MAX_LEVEL) return []
  const { data, error } = await createClient()
    .from('framework_nodes')
    .select('id, code, name_ar, level, frameworks!inner(code, status)')
    .eq('frameworks.code', 'QNSA')
    .eq('frameworks.status', 'active')
    .eq('level', levelNum)
    .eq('is_active', true)
  if (error || !data) return []
  /* الترتيب بالكود لا بـ`sort_order` — فهو رتبةٌ داخل الأب، وقائمةٌ
     مسطّحة تعبر الآباء كلّهم (انظر compareFrameworkCodes). */
  return data
    .map(({ id, code, name_ar, level }: any) => ({ id, code, name_ar, level }))
    .sort((a, b) => compareFrameworkCodes(a.code, b.code))
}

/** أسماء الجوانب بأكوادها: '1.2' → 'التخطيط والسياسات'. */
export type AspectLabels = Map<string, string>

/**
 * المعايير الفرعية كلّها ومعها أسماء جوانبها — رحلتان تكفيان القائمةَ
 * كلّها. والجوانب تُجلب لتُجمَّع بها القائمة في `<optgroup>`: ستّةٌ
 * وسبعون سطراً مسطّحاً تُقرأ بالعين سطراً سطراً، ومجموعةً تحت جانبها
 * تُقرأ كما يُقرأ الإطار نفسه.
 */
export async function fetchSubStandards(): Promise<{ subs: FrameworkNode[]; aspects: AspectLabels }> {
  const [subs, asp] = await Promise.all([
    fetchFrameworkAllAtLevel(3),
    fetchFrameworkAllAtLevel(2),
  ])
  return { subs, aspects: new Map(asp.map(a => [a.code, a.name_ar])) }
}

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

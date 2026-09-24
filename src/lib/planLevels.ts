/* ════════════════════════════════════════════════════════════
   مستويات هيكل الخطة — مصدر موحّد (إنشاء الخطة · معالج المدرسة ·
   واجهته الخادمية · منتقي بنود الإطار).

   المسمّيات **مطابقة لإطار الاعتماد** (قرار 2026-09-24): فعقدة الخطة
   في المستويات العليا **هي** بندٌ من الإطار، فيجب أن يقول الاسم ما
   تقوله البيانات. وقبل ذلك كانت قوائم مثل «المجال · البرنامج ·
   المبادرة» تُعرض بينما يفتح المنتقي جوانب الاعتماد ومعاييره.

   «مؤشر الأداء» هو لفظ الدليل نفسه، وهو موافق للعرف الدولي
   (ACS WASC: Category → Standard → Criterion → **Indicator**).
   أمّا مؤشرات الأداء الرئيسية الخاصة بالخطة فتُسمّى «م.أ.ر KPI»
   تمييزاً لها — انظر KPI_LABEL في هذا الملف.

   وكل قائمة **شريحة متّصلة من أعلى الإطار وتنتهي بالهدف** — لأن
   الهدف عمل المدرسة نفسها، ولا خطة بلا هدف. والمهمة ليست مستوىً
   في الهيكل بل كيان مستقلّ مثبَّت أسفل الشجرة دائماً.
   ════════════════════════════════════════════════════════════ */

/** أسماء مستويات الإطار — كما في دليل الاعتماد حرفياً. */
export const FRAMEWORK_LEVEL_LABELS: Record<number, string> = {
  1: 'المعيار الرئيس',
  2: 'الجانب',
  3: 'المعيار الفرعي',
  4: 'مؤشر الأداء',
}

/** مستوى عمل المدرسة — أعمق مستوى في الهيكل، وهو الوحيد الحرّ. */
export const GOAL_LABEL = 'الهدف'

/** تسمية مؤشرات الأداء الرئيسية الخاصة بالخطة (تمييزاً عن مؤشر الإطار). */
export const KPI_LABEL = 'م.أ.ر KPI'

export const LEVEL_PRESETS: Record<number, string[]> = {
  2: [FRAMEWORK_LEVEL_LABELS[1], GOAL_LABEL],
  3: [FRAMEWORK_LEVEL_LABELS[1], FRAMEWORK_LEVEL_LABELS[2], GOAL_LABEL],
  4: [FRAMEWORK_LEVEL_LABELS[1], FRAMEWORK_LEVEL_LABELS[2], FRAMEWORK_LEVEL_LABELS[3], GOAL_LABEL],
  5: [FRAMEWORK_LEVEL_LABELS[1], FRAMEWORK_LEVEL_LABELS[2], FRAMEWORK_LEVEL_LABELS[3],
      FRAMEWORK_LEVEL_LABELS[4], GOAL_LABEL],
}

/** عدد المستويات المتاحة (مرتّبة تنازلياً للعرض في المعالج). */
export const LEVEL_COUNTS = [5, 4, 3, 2]

/** نصّ خيار القائمة: «4 — المعيار الرئيس · الجانب · …» */
export const levelOptionLabel = (n: number) => `${n} — ${(LEVEL_PRESETS[n] || []).join(' · ')}`

/**
 * أيّ مستوى من الإطار يقابل مستوى الخطة رقم `levelNum`؟
 *
 * لا يصحّ افتراض أن مستوى الخطة N = مستوى الإطار N: خطةٌ من ثلاثة
 * مستويات ثالثُها **الهدف** (نصّ حرّ)، ولو افترضنا التطابق لفتح
 * المنتقي لها قائمة المعايير الفرعية.
 *
 * المطابقة بالاسم المخزَّن في الخطة (`plans.level_names`)، فتعمل مع
 * الخطط القديمة ذات الأسماء المخصّصة: اسمٌ غير معروف ⇒ مستوىً حرّ.
 */
export function frameworkLevelOf(levelNames: unknown, levelNum: number): number | null {
  const names = Array.isArray(levelNames) ? levelNames : []
  const name = String(names[levelNum - 1] ?? '').trim()
  if (!name) return null
  const hit = Object.entries(FRAMEWORK_LEVEL_LABELS).find(([, label]) => label === name)
  return hit ? Number(hit[0]) : null
}

'use client'

import { aspectCodeOf, type AspectLabels, type FrameworkNode } from '@/lib/framework'

/**
 * خيارات المعايير الفرعية مجموعةً تحت جوانبها — لكل قائمةٍ تختار مرساةً.
 *
 * ستّةٌ وسبعون سطراً مسطّحاً تُقرأ بالعين سطراً سطراً؛ ومجموعةً تحت
 * «1.2 — التخطيط والسياسات» تُقرأ كما يُقرأ الإطار نفسه، فيصل الباحث
 * إلى معياره بقفزةٍ لا بمسح.
 *
 * ويُشترط أن تكون `subs` مرتّبةً بالكود — وهو ما تضمنه
 * `fetchSubStandards` — فالتجميع هنا **تتابعيّ** لا بخريطة، ليحفظ
 * ترتيب الجوانب كما هو في الإطار.
 *
 * **والاسم يُقصّ عرضاً لا حجباً:** متوسّط أسماء المعايير الفرعية
 * **تسعةٌ وستّون حرفاً** وأطولها مئةٌ وسبعة عشر. وقائمة `<select>`
 * الأصلية تتّسع في المتصفّح لأطول خيارٍ فيها — فتركُها بلا حدّ يجعل
 * القائمة أعرض من النموذج نفسه ويكسر اتّساقه. فيُقصّ المعروض عند
 * حدٍّ **عند آخر كلمة تامّة** بعلامة «…» صريحة، **وتمامُه مضمونٌ
 * بطريقين**: `title` عند التحويم، و`ChosenSubStandard` تحت الحقل
 * بعد الاختيار. فالقصُّ هنا عَرْضٌ ضيّق لا معلومةٌ ضائعة.
 *
 * `by`: قيمة الخيار — معرّف البند (الافتراض) أو كوده، فالشاشات تختلف.
 * `trim`: حدُّ المعروض — خمسون حرفاً تسع الجملة الوسطى.
 */
function clip(s: string, n: number): string {
  if (s.length <= n) return s
  const cut = s.slice(0, n)
  const sp  = cut.lastIndexOf(' ')
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s،.]+$/, '') + '…'
}

export default function SubStandardOptions({
  subs, aspects, by = 'id', trim = 50,
}: {
  subs: FrameworkNode[]
  aspects: AspectLabels
  by?: 'id' | 'code'
  trim?: number
}) {
  const groups: { code: string; items: FrameworkNode[] }[] = []
  for (const s of subs) {
    const g = aspectCodeOf(s.code)
    const last = groups[groups.length - 1]
    if (last && last.code === g) last.items.push(s)
    else groups.push({ code: g, items: [s] })
  }

  return (
    <>
      {groups.map(g => (
        <optgroup key={g.code} label={`${g.code} — ${aspects.get(g.code) || ''}`}>
          {g.items.map(s => (
            <option key={s.id} value={by === 'code' ? s.code : s.id}
              title={`${s.code} — ${s.name_ar}`}>
              {s.code} — {clip(s.name_ar, trim)}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  )
}

/**
 * اسم المعيار المختار كاملاً تحت الحقل.
 *
 * فالحقل مغلقاً يقصّ بالـCSS بثلاث نقاط — وهو سلوك المتصفّح لا قصٌّ في
 * النصّ، لكنّ المختار هو ما يُبنى عليه القرار: مراسي مهمّةٍ دورية ترثها
 * أدلّةُ سنوات (5.1)، أو حكمٌ على دليلٍ في الفرز. **فما يُبنى عليه قرار
 * يُقرأ كاملاً** لا يُستدلّ عليه برقمٍ وأوّل سطر.
 */
export function ChosenSubStandard({ sub }: { sub?: FrameworkNode | null }) {
  if (!sub) return null
  return (
    <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600 bg-slate-50 border border-slate-100 rounded-xl px-2.5 py-1.5">
      <span className="font-latin font-semibold text-slate-500">{sub.code}</span>
      <span> — {sub.name_ar}</span>
    </p>
  )
}

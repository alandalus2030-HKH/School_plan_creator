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
 * **ولا يُقصّ الاسم:** قصصتُه أوّلاً عند خمسين حرفاً فظهر نصفُ الجملة
 * («إعداد وتطبيق خطط شاملة تسهم في تحقيق رؤية ورسالة و…») — ومتوسّط
 * أسماء المعايير الفرعية **تسعةٌ وستّون حرفاً** وأطولها مئةٌ وسبعة
 * عشر، فأربعةٌ وأربعون من ستّةٍ وسبعين تتجاوز الستّين. والقصُّ هنا
 * ليس اختصاراً بل **حجبٌ لما يُختار به**. فالقائمة تتّسع لأطولها،
 * وما ضاق عنه عرضُ الشاشة يُقرأ من `title` عند التحويم.
 *
 * `by`: قيمة الخيار — معرّف البند (الافتراض) أو كوده، فالشاشات تختلف.
 */
export default function SubStandardOptions({
  subs, aspects, by = 'id',
}: {
  subs: FrameworkNode[]
  aspects: AspectLabels
  by?: 'id' | 'code'
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
              {s.code} — {s.name_ar}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  )
}

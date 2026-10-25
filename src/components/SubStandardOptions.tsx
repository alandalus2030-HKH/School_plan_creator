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
 * `by`: قيمة الخيار — معرّف البند (الافتراض) أو كوده، فالشاشات تختلف.
 * `trim`: حدُّ اسم البند حين تضيق القائمة.
 */
export default function SubStandardOptions({
  subs, aspects, by = 'id', trim,
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
            <option key={s.id} value={by === 'code' ? s.code : s.id}>
              {s.code} — {trim ? s.name_ar.slice(0, trim) : s.name_ar}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  )
}

'use client'

import { AlertTriangle, MapPin, User } from 'lucide-react'
import type { ConflictResult } from '@/lib/conflicts'

/** لافتة تحذير ناعم بتعارض الأماكن/الموظف — غير مانعة */
export default function ConflictWarning({ result, compact }: { result: ConflictResult; compact?: boolean }) {
  const { location, assignee } = result
  if (location.length === 0 && assignee.length === 0) return null

  const fmt = (s: string | null, e: string | null) => {
    if (!s) return ''
    const d = (x: string) => new Date(x).toLocaleDateString('ar-QA')
    return e && e !== s ? `${d(s)} ← ${d(e)}` : d(s)
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
        <AlertTriangle size={16} /> تنبيه تعارض محتمل (لن يمنع الحفظ)
      </div>

      {location.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-amber-700 flex items-center gap-1"><MapPin size={13} /> تعارض في المكان:</p>
          {location.map(t => (
            <div key={t.id} className="text-xs text-amber-800 bg-white/70 border border-amber-100 rounded-lg px-3 py-1.5">
              <span className="font-medium">{t.name_ar}</span>
              {t.locations && t.locations.length > 0 && <span className="text-amber-600"> — {t.locations.join('، ')}</span>}
              {!compact && t.start_date && <span className="text-amber-500 mr-2">({fmt(t.start_date, t.end_date)})</span>}
            </div>
          ))}
        </div>
      )}

      {assignee.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-amber-700 flex items-center gap-1">
            <User size={13} /> الموظف مكلّف بـ {assignee.length} مهمة أخرى متداخلة زمنياً:
          </p>
          {assignee.map(t => (
            <div key={t.id} className="text-xs text-amber-800 bg-white/70 border border-amber-100 rounded-lg px-3 py-1.5">
              <span className="font-medium">{t.name_ar}</span>
              {!compact && t.start_date && <span className="text-amber-500 mr-2">({fmt(t.start_date, t.end_date)})</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

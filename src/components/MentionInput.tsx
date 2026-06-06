'use client'

import { useState, useRef, useEffect } from 'react'

type MentionUser = { id: string; name_ar: string; job_title?: string | null }

interface MentionInputProps {
  value:        string
  onChange:     (val: string) => void
  users:        MentionUser[]
  placeholder?: string
  rows?:        number
  className?:   string
}

/**
 * MentionInput — textarea مع دعم @ذكر المستخدمين
 * عند كتابة @ تظهر قائمة المستخدمين للاختيار
 */
export default function MentionInput({
  value, onChange, users, placeholder, rows = 3, className = '',
}: MentionInputProps) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const [showList, setShowList] = useState(false)
  const [query,    setQuery]    = useState('')
  const [active,   setActive]   = useState(0)
  const [anchor,   setAnchor]   = useState(0)   // موضع @ في النص

  /* فلترة المستخدمين حسب ما كُتب بعد @ */
  const filtered = query
    ? users.filter(u => u.name_ar?.includes(query)).slice(0, 6)
    : users.slice(0, 6)

  /* رصد كتابة @ */
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    const pos = e.target.selectionStart
    onChange(val)

    /* ابحث عن آخر @ قبل المؤشر */
    const textBefore = val.slice(0, pos)
    const match = textBefore.match(/@([^\s@]*)$/)
    if (match) {
      setShowList(true)
      setQuery(match[1])
      setAnchor(pos - match[1].length - 1)   // موضع @
      setActive(0)
    } else {
      setShowList(false)
    }
  }

  /* إدراج المستخدم المختار */
  const insertMention = (user: MentionUser) => {
    const before = value.slice(0, anchor)
    const after  = value.slice(anchor + 1 + query.length)
    const newVal = `${before}@${user.name_ar} ${after}`
    onChange(newVal)
    setShowList(false)
    setTimeout(() => taRef.current?.focus(), 0)
  }

  /* تنقل بالأسهم */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showList || filtered.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    if (e.key === 'Enter' && showList) { e.preventDefault(); insertMention(filtered[active]) }
    if (e.key === 'Escape') setShowList(false)
  }

  return (
    <div className="relative">
      <textarea
        ref={taRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        rows={rows}
        placeholder={placeholder}
        className={className}
      />

      {/* قائمة الاقتراحات */}
      {showList && filtered.length > 0 && (
        <div className="absolute z-30 bottom-full mb-1 right-0 w-56 bg-white rounded-xl shadow-lg
                        border border-slate-200 overflow-hidden max-h-52 overflow-y-auto">
          <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 text-[10px] text-slate-400 font-semibold">
            اذكر مستخدماً
          </div>
          {filtered.map((u, i) => (
            <button
              key={u.id}
              type="button"
              onMouseDown={e => { e.preventDefault(); insertMention(u) }}
              onMouseEnter={() => setActive(i)}
              className={`w-full text-right px-3 py-2 flex items-center gap-2 transition-colors
                ${active === i ? 'bg-violet-50' : 'hover:bg-slate-50'}`}>
              <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 flex items-center
                               justify-center text-[10px] font-bold flex-shrink-0">
                {u.name_ar?.[0] || '؟'}
              </span>
              <div className="min-w-0 text-right">
                <p className="text-xs font-medium text-slate-700 truncate">{u.name_ar}</p>
                {u.job_title && <p className="text-[10px] text-slate-400 truncate">{u.job_title}</p>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * استخراج المستخدمين المذكورين من نص التعليق
 * يُطابق @الاسم مع قائمة المستخدمين
 */
export function extractMentions(text: string, users: MentionUser[]): MentionUser[] {
  const mentioned: MentionUser[] = []
  for (const u of users) {
    if (text.includes(`@${u.name_ar}`)) mentioned.push(u)
  }
  return mentioned
}

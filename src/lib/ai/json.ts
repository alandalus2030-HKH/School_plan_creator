/* ════════════════════════════════════════════════════════════
   قراءة ردّ الذكاء الاصطناعي حين يكون المنتظَر **قائمة**.

   لماذا هذا الملفّ (2026-10-07):
   كان كل منفذ يلتقط القائمة بتعبيرٍ نمطيّ واحد `/\[[\s\S]*\]/` —
   وهو **جَشِع**: يأخذ من أوّل قوسٍ في النصّ إلى **آخر** قوسٍ فيه.
   فإن أتبع النموذج المصفوفة بسطر شرحٍ فيه قوس، أو كتب مصفوفتين،
   دخل الزائد في اللقطة فانفجر `JSON.parse` برسالةٍ إنجليزية خرجت
   إلى شاشة المدرسة: «Unexpected non-whitespace character after JSON».

   والعلاج هنا طبقتان:
     • `response_format: json_object` في المنفذ — يضمن المزوّد سلامة
       البناء من أصله (وهو ما يوصي به تعليق `groq.ts` لعائلة gpt-oss).
     • وهذه الدالّة شبكةً تحته — فالجواب قد يُبتَر إن نفدت الرموز،
       وقد يعود نموذجٌ بديل بنصٍّ حول المصفوفة.

   والقراءة هنا **بعدّ الأقواس لا بتعبيرٍ نمطيّ**: نمسح من أوّل قوسٍ
   ونعدّ العمق محترمين ما بين علامتي اقتباس (والمهروب منها)، فنقف عند
   القوس المقابل لا عند آخر قوسٍ في الصفحة.
   ════════════════════════════════════════════════════════════ */

/** مفاتيح يُغلِّف بها النموذج القائمة في وضع JSON الصارم. */
const ARRAY_KEYS = ['items', 'suggestions', 'results', 'data', 'list', 'tasks', 'goals', 'kpis', 'events']

/**
 * المقاطع المتوازنة التي تبدأ بالقوس المطلوب — أوّلها أوّل مرشّح.
 * يُكتفى بأربعة: ما بعدها ثرثرةٌ لا جواب.
 */
function balancedSlices(text: string, open: '[' | '{', max = 4): string[] {
  const close = open === '[' ? ']' : '}'
  const out: string[] = []

  for (let start = text.indexOf(open); start !== -1 && out.length < max; start = text.indexOf(open, start + 1)) {
    let depth = 0, inStr = false, esc = false

    for (let i = start; i < text.length; i++) {
      const ch = text[i]
      if (esc)        { esc = false; continue }
      if (inStr)      { if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue }
      if (ch === '"') { inStr = true; continue }

      if (ch === open) depth++
      else if (ch === close && --depth === 0) { out.push(text.slice(start, i + 1)); break }
    }
  }
  return out
}

/** القائمة داخل كائن: `items` وأخواتها، وإلّا فأوّل قيمةٍ هي مصفوفة. */
function arrayInObject(obj: unknown): unknown[] | null {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
  const rec = obj as Record<string, unknown>
  for (const k of ARRAY_KEYS) if (Array.isArray(rec[k])) return rec[k] as unknown[]
  for (const v of Object.values(rec)) if (Array.isArray(v)) return v
  return null
}

/**
 * يستخرج القائمة من ردٍّ خام مهما غُلِّف: مصفوفةً خالصة · كائناً
 * `{"items":[…]}` · مُحاطاً بسياجٍ markdown أو بشرحٍ قبله أو بعده.
 * يُرجع `null` إن لم يُفهم الردّ — فيُسجَّل خامُه ويُعتذر بالعربية.
 */
export function parseAiArray(raw: string): unknown[] | null {
  const text = String(raw || '')
  const firstAt = text.search(/[[{]/)
  if (firstAt === -1) return null

  /* يُبدأ بالقوس الأسبق: مصفوفةٌ خالصة أم كائنٌ يغلّفها */
  const order: ('[' | '{')[] = text[firstAt] === '[' ? ['[', '{'] : ['{', '[']

  for (const open of order) {
    for (const slice of balancedSlices(text, open)) {
      try {
        const parsed = JSON.parse(slice)
        if (Array.isArray(parsed)) return parsed
        const inner = arrayInObject(parsed)
        if (inner) return inner
      } catch { /* مرشّحٌ فاسد — يُجرَّب ما بعده */ }
    }
  }
  return null
}

/** القائمة نصوصاً: يقبل `["نصّ"]` و`[{"name_ar":"نصّ"}]`. */
export function parseAiStrings(raw: string): string[] | null {
  const arr = parseAiArray(raw)
  if (!arr) return null
  return arr
    .map((s: any) => (typeof s === 'string' ? s : s?.name_ar || s?.name || s?.text || ''))
    .map((s: string) => String(s).trim())
    .filter(Boolean)
}

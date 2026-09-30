/* ════════════════════════════════════════════════════════════
   بصمة المحتوى — SHA-256 في المتصفّح.

   موضعها من التصميم (الوثيقة §11): تُحسب هنا **قبل الرفع** لكشف
   المكرّر فلا يُرسَل ما هو موجود أصلاً. أمّا البصمة **المعتمدة** فهي
   التي يحسبها الخادم من البايتات المستلَمة — لأن ما يأتي من المتصفّح
   يمكن أن يُزوَّر.

   `crypto.subtle` متاح في السياق الآمن (https أو localhost) وحده،
   فإن غاب نُرجع null ويمضي الرفع بلا كشفٍ مسبق — والخادم يحسبها
   على أيّ حال.
   ════════════════════════════════════════════════════════════ */

export async function sha256(file: Blob): Promise<string | null> {
  try {
    if (typeof crypto === 'undefined' || !crypto.subtle) return null
    const buf    = await file.arrayBuffer()
    const digest = await crypto.subtle.digest('SHA-256', buf)
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  } catch {
    return null
  }
}

/** أول 12 خانة — ما يُطبع على ورقة غلاف الدليل (§9.4). */
export const shortHash = (h: string | null | undefined) =>
  h ? h.slice(0, 12) : ''

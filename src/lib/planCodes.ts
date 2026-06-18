/* ════════════════════════════════════════════════════════════
   ترقيم عقد الخطة (محسوب لا مخزَّن):
   - المستويات 1-3: تُبقي كودها الرسمي من كتالوج الاعتماد إن وُجد.
   - المستويات الأعمق (الأهداف وما دونها): رقم هرمي = كود الأب + ترتيبه
     بين إخوته (1..n) حسب order_num — فيُرقَّم تلقائياً ويُعاد ترقيمه
     تلقائياً عند الحذف بلا فجوات.
   ════════════════════════════════════════════════════════════ */

export type CodeNode = {
  id: string
  parent_id: string | null
  level_num: number
  order_num: number
  standard_code: string | null
}

/** يُرجع خريطة { معرّف العقدة → الكود الفعّال المعروض } لكل العقد. */
export function computeNodeCodes(nodes: CodeNode[]): Record<string, string> {
  const byParent: Record<string, CodeNode[]> = {}
  for (const n of nodes) {
    const k = n.parent_id ?? 'root'
    ;(byParent[k] ||= []).push(n)
  }
  for (const k in byParent) byParent[k].sort((a, b) => a.order_num - b.order_num)

  const codes: Record<string, string> = {}
  const walk = (parentId: string | null, parentCode: string) => {
    const list = byParent[parentId ?? 'root'] || []
    list.forEach((n, i) => {
      const seq = i + 1
      // الكود الرسمي يُحترَم في المستويات 1-3 فقط (كتالوج الاعتماد بثلاثة مستويات)
      const official = n.standard_code && n.level_num <= 3 ? n.standard_code : null
      const code = official ?? (parentCode ? `${parentCode}.${seq}` : `${seq}`)
      codes[n.id] = code
      walk(n.id, code)
    })
  }
  walk(null, '')
  return codes
}

export type CodeTask = {
  id: string
  node_id: string
  order_num: number | null
  created_at?: string | null
}

/**
 * ترقيم المهام هرمياً (محسوب): رقم المهمة = كود عقدتها + ترتيبها بين
 * مهام العقدة (1..n) حسب order_num ثم created_at — فيُعاد الترقيم تلقائياً
 * عند حذف مهمة قبلها.
 */
export function computeTaskCodes(tasks: CodeTask[], nodeCodes: Record<string, string>): Record<string, string> {
  const byNode: Record<string, CodeTask[]> = {}
  for (const t of tasks) (byNode[t.node_id] ||= []).push(t)

  const res: Record<string, string> = {}
  for (const nodeId in byNode) {
    const base = nodeCodes[nodeId]
    if (!base) continue
    byNode[nodeId].sort((a, b) =>
      (a.order_num ?? 0) - (b.order_num ?? 0) ||
      String(a.created_at || '').localeCompare(String(b.created_at || '')))
    byNode[nodeId].forEach((t, i) => { res[t.id] = `${base}.${i + 1}` })
  }
  return res
}

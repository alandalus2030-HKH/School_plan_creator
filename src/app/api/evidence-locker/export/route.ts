import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { requireAuth } from '@/lib/supabase/server'

/**
 * تصدير قائمة خزانة الأدلة (المُصفّاة) إلى ملف Excel.
 * يستقبل صفوفاً جاهزة من العميل (مفاتيحها = عناوين الأعمدة بالعربية)
 * ويبنيها في ورقة RTL بترويسة مثبّتة — بلا إعادة استعلام للقاعدة
 * (البيانات مُصرَّح بها أصلاً عبر GET، فلا تسرّب جديد).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const body = await req.json().catch(() => ({}))
  const rows: Record<string, string | number>[] = Array.isArray(body?.rows) ? body.rows : []
  const fileName = encodeURIComponent(`${body?.fileName || 'خزانة-الأدلة'}.xlsx`)

  const headers = rows.length ? Object.keys(rows[0]) : ['—']

  const wb = new ExcelJS.Workbook()
  wb.creator = 'School Plan System'
  wb.created = new Date()
  const ws = wb.addWorksheet('الأدلة', {
    views: [{ state: 'frozen', ySplit: 1, rightToLeft: true }],
  })

  /* الترويسة */
  ws.addRow(headers)
  const hr = ws.getRow(1)
  hr.height = 30
  hr.eachCell(cell => {
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8A1538' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  })

  /* صفوف البيانات */
  rows.forEach(r => {
    const row = ws.addRow(headers.map(h => r[h] ?? ''))
    row.height = 20
    row.eachCell({ includeEmpty: true }, cell => {
      cell.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true }
    })
  })

  /* عرض الأعمدة تلقائياً حسب أطول محتوى */
  headers.forEach((h, i) => {
    const maxLen = Math.max(h.length, ...rows.map(r => String(r[h] ?? '').length))
    ws.getColumn(i + 1).width = Math.min(Math.max(maxLen + 4, 12), 50)
  })

  const buffer = await wb.xlsx.writeBuffer()
  return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${fileName}`,
    },
  })
}

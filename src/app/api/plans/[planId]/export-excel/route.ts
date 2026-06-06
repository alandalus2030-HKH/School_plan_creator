import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'
import { requireAuth } from '@/lib/supabase/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/** تحويل رقم العمود (1-based) إلى حرف Excel */
function colLetter(idx: number): string {
  let letter = ''
  while (idx > 0) {
    const rem = (idx - 1) % 26
    letter = String.fromCharCode(65 + rem) + letter
    idx = Math.floor((idx - 1) / 26)
  }
  return letter
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ planId: string }> }
) {
  /* ── التحقق من هوية المُستدعي أولاً ── */
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const { planId } = await context.params

  /* ── جلب الخطة ── */
  const { data: plan } = await supabaseAdmin
    .from('plans')
    .select('id, name_ar, level_count, level_names')
    .eq('id', planId)
    .single()

  if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })

  /* ── جلب العقد ── */
  const { data: nodes } = await supabaseAdmin
    .from('plan_nodes')
    .select('id, parent_id, level_num, name_ar, order_num')
    .eq('plan_id', planId)
    .order('order_num')

  const nodeIds = (nodes || []).map((n: any) => n.id)

  /* ── جلب المهام + الملفات الشخصية + الفرق ── */
  let allTasks: any[] = []
  if (nodeIds.length > 0) {
    const { data: t } = await supabaseAdmin
      .from('tasks')
      .select('id,name_ar,status,priority,task_type,start_date,end_date,node_id,order_num,assigned_to_user_id,assigned_to_team_id,budget_qar,other_resources,evidence_required')
      .in('node_id', nodeIds)
    allTasks = t || []
  }

  const [{ data: profiles }, { data: teams }] = await Promise.all([
    supabaseAdmin.from('profiles').select('id,name_ar').order('name_ar'),
    supabaseAdmin.from('teams').select('id,name_ar').order('name_ar'),
  ])
  const profileMap   = Object.fromEntries((profiles || []).map((p: any) => [p.id, p.name_ar]))
  const teamMap      = Object.fromEntries((teams    || []).map((t: any) => [t.id, t.name_ar]))
  const profileNames = (profiles || []).map((p: any) => p.name_ar).filter(Boolean) as string[]
  const teamNames    = (teams    || []).map((t: any) => t.name_ar).filter(Boolean) as string[]

  /* ── خرائط الترجمة ── */
  const STATUS_AR:   Record<string,string> = { not_started:'لم تبدأ', in_progress:'جارية', completed:'منجزة', delayed:'متأخرة' }
  const PRIORITY_AR: Record<string,string> = { high:'عالية', medium:'متوسطة', low:'منخفضة' }
  const TYPE_AR:     Record<string,string> = { academic:'أكاديمية', administrative:'إدارية', general:'عامة' }

  const lNames   = (plan.level_names || []) as string[]
  const lCount   = plan.level_count  || 3
  const colNames = Array.from({ length: lCount }, (_: any, i: number) => lNames[i] || `المستوى ${i + 1}`)
  const TASK_COL = 'المهمة'
  const TASK_HEADERS = [
    'الحالة', 'الأولوية', 'النوع',
    'تاريخ البداية', 'تاريخ الانتهاء',
    'المكلف', 'الفريق المكلف',
    'الموارد المالية (ر.ق)', 'الموارد الأخرى', 'أدلة الإنجاز',
  ]
  const headers = [...colNames, TASK_COL, ...TASK_HEADERS]

  /* ─────────────────────────────────────────
     أرقام الأعمدة (1-indexed لـ ExcelJS)
     headers index (0-based):
       lCount+0  → المهمة
       lCount+1  → الحالة
       lCount+2  → الأولوية
       lCount+3  → النوع
       lCount+4  → تاريخ البداية
       lCount+5  → تاريخ الانتهاء
       lCount+6  → المكلف
       lCount+7  → الفريق المكلف
       lCount+8  → الموارد المالية
       lCount+9  → الموارد الأخرى
       lCount+10 → أدلة الإنجاز
  ───────────────────────────────────────── */
  const statusColNum   = lCount + 2   // lCount+1+1
  const priorityColNum = lCount + 3
  const typeColNum     = lCount + 4
  const startDateColNum = lCount + 5
  const endDateColNum   = lCount + 6
  const userColNum      = lCount + 7
  const teamColNum      = lCount + 8
  const budgetColNum    = lCount + 9

  /* ── بناء صفوف البيانات ── */
  type RowData = (string | number | Date | null)[]
  const dataRows: RowData[] = []

  const processNode = (parentId: string | null, depth: number, path: string[]) => {
    ;(nodes || [])
      .filter((n: any) => n.parent_id === parentId && n.level_num === depth)
      .sort((a: any, b: any) => a.order_num - b.order_num)
      .forEach((node: any) => {
        const newPath = [...path, node.name_ar]

        // صف العقدة
        const nodeRow: RowData = headers.map((_, i) => i < lCount ? (newPath[i] || '') : '')
        dataRows.push(nodeRow)

        // مهام هذه العقدة
        allTasks
          .filter((t: any) => t.node_id === node.id)
          .sort((a: any, b: any) => (a.order_num || 0) - (b.order_num || 0))
          .forEach((task: any) => {
            const tr: RowData = headers.map((_, i) => i < lCount ? (newPath[i] || '') : '')
            tr[lCount]      = task.name_ar || ''
            tr[lCount + 1]  = STATUS_AR[task.status]      || ''
            tr[lCount + 2]  = PRIORITY_AR[task.priority]  || ''
            tr[lCount + 3]  = TYPE_AR[task.task_type]     || ''
            tr[lCount + 4]  = task.start_date ? new Date(task.start_date) : ''
            tr[lCount + 5]  = task.end_date   ? new Date(task.end_date)   : ''
            tr[lCount + 6]  = profileMap[task.assigned_to_user_id] || ''
            tr[lCount + 7]  = teamMap[task.assigned_to_team_id]    || ''
            tr[lCount + 8]  = task.budget_qar != null ? Number(task.budget_qar) : ''
            tr[lCount + 9]  = task.other_resources  || ''
            tr[lCount + 10] = task.evidence_required || ''
            dataRows.push(tr)
          })

        processNode(node.id, depth + 1, newPath)
      })
  }
  processNode(null, 1, [])

  /* ════════════════════════════════════════
     بناء ملف Excel
  ════════════════════════════════════════ */
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'School Plan System'
  workbook.created = new Date()

  /* ── ورقة البيانات الرئيسية ── */
  const ws = workbook.addWorksheet('هيكل الخطة', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 1, rightToLeft: true }],
  })

  /* ── ورقة القوائم المرجعية (مخفية تماماً) ── */
  const refSheet = workbook.addWorksheet('_lists')
  ;(refSheet as any).state = 'veryHidden'

  // أعمدة الورقة المرجعية:
  //   A → المستخدمون  |  B → الفرق
  //   C → الحالة      |  D → الأولوية  |  E → النوع
  const statusList   = ['لم تبدأ', 'جارية', 'منجزة', 'متأخرة']
  const priorityList = ['عالية', 'متوسطة', 'منخفضة']
  const typeList     = ['أكاديمية', 'إدارية', 'عامة']

  refSheet.getCell('A1').value = 'المستخدمون'
  refSheet.getCell('B1').value = 'الفرق'
  refSheet.getCell('C1').value = 'الحالة'
  refSheet.getCell('D1').value = 'الأولوية'
  refSheet.getCell('E1').value = 'النوع'

  const maxRefRows = Math.max(profileNames.length, teamNames.length, statusList.length, priorityList.length, typeList.length)
  for (let i = 0; i < maxRefRows; i++) {
    refSheet.getCell(`A${i + 2}`).value = profileNames[i] || ''
    refSheet.getCell(`B${i + 2}`).value = teamNames[i]    || ''
    refSheet.getCell(`C${i + 2}`).value = statusList[i]   || ''
    refSheet.getCell(`D${i + 2}`).value = priorityList[i] || ''
    refSheet.getCell(`E${i + 2}`).value = typeList[i]     || ''
  }

  /* ── صف الترويسة ── */
  ws.addRow(headers)
  const headerRow = ws.getRow(1)
  headerRow.height = 36
  headerRow.eachCell(cell => {
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B21B6' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border    = { bottom: { style: 'medium', color: { argb: 'FF7C3AED' } } }
  })

  /* ── صفوف البيانات ── */
  dataRows.forEach((rowData) => {
    const row = ws.addRow(rowData)
    row.height = 22

    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.alignment = { vertical: 'middle', wrapText: colNum > lCount + 8 }
    })

    // تنسيق خلايا التاريخ والميزانية
    row.getCell(startDateColNum).numFmt = 'yyyy-mm-dd'
    row.getCell(endDateColNum).numFmt   = 'yyyy-mm-dd'
    row.getCell(budgetColNum).numFmt    = '#,##0.00'

    // تمييز صفوف المهام بلون خفيف
    if ((rowData[lCount] || '') !== '') {
      row.eachCell({ includeEmpty: true }, cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F3FF' } }
      })
    }
  })

  /* ── عرض الأعمدة ── */
  headers.forEach((header, i) => {
    ws.getColumn(i + 1).width =
      colNames.includes(header)                                         ? 28 :
      header === TASK_COL                                               ? 38 :
      header === 'تاريخ البداية' || header === 'تاريخ الانتهاء'        ? 18 :
      header === 'الموارد الأخرى' || header === 'أدلة الإنجاز'         ? 35 :
      header === 'الموارد المالية (ر.ق)'                                ? 20 :
      header === 'المكلف' || header === 'الفريق المكلف'                 ? 22 :
      16
  })

  /* ── تنسيق أعمدة التاريخ والميزانية ── */
  ws.getColumn(startDateColNum).numFmt = 'yyyy-mm-dd'
  ws.getColumn(endDateColNum).numFmt   = 'yyyy-mm-dd'
  ws.getColumn(budgetColNum).numFmt    = '#,##0.00'

  /* ═══════════════════════════════════════════════════
     صلاحيات التحقق من البيانات (Data Validation)
     جميع القوائم تُحفظ في ورقة _lists المخفية
  ═══════════════════════════════════════════════════ */
  const MAX_ROW = 10000
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wsAny = ws as any

  const addListValidation = (
    col: number,
    listFormula: string,
    promptTitle: string,
    prompt: string,
    errorTitle: string,
    error: string,
  ) => {
    const c = colLetter(col)
    wsAny.dataValidations.add(`${c}2:${c}${MAX_ROW}`, {
      type:             'list',
      allowBlank:       true,
      formulae:         [listFormula],
      showErrorMessage: true,
      errorStyle:       'stop',
      errorTitle,
      error,
      showInputMessage: true,
      promptTitle,
      prompt,
    })
  }

  // ── الحالة ──
  addListValidation(
    statusColNum,
    '_lists!$C$2:$C$5',
    'الحالة',
    'اختر حالة المهمة من القائمة المنسدلة',
    'حالة غير صحيحة',
    'يجب اختيار حالة من القائمة: لم تبدأ / جارية / منجزة / متأخرة',
  )

  // ── الأولوية ──
  addListValidation(
    priorityColNum,
    '_lists!$D$2:$D$4',
    'الأولوية',
    'اختر أولوية المهمة من القائمة المنسدلة',
    'أولوية غير صحيحة',
    'يجب اختيار أولوية من القائمة: عالية / متوسطة / منخفضة',
  )

  // ── النوع ──
  addListValidation(
    typeColNum,
    '_lists!$E$2:$E$4',
    'النوع',
    'اختر نوع المهمة من القائمة المنسدلة',
    'نوع غير صحيح',
    'يجب اختيار نوع من القائمة: أكاديمية / إدارية / عامة',
  )

  // ── تاريخ البداية ──
  const sdCol = colLetter(startDateColNum)
  wsAny.dataValidations.add(`${sdCol}2:${sdCol}${MAX_ROW}`, {
    type:             'date',
    operator:         'between',
    formula1:         new Date('2000-01-01'),
    formula2:         new Date('2099-12-31'),
    showErrorMessage: true,
    errorStyle:       'stop',
    errorTitle:       'تنسيق التاريخ غير صحيح',
    error:            'يجب إدخال تاريخ صحيح بين 2000-01-01 و 2099-12-31. مثال: 2025-09-01',
    showInputMessage: true,
    promptTitle:      'تاريخ البداية',
    prompt:           'أدخل التاريخ بتنسيق: YYYY-MM-DD  —  مثال: 2025-09-01',
  })

  // ── تاريخ الانتهاء ──
  const edCol = colLetter(endDateColNum)
  wsAny.dataValidations.add(`${edCol}2:${edCol}${MAX_ROW}`, {
    type:             'date',
    operator:         'between',
    formula1:         new Date('2000-01-01'),
    formula2:         new Date('2099-12-31'),
    showErrorMessage: true,
    errorStyle:       'stop',
    errorTitle:       'تنسيق التاريخ غير صحيح',
    error:            'يجب إدخال تاريخ صحيح بين 2000-01-01 و 2099-12-31. مثال: 2025-12-31',
    showInputMessage: true,
    promptTitle:      'تاريخ الانتهاء',
    prompt:           'أدخل التاريخ بتنسيق: YYYY-MM-DD  —  مثال: 2025-12-31',
  })

  // ── المكلف (من قائمة المستخدمين) ──
  if (profileNames.length > 0) {
    addListValidation(
      userColNum,
      `_lists!$A$2:$A$${profileNames.length + 1}`,
      'المكلف',
      'اختر اسم المستخدم المكلف بالمهمة من القائمة',
      'مستخدم غير موجود',
      'يجب اختيار اسم من قائمة المستخدمين المسجّلين في النظام',
    )
  }

  // ── الفريق المكلف (من قائمة الفرق) ──
  if (teamNames.length > 0) {
    addListValidation(
      teamColNum,
      `_lists!$B$2:$B$${teamNames.length + 1}`,
      'الفريق المكلف',
      'اختر الفريق المكلف بالمهمة من القائمة',
      'فريق غير موجود',
      'يجب اختيار اسم من قائمة الفرق المسجّلة في النظام',
    )
  }

  // ── الموارد المالية (أرقام فقط 0 - 9,999,999) ──
  const bgCol = colLetter(budgetColNum)
  wsAny.dataValidations.add(`${bgCol}2:${bgCol}${MAX_ROW}`, {
    type:             'decimal',
    operator:         'between',
    formula1:         0,
    formula2:         9999999,
    showErrorMessage: true,
    errorStyle:       'stop',
    errorTitle:       'قيمة غير صحيحة',
    error:            'يجب إدخال رقم بين 0 و 9,999,999 فقط. لا يُسمح بالحروف أو الرموز.',
    showInputMessage: true,
    promptTitle:      'الموارد المالية (ر.ق)',
    prompt:           'أدخل مبلغاً مالياً بالريال القطري (أرقام فقط، الحد الأقصى: 9,999,999)',
  })

  /* ── توليد الملف وإرساله ── */
  const buffer   = await workbook.xlsx.writeBuffer()
  const fileName = encodeURIComponent(`${plan.name_ar}.xlsx`)

  return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${fileName}`,
    },
  })
}

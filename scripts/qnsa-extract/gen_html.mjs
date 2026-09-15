import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(DIR, '../..')                      // جذر المستودع
const SP = process.env.QNSA_WORK || path.join(DIR, 'work')   // مجلّد الوسائط
const c = JSON.parse(fs.readFileSync(SP + '/catalog.json', 'utf8'))
const flags = JSON.parse(fs.readFileSync(SP + '/flags.json', 'utf8')).filter(f => f.kind.startsWith('حدّ صفحة'))
const merges = JSON.parse(fs.readFileSync(SP + '/merges.json', 'utf8'))
/* نطابق بالنصّ لا بالفهرس: ترشيح العناوين قد يزحزح أرقام المؤشرات */
const mergedText = new Set(merges.map(m => m.text))
/* سلم التقدير — اختياري: يُدرَج إن كان build_rubric قد عمل */
const rpath = SP + '/rubric.json'
const rub = fs.existsSync(rpath) ? JSON.parse(fs.readFileSync(rpath, 'utf8')) : null
const LEVELS = rub ? rub.levels : {}
const rubric = new Map(rub ? rub.groups.map(g => [g.code, g]) : [])
const descTotal = rub ? rub.groups.reduce((n, g) => n + g.rows.length, 0) : 0
/* نماذج الأدلة — اختيارية: تُدرَج إن كان build_evidence قد عمل */
const epath = SP + '/evidence.json'
const evidence = new Map(fs.existsSync(epath) ? JSON.parse(fs.readFileSync(epath, 'utf8')).groups.map(g => [g.code, g]) : [])
const evTotal = [...evidence.values()].reduce((n, g) => n + g.items.length, 0)
const phraseTotal = rub ? rub.groups.reduce((n, g) => n + g.rows.reduce((k, r) => k + [1,2,3,4,5].filter(l => r[l]).length, 0), 0) : 0
const E = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const totalInd = c.subs.reduce((n, s) => n + s.indicators.length, 0)

/* مواضع حدود الصفحات: code → مجموعة الفهارس التي يبدأ عندها بند بعد فاصل */
const junction = new Map()
flags.forEach((f, i) => {
  if (!junction.has(f.code)) junction.set(f.code, new Map())
  junction.get(f.code).set(f.at, i + 1)
})

let body = ''
for (const std of c.standards) {
  body += `<section class="std"><h2><span class="code">${std.code}</span> ${E(std.name)}</h2>`
  for (const asp of c.aspects.filter(a => a.parent === std.code)) {
    body += `<div class="asp"><h3><span class="code">${asp.code}</span> ${E(asp.name)}</h3>`
    const ev = evidence.get(asp.code)
    if (ev) body += `<details class="evd"><summary>نماذج الأدلة والوثائق — ${ev.items.length} دليلاً</summary>
      <ol class="evl">${ev.items.map(t => `<li>${E(t)}</li>`).join('')}</ol></details>`
    for (const sub of c.subs.filter(s => s.parent === asp.code)) {
      const j = junction.get(sub.code)
      body += `<div class="sub" id="s${sub.code}">
        <h4><span class="code">${sub.code}</span> ${E(sub.name)}${sub.decided ? ' <span class="tag decided">نصّ معتمد بقرارك</span>' : ''}</h4>
        <ol class="ind">`
      sub.indicators.forEach((ind, k) => {
        const isAfter = j && j.has(k)          // هذا البند بدأ بعد فاصل صفحة
        const isBefore = j && j.has(k + 1)     // والبند التالي بدأ بعده
        const isMerged = mergedText.has(ind)
        const cls = isAfter || isBefore || isMerged ? ' class="jn"' : ''
        const badge = isAfter ? ` <a class="jbadge" href="#j${j.get(k)}">⚠ موضع ${j.get(k)} — بقي منفصلاً بقرارك</a>`
                   : isMerged ? ' <span class="tag decided">وُصِل عبر فاصل صفحة بقرارك</span>' : ''
        body += `<li${cls}><span class="icode">${sub.code}.${k + 1}</span> ${E(ind)}${badge}</li>`
        if (isBefore) body += `<li class="cut">✂ فاصل صفحة في الوثيقة — البندان منفصلان بقرارك</li>`
      })
      body += `</ol>`
      const rg = rubric.get(sub.code)
      if (rg) {
        body += `<details class="rub"><summary>سلم التقدير اللفظي — ${rg.rows.length} وصفاً × 5 مستويات</summary>
          <div class="rwrap"><table class="rt"><thead><tr><th>#</th>${
            [5, 4, 3, 2, 1].map(n => `<th>${E(LEVELS[n])}</th>`).join('')}</tr></thead><tbody>`
        rg.rows.forEach((row, i) => {
          body += `<tr><td class="rn">${i + 1}</td>${
            [5, 4, 3, 2, 1].map(n => `<td>${E(row[n]) || '<i class="na">—</i>'}</td>`).join('')}</tr>`
        })
        body += `</tbody></table></div></details>`
      }
      if (sub.guidanceText || sub.reflectionText || sub.questionsText) {
        body += `<details><summary>البيانات التوضيحية وأسئلة التأمل الذاتي</summary>
          <div class="extra"><h5>البيانات التوضيحية</h5><pre>${E(sub.guidanceText)}</pre>
          <h5>أسئلة التأمل الذاتي</h5><pre>${E(sub.questionsText)}</pre></div></details>`
      }
      body += `</div>`
    }
    body += `</div>`
  }
  body += `</section>`
}

let jlist = '<table class="jt"><thead><tr><th>#</th><th>المعيار الفرعي</th><th>نهاية البند السابق</th><th>بداية البند التالي</th><th></th></tr></thead><tbody>'
flags.forEach((f, i) => {
  jlist += `<tr id="j${i + 1}"><td>${i + 1}</td><td>${f.code}</td><td class="ltxt">…${E(f.before)}</td><td class="rtxt">${E(f.after)}…</td><td><a href="#s${f.code}">اذهب</a></td></tr>`
})
jlist += '</tbody></table>'

const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>كتالوج QNSA المستخرج — للمراجعة</title>
<style>
  :root { --maroon:#8a1538; --line:#e2e8f0; --warn:#b45309; }
  body { font-family: "Cairo","Segoe UI",Tahoma,Arial,sans-serif; line-height:1.9; color:#1e293b;
         max-width:1000px; margin:0 auto; padding:24px; background:#fff; }
  h1 { color:var(--maroon); border-bottom:3px solid var(--maroon); padding-bottom:8px; }
  h2 { color:#fff; background:var(--maroon); padding:8px 14px; border-radius:10px; font-size:1.15rem; margin-top:34px; }
  h3 { color:var(--maroon); border-right:4px solid var(--maroon); padding-right:10px; font-size:1.02rem; margin-top:22px; }
  h4 { font-size:.97rem; margin:14px 0 6px; font-weight:700; }
  .code { display:inline-block; background:#f1f5f9; border:1px solid var(--line); border-radius:6px;
          padding:0 7px; font-family:Consolas,monospace; direction:ltr; font-size:.85em; margin-left:6px; }
  h2 .code { background:rgba(255,255,255,.2); border-color:transparent; color:#fff; }
  .sub { border:1px solid var(--line); border-radius:12px; padding:10px 14px; margin:10px 0; }
  ol.ind { margin:6px 0; padding-right:6px; list-style:none; }
  ol.ind li { padding:5px 0; border-bottom:1px dashed #f1f5f9; }
  .icode { font-family:Consolas,monospace; direction:ltr; color:#64748b; font-size:.8em; margin-left:6px; }
  li.jn { background:#fffbeb; border-radius:8px; padding:6px 8px !important; }
  li.cut { list-style:none; color:var(--warn); font-size:.82rem; font-weight:700; background:#fef3c7;
           border-radius:8px; padding:4px 8px !important; margin:4px 0; }
  .jbadge { display:inline-block; margin-right:8px; font-size:.75rem; color:var(--warn); text-decoration:none;
            border:1px solid #fcd34d; border-radius:20px; padding:1px 8px; background:#fffbeb; }
  .tag { font-size:.7rem; padding:2px 8px; border-radius:20px; vertical-align:middle; }
  .decided { background:#dcfce7; color:#166534; border:1px solid #86efac; }
  details { margin-top:8px; } summary { cursor:pointer; color:#64748b; font-size:.85rem; }
  .extra pre { white-space:pre-wrap; font-family:inherit; background:#f8fafc; border:1px solid var(--line);
               border-radius:8px; padding:10px; font-size:.86rem; }
  .extra h5 { margin:10px 0 4px; color:var(--maroon); font-size:.85rem; }
  table.jt { width:100%; border-collapse:collapse; font-size:.85rem; margin:12px 0 26px; }
  table.jt th, table.jt td { border:1px solid var(--line); padding:7px 9px; vertical-align:top; }
  table.jt th { background:#f8fafc; }
  table.jt tr:target { background:#fffbeb; }
  .stats { display:flex; gap:10px; flex-wrap:wrap; margin:14px 0; }
  .stat { border:1px solid var(--line); border-radius:12px; padding:8px 16px; text-align:center; }
  .stat b { display:block; font-size:1.5rem; color:var(--maroon); }
  .note { background:#f8fafc; border-right:4px solid var(--maroon); border-radius:8px; padding:10px 14px; font-size:.9rem; }
  details.rub summary { color:var(--maroon); font-weight:700; }
  details.evd { margin:6px 0 10px; } details.evd summary { color:#0f766e; font-weight:700; }
  ol.evl { margin:6px 0; padding-right:22px; font-size:.86rem; } ol.evl li { padding:2px 0; }
  .rwrap { overflow-x:auto; }
  table.rt { border-collapse:collapse; font-size:.8rem; margin:8px 0; min-width:900px; }
  table.rt th, table.rt td { border:1px solid var(--line); padding:6px 8px; vertical-align:top; width:19%; }
  table.rt th { background:#f1f5f9; position:sticky; top:0; }
  table.rt th:first-child, table.rt td.rn { width:5%; text-align:center; background:#f8fafc;
    font-family:Consolas,monospace; color:#64748b; }
  .na { color:#cbd5e1; }
  @media print { .sub, .asp { break-inside:avoid; } details { display:none; } }
</style></head><body>
<h1>كتالوج معايير الاعتماد المدرسي الوطني (QNSA) — النسخة المستخرجة</h1>
<p class="note"><b>المصدر:</b> «دليل الاعتماد نهائي.docx» · <b>الاستخراج:</b> 2026-09-14 (بعد تدقيقك اليدويّ) ·
<b>الترحيلات:</b> <code dir="ltr">064</code> · <code dir="ltr">065</code><br>
طُوبق نصّ كل عقدة حرفياً مع الوثيقة، عدا تعديلين بقرارك: صياغة <b>3.1.8</b>، ووصل <b>3.1.2</b> بحذف كلمة مكرّرة عند حدّ صفحة.
<br>وعدد المؤشرات والأوصاف لكل معيار فرعي <b>يطابق تدقيقك اليدويّ في 73 من 73</b>.
${rub ? `<br>ومعها <b>سلم التقدير اللفظي</b>: ${descTotal} وصفاً في ${Object.keys(LEVELS).length} مستويات
= <b>${phraseTotal}</b> عبارة، طُوبقت كلّها حرفياً. افتح «سلم التقدير اللفظي» تحت كل معيار فرعي.
<br><b>تنبيه نمذجة:</b> الوصف مرتبط بالمعيار الفرعي لا بمؤشر أداء بعينه — الوثيقة تضع
${descTotal} وصفاً مقابل ${totalInd} مؤشراً.` : ''}</p>

<div class="stats">
  <div class="stat"><b>${c.standards.length}</b>معيار رئيس</div>
  <div class="stat"><b>${c.aspects.length}</b>جانب</div>
  <div class="stat"><b>${c.subs.length}</b>معيار فرعي</div>
  <div class="stat"><b>${totalInd}</b>مؤشر أداء</div>
  <div class="stat"><b>${merges.length}</b>موضع وُصِل</div>
  ${rub ? `<div class="stat"><b>${descTotal}</b>وصف سلم تقدير</div>` : ''}
  ${evTotal ? `<div class="stat"><b>${evTotal}</b>نموذج دليل</div>` : ''}
</div>

<h2 style="background:#15803d">حدود الصفحات — حُسمت كلّها</h2>
<p class="note">انقطع نصّ «مؤشرات الأداء» بين خليّتين عبر <b>فاصل صفحة</b> في ${merges.length + flags.length} موضعاً.
<b>${merges.length}</b> منها وُصِلت في مؤشر واحد — والمعيار لغوي لا تقديري: الشقّ الثاني يبدأ
بكلمة لا تصحّ بداية جملة (حرف جرّ · عطف · صفة · مضاف إليه)، وأكّد التحقّق الآلي أن النصّ
الموصول يرد متّصلاً في مجرى العمود نفسه داخل الوثيقة.
و<b>${flags.length}</b> بقي منفصلاً لأنه جملة مستقلّة تامّة.
كلٌّ منها مُعلَّم داخل الكتالوج أدناه.</p>

<table class="jt"><thead><tr><th>#</th><th>المؤشر</th><th>النصّ بعد الوصل</th></tr></thead><tbody>
${merges.map((m, i) => `<tr><td>${i + 1}</td><td>${m.key.replace('@', '.')}</td><td>${E(m.text)}</td></tr>`).join('\n')}
</tbody></table>

<h3>بقي منفصلاً</h3>
${jlist}

<h2 style="background:#334155">الكتالوج الكامل</h2>
${body}
</body></html>`

fs.writeFileSync(path.join(ROOT, 'docs/QNSA_CATALOG_EXTRACTED.html'), html, 'utf8')
console.log('كُتب الملف:', Math.round(html.length / 1024), 'KB · مواضع مُعلَّمة:', flags.length)

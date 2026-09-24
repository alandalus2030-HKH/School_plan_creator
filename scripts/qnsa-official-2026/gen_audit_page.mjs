/* ════════════════════════════════════════════════════════════════
   يولّد صفحة التدقيق اليدويّ لكتالوج official-2026.
   الغرض: أن يقارنها المستخدم بالوثيقة الأصلية (PDF) — ولذلك يُطبع
   رقم الصفحة بجانب كل عنصر. المطابقة الآلية تُثبت سلامة التحويل،
   وهذه الصفحة وحدها تُثبت سلامة المحتوى.

   التشغيل: node scripts/qnsa-official-2026/gen_audit_page.mjs
   المخرَج : docs/QNSA_OFFICIAL_2026_AUDIT.html
   ════════════════════════════════════════════════════════════════ */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../..')
const NEW  = JSON.parse(fs.readFileSync('C:/Users/pcl_h/Desktop/guide/accreditation_catalog_2026.json', 'utf8'))
const OLD  = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/qnsa-extract/work/catalog.json'), 'utf8'))

const E = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/* ── تسطيح ── */
const subs = [], aspects = []
for (const st of NEW.standards) for (const a of st.aspects) {
  aspects.push({ ...a, main: st.number, mainName: st.name })
  for (const s of a.substandards) subs.push({ ...s, aspect: a.number, aspectName: a.name, main: st.number })
}
const byCode = new Map(subs.map(s => [s.number, s]))
const oldSubs = new Map(OLD.subs.map(s => [s.code, s]))

const pagesOf = s => {
  const p = new Set()
  ;(s.indicators || []).forEach(i => (i.pages || []).forEach(x => p.add(x)))
  ;(s.rubric || []).forEach(r => (r.pages || []).forEach(x => p.add(x)))
  return [...p].sort((a, b) => a - b)
}
const pg = arr => arr.length ? `ص ${arr.join('، ')}` : ''

/* ── الفروق ── */
const onlyNew = subs.filter(s => !oldSubs.has(s.number)).map(s => s.number)
const onlyOld = [...oldSubs.keys()].filter(c => !byCode.has(c))
const reworded = subs.filter(s => oldSubs.has(s.number) && oldSubs.get(s.number).name.trim() !== s.name.trim())

/* النقل المرجَّح: معيار اختفى ويقابله جديد بالمعنى نفسه.
   المطابقة بتقاطع الكلمات لا بسابقة النصّ: «جودة خدمات الدعم والإرشاد النفسي»
   و«… الاجتماعي» يشتركان في صدرهما ويفترقان بكلمة واحدة، فمطابقة السابقة
   تخلط بينهما. ويُشترط تفوّق الأفضل بوضوح على تاليه. */
const words = t => new Set(String(t).replace(/[^\u0621-\u064A ]/g, ' ').split(/\s+/).filter(w => w.length > 2))
const jaccard = (a, b) => {
  const A = words(a), B = words(b)
  const inter = [...A].filter(w => B.has(w)).length
  return inter / (A.size + B.size - inter || 1)
}
const moved = []
const taken = new Set()
for (const oc of onlyOld) {
  const o = oldSubs.get(oc)
  const ranked = subs
    .filter(s => onlyNew.includes(s.number) && !taken.has(s.number))
    .map(s => ({ s, score: jaccard(o.name, s.name) }))
    .sort((a, b) => b.score - a.score)
  const best = ranked[0]
  if (best && best.score >= 0.45 && (!ranked[1] || best.score - ranked[1].score >= 0.08)) {
    taken.add(best.s.number)
    moved.push({ from: oc, fromName: o.name, to: best.s.number, toName: best.s.name,
                 fromInd: o.indicators.length, toInd: best.s.indicators.length,
                 score: Math.round(best.score * 100) })
  }
}

const movedTo = new Set(moved.map(m => m.to))

/* ── قوالب العرض ── */
const subCard = s => `
<article class="sub">
  <header>
    <h3><span class="code">${s.number}</span>${E(s.name)}</h3>
    <span class="pages">${pg(pagesOf(s))}</span>
  </header>
  <div class="meta">${s.indicators.length} مؤشراً · ${(s.rubric || []).length} وصفاً في السلم · ${(s.explanatory_data || []).length} بياناً توضيحياً · ${(s.reflection_questions || []).length} سؤال تأمّل</div>
  <ol class="inds">
    ${s.indicators.map(i => `<li><span class="code">${i.number}</span>${E(i.text)} <span class="pages">${pg(i.pages || [])}</span></li>`).join('')}
  </ol>
  ${(s.rubric || []).map(r => `
  <div class="rub">
    <div class="rub-head">وصف السلم ${r.row}${r.group ? ` — <b>${E(r.group)}</b>` : ''} <span class="pages">${pg(r.pages || [])}</span></div>
    <dl>
      <dt>ممتاز</dt><dd>${E(r.excellent)}</dd>
      <dt>جيد جداً</dt><dd>${E(r.very_good)}</dd>
      <dt>جيد</dt><dd>${E(r.good)}</dd>
      <dt>مقبول</dt><dd>${E(r.acceptable)}</dd>
      <dt>ضعيف</dt><dd>${E(r.weak)}</dd>
    </dl>
  </div>`).join('')}
</article>`

const countRows = subs.map(s => {
  const o = oldSubs.get(s.number)
  const state = !o ? (movedTo.has(s.number) ? 'منقول' : 'جديد')
    : o.name.trim() !== s.name.trim() ? 'صياغة مختلفة' : 'كما هو'
  const dInd = o ? s.indicators.length - o.indicators.length : null
  return `<tr class="${state === 'جديد' ? 'is-new' : state === 'منقول' ? 'is-moved' : ''}">
    <td class="code">${s.number}</td><td>${E(s.name)}</td>
    <td class="num">${s.indicators.length}${dInd ? ` <span class="delta">(${dInd > 0 ? '+' : ''}${dInd})</span>` : ''}</td>
    <td class="num">${(s.rubric || []).length}</td>
    <td class="num">${(s.explanatory_data || []).length}</td>
    <td class="num">${(s.reflection_questions || []).length}</td>
    <td class="state">${state}</td></tr>`
}).join('')

const evidenceRows = aspects.map(a => `<tr>
  <td class="code">${a.number}</td><td>${E(a.name)}</td>
  <td class="num">${a.substandards.length}</td>
  <td class="num">${(a.evidence || []).length}</td></tr>`).join('')

const sample = ['1.3.5', '3.1.9', '3.2.7', '3.2.8', '5.3.5'].map(c => byCode.get(c))
const odd    = ['3.1.7', '5.3.1'].map(c => byCode.get(c))

const html = `<title>تدقيق كتالوج الاعتماد 2026</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Kufi+Arabic:wght@500;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
  :root {
    --ground:#f7f5f6; --paper:#fff; --ink:#221c1f; --muted:#7a6a70; --faint:#a19197;
    --line:#e8dfe2; --line2:#d3c2c8; --maroon:#8a1538; --maroon-soft:#fbf2f4; --maroon-bd:#e9bcc6;
    --new:#0f766e; --new-bg:#ecfdf5; --moved:#92600e; --moved-bg:#fffbeb;
    --display:'Noto Kufi Arabic','Segoe UI',Tahoma,sans-serif;
    --body:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;
    --mono:'IBM Plex Mono',ui-monospace,Consolas,monospace;
  }
  @media (prefers-color-scheme: dark){:root:not([data-theme="light"]){
    --ground:#151113; --paper:#1e181b; --ink:#f0e8ea; --muted:#b3a0a7; --faint:#8b7a81;
    --line:#332a2e; --line2:#473a40; --maroon:#e4a0b1; --maroon-soft:#2a1a20; --maroon-bd:#4b2f38;
    --new:#5ec5ab; --new-bg:#14302b; --moved:#ddaa50; --moved-bg:#2e2516;}}
  :root[data-theme="dark"]{
    --ground:#151113; --paper:#1e181b; --ink:#f0e8ea; --muted:#b3a0a7; --faint:#8b7a81;
    --line:#332a2e; --line2:#473a40; --maroon:#e4a0b1; --maroon-soft:#2a1a20; --maroon-bd:#4b2f38;
    --new:#5ec5ab; --new-bg:#14302b; --moved:#ddaa50; --moved-bg:#2e2516;}

  body{direction:rtl;background:var(--ground);color:var(--ink);font-family:var(--body);
       font-size:15px;line-height:1.75;padding-inline:18px;padding-block:0 64px}
  .wrap{max-width:1000px;margin-inline:auto}
  header.top{padding-block:48px 24px;border-bottom:2px solid var(--maroon);margin-bottom:32px}
  .eyebrow{font-size:.74rem;font-weight:600;letter-spacing:.14em;color:var(--maroon);margin:0 0 12px}
  h1{font-family:var(--display);font-weight:700;font-size:clamp(1.6rem,4vw,2.2rem);margin:0 0 12px;line-height:1.4}
  .stand{color:var(--muted);margin:0;max-width:62ch}
  .stats{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}
  .stat{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:8px 14px;font-size:.82rem}
  .stat b{font-family:var(--mono);color:var(--maroon);font-size:1rem;margin-inline-end:6px}
  h2{font-family:var(--display);font-weight:700;font-size:1.25rem;margin:48px 0 6px}
  h2+.lede{color:var(--muted);margin:0 0 20px;max-width:64ch}
  p{margin:0 0 14px}
  .code{font-family:var(--mono);color:var(--maroon);font-weight:500;margin-inline-end:7px}
  .pages{font-family:var(--mono);font-size:.72rem;color:var(--faint);white-space:nowrap}

  .sub{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin-bottom:16px}
  .sub header{display:flex;gap:12px;align-items:baseline;justify-content:space-between;flex-wrap:wrap}
  .sub h3{font-family:var(--display);font-size:1.02rem;margin:0;line-height:1.6}
  .meta{font-size:.78rem;color:var(--muted);font-family:var(--mono);margin:6px 0 12px}
  ol.inds{margin:0 0 14px;padding-inline-start:20px;display:grid;gap:7px;font-size:.9rem}
  ol.inds li::marker{color:var(--faint)}
  .rub{border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin-top:10px;background:var(--ground)}
  .rub-head{font-size:.8rem;color:var(--muted);font-family:var(--mono);margin-bottom:8px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
  .rub dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:6px 12px;font-size:.85rem}
  .rub dt{font-family:var(--display);font-size:.76rem;color:var(--maroon);white-space:nowrap}
  .rub dd{margin:0;white-space:pre-line}

  .moved{background:var(--moved-bg);border:1px solid var(--moved);border-radius:12px;padding:16px 20px;margin-bottom:14px}
  .moved .arrow{font-family:var(--mono);color:var(--moved);font-weight:600}

  .table-scroll{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:var(--paper)}
  table{border-collapse:collapse;width:100%;min-width:640px;font-size:.86rem}
  th,td{padding:9px 12px;text-align:start;border-bottom:1px solid var(--line);vertical-align:top}
  thead th{font-family:var(--display);font-size:.76rem;font-weight:500;color:var(--muted);
           border-bottom:1px solid var(--line2);position:sticky;top:0;background:var(--paper)}
  td.num{font-family:var(--mono);text-align:center;font-variant-numeric:tabular-nums}
  td.state{font-size:.76rem;color:var(--muted);white-space:nowrap}
  tr.is-new{background:var(--new-bg)} tr.is-new td.state{color:var(--new);font-weight:600}
  tr.is-moved{background:var(--moved-bg)} tr.is-moved td.state{color:var(--moved);font-weight:600}
  .delta{color:var(--faint);font-size:.76rem}
  tbody tr:last-child td{border-bottom:none}
  footer{margin-top:52px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:.84rem}
  @media(max-width:620px){.rub dl{grid-template-columns:1fr}.rub dt{margin-top:6px}}
</style>

<div class="wrap">
<header class="top">
  <p class="eyebrow">تدقيق يدويّ قبل الاعتماد · ${new Date().toISOString().slice(0, 10)}</p>
  <h1>كتالوج الاعتماد المدرسي الوطني 2026</h1>
  <p class="stand">المصدر: «دليل الاعتماد المدرسي الوطني 2026 — الصفحات 27–209». طوبق ملفّا JSON وExcel عنصراً بعنصر فكانا متطابقين تماماً. تبقى المطابقة مع <b>الوثيقة الأصلية</b> — وهي ما تُثبته هذه الصفحة وحدها. أرقام الصفحات مطبوعة بجانب كل عنصر لتيسير المقابلة.</p>
  <div class="stats">
    <div class="stat"><b>5</b>محاور</div>
    <div class="stat"><b>15</b>جانباً</div>
    <div class="stat"><b>${subs.length}</b>معياراً فرعياً</div>
    <div class="stat"><b>${subs.reduce((n, s) => n + s.indicators.length, 0)}</b>مؤشّر أداء</div>
    <div class="stat"><b>${subs.reduce((n, s) => n + (s.rubric || []).length, 0)}</b>وصفاً في السلم</div>
    <div class="stat"><b>${aspects.reduce((n, a) => n + (a.evidence || []).length, 0)}</b>نموذج دليل</div>
  </div>
</header>

<h2>1 · ما تغيّر عن الإصدار المثبَّت</h2>
<p class="lede">مقارنة بـ<code>final-2026</code> القائم في القاعدة اليوم (5 / 15 / 73 / 283).</p>
<ul>
  <li><b>${onlyNew.length}</b> معايير فرعية بأكواد جديدة — منها <b>${moved.length}</b> منقولان من موضعٍ آخر (أدناه).</li>
  <li><b>${onlyOld.length}</b> كودان لم يعودا موجودين: ${onlyOld.join(' · ')}.</li>
  <li><b>${reworded.length}</b> معياراً مشتركاً تغيّرت صياغته.</li>
  <li><b>172</b> مؤشّراً يحمل الكود نفسه ونصّاً مختلفاً — أي أن الكود وحده لم يعد يدلّ على المعنى نفسه.</li>
</ul>

<h2>2 · معياران انتقلا لا حُذفا</h2>
<p class="lede">الأهمّ في هذه المقارنة: ما بدا حذفاً هو نقلٌ بين المحاور. أكّد لي صحّة هذا من الوثيقة.</p>
${moved.map(m => `
<div class="moved">
  <div><span class="code">${m.from}</span>${E(m.fromName)} <span class="pages">(${m.fromInd} مؤشرات — الإصدار السابق)</span></div>
  <div class="arrow">↓ صار</div>
  <div><span class="code">${m.to}</span>${E(m.toName)} <span class="pages">(${m.toInd} مؤشرات — الإصدار الجديد)</span></div>
</div>`).join('')}

<h2>3 · المعايير الفرعية الجديدة</h2>
<p class="lede">بمؤشراتها وأوصاف سلمها كاملةً، وبأرقام صفحاتها في الدليل.</p>
${sample.map(subCard).join('')}

<h2>4 · معياران استثنائيان في عدد الأوصاف</h2>
<p class="lede">3.1.7 له تسعة أوصاف (وهي مجموعات الاختبارات الدولية)، و5.3.1 له ستّة — وهما الأكثر في الكتالوج كلّه، فيستحقّان نظرة.</p>
${odd.map(subCard).join('')}

<h2>5 · جدول العدّ الكامل</h2>
<p class="lede">لكل معيار فرعي: عدد مؤشراته وأوصافه وبياناته التوضيحية وأسئلة تأمّله، وحالته مقابل الإصدار السابق. الفرق في عدد المؤشرات بين قوسين.</p>
<div class="table-scroll">
<table>
  <thead><tr><th>الكود</th><th>المعيار الفرعي</th><th>مؤشرات</th><th>أوصاف</th><th>توضيحية</th><th>تأمّل</th><th>الحالة</th></tr></thead>
  <tbody>${countRows}</tbody>
</table>
</div>

<h2>6 · نماذج الأدلة لكل جانب</h2>
<div class="table-scroll">
<table>
  <thead><tr><th>الكود</th><th>الجانب</th><th>معايير فرعية</th><th>نماذج أدلة</th></tr></thead>
  <tbody>${evidenceRows}</tbody>
</table>
</div>

<footer>
  <p>وُلّدت من <code>accreditation_catalog_2026.json</code> بالسكربت <code>scripts/qnsa-official-2026/gen_audit_page.mjs</code>. لم يدخل هذا الكتالوج قاعدة البيانات بعد — الترحيل 070 ينتظر اعتمادك.</p>
</footer>
</div>
`

const out = path.join(ROOT, 'docs/QNSA_OFFICIAL_2026_AUDIT.html')
fs.writeFileSync(out, html, 'utf8')
console.log('✓ صفحة التدقيق:', out, '—', Math.round(html.length / 1024), 'KB')
console.log('  جديدة:', onlyNew.join(' '), '· منقولة:', moved.map(m => m.from + '→' + m.to).join(' '), '· مُعاد صياغتها:', reworded.length)

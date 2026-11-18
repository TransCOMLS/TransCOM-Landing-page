// Every page at 7 widths in both languages: no horizontal scroll, no page errors (CLAUDE.md testing rule).
const { chromium } = require('../lib/browser');
(async () => { const b = await chromium.launch(); let bad = 0, n = 0;
 for (const w of [1366,1920,1280,1024,390,320,768]) for (const lang of ['th','en']) {
  const ctx = await b.newContext({ viewport: { width: w, height: 800 } });
  await ctx.route('https://script.google.com/**', r => r.abort());
  await ctx.addInitScript(l => { try { localStorage.setItem('tr_lang', l); } catch (e) {} }, lang);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/');
  // home instant estimate: the category and pages boxes sit on one line even when a label wraps (2026-11-12)
  await p.waitForTimeout(150);
  const qq = await p.evaluate(() => { const a = document.querySelector('#q-category').getBoundingClientRect(), c = document.querySelector('#q-pages').getBoundingClientRect(); return Math.abs(a.bottom - c.bottom) + Math.abs(a.top - c.top); });
  if (qq > 1) { bad++; console.log('QUICK-ESTIMATE MISALIGNED', w, lang, qq); }
  for (const tab of ['home','services','pricing','calculator','news','submit','track','verify','account','how','faq','contact','privacy','terms']) {
    await p.evaluate(t => App.showTab(t), tab); await p.waitForTimeout(60); n++;
    const o = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (o > 0) { bad++; console.log('OVERFLOW', w, lang, tab, o); }
  }
  if (errs.length) { bad++; console.log('ERR', w, lang, errs); }
  await ctx.close(); }
 console.log((bad ? 'FAIL ' : 'PASS ') + n + ' page views at 7 widths × th/en: no horizontal scroll, no page errors, estimate boxes aligned (problems: ' + bad + ')');
 if (bad) process.exitCode = 1; await b.close(); })();

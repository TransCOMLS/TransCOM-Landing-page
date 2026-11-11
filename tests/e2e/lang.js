// Speed-pass behaviour (2026-11-11): English text in its own file, lazy logos, self-hosted Sarabun.
const { chromium } = require('../lib/browser');
const base = require('../lib/paths').BASE;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
async function page(b, opts = {}) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 800 } });
  await ctx.route(/script\.google(usercontent)?\.com/, r => r.abort());
  if (opts.failEn) await ctx.route(/i18n-en\.js/, r => r.abort());
  if (opts.init) await ctx.addInitScript(opts.init, opts.arg);
  const p = await ctx.newPage(); const reqs = [], errs = [];
  p.on('request', r => reqs.push(r.url())); p.on('pageerror', e => errs.push(e.message));
  return { ctx, p, reqs, errs };
}
const h1 = p => p.evaluate(() => document.querySelector('#home h1').textContent.trim());
(async () => {
  const b = await chromium.launch();
  // 1. Thai visitor: no English file, toggle loads it, toggle back
  let { ctx, p, reqs, errs } = await page(b);
  await p.goto(base, { waitUntil: 'load' }); await p.waitForTimeout(500);
  ok(!reqs.some(u => /i18n-en/.test(u)), 'Thai visitor does not download English text');
  const th = await h1(p); ok(/แปล/.test(th), 'Thai headline shown: ' + th);
  await p.click('.lang-toggle [data-lang="en"]'); await p.waitForFunction(() => document.documentElement.lang === 'en');
  const en = await h1(p); ok(/[A-Za-z]/.test(en) && !/แปล/.test(en), 'Switch to EN shows English: ' + en);
  ok(await p.evaluate(() => document.querySelector('.lang-toggle [data-lang="en"]').getAttribute('aria-pressed')) === 'true', 'EN button pressed');
  ok(await p.evaluate(() => localStorage.getItem('tr_lang')) === 'en', 'EN choice saved');
  await p.click('.lang-toggle [data-lang="th"]'); await p.waitForTimeout(200);
  ok(await h1(p) === th, 'Switch back to TH restores Thai');
  // calculator works in English
  await p.click('.lang-toggle [data-lang="en"]'); await p.waitForTimeout(200);
  await p.goto(base + '#calculator'); await p.waitForTimeout(400);
  const opts = await p.evaluate(() => [...document.querySelectorAll('#c-category option')].map(o => o.textContent).slice(1, 3));
  ok(opts.length && opts.every(o => /[A-Za-z]/.test(o)), 'Calculator categories in English after reload: ' + opts.join(' | '));
  ok(errs.length === 0, 'no page errors (' + errs.join('; ') + ')'); await ctx.close();

  // 2. Saved English: loaded before app.js, English from the first paint
  ({ ctx, p, reqs, errs } = await page(b, { init: () => { try { localStorage.setItem('tr_lang', 'en'); } catch (e) {} } }));
  let firstLang = null;
  await p.exposeFunction('__rec', v => { if (firstLang === null) firstLang = v; });
  await p.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
    const h = document.querySelector('#home h1');
    new MutationObserver(() => { if (h.textContent.trim()) window.__rec(document.documentElement.lang + '|' + h.textContent.trim()); }).observe(h, { childList: true, characterData: true, subtree: true });
  }, { capture: true }));
  await p.goto(base, { waitUntil: 'load' }); await p.waitForTimeout(300);
  ok(reqs.some(u => /i18n-en\.js\?v=/.test(u)), 'Saved English downloads i18n-en.js at start');
  ok(firstLang && firstLang.startsWith('en|') && /[A-Za-z]/.test(firstLang), 'First headline text ever shown is English: ' + firstLang);
  ok(errs.length === 0, 'no page errors'); await ctx.close();

  // 3. Storage blocked: Thai, toggle still works
  ({ ctx, p, reqs, errs } = await page(b, { init: () => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); } }));
  await p.goto(base, { waitUntil: 'load' }); await p.waitForTimeout(300);
  ok(/แปล/.test(await h1(p)), 'Storage blocked: Thai shown');
  await p.click('.lang-toggle [data-lang="en"]'); await p.waitForFunction(() => document.documentElement.lang === 'en', null, { timeout: 5000 }).catch(() => {});
  ok(await p.evaluate(() => document.documentElement.lang) === 'en', 'Storage blocked: switch to EN works');
  ok(errs.length === 0, 'no page errors (' + errs.join('; ') + ')'); await ctx.close();

  // 4. English file cannot load: stays Thai, no crash, retry later works
  ({ ctx, p, reqs, errs } = await page(b, { failEn: true }));
  await p.goto(base, { waitUntil: 'load' }); await p.waitForTimeout(300);
  await p.click('.lang-toggle [data-lang="en"]'); await p.waitForTimeout(600);
  ok(await p.evaluate(() => document.documentElement.lang) === 'th' && /แปล/.test(await h1(p)), 'EN file offline: page stays Thai');
  ok(errs.length === 0, 'no page errors'); await ctx.close();

  // 5. Saved English but file fails at start: Thai shown, page usable
  ({ ctx, p, reqs, errs } = await page(b, { failEn: true, init: () => { try { localStorage.setItem('tr_lang', 'en'); } catch (e) {} } }));
  await p.goto(base, { waitUntil: 'load' }); await p.waitForTimeout(600);
  ok(/แปล/.test(await h1(p)), 'Saved EN + file offline: Thai text shown (not blank)');
  ok(errs.length === 0, 'no page errors (' + errs.join('; ') + ')'); await ctx.close();

  // 6. Fonts self-hosted and used; dark theme logo
  ({ ctx, p, reqs, errs } = await page(b, { init: () => { try { localStorage.setItem('tr_theme', 'dark'); } catch (e) {} } }));
  await p.goto(base, { waitUntil: 'load' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  ok(await p.evaluate(() => document.fonts.check('700 20px Sarabun', 'ก') && [...document.fonts].some(f => f.family.replace(/"/g, '') === 'Sarabun' && f.status === 'loaded')), 'Sarabun loaded from the site');
  ok(!reqs.some(u => /fonts\.(googleapis|gstatic)/.test(u)), 'No Google Fonts requests');
  ok(reqs.some(u => /css\/fonts\/sarabun-\d+-thai\.woff2/.test(u)), 'Thai font files requested from /css/fonts');
  ok(reqs.some(u => /logo-white\.svg/.test(u)) && !reqs.some(u => /\/img\/logo\.svg/.test(u)), 'Dark theme: only the white logo is fetched');
  ok(await p.evaluate(() => { const i = document.querySelector('.brand-logo.logo-on-dark'); return i.complete && i.naturalWidth > 0 && getComputedStyle(i).display !== 'none'; }), 'Dark header logo visible');
  ok(errs.length === 0, 'no page errors'); await ctx.close();

  // 7. Light theme header logo visible, avatar not fetched until news post opens
  ({ ctx, p, reqs, errs } = await page(b, { init: () => { try { localStorage.setItem('tr_theme', 'light'); } catch (e) {} } }));
  await p.goto(base, { waitUntil: 'load' }); await p.waitForTimeout(300);
  ok(await p.evaluate(() => { const i = document.querySelector('.brand-logo.logo-on-light'); return i.complete && i.naturalWidth > 0; }), 'Light header logo visible');
  ok(errs.length === 0, 'no page errors'); await ctx.close();

  // 8. EN tapped, then TH tapped before the English file arrives: the page must stay Thai (bug found 2026-11-11)
  ({ ctx, p, reqs, errs } = await page(b));
  await ctx.route(/i18n-en\.js/, async r => { await new Promise(x => setTimeout(x, 800)); r.continue(); });
  await p.goto(base, { waitUntil: 'load' }); await p.waitForTimeout(200);
  await p.evaluate(() => { document.querySelector('.lang-toggle [data-lang="en"]').click(); document.querySelector('.lang-toggle [data-lang="th"]').click(); });
  await p.waitForTimeout(1500);
  ok(await p.evaluate(() => document.documentElement.lang) === 'th' && /แปล/.test(await h1(p)), 'EN then TH quickly: stays Thai when the English file arrives late');
  ok(errs.length === 0, 'no page errors'); await ctx.close();

  await b.close();
  if (fails) process.exitCode = 1;
})();

const { chromium } = require('../lib/browser');
const { load } = require('../lib/mock');
const out = require('../lib/paths').out(__filename);
const g = load(require('../lib/paths').CODE_GS); g.ctx.setup();
const URL = 'https://script.google.com/macros/s/TEST/exec';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const P = g.post;
P({ action: 'requestCode', email: 'nida@example.com' }); const tok = P({ action: 'verifyCode', email: 'nida@example.com', code: g.lastCode() }).token;
P({ action: 'updateProfile', token: tok, profile: { name: 'นิดา ใจดี' } });
P({ action: 'requestCode', email: 'owner@example.com' }); const admin = P({ action: 'verifyCode', email: 'owner@example.com', code: g.lastCode() }).token;
P({ action: 'adminSavePost', token: admin, kind: 'promo', post: { active: true, titleTh: 'โปรจากชีต', titleEn: 'Sheet offer', textTh: 'x', textEn: 'x' } });
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } });
  let delay = 0;
  const loaded = [];
  await ctx.route('https://script.google.com/macros/s/AKfy**', r => r.abort());
  await ctx.route('**/js/config.js*', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/appsScriptUrl: "[^"]*"/, `appsScriptUrl: "${URL}"`) }); });
  await ctx.route(URL, async r => { const body = JSON.stringify(P(JSON.parse(r.request().postData()))); if (delay) await new Promise(x => setTimeout(x, delay)); r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body }); });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('request', q => { const m = /js\/(\w+)\.js/.exec(q.url()); if (m) loaded.push(m[1] + '@' + Date.now()); });
  // ---- guest: no portal.js; terms.js only after load
  await p.goto('http://localhost:8765/#home');
  await p.waitForLoadState('load');
  const early = loaded.map(x => x.split('@')[0]);
  ok(!early.includes('portal'), 'guest: dashboard script not loaded');
  await p.waitForTimeout(2200);
  ok(loaded.some(x => x.startsWith('terms')), 'terms text fetched after the page finished loading');
  await p.evaluate(() => App.showTab('terms'));
  ok((await p.textContent('#terms-body')).length > 2000 && (await p.locator('#terms .doc-toc li').count()) > 5, 'terms page has its text and contents list');
  // pop-up straight away on a fresh page (terms not loaded yet)
  const p2 = await ctx.newPage(); p2.on('pageerror', e => errs.push(e.message));
  await p2.goto('http://localhost:8765/#submit');
  await p2.click('[data-modal="terms"]');
  await p2.waitForSelector('#policy-dialog[open]');
  await p2.waitForTimeout(300);
  ok((await p2.textContent('#policy-dialog-body')).length > 2000, 'terms pop-up opened before the file was loaded still shows the full text');
  await p2.close();
  // ---- signed-in: cached account + offers shown before the slow backend answers
  await p.evaluate(tk => { localStorage.setItem('tr_session', tk); localStorage.setItem('tr_lang', 'th'); }, tok);
  await p.goto('http://localhost:8765/#account'); await p.reload();      // first visit: fills the caches
  await p.waitForSelector('#acct-home:not([hidden])');
  await p.waitForSelector('#dash-nav .dash-link');
  ok(await p.evaluate(() => !!localStorage.getItem('tr_account') && !!localStorage.getItem('tr_content')), 'account + offers kept on the device');
  delay = 4000;
  const t0 = Date.now();
  await p.reload();
  await p.waitForSelector('#dash-nav .dash-link', { timeout: 3000 });
  const ms = Date.now() - t0;
  ok(ms < 3000 && (await p.textContent('#acct-hello')).includes('นิดา'), 'dashboard shows at once from the last copy (' + ms + ' ms, backend takes 4000 ms)');
  await p.evaluate(() => App.showTab('home'));
  ok((await p.textContent('#promo-list')).includes('โปรจากชีต'), 'offers from the sheet show at once from the last copy');
  // signing out clears the copy
  delay = 0;
  await p.evaluate(() => App.showTab('account'));
  await p.locator('#dash-nav .dash-link', { hasText: 'แก้ไขโปรไฟล์' }).click();
  await p.click('#a-logout');
  ok(await p.evaluate(() => !localStorage.getItem('tr_account')), 'sign out removes the kept account copy');
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
  // ---- logo size
  const fs = require('fs');
  ok(fs.statSync(require('path').join(require('../lib/paths').ROOT, 'img/logo.svg')).size < 70000, 'logo file under 70 KB');
  await b.close();
})();

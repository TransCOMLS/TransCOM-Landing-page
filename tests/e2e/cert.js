const { chromium } = require('../lib/browser');
const { load } = require('../lib/mock');
const out = require('../lib/paths').out(__filename);
const g = load(require('../lib/paths').CODE_GS, { realJobNo: true }); g.ctx.setup();
const URL = 'https://script.google.com/macros/s/TEST/exec';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const P = g.post;
const signIn = e => { P({ action: 'requestCode', email: e }); return P({ action: 'verifyCode', email: e, code: g.lastCode() }).token; };
const admin = signIn('owner@example.com'), cust = signIn('nida@example.com');
P({ action: 'updateProfile', token: admin, profile: { name: 'เจ้าของ' } }); P({ action: 'updateProfile', token: cust, profile: { name: 'นิดา ใจดี' } });
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const c = P({ action: 'createJob', lang: 'th', job: { name: 'นิดา ใจดี', email: 'nida@example.com', langPair: 'th-en', category: 'official', pages: 3, neededBy: day(5), consent: true, certified: true, files: [{ name: 'a.pdf', size: 3 }], idFiles: [] } });
P({ action: 'uploadFile', jobNo: c.jobNo, uploadToken: c.uploadToken, kind: 'doc', name: 'a.pdf', data: 'QUJD' });
P({ action: 'finishJob', jobNo: c.jobNo, uploadToken: c.uploadToken });
const jobNo = c.jobNo;
(async () => {
  const b = await chromium.launch();
  async function open(w, h, scheme, token, path, lang) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, acceptDownloads: true });
    await ctx.route('https://script.google.com/macros/s/AKfy**', r => r.abort());
    await ctx.addInitScript(([tk, l]) => { try { if (tk) localStorage.setItem('tr_session', tk); localStorage.setItem('tr_lang', l); } catch (e) {} }, [token, lang || 'th']);
    await ctx.route('**/js/config.js*', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/appsScriptUrl: "[^"]*"/, `appsScriptUrl: "${URL}"`) }); });
    await ctx.route(URL, async r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(P(JSON.parse(r.request().postData()))) }));
    const p = await ctx.newPage(); p.errs = [];
    p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && p.errs.push(m.text()));
    await p.goto('http://localhost:8765/' + path);
    return { ctx, p };
  }
  const overflow = p => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  // ---- admin: job page shows the cert card with a QR, sets the document title
  let { ctx, p } = await open(1366, 900, 'light', admin, '#account');
  await p.waitForSelector('#dash-nav .dash-link');
  await p.evaluate(no => { const v = document.querySelector('#dash-view'); }, jobNo);
  await p.locator('#dash-nav .dash-link', { hasText: 'งานทั้งหมด' }).click();
  await p.locator('.job-item-btn', { hasText: jobNo }).first().click();
  await p.waitForSelector('.dash-cert canvas', { timeout: 15000 });
  const code = (await p.textContent('.dash-cert-code')).trim();
  ok(/^[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}$/.test(code) && (await p.textContent('.dash-cert .flag')) === 'รอรับรอง', 'admin job page: cert card, code ' + code + ', รอรับรอง');
  const qr = await p.evaluate(() => { const cv = document.querySelector('.dash-cert canvas'); return { w: cv.width, decodedSize: (cv.width / 5) - 8 }; });
  ok(qr.decodedSize === 33, 'QR drawn (33×33 modules = version 4)');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('.dash-cert button:has-text("ดาวน์โหลด QR")')]);
  ok(dl.suggestedFilename() === 'QR-' + code + '.png', 'QR downloads as ' + dl.suggestedFilename());
  await p.fill('.dash-cert input[placeholder="เช่น สูติบัตร"]', 'หนังสือรับรองความประพฤติ');
  await p.click('.dash-cert .actions button');
  await p.waitForSelector('.dash-cert canvas');
  ok(g.sheets.Certificates.data.some(r => r[0] === code && r[3] === 'หนังสือรับรองความประพฤติ'), 'document title saved to the Certificates sheet');
  await p.screenshot({ path: `${out}/cert-admin-1366.png`, fullPage: true });
  ok(await overflow(p) <= 0 && p.errs.length === 0, 'admin page: no horizontal scroll, no console errors ' + JSON.stringify(p.errs));
  await ctx.close();
  // move the job along; customer accepts
  ['paid', 'inProgress', 'review'].forEach(s => P({ action: 'adminUpdateJob', token: admin, jobNo, status: s }));
  P({ action: 'confirmTranslation', token: cust, jobNo });
  // ---- scanning the QR: /?verify=CODE (phone, dark) — opens the page and shows the result
  for (const [w, h, scheme, lang] of [[390, 844, 'dark', 'th'], [1366, 900, 'light', 'en'], [320, 640, 'light', 'th']]) {
    ({ ctx, p } = await open(w, h, scheme, null, '?verify=' + code.toLowerCase(), lang));
    await p.waitForSelector('#verify-card:not([hidden])', { timeout: 10000 });
    const txt = await p.textContent('#verify-card');
    const th = lang === 'th';
    ok(await p.isVisible('#verify') && txt.includes(th ? 'คำรับรองนี้ถูกต้อง' : 'genuine') && txt.includes('หนังสือรับรองความประพฤติ') && txt.includes(th ? '3 หน้า' : '3 pages') && txt.includes('TransCOM') && !txt.includes('นิดา'),
      `${w}${scheme}-${lang} QR link opens the check page: valid, document, pages, certifier, no customer name`);
    ok(txt.includes(th ? 'พ.ศ.' : '2026') || txt.includes('256'), `${w} certification date shown`);
    ok((await p.evaluate(() => location.search)) === '', `${w} code removed from the address bar`);
    await p.screenshot({ path: `${out}/verify-${w}${scheme}-${lang}.png`, fullPage: true });
    ok(await overflow(p) <= 0 && p.errs.length === 0, `${w} no horizontal scroll, no console errors ` + JSON.stringify(p.errs));
    await ctx.close();
  }
  // ---- typing a code; wrong code; menu item
  ({ ctx, p } = await open(1366, 900, 'light', null, '#home'));
  await p.click('.nav-toggle[aria-controls="menu-order"]');
  await p.click('.nav-sublink[data-tab="verify"]');
  ok(await p.isVisible('#verify-form') && (await p.textContent('.nav-sublink[data-tab="verify"]')) === 'ตรวจสอบการรับรอง', 'menu: สั่งงาน → ตรวจสอบการรับรอง');
  await p.fill('#v-code', 'abc'); await p.click('#verify-form button[type=submit]');
  ok(await p.isVisible('#v-code-err'), 'bad format explained');
  await p.fill('#v-code', 'ZZZZ ZZZZ ZZZZ'); await p.click('#verify-form button[type=submit]');
  await p.waitForFunction(() => /ไม่พบรหัสนี้/.test(document.querySelector('#verify-status').textContent));
  ok(true, 'unknown code: "not found" message');
  await p.fill('#v-code', code.replace(/-/g, '')); await p.click('#verify-form button[type=submit]');
  await p.waitForSelector('#verify-card.is-valid');
  ok((await p.inputValue('#v-code')) === code, 'code typed without dashes works (tidied to ' + code + ')');
  // withdrawn
  P({ action: 'certUpdate', token: admin, jobNo, status: 'revoked' });
  await p.click('#verify-form button[type=submit]');
  await p.waitForSelector('#verify-card.is-revoked');
  ok((await p.textContent('#verify-card')).includes('ถูกยกเลิก'), 'withdrawn certification shown in red');
  await p.screenshot({ path: `${out}/verify-revoked.png` });
  P({ action: 'certUpdate', token: admin, jobNo, status: 'valid' });
  await ctx.close();
  // ---- customer job page shows the QR
  ({ ctx, p } = await open(390, 844, 'light', cust, '#account'));
  await p.waitForSelector('#dash-nav .dash-link');
  await p.locator('#dash-nav .dash-link', { hasText: 'ปิดงานแล้ว' }).click();
  await p.locator('.job-item-btn', { hasText: jobNo }).first().click();
  await p.waitForSelector('.dash-cert canvas');
  ok((await p.textContent('.dash-cert')).includes('รับรองแล้ว') && !(await p.$('.dash-cert input')), 'customer sees code + QR (certified), no edit fields');
  await p.locator('.dash-cert').scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${out}/cert-customer-390.png` });
  ok(await overflow(p) <= 0 && p.errs.length === 0, 'customer page: no horizontal scroll, no console errors ' + JSON.stringify(p.errs));
  await ctx.close();
  await b.close();
})();

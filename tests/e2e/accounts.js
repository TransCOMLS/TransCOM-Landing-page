const { chromium } = require('../lib/browser'); const { load } = require('../lib/mock');
const out = require('../lib/paths').out(__filename); const g = load(require('../lib/paths').CODE_GS); g.ctx.setup();
const URL = 'https://script.google.com/macros/s/TEST/exec';
const J = g.sheets.Jobs, head = J.data[0]; const row = o => head.map(h => o[h] === undefined ? '' : o[h]);
J.appendRow(row({ 'เลขที่งาน': 'TR-2569-0007', 'วันที่ส่งงาน': new Date('2026-10-20'), 'สถานะ': 'ส่งใบเสนอราคาแล้ว', 'อีเมล': 'nida@example.com', 'คู่ภาษา': 'th-en', 'ประเภทเอกสาร': 'official', 'จำนวนหน้า': 3, 'วันที่ต้องการรับงาน': new Date('2026-11-10') }));
J.appendRow(row({ 'เลขที่งาน': 'TR-2569-0004', 'วันที่ส่งงาน': new Date('2026-10-02'), 'สถานะ': 'ส่งมอบแล้ว', 'อีเมล': 'nida@example.com', 'คู่ภาษา': 'en-th', 'ประเภทเอกสาร': 'academic', 'จำนวนหน้า': 1 }));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.route('https://script.google.com/macros/s/AKfy**', r => r.abort());   // never reach the live system
    await ctx.route('**/js/config.js*', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()) + `\nwindow.APP_CONFIG.appsScriptUrl = "${URL}";` }); });
  await ctx.route(URL, async r => { await new Promise(x => setTimeout(x, 150)); r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(g.post(JSON.parse(r.request().postData()))) }); });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); p.on('console', m => m.type() === 'error' && errors.push(m.text()));
  await p.goto('http://localhost:8765/#submit');
  ok(await p.isVisible('#acct-prefill-ask'), 'submit page offers sign-in to prefill');
  ok((await p.textContent('.account-label')).trim() === 'เข้าสู่ระบบ', 'header shows Sign in');
  await p.click('.account-btn'); ok(await p.isVisible('#acct-signin'), 'account page: sign-in view');
  await p.screenshot({ path: out + '/acct-signin.png' });
  await p.click('#acct-email-form button[type=submit]'); ok((await p.textContent('#a-email-err')).includes('กรุณากรอก'), 'empty email error');
  await p.fill('#a-email', 'Nida@Example.com'); await p.click('#acct-email-form button[type=submit]');
  await p.waitForSelector('#acct-code-form:not([hidden])');
  ok((await p.textContent('#acct-code-sent')).includes('nida@example.com'), 'code step shows email');
  ok(await p.isDisabled('#a-resend') && /วินาที/.test(await p.textContent('#a-resend')), 'resend countdown');
  ok(await p.evaluate(() => document.activeElement.id) === 'a-code', 'focus on code field');
  await p.fill('#a-code', '12ab'); ok(await p.inputValue('#a-code') === '12', 'code field keeps digits only');
  await p.click('#acct-code-form button[type=submit]'); ok((await p.textContent('#a-code-err')).includes('6 หลัก'), 'short code error');
  const real = g.lastCode(); await p.fill('#a-code', real === '000000' ? '000001' : '000000'); await p.click('#acct-code-form button[type=submit]');
  await p.waitForSelector('#a-code-err:not([hidden])'); ok((await p.textContent('#a-code-err')).includes('ไม่ถูกต้อง'), 'wrong code error from server');
  await p.fill('#a-code', real); await p.click('#acct-code-form button[type=submit]');
  await p.waitForSelector('#acct-home:not([hidden])'); await p.waitForSelector('#acct-profile', { state: 'visible' });
  ok(await p.isVisible('#acct-welcome') && await p.isVisible('#acct-profile'), 'new account: welcome + opens on the profile form');
  await p.locator('#dash-nav .dash-link', { hasText: 'ภาพรวม' }).click(); await p.waitForSelector('.job-item');
  ok(await p.$$eval('.job-item .job-no', a => a.map(e => e.textContent).join(',')) === 'TR-2569-0007,TR-2569-0004', 'job history newest first');
  ok((await p.textContent('.job-item .status-chip')).includes('ใบเสนอราคา'), 'status chip in Thai');
  ok(/2569/.test(await p.textContent('.job-dates')), 'Thai dates use พ.ศ.');
  ok(await p.evaluate(() => /^[0-9a-f]{64}$/.test(localStorage.getItem('tr_session'))), 'session saved');
  await p.locator('#dash-nav .dash-link', { hasText: 'แก้ไขโปรไฟล์' }).click();
  await p.fill('#p-name', 'นิดา ใจดี'); await p.fill('#p-phone', '12'); await p.click('#acct-profile button[type=submit]');
  ok((await p.textContent('#p-phone-err')).includes('ไม่ถูกต้อง'), 'profile phone validation');
  await p.fill('#p-phone', '081 234 5678'); await p.fill('#p-line', '@nida'); await p.fill('#p-nameSpelling', 'nida jaidee'); await p.selectOption('#p-langPair', 'th-en');
  await p.click('#acct-profile button[type=submit]'); await p.waitForSelector('#acct-profile-status.success');
  ok(await p.inputValue('#p-nameSpelling') === 'NIDA JAIDEE', 'saved + spelling upper-case');
  await p.waitForFunction(() => (document.querySelector('.account-label') || {}).textContent && document.querySelector('.account-label').textContent.trim() === 'นิดา', null, { timeout: 8000 }).catch(() => {});
  ok((await p.textContent('#acct-hello')).includes('นิดา') && (await p.textContent('.account-label')).trim() === 'นิดา', 'greeting + header use first name');
  await p.locator('#dash-nav .dash-link', { hasText: 'ภาพรวม' }).click(); await p.waitForSelector('.job-item');
  await p.screenshot({ path: out + '/acct-home1366.png', fullPage: true });
  await p.click('.lang-toggle [data-lang=en]'); await p.waitForFunction(() => document.documentElement.lang === 'en'); ok((await p.textContent('.job-item .status-chip')).includes('Quote sent') && /2026/.test(await p.textContent('.job-dates')), 'English status + dates');
  await p.click('.lang-toggle [data-lang=th]');
  // prefill
  await p.click('#acct-home [data-goto=submit]');
  await p.waitForFunction(() => document.querySelector('#f-name').value !== '', null, { timeout: 8000 }).catch(() => {});
  ok(await p.inputValue('#f-name') === 'นิดา ใจดี' && await p.inputValue('#f-email') === 'nida@example.com' && await p.inputValue('#f-nameSpelling') === 'NIDA JAIDEE' && await p.inputValue('#f-langPair') === 'th-en', 'job form filled in from account');
  ok(await p.isVisible('#acct-prefill-done'), 'prefill notice');
  // reload keeps session
  await p.reload(); await p.waitForFunction(() => (document.querySelector('.account-label') || {}).textContent && document.querySelector('.account-label').textContent.trim() === 'นิดา', null, { timeout: 8000 }).catch(() => {}); ok((await p.textContent('.account-label')).trim() === 'นิดา', 'session survives reload');
  // logout clears form + session
  await p.evaluate(() => App.showTab('account')); await p.locator('#dash-nav .dash-logout').click();
  ok(await p.isVisible('#acct-signin') && (await p.textContent('#acct-signin-status')).includes('ออกจากระบบ'), 'logged out');
  ok(await p.evaluate(() => localStorage.getItem('tr_session')) === null, 'session removed');
  await p.evaluate(() => App.showTab('submit')); ok(await p.inputValue('#f-name') === '', 'job form cleared of account data');
  // sign in again (returning) and delete
  g.cache.clear(); await p.evaluate(() => App.showTab('account'));
  await p.fill('#a-email', 'nida@example.com'); await p.click('#acct-email-form button[type=submit]'); await p.waitForSelector('#acct-code-form:not([hidden])');
  await p.fill('#a-code', g.lastCode()); await p.click('#acct-code-form button[type=submit]'); await p.waitForSelector('.job-item');
  ok(await p.isHidden('#acct-welcome'), 'returning user: no welcome, opens on the overview');
  await p.locator('#dash-nav .dash-link', { hasText: 'แก้ไขโปรไฟล์' }).click();
  await p.click('#a-delete'); ok(await p.isVisible('#acct-delete-confirm'), 'delete asks to confirm');
  await p.click('#a-delete-no'); ok(await p.isHidden('#acct-delete-confirm'), 'cancel delete');
  await p.click('#a-delete'); await p.click('#a-delete-yes'); await p.waitForSelector('#acct-signin:not([hidden])');
  ok(g.sheets.Users.data.length === 1, 'account deleted in sheet');
  // expired session on load
  await p.evaluate(() => localStorage.setItem('tr_session', 'a'.repeat(64))); await p.reload(); await p.waitForTimeout(600);
  ok(await p.evaluate(() => localStorage.getItem('tr_session')) === null && (await p.textContent('.account-label')).trim() === 'เข้าสู่ระบบ', 'stale session cleared on load');
  // phone
  await p.setViewportSize({ width: 390, height: 844 }); await p.evaluate(() => App.showTab('account')); await p.waitForTimeout(100);
  ok(await p.isHidden('.account-btn'), 'phone: header account button hidden'); await p.click('.menu-btn');
  ok(await p.isVisible('.nav-account'), 'phone: account in menu'); await p.click('.menu-btn');
  await p.screenshot({ path: out + '/acct-signin390.png', fullPage: true });
  ok(errors.length === 0, 'no console errors ' + JSON.stringify(errors));
  await b.close();
})();

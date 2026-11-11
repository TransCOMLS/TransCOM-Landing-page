const { chromium } = require('../lib/browser');
const { load } = require('../lib/mock');
const out = require('../lib/paths').out(__filename);
const g = load(require('../lib/paths').CODE_GS); g.ctx.setup();
const URL = 'https://script.google.com/macros/s/TEST/exec';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const P = g.post;
const codeFor = to => /(\d{6})/.exec(g.mail.filter(m => m.to === to).pop().subject)[1];
(async () => {
  const b = await chromium.launch();
  async function open(w, h, scheme, lang) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
    await ctx.route('https://script.google.com/macros/s/AKfy**', r => r.abort());
    await ctx.addInitScript(l => { try { if (!sessionStorage.getItem('init')) { localStorage.setItem('tr_lang', l); sessionStorage.setItem('init', '1'); } } catch (e) {} }, lang || 'th');
    await ctx.route('**/js/config.js*', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/appsScriptUrl: "[^"]*"/, `appsScriptUrl: "${URL}"`) }); });
    await ctx.route(URL, async r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(P(JSON.parse(r.request().postData()))) }));
    const p = await ctx.newPage(); p.errs = [];
    p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && p.errs.push(m.text()));
    p.on('dialog', d => d.accept());
    await p.goto('http://localhost:8765/#account');
    return { ctx, p };
  }
  const overflow = p => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  async function codeSignIn(p, email) {
    await p.fill('#a-email', email);
    await p.click('#a-submit');
    await p.waitForSelector('#acct-code-form:not([hidden])');
    await p.fill('#a-code', codeFor(email));
    await p.click('#acct-code-form button[type=submit]');
    await p.waitForSelector('#acct-home:not([hidden])');
  }
  async function signOut(p) {
    await p.evaluate(() => App.showTab('account'));
    await p.locator('#dash-nav .dash-link', { hasText: /แก้ไขโปรไฟล์|Edit profile/ }).click();
    await p.click('#a-logout');
    await p.waitForSelector('#acct-signin:not([hidden])');
  }

  for (const [w, h, scheme] of [[1366, 900, 'light'], [390, 844, 'dark']]) {
    const tag = w + scheme;
    const email = `cust${w}@example.com`, backup = `backup${w}@gmail.com`;
    let { ctx, p } = await open(w, h, scheme);
    await p.waitForSelector('#acct-signin:not([hidden])');
    ok((await p.textContent('#a-submit')) === 'รับรหัสทางอีเมล' && await p.isHidden('#a-password-field'), tag + ' sign-in starts with emailed code (as before)');
    // ---- first time: emailed code
    await codeSignIn(p, email);
    await p.waitForSelector('#acct-security', { state: 'visible' });
    ok(true, tag + ' new account opens on the profile page, with the security card');
    await p.locator('#dash-nav .dash-link', { hasText: 'ภาพรวม' }).click();
    await p.waitForSelector('.dash-nudge');
    ok((await p.textContent('.dash-nudge')).includes('ตั้งรหัสผ่านหรือเพิ่มอีเมลสำรอง'), tag + ' overview suggests a password / backup email');
    await p.locator('.dash-nudge button').click();
    await p.waitForSelector('#acct-security:not([hidden])', { state: 'visible' });
    ok((await p.textContent('#sec-pw-flag')) === 'ยังไม่ได้ตั้ง' && await p.isHidden('#sec-cur-field') && (await p.textContent('#sec-pw-save')) === 'ตั้งรหัสผ่าน', tag + ' security card: no password yet, no "current password" needed');
    // weak / mismatch
    await p.fill('#sec-new', 'abcdefgh'); await p.fill('#sec-new2', 'abcdefgh'); await p.click('#sec-pw-save');
    ok((await p.textContent('#sec-new-err')).includes('ตัวอักษรและตัวเลข'), tag + ' weak password explained');
    await p.fill('#sec-new', 'Transcom2569'); await p.fill('#sec-new2', 'Transcom2568'); await p.click('#sec-pw-save');
    ok((await p.textContent('#sec-new2-err')).includes('ไม่ตรงกัน'), tag + ' mismatch explained');
    await p.check('#sec-show');
    ok(await p.getAttribute('#sec-new', 'type') === 'text', tag + ' "show password" works');
    await p.fill('#sec-new2', 'Transcom2569'); await p.click('#sec-pw-save');
    await p.waitForFunction(() => document.querySelector('#sec-pw-flag').textContent === 'ตั้งแล้ว');
    ok((await p.textContent('#sec-pw-status')).includes('บันทึกรหัสผ่านแล้ว') && (await p.textContent('#sec-pw-save')) === 'เปลี่ยนรหัสผ่าน' && await p.isVisible('#sec-pw-remove'), tag + ' password set; button becomes "change"');
    // ---- backup email
    await p.fill('#sec-bk', email); await p.click('#sec-bk-send');
    ok((await p.textContent('#sec-bk-err')).includes('ต้องไม่ใช่อีเมลหลัก'), tag + ' backup = main email refused');
    await p.fill('#sec-bk', backup); await p.click('#sec-bk-send');
    await p.waitForSelector('#sec-bk-code-form:not([hidden])');
    ok((await p.textContent('#sec-bk-sent')).includes(backup), tag + ' code sent to the backup address');
    await p.fill('#sec-bk-code', '000000' === codeFor(backup) ? '111111' : '000000'); await p.click('#sec-bk-code-form button[type=submit]');
    await p.waitForSelector('#sec-bk-code-err:not([hidden])');
    ok((await p.textContent('#sec-bk-code-err')).includes('ไม่ถูกต้อง'), tag + ' wrong code explained');
    await p.fill('#sec-bk-code', codeFor(backup)); await p.click('#sec-bk-code-form button[type=submit]');
    await p.waitForFunction(() => document.querySelector('#sec-bk-flag').textContent === 'เพิ่มแล้ว');
    ok((await p.textContent('#sec-bk-current')).includes(backup) && await p.isVisible('#sec-bk-remove'), tag + ' backup email saved and shown');
    await p.locator('#acct-security').scrollIntoViewIfNeeded();
    await p.screenshot({ path: `${out}/security-${tag}.png`, fullPage: true });
    ok(await overflow(p) <= 0, tag + ' settings: no horizontal scroll');
    // nudge gone
    await p.locator('#dash-nav .dash-link', { hasText: 'ภาพรวม' }).click();
    await p.waitForSelector('#dash-view .dash-stats');
    ok(!(await p.$('.dash-nudge')), tag + ' overview: suggestion gone once set up');
    // ---- sign out, sign in with password
    await signOut(p);
    await p.click('#a-mode');
    ok(await p.isVisible('#a-password-field') && (await p.textContent('#a-submit')) === 'เข้าสู่ระบบ' && (await p.textContent('#a-mode')).includes('เข้าสู่ระบบด้วยรหัสทางอีเมล'), tag + ' switch to password sign-in');
    const fieldBox = await p.evaluate(() => { const e = document.querySelector('#a-email').getBoundingClientRect(), pw = document.querySelector('#a-password'); const r = pw.getBoundingClientRect(); return { eh: Math.round(e.height), ph: Math.round(r.height), ew: Math.round(e.width), pw: Math.round(r.width), border: getComputedStyle(pw).borderTopWidth, type: pw.type }; });
    ok(fieldBox.type === 'password' && fieldBox.eh === fieldBox.ph && fieldBox.ew === fieldBox.pw && fieldBox.border === '1px', tag + ' password box matches the email box (hidden text) ' + JSON.stringify(fieldBox));
    ok(await p.isVisible('#a-forgot') && (await p.textContent('#a-forgot')) === 'ลืมรหัสผ่าน?' && (await p.textContent('#a-mode')).includes('ยังไม่ได้ตั้งรหัสผ่าน'), tag + ' two separate links: forgot / no password yet');
    await p.fill('#a-email', email); await p.fill('#a-password', 'Transcom2569');
    await p.screenshot({ path: `${out}/signin-pw-hidden-${tag}.png` });
    await p.fill('#a-password', 'wrongpass1'); await p.click('#a-submit');
    await p.waitForSelector('#a-password-err:not([hidden])');
    ok((await p.textContent('#a-password-err')).includes('อีเมลหรือรหัสผ่านไม่ถูกต้อง'), tag + ' wrong password explained (generic)');
    await p.click('[data-pw-toggle="a-password"]');
    ok(await p.getAttribute('#a-password', 'type') === 'text', tag + ' eye button shows the password');
    await p.screenshot({ path: `${out}/signin-pw-${tag}.png` });
    await p.fill('#a-password', 'Transcom2569'); await p.click('#a-submit');
    await p.waitForSelector('#acct-home:not([hidden])');
    ok(true, tag + ' signed in with the password');
    // not fresh → current password needed to change
    await p.locator('#dash-nav .dash-link', { hasText: 'แก้ไขโปรไฟล์' }).click();
    ok(await p.isVisible('#sec-cur-field'), tag + ' after a password sign-in, changing needs the current password');
    await p.fill('#sec-cur', 'nope12345'); await p.fill('#sec-new', 'Another2569'); await p.fill('#sec-new2', 'Another2569'); await p.click('#sec-pw-save');
    await p.waitForSelector('#sec-cur-err:not([hidden])');
    ok((await p.textContent('#sec-cur-err')).includes('ไม่ถูกต้อง'), tag + ' wrong current password explained');
    // remembers password mode on this device
    await signOut(p);
    ok(await p.isVisible('#a-password-field'), tag + ' next time the form opens in password mode');
    // ---- forgot password: code → must set a new password → signed in
    await p.fill('#a-email', '');
    await p.click('#a-forgot');
    ok((await p.textContent('#a-email-err')).length > 0, tag + ' forgot: asks for the email first');
    await p.fill('#a-email', email);
    g.cache.delete('code:' + email);
    await p.click('#a-forgot');
    await p.waitForSelector('#acct-code-form:not([hidden])');
    ok((await p.textContent('#acct-code-sent')).includes('ตั้งรหัสผ่านใหม่') && (await p.textContent('#a-verify')) === 'ยืนยันรหัส', tag + ' forgot: reset code sent (own wording)');
    ok(/รหัสตั้งรหัสผ่านใหม่/.test(g.mail.filter(m => m.to === email).pop().subject), tag + ' forgot: email says it is a reset code');
    await p.fill('#a-code', codeFor(email)); await p.click('#a-verify');
    await p.waitForSelector('#acct-reset-form:not([hidden])');
    ok(await p.isHidden('#acct-home') && (await p.textContent('#acct-reset-note')).includes(email), tag + ' forgot: must set a new password before the account opens');
    const resetBox = await p.evaluate(() => Math.round(document.querySelector('#a-new').getBoundingClientRect().height));
    ok(resetBox >= 44, tag + ' new-password boxes full size (' + resetBox + 'px)');
    await p.fill('#a-new', 'short'); await p.click('#a-reset-save');
    ok((await p.textContent('#a-new-err')).includes('8 ตัว'), tag + ' forgot: weak password explained');
    await p.fill('#a-new', 'Reset2569x'); await p.fill('#a-new2', 'Reset2569y'); await p.click('#a-reset-save');
    ok((await p.textContent('#a-new2-err')).includes('ไม่ตรงกัน'), tag + ' forgot: mismatch explained');
    await p.screenshot({ path: `${out}/reset-${tag}.png` });
    await p.fill('#a-new2', 'Reset2569x'); await p.click('#a-reset-save');
    await p.waitForSelector('#acct-home:not([hidden])');
    ok(true, tag + ' forgot: new password set → signed in');
    await signOut(p);
    await p.fill('#a-email', email); await p.fill('#a-password', 'Reset2569x'); await p.click('#a-submit');
    await p.waitForSelector('#acct-home:not([hidden])');
    ok(true, tag + ' the new password works');
    await signOut(p);
    // "no password yet" → emailed code (sign-in)
    await p.click('#a-mode');
    ok(await p.isHidden('#a-password-field') && await p.isHidden('#a-forgot') && (await p.textContent('#a-submit')) === 'รับรหัสทางอีเมล', tag + ' "no password yet" → emailed-code sign-in');
    await p.click('#a-mode');
    // ---- sign in with the backup email (emailed code)
    await p.click('#a-mode');
    await codeSignIn(p, backup);
    await p.locator('#dash-nav .dash-link', { hasText: 'แก้ไขโปรไฟล์' }).click();
    ok((await p.inputValue('#p-email')) === email, tag + ' code to the backup email opens the same account');
    ok(p.errs.length === 0, tag + ' no console errors ' + JSON.stringify(p.errs));
    await ctx.close();
  }

  // ---- English labels
  ({ ctx, p } = await open(1366, 900, 'light', 'en'));
  await p.waitForSelector('#acct-signin:not([hidden])');
  await p.click('#a-mode');
  ok((await p.textContent('#a-submit')) === 'Sign in' && (await p.textContent('label[for=a-password]')) === 'Password', 'EN: password sign-in labels');
  await ctx.close();

  // ---- admin changes an email
  ({ ctx, p } = await open(1366, 900, 'light'));
  await p.waitForSelector('#acct-signin:not([hidden])');
  await codeSignIn(p, 'owner@example.com');
  await p.locator('#dash-nav .dash-link', { hasText: 'ผู้ใช้และบทบาท' }).click();
  await p.waitForSelector('.dash-user');
  const li = p.locator('.dash-user', { hasText: 'cust390@example.com' });
  ok((await li.textContent()).includes('มีรหัสผ่าน') && (await li.textContent()).includes('สำรอง: backup390@gmail.com'), 'admin sees password + backup state');
  ok(!(await p.locator('.dash-user', { hasText: 'owner@example.com' }).locator('.dash-email-change').count()), 'fixed admin has no "change email"');
  await li.locator('.dash-email-change summary').click();
  await li.locator('.dash-email-change input').fill('cust1366@example.com');
  await li.locator('.dash-email-change button').click();
  await p.waitForSelector('.dash-email-change .form-status:not([hidden])');
  ok((await li.locator('.dash-email-change .form-status').textContent()).includes('ใช้กับบัญชีอื่นอยู่แล้ว'), 'taken email refused');
  await li.locator('.dash-email-change input').fill('new390@example.com');
  await p.screenshot({ path: `${out}/admin-change-email.png`, fullPage: false });
  await li.locator('.dash-email-change button').click();
  await p.waitForFunction(() => [...document.querySelectorAll('.dash-user')].some(x => x.textContent.includes('new390@example.com')));
  ok(!(await p.locator('.dash-user', { hasText: 'cust390@example.com' }).count()), 'admin changed the email; list updated');
  ok(g.mail.some(m => m.to === 'new390@example.com' && /อีเมลบัญชีถูกเปลี่ยน/.test(m.subject)) && g.mail.some(m => m.to === 'cust390@example.com' && /อีเมลบัญชีถูกเปลี่ยน/.test(m.subject)), 'both addresses notified');
  ok(await overflow(p) <= 0 && p.errs.length === 0, 'admin page: no horizontal scroll, no console errors ' + JSON.stringify(p.errs));
  await ctx.close();
  await b.close();
})();

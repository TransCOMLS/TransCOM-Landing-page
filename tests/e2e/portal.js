const { chromium } = require('../lib/browser');
const { load } = require('../lib/mock');
const out = require('../lib/paths').out(__filename);
const g = load(require('../lib/paths').CODE_GS);
g.ctx.setup();
const URL = 'https://script.google.com/macros/s/TEST/exec';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const P = g.post;
const signIn = (email, name) => { P({ action: 'requestCode', email }); const tk = P({ action: 'verifyCode', email, code: g.lastCode() }).token; if (name) P({ action: 'updateProfile', token: tk, profile: { name } }); return tk; };

// data: admin (provider email), one staff, one customer with 3 jobs
const admin = signIn('owner@example.com', 'เจ้าของ ร้าน');
const cust = signIn('nida@example.com', 'นิดา ใจดี');
P({ action: 'adminSetUser', token: admin, email: 'ploy@example.com', role: 'staff' });
const staff = signIn('ploy@example.com', 'พลอย นักแปล');
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const mk = (cat, need, files) => {
  const c = P({ action: 'createJob', lang: 'th', job: { name: 'นิดา ใจดี', email: 'nida@example.com', phone: '0812345678', langPair: 'th-en', category: cat, pages: 2, neededBy: need, consent: true, idConsent: cat === 'civil', nameSpelling: 'Nida Jaidee', notes: 'ใช้ยื่นวีซ่า', files: [{ name: files[0], size: 3 }], idFiles: cat === 'civil' ? [{ name: 'id.jpg', size: 3 }] : [] } });
  P({ action: 'uploadFile', jobNo: c.jobNo, uploadToken: c.uploadToken, kind: 'doc', name: files[0], data: 'QUJD' });
  if (cat === 'civil') P({ action: 'uploadFile', jobNo: c.jobNo, uploadToken: c.uploadToken, kind: 'id', name: 'id.jpg', data: 'QUJD' });
  P({ action: 'finishJob', jobNo: c.jobNo, uploadToken: c.uploadToken });
  return c.jobNo;
};
const j1 = mk('civil', day(2), ['birth.pdf']);      // assigned, in progress
const j2 = mk('other', day(6), ['letter.pdf']);     // received, customer may cancel
const j3 = mk('business', day(9), ['contract.pdf']);// delivered with a file
P({ action: 'adminUpdateJob', token: admin, jobNo: j1, assignee: 'ploy@example.com' });
P({ action: 'staffUpdate', token: staff, jobNo: j1, step: 'start' });
P({ action: 'adminUpdateJob', token: admin, jobNo: j3, assignee: 'ploy@example.com', status: 'inProgress' });
P({ action: 'uploadTranslation', token: staff, jobNo: j3, name: 'contract-EN.pdf', data: 'WFla' });
P({ action: 'adminUpdateJob', token: admin, jobNo: j3, status: 'delivered' });
const tokens = { customer: cust, staff, admin };

(async () => {
  const b = await chromium.launch();
  async function open(role, w, h, scheme) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, acceptDownloads: true });
    await ctx.addInitScript(tk => { try { localStorage.setItem('tr_session', tk); localStorage.setItem('tr_lang', 'th'); } catch (e) {} }, tokens[role]);
    await ctx.route('https://script.google.com/macros/s/AKfy**', r => r.abort());   // never reach the live system
    await ctx.route('**/js/config.js*', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/appsScriptUrl: "[^"]*"/, `appsScriptUrl: "${URL}"`) }); });
    await ctx.route(URL, async r => { const body = JSON.parse(r.request().postData()); r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(P(body)) }); });
    const p = await ctx.newPage();
    p.errors = [];
    p.on('pageerror', e => p.errors.push(e.message));
    p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && p.errors.push(m.text()));
    await p.goto('http://localhost:8765/#account');
    await p.waitForSelector('#dash-nav .dash-link', { timeout: 15000 });
    await p.waitForTimeout(300);
    return { ctx, p };
  }
  const overflow = p => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const click = (p, text) => p.locator('#dash-nav .dash-link', { hasText: text }).first().click();

  for (const [w, h, scheme] of [[1366, 900, 'light'], [390, 844, 'dark'], [320, 640, 'light'], [768, 1024, 'dark']]) {
    const tag = w + scheme;
    // ===== customer
    let { ctx, p } = await open('customer', w, h, scheme);
    ok((await p.textContent('#dash-role')).includes('ลูกค้า'), tag + ' customer: role shown');
    ok(await p.locator('.dash-stat').count() === 4, tag + ' customer overview: 4 stats');
    ok(!(await p.locator('#dash-nav').textContent()).includes('ผู้ใช้และบทบาท'), tag + ' customer has no admin menu');
    if (w === 1366) await p.screenshot({ path: `${out}/c-overview-${tag}.png`, fullPage: true });
    await click(p, 'ปิดงานแล้ว'); await p.waitForTimeout(150);
    ok((await p.locator('#dash-view .job-item-btn').count()) >= 1, tag + ' closed orders listed');
    await p.locator('#dash-view .job-item-btn', { hasText: j3 }).click();
    await p.waitForSelector('#dash-view .dash-files li');
    ok((await p.textContent('#dash-view .dash-files')).includes('contract-EN.pdf') && !(await p.textContent('#dash-view')).includes('ploy'), tag + ' delivered job: translation listed, translator not named');
    if (w === 1366) {
      const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('#dash-view .dash-files button', { hasText: 'ดาวน์โหลด' }).click()]);
      ok(dl.suggestedFilename() === 'contract-EN.pdf', 'customer downloads the translation');
      await p.screenshot({ path: `${out}/c-job-${tag}.png`, fullPage: true });
    }
    await click(p, 'กำลังดำเนินการ'); await p.waitForTimeout(150);
    if (w === 1366) {
      await p.locator('#dash-view .job-item-btn', { hasText: j2 }).click();
      await p.waitForSelector('#dash-view textarea');
      await p.fill('#dash-view textarea', 'ส่งไฟล์ผิด');
      await p.locator('#dash-view button', { hasText: 'ส่งคำขอยกเลิก' }).click();
      await p.waitForSelector('#dash-view .notice-warn');
      ok((await p.textContent('#dash-view')).includes('รอทีมงานยืนยัน'), 'customer sends a cancel request');
    }
    await click(p, 'ชำระค่าบริการ');
    const payOk = await p.waitForFunction(() => { const v = document.querySelector('#dash-view'); return v && (v.textContent.includes(App.t('pay.emptyToPay')) || !!v.querySelector('.job-item-btn')); }, null, { timeout: 5000 }).then(() => true, () => false);
    ok(payOk, tag + ' payment: quotes to pay (or "nothing to pay")');
    await click(p, 'แก้ไขโปรไฟล์'); await p.waitForTimeout(100);
    ok(await p.isVisible('#acct-profile') && await p.isVisible('#a-delete'), tag + ' settings: profile + delete account for customers');
    ok(await overflow(p) <= 0, tag + ' customer: no horizontal scroll');
    ok(p.errors.length === 0, tag + ' customer: no console errors ' + JSON.stringify(p.errors));
    await ctx.close();

    // ===== staff
    ({ ctx, p } = await open('staff', w, h, scheme));
    await p.waitForSelector('#dash-view .job-item-btn');
    ok((await p.textContent('#dash-role')).includes('พนักงาน') && await p.locator('#dash-view .job-item-btn').count() === 2, tag + ' staff: 2 assigned jobs');
    if (w === 1366) ok((await p.textContent('#dash-view')).includes('ใกล้กำหนด'), tag + ' staff: due-soon flag');
    await p.locator('#dash-view .job-item-btn', { hasText: j1 }).click();
    await p.waitForSelector('#dash-view .dash-files');
    const body = await p.textContent('#dash-view');
    ok(body.includes('NIDA JAIDEE') && body.includes('birth.pdf') && body.includes('id.jpg') && !body.includes('0812345678') && !body.includes('nida@example.com'), tag + ' staff job: spelling + files, no customer contacts');
    if (w === 1366) {
      await p.setInputFiles('#dash-view .dash-upload input[type=file]', { name: 'birth-EN.pdf', mimeType: 'application/pdf', buffer: Buffer.from('XYZ') });
      await p.waitForFunction(() => document.querySelector('#dash-view') && document.querySelector('#dash-view').textContent.includes('birth-EN.pdf'), null, { timeout: 15000 });
      await p.waitForSelector('#busy-dialog.is-done');
      ok((await p.textContent('#busy-title')).includes('อัปโหลดเรียบร้อยแล้ว'), 'staff uploads a translation (pop-up shows the tick)');
      await p.waitForFunction(() => !document.querySelector('#busy-dialog').open, null, { timeout: 4000 });
      await p.locator('#dash-view button', { hasText: 'แปลเสร็จ ส่งตรวจ' }).click();
      await p.waitForSelector('#dash-view .notice');
      ok((await p.textContent('#dash-view')).includes('ส่งตรวจแล้ว'), 'staff marks ready for checking');
      await p.fill('#dash-view textarea', 'ตรวจชื่ออำเภอแล้ว');
      await p.locator('#dash-view button', { hasText: 'เพิ่มบันทึก' }).click();
      await p.waitForFunction(() => document.querySelector('.dash-log') && document.querySelector('.dash-log').textContent.includes('ตรวจชื่ออำเภอแล้ว'));
      ok(true, 'staff adds an internal note');
      await p.screenshot({ path: `${out}/s-job-${tag}.png`, fullPage: true });
    }
    await click(p, 'แก้ไขโปรไฟล์'); await p.waitForTimeout(100);
    ok(await p.isHidden('#a-delete'), tag + ' staff: no delete-account button');
    ok(await overflow(p) <= 0, tag + ' staff: no horizontal scroll');
    ok(p.errors.length === 0, tag + ' staff: no console errors ' + JSON.stringify(p.errors));
    await ctx.close();

    // ===== admin
    ({ ctx, p } = await open('admin', w, h, scheme));
    await p.waitForSelector('#dash-view .dash-stat');
    await p.waitForSelector('.dash-stats-2');
    const grids = await p.$$eval('#dash-view .dash-stats', gs => gs.map(g => (g.classList.contains('dash-stats-2') ? 'visits' : 'n') + g.querySelectorAll('.dash-stat').length));
    ok(grids[0] === 'n6' && grids.includes('visits2') && grids.includes('n4') && await p.locator('.dash-bar-row').count() >= 12, tag + ' admin overview: 6 job stats + 4 money stats + 2 visitor stats + charts (' + grids.join() + ')');
    if (w === 1366 || w === 390) await p.screenshot({ path: `${out}/a-overview-${tag}.png`, fullPage: true });
    await click(p, 'งานทั้งหมด');
    await p.waitForSelector('#dash-view .job-item-btn');
    ok(await p.locator('#dash-view .job-item-btn').count() === 3, tag + ' admin: all 3 jobs');
    await p.fill('#dash-view input[type=search]', j3); await p.waitForTimeout(100);
    ok(await p.locator('#dash-view .job-item-btn').count() === 1, tag + ' admin: search narrows the list');
    await p.fill('#dash-view input[type=search]', '');
    await p.locator('#dash-view .job-item-btn', { hasText: w === 1366 ? j2 : j1 }).click();
    await p.waitForSelector('#a-assignee');
    ok((await p.textContent('#dash-view')).includes('0812345678') && (await p.textContent('#dash-view')).includes('nida@example.com'), tag + ' admin job: customer contact shown');
    if (w === 1366) {
      ok((await p.textContent('#dash-view')).includes('ส่งไฟล์ผิด'), 'admin sees the cancel request');
      await p.screenshot({ path: `${out}/a-job-${tag}.png`, fullPage: true });
      await p.locator('#dash-view button', { hasText: 'อนุมัติยกเลิก' }).click();
      await p.waitForFunction(() => document.querySelector('#dash-view .job-top .status-chip') && document.querySelector('#dash-view .job-top .status-chip').textContent === 'ยกเลิก');
      ok(true, 'admin approves the cancel request');
      // deliver j1 via status select
      await click(p, 'งานทั้งหมด'); await p.waitForSelector('#dash-view .job-item-btn');
      await p.locator('#dash-view .job-item-btn', { hasText: j1 }).click(); await p.waitForSelector('#a-status');
      await p.selectOption('#a-status', 'delivered');
      await p.locator('#dash-view .dash-card', { has: p.locator('#a-status') }).locator('button', { hasText: 'บันทึกข้อมูล' }).click();
      await p.waitForFunction(() => document.querySelector('#dash-view .job-top .status-chip').textContent === 'ส่งมอบแล้ว');
      ok(g.mail.some(m => m.to === 'nida@example.com' && /ส่งมอบแล้ว/.test(m.subject) && new RegExp(j1).test(m.subject)), 'admin delivers from the site; customer emailed');
    }
    await click(p, 'ผู้ใช้และบทบาท'); await p.waitForSelector('.dash-user');
    ok(await p.locator('.dash-user').count() >= 3, tag + ' users list');
    if (w === 1366) {
      await p.locator('.dash-toolbar input[type=email]:not([inputmode])').fill('new@example.com');
      await p.locator('.dash-toolbar button', { hasText: 'เพิ่ม' }).click();
      await p.waitForFunction(() => document.querySelectorAll('.dash-user').length === 4);
      ok(true, 'admin adds a staff member');
      const row = p.locator('.dash-user', { hasText: 'nida@example.com' });
      await row.locator('select').nth(1).selectOption('student');
      await p.waitForFunction(() => [...document.querySelectorAll('.dash-saved')].some(s => s.textContent));
      ok(g.sheets.Users.data.some(r => r.includes('nida@example.com') && r.includes('นักเรียน/นักศึกษา')), 'admin sets a customer type (saved in the sheet)');
      await p.screenshot({ path: `${out}/a-users-${tag}.png`, fullPage: true });
    }
    await click(p, 'ส่วนลด'); await p.waitForSelector('.dash-disc-row');
    if (w === 1366) {
      await p.locator('.dash-disc-row', { hasText: 'นักเรียน' }).locator('input').fill('10');
      await p.locator('#dash-view button', { hasText: 'เพิ่มขั้นสมาชิก' }).click();
      await p.locator('.dash-tier input[type=text]').fill('Gold');
      await p.locator('.dash-tier input[type=number]').first().fill('20000');
      await p.locator('.dash-tier .dash-pct input').fill('7');
      await p.locator('#dash-view button', { hasText: 'บันทึกข้อมูล' }).click();
      await p.waitForSelector('#dash-view .form-status.success');
      const D = g.sheets.Discounts.data;
      ok(D.some(r => r[1] === 'student' && r[4] === 10) && D.some(r => r[0] === 'tier' && r[2] === 'Gold' && r[5] === 20000 && r[4] === 7), 'admin saves discounts (type + tier)');
      await p.screenshot({ path: `${out}/a-discounts-${tag}.png`, fullPage: true });
    }
    // English redraw
    await p.click('.lang-toggle [data-lang=en]'); await p.waitForTimeout(150);
    ok((await p.textContent('#dash-nav')).includes('Users & roles'), tag + ' admin menu in English');
    await p.click('.lang-toggle [data-lang=th]');
    ok(await overflow(p) <= 0, tag + ' admin: no horizontal scroll');
    ok(p.errors.length === 0, tag + ' admin: no console errors ' + JSON.stringify(p.errors));
    await ctx.close();
  }
  await b.close();
})();

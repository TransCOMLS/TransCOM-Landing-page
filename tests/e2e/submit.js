const { chromium } = require('../lib/browser');
const { load } = require('../lib/mock');
const out = require('../lib/paths').out(__filename);
const g = load(require('../lib/paths').CODE_GS);
g.ctx.setup();
const URL = 'https://script.google.com/macros/s/TEST/exec';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
let failNextUpload = 0, calls = [];

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.route('https://script.google.com/macros/s/AKfy**', r => r.abort());   // never reach the live system
    await ctx.route('**/js/config.js*', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()) + `\nwindow.APP_CONFIG.appsScriptUrl = "${URL}";` }); });
  await ctx.route(URL, async r => {
    const body = JSON.parse(r.request().postData());
    calls.push(body.action + (body.name ? ':' + body.name : ''));
    if (body.action === 'uploadFile' && failNextUpload > 0) { failNextUpload--; return r.abort('connectionreset'); }
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(g.post(body)) });
  });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => m.type() === 'error' && !/Failed to load resource|ERR_CONNECTION_RESET/.test(m.text()) && errors.push(m.text()));
  await p.goto('http://localhost:8765/#submit');
  await p.click('.lang-toggle [data-lang=th]');

  const fill = async () => {
    await p.fill('#f-name', 'นิดา ใจดี'); await p.fill('#f-email', 'nida@example.com');
    await p.selectOption('#f-langPair', 'th-en'); await p.selectOption('#f-category', 'civil');
    const d = await p.evaluate(() => { const x = new Date(Date.now() + 4 * 864e5); return x.toISOString().slice(0, 10); });
    await p.fill('#f-neededBy', d);
    await p.setInputFiles('#f-files', [
      { name: 'image.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(3000, 1) },
      { name: 'birth.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(2000, 2) }]);
    await p.setInputFiles('#f-files', [{ name: 'image.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(4000, 3) }]);   // second photo, same name
    await p.setInputFiles('#f-idFiles', [{ name: 'idcard.png', mimeType: 'image/png', buffer: Buffer.alloc(1500, 4) }]);
    await p.check('#f-idConsent'); await p.check('#f-consent');
  };
  await fill();

  // 1) connection drops on the 2nd file
  failNextUpload = 0;
  calls = [];
  await p.evaluate(() => {});
  const origPost = g.post;
  let uploads = 0, busySeen = '';
  failNextUpload = 0;
  await ctx.unroute(URL);
  await ctx.route(URL, async r => {
    const body = JSON.parse(r.request().postData());
    calls.push(body.action + (body.name ? ':' + body.name : ''));
    if (body.action === 'uploadFile' && ++uploads === 1) {
      busySeen = await p.evaluate(() => { const d = document.querySelector('#busy-dialog'); return d.open && !d.classList.contains('is-done') && getComputedStyle(d.querySelector('.busy-spinner')).display !== 'none' && d.textContent; });
      await p.screenshot({ path: out + '/busy-uploading-1366.png' });
    }
    if (body.action === 'uploadFile' && uploads === 2) return r.abort('connectionreset');
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(origPost(body)) });
  });
  await p.click('#job-form button[type=submit]');
  await p.waitForSelector('#form-status.error', { timeout: 15000 });
  ok(/กำลังส่งงานแปล/.test(busySeen) && /อย่าปิด/.test(busySeen) && /อาจใช้เวลาสักครู่/.test(busySeen), 'pop-up with spinner while uploading, tells the customer to wait');
  ok(!(await p.evaluate(() => document.querySelector('#busy-dialog').open)), 'pop-up closes when the connection drops');
  ok((await p.textContent('#form-status')).includes('ส่งต่อจากไฟล์ที่ค้าง'), 'dropped connection: clear message, form kept');
  ok(await p.inputValue('#f-name') === 'นิดา ใจดี' && await p.isEnabled('#job-form button[type=submit]'), 'form data still there, button usable again');
  ok(g.sheets.Jobs.data.length === 2, 'one job row created so far');

  // 2) press Submit again: resumes, no second job
  calls = [];
  await p.click('#job-form button[type=submit]');
  await p.waitForSelector('#busy-dialog.is-done', { timeout: 15000 });
  ok((await p.textContent('#busy-title')).includes('ส่งงานเรียบร้อยแล้ว') && (await p.textContent('#busy-text')).includes('TR-2569-0001') && await p.isVisible('.busy-check'), 'pop-up turns into a tick with the job number');
  await p.waitForTimeout(700); await p.screenshot({ path: out + '/busy-done-1366.png' });
  ok(await p.evaluate(() => { try { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return !e.defaultPrevented; } catch (x) { return false; } }), 'leaving the page is allowed again once finished');
  ok(!(await p.isVisible('#busy-ok')), 'no button to press (the OK button is only for failures)');
  await p.waitForFunction(() => !document.querySelector('#busy-dialog').open, null, { timeout: 4000 });
  ok(true, 'pop-up closes by itself after the tick');
  await p.waitForSelector('#submit-done:not([hidden])', { timeout: 15000 });
  ok(!calls.includes('createJob'), 'retry does not create a second job: ' + calls.join(' '));
  ok(calls.filter(c => c.startsWith('uploadFile')).length === 3 && calls[calls.length - 1] === 'finishJob', 'retry sends the 3 remaining files then finishes');
  ok(g.sheets.Jobs.data.length === 2, 'still one job row');
  ok((await p.textContent('#submit-done-no')) === 'TR-2569-0001', 'success: job number shown');
  ok((await p.textContent('#submit-done-text')).includes('nida@example.com'), 'success text mentions the email');
  const names = g.drive.files.map(f => f.name).sort();
  ok(JSON.stringify(names) === JSON.stringify(['birth.pdf', 'idcard.png', 'image (2).jpg', 'image.jpg']), 'all 4 files stored, duplicate name renamed: ' + names.join(', '));
  ok(g.drive.files.find(f => f.name === 'idcard.png') && g.drive.folders[g.drive.files.find(f => f.name === 'idcard.png').folder].name.startsWith('บัตร'), 'ID card in its own subfolder');
  const row = g.sheets.Jobs.data[1], head = g.sheets.Jobs.data[0];
  ok(row[head.indexOf('สถานะ')] === 'ได้รับงานแล้ว' && row[head.indexOf('จำนวนไฟล์')] === 4, 'sheet row: received, 4 files');
  ok(g.mail.some(m => m.to === 'nida@example.com' && /TR-2569-0001/.test(m.subject)) && g.mail.some(m => m.to === 'owner@example.com'), 'emails to customer and provider');
  await p.screenshot({ path: out + '/submit-done-1366.png' });

  // 3) send another
  await p.click('#submit-another');
  ok(await p.isVisible('#job-form') && await p.inputValue('#f-name') === '' && (await p.$$('#file-list .file-item')).length === 0, 'send another: empty form');

  // 4) server-side refusal shows a message
  await ctx.unroute(URL);
  await ctx.route(URL, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: false, error: 'rate_limited' }) }));
  await fill();
  await p.click('#job-form button[type=submit]');
  await p.waitForSelector('#form-status.error');
  ok((await p.textContent('#form-status')).includes('บ่อยเกินไป'), 'rate limit message');

  // 5) too many files caught before sending
  await p.setInputFiles('#f-files', Array.from({ length: 10 }, (_, i) => ({ name: 'p' + i + '.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(10, i) })));
  await p.click('#job-form button[type=submit]');
  ok((await p.textContent('#f-files-err')).includes('สูงสุด 10 ไฟล์'), 'more than 10 files: error before sending');

  // 6) dark mode look
  await p.setInputFiles('#f-files', []);
  ok(errors.length === 0, 'no console errors ' + JSON.stringify(errors));
  await b.close();
})();

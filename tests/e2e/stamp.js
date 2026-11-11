const { chromium } = require('../lib/browser'); const fs = require('fs');
const { load } = require('../lib/mock');
const out = require('../lib/paths').out(__filename);
const g = load(require('../lib/paths').CODE_GS, { realJobNo: true }); g.ctx.setup();
const URL = 'https://script.google.com/macros/s/TEST/exec';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const P = g.post;
const signIn = e => { P({ action: 'requestCode', email: e }); return P({ action: 'verifyCode', email: e, code: g.lastCode() }).token; };
const admin = signIn('owner@example.com'); P({ action: 'updateProfile', token: admin, profile: { name: 'เจ้าของ' } });
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
function job(shipping, pair) {
  const c = P({ action: 'createJob', lang: 'th', job: { name: 'ลูกค้า', email: 'c@example.com', langPair: pair, category: 'official', pages: 1, neededBy: day(5), consent: true, certified: true, shipping, address: shipping ? '1 ถนนทดสอบ กรุงเทพฯ 10100' : '', files: [{ name: 'a.pdf', size: 3 }], idFiles: [] } });
  P({ action: 'uploadFile', jobNo: c.jobNo, uploadToken: c.uploadToken, kind: 'doc', name: 'a.pdf', data: 'QUJD' });
  const f = P({ action: 'finishJob', jobNo: c.jobNo, uploadToken: c.uploadToken });
  if (!f.ok) console.log(JSON.stringify(f));
  return c.jobNo;
}
const eJob = job(false, 'th-en'), paperJob = job(true, 'th-en');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.route('https://script.google.com/macros/s/AKfy**', r => r.abort());
  await ctx.addInitScript(tk => { try { localStorage.setItem('tr_session', tk); localStorage.setItem('tr_lang', 'th'); } catch (e) {} }, admin);
  await ctx.route('**/js/config.js*', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/appsScriptUrl: "[^"]*"/, `appsScriptUrl: "${URL}"`) }); });
  await ctx.route(URL, async r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(P(JSON.parse(r.request().postData()))) }));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/#account');
  await p.waitForSelector('#dash-nav .dash-link');
  async function openJob(no) {
    await p.locator('#dash-nav .dash-link', { hasText: 'งานทั้งหมด' }).click();
    await p.locator('.job-item-btn', { hasText: no }).first().click();
    await p.waitForSelector('.dash-cert canvas');
  }
  // e-cert job: option shown + stamp button
  await openJob(eJob);
  ok(await p.isVisible('.dash-stamp-choice') && await p.isChecked('.dash-stamp-choice input'), 'e-certified job: "stamp automatically" shown and ticked');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('.dash-cert button:has-text("ดาวน์โหลดตรารับรอง")')]);
  ok(/^E-Certified-[2-9A-Z-]+\.png$/.test(dl.suggestedFilename()), 'stamp picture downloads: ' + dl.suggestedFilename());
  const pdf = fs.readFileSync(require('path').join(__dirname, '..', 'fixtures', 'letter-portrait.pdf'));
  await p.setInputFiles('.dash-upload input[type=file]', [{ name: 'translation.pdf', mimeType: 'application/pdf', buffer: pdf },
    { name: 'notes.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('PK fake') }]);
  await p.waitForFunction(() => !document.querySelector('#busy-dialog').open, null, { timeout: 30000 });
  await p.waitForTimeout(500);
  const stored = g.drive.files.filter(f => f.name === 'translation.pdf').pop();
  const bytes = Buffer.from((stored.bytes || []).map(x => x & 255));
  ok(stored && bytes.length > pdf.length + 20000 && bytes.slice(0, 5).toString() === '%PDF-', 'uploaded PDF is the stamped one (' + pdf.length + ' → ' + bytes.length + ' bytes)');
  fs.writeFileSync(out + '/uploaded-stamped.pdf', bytes);
  ok((await p.textContent('#dash-view')).includes('ไม่ได้ประทับตรา') && (await p.textContent('#dash-view')).includes('notes.docx'), 'Word file uploaded unstamped, staff told');
  // paper-copy job: no stamp option
  await openJob(paperJob);
  ok(!(await p.$('.dash-stamp-choice')) && !(await p.$('.dash-cert button:has-text("ดาวน์โหลดตรารับรอง")')), 'job with a paper copy by post: no automatic stamp (rubber stamp by hand)');
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
  await b.close();
})();

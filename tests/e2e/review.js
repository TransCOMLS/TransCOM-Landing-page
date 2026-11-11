const { chromium } = require('../lib/browser');
const { load } = require('../lib/mock');
const out = require('../lib/paths').out(__filename);
const g = load(require('../lib/paths').CODE_GS);
g.ctx.setup();
const URL = 'https://script.google.com/macros/s/TEST/exec';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const P = g.post;
const signIn = (email, name) => { P({ action: 'requestCode', email }); const tk = P({ action: 'verifyCode', email, code: g.lastCode() }).token; if (name) P({ action: 'updateProfile', token: tk, profile: { name } }); return tk; };
const admin = signIn('owner@example.com', 'เจ้าของ');
const cust = signIn('nida@example.com', 'นิดา ใจดี');
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
function makeReviewJob() {
const c = P({ action: 'createJob', lang: 'th', job: { name: 'นิดา ใจดี', email: 'nida@example.com', langPair: 'th-en', category: 'other', pages: 1, neededBy: day(4), consent: true, files: [{ name: 'a.pdf', size: 3 }], idFiles: [] } });
P({ action: 'uploadFile', jobNo: c.jobNo, uploadToken: c.uploadToken, kind: 'doc', name: 'a.pdf', data: 'QUJD' });
P({ action: 'finishJob', jobNo: c.jobNo, uploadToken: c.uploadToken });
const jobNo = c.jobNo;
P({ action: 'adminUpdateJob', token: admin, jobNo, status: 'inProgress' });
P({ action: 'uploadTranslation', token: admin, jobNo, name: 'a-EN.pdf', data: 'WFla' });
P({ action: 'adminUpdateJob', token: admin, jobNo, status: 'review' });
const reviewMail = g.mail.filter(m => m.to === 'nida@example.com').pop().htmlBody;
const link = (reviewMail.match(/href="(https:\/\/www\.prathaitranslation\.com\/\?job=[^"]+)"/) || [])[1];
ok(!!link, 'review email has the job link: ' + link);
return { jobNo, link };
}

(async () => {
  const b = await chromium.launch();
  for (const [w, h, scheme] of [[1366, 900, 'light'], [390, 844, 'dark']]) {
    const { jobNo, link } = makeReviewJob();
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
    await ctx.addInitScript(tk => { try { localStorage.setItem('tr_session', tk); localStorage.setItem('tr_lang', 'th'); } catch (e) {} }, cust);
    await ctx.route('https://script.google.com/macros/s/AKfy**', r => r.abort());   // never reach the live system
    await ctx.route('**/js/config.js*', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/appsScriptUrl: "[^"]*"/, `appsScriptUrl: "${URL}"`) }); });
    await ctx.route(URL, async r => { r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(P(JSON.parse(r.request().postData()))) }); });
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    // open the link from the email (same path, local server)
    await p.goto(link.replace('https://www.prathaitranslation.com/', 'http://localhost:8765/'));
    await p.waitForSelector('.dash-review', { timeout: 15000 });
    ok((await p.textContent('#dash-view .job-no')) === jobNo && (await p.textContent('#dash-view .job-top .status-chip')) === 'รอลูกค้าตรวจ', w + ' email link opens the job page (status รอลูกค้าตรวจ)');
    ok(!(await p.evaluate(() => location.search)), w + ' job link removed from the address bar after use');
    ok(await p.locator('.track-steps li').count() === 6 && (await p.textContent('.track-steps li.current')).includes('รอลูกค้าตรวจ'), w + ' 6-step timeline, current = รอลูกค้าตรวจ');
    ok((await p.textContent('#dash-view .dash-files')).includes('a-EN.pdf'), w + ' translation listed for checking');
    if (w === 1366) {
      await p.screenshot({ path: `${out}/review-${w}.png`, fullPage: true });
      // ask for corrections
      await p.click('.dash-revision summary');
      await p.fill('.dash-revision textarea', 'ชื่อสะกดผิด ควรเป็น Nida Jaidee');
      await p.locator('.dash-revision button').click();
      await p.waitForFunction(() => document.querySelector('#dash-view .job-top .status-chip') && document.querySelector('#dash-view .job-top .status-chip').textContent === 'กำลังแปล');
      ok((await p.textContent('#dash-view')).includes('ส่งคำขอแก้ไขแล้ว') && g.mail.some(m => /ลูกค้าขอแก้ไข/.test(m.subject)), 'correction request: back to กำลังแปล, team emailed, note shown');
      // team sends it back for review, customer confirms
      P({ action: 'adminUpdateJob', token: admin, jobNo, status: 'review' });
      await p.locator('#dash-nav .dash-link', { hasText: 'ภาพรวม' }).click();
      await p.waitForSelector('.dash-attention');
      ok((await p.textContent('.dash-attention')).includes('รอท่านตรวจ 1 งาน'), 'overview reminds the customer of work to check');
      await p.locator('.dash-attention .job-item-btn').click();
      await p.waitForSelector('.dash-review');
      await p.locator('.dash-review .btn-primary').click();
      await p.waitForSelector('.track-confirmed');
      ok((await p.textContent('#dash-view .job-top .status-chip')) === 'ส่งมอบแล้ว' && (await p.textContent('.track-confirmed')).includes('ยืนยันว่างานแปลถูกต้องแล้ว'), 'customer confirms: ส่งมอบแล้ว + confirmed note');
      ok(!(await p.$('.dash-review')), 'no more confirm/correct buttons after confirming');
      await p.screenshot({ path: `${out}/confirmed-${w}.png`, fullPage: true });
    }
    const o = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(o <= 0, w + ' no horizontal scroll');
    ok(!errs.length, w + ' no console errors ' + JSON.stringify(errs));
    await ctx.close();
  }
  // admin: status menu has the new step, sheet label maps
  ok(g.ctx.statusLabel_('review') === 'รอลูกค้าตรวจ', 'sheet label for the new status');
  await b.close();
})();

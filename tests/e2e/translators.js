// Phase 7 in the browser: apply → (admin approves) → contract with the person's details → accept → open list → claim
// → files after payment → confirm tick + ready → admin approves on the job page; earnings, glossary, manual, admin pages
const { chromium } = require('../lib/browser');
const { load } = require('../lib/mock');
const out = require('../lib/paths').out(__filename);
const g = load(require('../lib/paths').CODE_GS);
g.ctx.setup();
const URL = 'https://script.google.com/macros/s/TEST/exec';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const P = g.post;
const signIn = email => { P({ action: 'requestCode', email }); return P({ action: 'verifyCode', email, code: g.lastCode() }).token; };
const admin = signIn('owner@example.com'), cand = signIn('anan@example.com');
P({ action: 'updateProfile', token: cand, profile: { name: 'อนันต์ แปลดี' } });
const future = new Date(Date.now() + 6 * 864e5).toISOString().slice(0, 10);
const c = P({ action: 'createJob', job: { name: 'นิดา', email: 'nida@example.com', langPair: 'th-en', category: 'official', pages: 2, neededBy: future, consent: true, files: [{ name: 'a.pdf', size: 3 }], idFiles: [] } });
P({ action: 'uploadFile', jobNo: c.jobNo, uploadToken: c.uploadToken, kind: 'doc', name: 'a.pdf', data: 'QUJD' });
P({ action: 'finishJob', jobNo: c.jobNo, uploadToken: c.uploadToken });
const jobNo = c.jobNo;
P({ action: 'adminSaveQuote', token: admin, jobNo, items: [{ text: 'ค่าแปล 2 หน้า', amount: 600 }] });

(async () => {
  const b = await chromium.launch();
  async function open(w, h, scheme, token, hash, lang) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
    await ctx.addInitScript(([tk, lg]) => { try { localStorage.setItem('tr_session', tk); localStorage.setItem('tr_lang', lg); } catch (e) {} }, [token, lang || 'th']);
    await ctx.route('**/js/config.js*', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/appsScriptUrl: "[^"]*"/, `appsScriptUrl: "${URL}"`) }); });
    await ctx.route(URL, async r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(P(JSON.parse(r.request().postData()))) }));
    const p = await ctx.newPage(); p.errs = [];
    p.on('pageerror', e => p.errs.push(e.message));
    p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && p.errs.push(m.text()));
    await p.goto('http://localhost:8765/' + (hash || '#account'));
    await p.waitForSelector('#dash-nav .dash-link');
    return { ctx, p };
  }
  const overflow = p => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const nav = (p, text) => p.locator('#dash-nav .dash-link', { hasText: text }).first().click();
  const field = (p, label) => p.locator('#dash-view .field', { hasText: label }).first();

  // ---- 1. customer applies on the website
  let { ctx, p } = await open(1366, 900, 'light', cand);
  await nav(p, 'สมัครเป็นผู้แปล');
  await p.waitForSelector('#dash-view .choice-grid');
  ok((await p.inputValue('#dash-view input[autocomplete=name]')) === 'อนันต์ แปลดี', 'apply form: name filled in from the account');
  ok(/ยังไม่เปิดรับงาน/.test(await p.textContent('#dash-view .tr-more summary')) && (await p.locator('#dash-view .tr-more input').count()) === 20, 'prepared language pairs offered separately (folded)');
  await field(p, 'เลขบัตรประชาชน').locator('input').fill('1101700000012');
  await field(p, 'ที่อยู่').locator('textarea').fill('12 ถนนสุขุมวิท แขวงคลองเตย กรุงเทพฯ');
  await p.check('#dash-view .choice-grid input[value="th-en"]');
  await field(p, 'ธนาคาร').locator('input').fill('กสิกรไทย');
  await field(p, 'เลขบัญชี').locator('input').fill('0123456789');
  await field(p, 'ชื่อบัญชี').locator('input').fill('อนันต์ แปลดี');
  await field(p, 'ประวัติย่อ').locator('input[type=file]').setInputFiles({ name: 'cv.pdf', mimeType: 'application/pdf', buffer: Buffer.from('ABC') });
  await p.check('#dash-view .dash-card > label.choice input');
  ok(await overflow(p) === 0, '1366 apply form: no horizontal scroll');
  await p.screenshot({ path: out + '/apply-1366.png', fullPage: true });
  await p.click('#dash-view button:has-text("ส่งใบสมัคร")');
  await p.waitForSelector('#dash-view .notice-soft', { timeout: 15000 });
  ok(/รอร้านพิจารณา/.test(await p.textContent('#dash-view')), 'after sending: waiting for review');
  ok(g.sheets.Translators.data.length === 2, 'application row in Translators');
  ok(!p.errs.length, 'apply: no console errors ' + p.errs.join(' | '));
  await ctx.close();

  // ---- 2. admin approves on the translators page
  ({ ctx, p } = await open(1366, 900, 'light', admin));
  await nav(p, 'ผู้แปลและใบสมัคร');
  await p.waitForSelector('#dash-view button:has-text("อนุมัติเป็นผู้แปล")');
  await p.screenshot({ path: out + '/admin-translators-1366.png', fullPage: true });
  await p.click('#dash-view button:has-text("อนุมัติเป็นผู้แปล")');
  await p.waitForSelector('#dash-view .flag-ok');
  ok(/ยังไม่ยอมรับสัญญา/.test(await p.textContent('#dash-view')), 'approved; contract still to be accepted');
  await ctx.close();

  // ---- 3. translator: contract filled in → accept → open list → claim
  ({ ctx, p } = await open(390, 844, 'dark', cand));
  await p.waitForSelector('#dash-view .doc-sec');
  const docText = await p.textContent('#dash-view .doc-sec');
  ok(/อนันต์ แปลดี/.test(docText) && /1101700000012/.test(docText) && /ถนนสุขุมวิท/.test(docText) && /anan@example.com/.test(docText), 'contract shows the translator\'s own details');
  ok(await overflow(p) === 0, '390 contract: no horizontal scroll');
  await p.screenshot({ path: out + '/contract-390-dark.png' });
  await field(p, 'พิมพ์ชื่อ').locator('input').fill('อนันต์ แปลดี');
  await p.click('#dash-view button:has-text("ยอมรับและเริ่มรับงาน")');
  await p.waitForSelector('#dash-view .form-status.error');
  ok(/ติ๊กยอมรับ/.test(await p.textContent('#dash-view .form-status.error')), 'must tick to accept');
  await p.check('#dash-view .dash-card > label.choice input');
  await p.click('#dash-view button:has-text("ยอมรับและเริ่มรับงาน")');
  await p.waitForSelector('#dash-view button:has-text("ขอรับงาน")');
  ok(g.mail.some(m => /สัญญาผู้แปล/.test(m.subject) && m.to === 'anan@example.com'), 'accepted: PDF emailed');
  await p.screenshot({ path: out + '/open-list-390-dark.png', fullPage: true });
  await p.click('#dash-view button:has-text("ขอรับงาน")');
  await p.waitForSelector('#dash-view .notice-soft');
  ok(/ยังไม่ชำระเงิน/.test(await p.textContent('#dash-view')), 'claimed: files locked until payment');
  ok(!p.errs.length, 'translator: no console errors ' + p.errs.join(' | '));
  await ctx.close();

  // ---- 4. paid → files, confirm tick, ready
  P({ action: 'adminUpdateJob', token: admin, jobNo, status: 'paid' });
  P({ action: 'uploadTranslation', token: cand, jobNo, name: 'a-EN.pdf', data: 'WFla' });
  ({ ctx, p } = await open(1366, 900, 'light', cand));
  await p.locator('#dash-view .job-item-btn', { hasText: jobNo }).first().click();
  await p.waitForSelector('#dash-view label.choice:has-text("ยืนยันว่าได้แปล")');
  ok(/a\.pdf/.test(await p.textContent('#dash-view')), 'after payment: source file listed');
  await p.click('#dash-view button:has-text("แปลเสร็จ ส่งตรวจ")');
  await p.waitForSelector('#dash-view .form-status.error');
  ok(/ติ๊กยืนยัน/.test(await p.textContent('#dash-view .form-status.error')), 'ready blocked without the tick');
  await p.check('#dash-view label.choice:has-text("ยืนยันว่าได้แปล") input');
  await p.click('#dash-view button:has-text("แปลเสร็จ ส่งตรวจ")');
  await p.waitForSelector('#dash-view .notice:has-text("ส่งตรวจแล้ว")');
  ok(true, 'ready with the confirmation tick');
  await p.screenshot({ path: out + '/job-1366.png', fullPage: true });
  for (const [menu, sel, name] of [['ค่าตอบแทน', '#dash-view .dash-card', 'earnings'], ['คำศัพท์', '#dash-view .doc-table', 'glossary'], ['คู่มือผู้แปล', '#dash-view .doc-sec', 'manual'], ['ข้อมูลผู้แปล', '#dash-view .dash-stats', 'profile']]) {
    await nav(p, menu); await p.waitForSelector(sel);
    ok(await overflow(p) === 0, name + ' page shows, no horizontal scroll');
    await p.screenshot({ path: out + '/' + name + '-1366.png', fullPage: true });
  }
  await nav(p, 'คำศัพท์'); await p.waitForSelector('#dash-view .dict-links a');
  await p.fill('#dash-view .dict-links >> xpath=.. >> input[type=search]', 'birth certificate');
  const hrefs = await p.$$eval('#dash-view .dict-links a', a => a.map(x => x.href + '|' + x.target));
  ok(/cambridge\.org\/search\/direct\/\?datasetsearch=english-thai&q=birth%20certificate\|_blank/.test(hrefs[0]) && /datasetsearch=english&q=birth/.test(hrefs[1]) && /dictionary\.orst\.go\.th\/\|_blank/.test(hrefs[2]), 'dictionary links: Cambridge EN–TH / EN with the word, Royal Society site, new tab');
  await p.fill('#dash-view .dict-links >> xpath=.. >> input[type=search]', '');
  await p.click('#dash-view .dict-links a >> nth=0');
  ok(/พิมพ์คำก่อน/.test(await p.textContent('#dash-view .dict-links + .hint')), 'empty word: asked to type first, nothing opens');
  await p.fill('#dash-view .dict-links >> xpath=.. >> input[type=search]', 'certificate');
  await p.screenshot({ path: out + '/glossary-dict-1366.png', fullPage: true });
  ok(!p.errs.length, 'translator pages: no console errors ' + p.errs.join(' | '));
  await ctx.close();

  // ---- 5. admin approves the work on the job page (English); payouts + glossary pages
  ({ ctx, p } = await open(1366, 900, 'light', admin, '?job=' + jobNo + '#account', 'en'));
  await p.waitForSelector('#dash-view button:has-text("Approve — send to customer")');
  await p.screenshot({ path: out + '/admin-job-en-1366.png', fullPage: true });
  await p.click('#dash-view button:has-text("Approve — send to customer")');
  await p.waitForFunction(() => !document.querySelector('#dash-view button') || !/Approve — send/.test(document.querySelector('#dash-view').textContent));
  ok(P({ action: 'adminJob', token: admin, jobNo }).job.status === 'review', 'admin approves from the job page → customer check');
  await nav(p, 'Translator pay'); await p.waitForSelector('#dash-view select');
  await nav(p, 'Suggested terms'); await p.waitForSelector('#dash-view .dash-card');
  ok(!p.errs.length, 'admin pages (EN): no console errors ' + p.errs.join(' | '));
  await ctx.close();
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });

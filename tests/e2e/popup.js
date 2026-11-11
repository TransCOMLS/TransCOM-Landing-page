const { chromium } = require('../lib/browser');
const { load } = require('../lib/mock');
const out = require('../lib/paths').out(__filename);
const g = load(require('../lib/paths').CODE_GS); g.ctx.setup();
const P = g.post, URL = 'https://script.google.com/macros/s/TEST/exec';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const signIn = e => { P({ action: 'requestCode', email: e }); return P({ action: 'verifyCode', email: e, code: g.lastCode() }).token; };
const admin = signIn('owner@example.com');
g.props.BEAM_MERCHANT_ID_TEST = 'm'; g.props.BEAM_API_KEY_TEST = 'k';
const mk = () => { const c = P({ action: 'createJob', job: { name: 'นิดา', email: 'nida@example.com', langPair: 'th-en', category: 'other', pages: 1, neededBy: '2099-01-01', consent: true, files: [{ name: 'a.pdf', size: 3 }], idFiles: [] } });
  P({ action: 'uploadFile', jobNo: c.jobNo, uploadToken: c.uploadToken, kind: 'doc', name: 'a.pdf', data: 'QUJD' }); P({ action: 'finishJob', jobNo: c.jobNo, uploadToken: c.uploadToken }); return c.jobNo; };
const j1 = mk();
P({ action: 'adminSaveQuote', token: admin, jobNo: j1, items: [{ text: 'Test', amount: 100 }] });
const t1 = /[?&]t=([0-9a-f]{32})/.exec(g.mail.filter(m => m.to === 'nida@example.com').pop().htmlBody.replace(/&amp;/g, '&'))[1];
let delay = 0;
(async () => {
  const b = await chromium.launch();
  async function open(path, tok, w) {
    const ctx = await b.newContext({ viewport: { width: w || 1366, height: 900 }, colorScheme: 'dark' });
    await ctx.addInitScript(tk => { try { localStorage.setItem('tr_lang', 'th'); if (tk) localStorage.setItem('tr_session', tk); } catch (e) {} }, tok || '');
    await ctx.route('https://script.google.com/macros/s/AKfy**', r => r.abort());
    await ctx.route('https://api.beamcheckout.com/**', r => r.abort());
    await ctx.route('https://playground-pay.beamcheckout.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Beam</h1>' }));
    await ctx.route('**/js/config.js*', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/appsScriptUrl: "[^"]*"/, `appsScriptUrl: "${URL}"`) }); });
    await ctx.route(URL, async r => { const body = JSON.stringify(P(JSON.parse(r.request().postData()))); if (delay) await new Promise(x => setTimeout(x, delay)); r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body }); });
    const p = await ctx.newPage(); p.errs = [];
    p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && p.errs.push(m.text()));
    await p.goto('http://localhost:8765/' + path);
    return { ctx, p };
  }
  // 1) verify page: a job number → hint + button to Track
  let { ctx, p } = await open('#verify');
  await p.fill('#v-code', j1); await p.click('#verify-form button[type=submit]');
  await p.waitForSelector('#verify-status:not([hidden]) button');
  ok((await p.textContent('#verify-status')).includes('คือเลขที่งาน'), 'verify: job number explained');
  await p.screenshot({ path: out + '/verify-jobno.png' });
  await p.click('#verify-status button');
  ok(await p.isVisible('#track') && (await p.inputValue('#t-jobNo')) === j1, 'button opens Track with the job number filled in');
  // 2) track tolerant input
  await p.fill('#t-jobNo', j1.toLowerCase().replace(/-/g, ' ')); await p.fill('#t-email', 'nida@example.com');
  await p.click('#track-form button[type=submit]');
  await p.waitForSelector('#track-card:not([hidden])');
  ok((await p.inputValue('#t-jobNo')) === j1, 'track: "' + j1.toLowerCase().replace(/-/g, ' ') + '" accepted → ' + j1);
  await ctx.close();
  // 3) pay: going to Beam
  ({ ctx, p } = await open(`?pay=${j1}&t=${t1}`));
  await p.waitForSelector('#pay-go');
  delay = 800;
  await p.click('#pay-go');
  await p.waitForSelector('#busy-dialog[open]');
  ok((await p.textContent('#busy-title')).includes('กำลังไปหน้าชำระเงิน'), 'pay: "opening the payment page" pop-up');
  await p.screenshot({ path: out + '/busy-go.png' });
  await p.waitForURL(/playground-pay/);
  delay = 0;
  // failed attempt → ✗ with reason
  const lid = Object.keys(g.beam.links).pop();
  g.beam.charges.push({ chargeId: 'ch_f', status: 'FAILED', failureCode: 'CH_INSUFFICIENT_FUNDS', sourceId: lid, createdAt: new Date().toISOString(), amount: 10000 });
  await p.goto(`http://localhost:8765/?pay=${j1}&t=${t1}&back=1`);
  await p.waitForSelector('#busy-dialog.is-failed');
  ok((await p.textContent('#busy-title')).includes('ชำระเงินไม่สำเร็จ') && (await p.textContent('#busy-text')).includes('ยอดเงินในบัญชีหรือบัตรไม่พอ'), 'failed attempt → ✗ + short reason');
  await p.screenshot({ path: out + '/busy-fail.png' });
  await p.click('#busy-ok');
  ok(!(await p.isVisible('#busy-dialog')), 'OK closes it');
  // paid → tick
  g.beam.pay(lid, 'QR_PROMPT_PAY');
  await p.goto(`http://localhost:8765/?pay=${j1}&t=${t1}&back=1`);
  await p.waitForSelector('#busy-dialog.is-done');
  ok((await p.textContent('#busy-text')).includes('RC-'), 'paid → ✓ with receipt number');
  await p.screenshot({ path: out + '/busy-done.png' });
  ok(!p.errs.length, 'no console errors ' + p.errs.join(' | '));
  await ctx.close();
  // 4) dashboard slow load
  ({ ctx, p } = await open('#account', admin));
  await p.waitForSelector('#dash-nav');
  delay = 1500;
  await p.locator('#dash-nav .dash-link', { hasText: 'การชำระเงิน' }).click();
  await p.waitForSelector('#busy-dialog[open]');
  ok((await p.textContent('#busy-title')).includes('กำลังโหลด'), 'slow dashboard view → loading pop-up');
  await p.screenshot({ path: out + '/busy-loading.png' });
  await p.waitForSelector('#busy-dialog', { state: 'hidden' });
  ok(await p.isVisible('#dash-view .pay-list, #dash-view .job-empty'), 'pop-up closes when the view has loaded');
  delay = 0;
  await p.locator('#dash-nav .dash-link', { hasText: 'ภาพรวม' }).click();
  await p.waitForTimeout(400);
  ok(!(await p.isVisible('#busy-dialog')), 'fast view → no pop-up');
  ok(!p.errs.length, 'no console errors ' + p.errs.join(' | '));
  await ctx.close(); await b.close();
})().catch(e => { console.error(e); process.exit(1); });

const { chromium } = require('../lib/browser');
const { load } = require('../lib/mock');
const g = load(require('../lib/paths').CODE_GS); g.ctx.setup();
const P = g.post, URL = 'https://script.google.com/macros/s/TEST/exec';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
P({ action: 'requestCode', email: 'owner@example.com' }); const admin = P({ action: 'verifyCode', email: 'owner@example.com', code: g.lastCode() }).token;
g.props.BEAM_MERCHANT_ID_TEST = 'm'; g.props.BEAM_API_KEY_TEST = 'k';
g.props.RECEIPT_ADDRESS = 'เลขที่ 1 หมู่ที่ 1 ตำบลตัวอย่าง'; g.props.RECEIPT_ADDRESS_EN = '1 Moo 1, Example Subdistrict';
const c = P({ action: 'createJob', job: { name: 'A', email: 'a@example.com', langPair: 'th-en', category: 'other', pages: 1, neededBy: '2099-01-01', consent: true, files: [{ name: 'a.pdf', size: 3 }], idFiles: [] } });
P({ action: 'uploadFile', jobNo: c.jobNo, uploadToken: c.uploadToken, kind: 'doc', name: 'a.pdf', data: 'QUJD' }); P({ action: 'finishJob', jobNo: c.jobNo, uploadToken: c.uploadToken });
P({ action: 'adminSaveQuote', token: admin, jobNo: c.jobNo, items: [{ text: 'x', amount: 100 }] });
const m = g.mail.filter(x => x.to === 'a@example.com').pop().htmlBody.replace(/&amp;/g, '&'); const t = /[?&]t=([0-9a-f]{32})/.exec(m)[1];
P({ action: 'payStart', jobNo: c.jobNo, t }); g.beam.pay(Object.keys(g.beam.links).pop()); g.ctx.checkPayments();
const rm = g.mail.filter(x => x.to === 'a@example.com').pop().htmlBody.replace(/&amp;/g, '&');
const link = /href="https:\/\/www\.prathaitranslation\.com\/(\?receipt=[^"]+)"/.exec(rm)[1];
(async () => {
  const b = await chromium.launch();
  for (const lang of ['th', 'en']) {
    const ctx = await b.newContext(); await ctx.addInitScript(l => localStorage.setItem('tr_lang', l), lang);
    await ctx.route('**/js/config.js*', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/appsScriptUrl: "[^"]*"/, `appsScriptUrl: "${URL}"`) }); });
    await ctx.route(URL, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(P(JSON.parse(r.request().postData()))) }));
    const p = await ctx.newPage(); await p.goto('http://localhost:8765/' + link); await p.waitForSelector('.receipt');
    const txt = await p.textContent('.receipt-seller');
    ok(lang === 'en' ? txt.includes('1 Moo 1') && !txt.includes('ตำบล') : txt.includes('ตำบลตัวอย่าง'), lang + ' receipt address');
    await ctx.close();
  }
  await b.close();
})();

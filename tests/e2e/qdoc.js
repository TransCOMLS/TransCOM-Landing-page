const { chromium } = require('../lib/browser');
const { load } = require('../lib/mock');
const out = require('../lib/paths').out(__filename);
const g = load(require('../lib/paths').CODE_GS); g.ctx.setup();
const P = g.post, URL = 'https://script.google.com/macros/s/TEST/exec';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
P({ action: 'requestCode', email: 'owner@example.com' }); const admin = P({ action: 'verifyCode', email: 'owner@example.com', code: g.lastCode() }).token;
Object.assign(g.props, { BEAM_MERCHANT_ID_TEST: 'm', BEAM_API_KEY_TEST: 'k', RECEIPT_TAX_ID: '1234567890123',
  RECEIPT_ADDRESS: 'เลขที่ 1 หมู่ที่ 1 ตำบลตัวอย่าง อำเภอตัวอย่าง จังหวัดตัวอย่าง 10000', RECEIPT_ADDRESS_EN: '1 Moo 1, Example Subdistrict, Example 10000' });
const c = P({ action: 'createJob', job: { name: 'บริษัท ตัวอย่าง จำกัด', email: 'hr@company.example', langPair: 'th-en', category: 'business', pages: 12, neededBy: '2099-01-01', consent: true, files: [{ name: 'a.pdf', size: 3 }], idFiles: [] } });
P({ action: 'uploadFile', jobNo: c.jobNo, uploadToken: c.uploadToken, kind: 'doc', name: 'a.pdf', data: 'QUJD' }); P({ action: 'finishJob', jobNo: c.jobNo, uploadToken: c.uploadToken });
P({ action: 'adminSaveQuote', token: admin, jobNo: c.jobNo, items: [{ text: 'แปลเอกสารธุรกิจ 12 หน้า', amount: 4200 }, { text: 'ค่ารับรองคำแปล', amount: 300 }], discountPercent: 5, discountName: 'ลูกค้าองค์กร', note: 'ส่งงานภายใน 5 วันทำการหลังชำระเงิน' });
const mail = g.mail.filter(m => m.to === 'hr@company.example').pop().htmlBody.replace(/&amp;/g, '&');
const docLink = /href="https:\/\/www\.prathaitranslation\.com\/(\?pay=[^"]+&doc=quote)"/.exec(mail);
ok(!!docLink, 'quote email has a "document / PDF" link');
(async () => {
  const b = await chromium.launch();
  for (const [w, scheme, lang] of [[1366, 'light', 'th'], [390, 'dark', 'th'], [1366, 'light', 'en']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme });
    await ctx.addInitScript(l => { try { localStorage.setItem('tr_lang', l); } catch (e) {} }, lang);
    await ctx.route('https://script.google.com/macros/s/AKfy**', r => r.abort());
    await ctx.route('**/js/config.js*', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/appsScriptUrl: "[^"]*"/, `appsScriptUrl: "${URL}"`) }); });
    await ctx.route(URL, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(P(JSON.parse(r.request().postData()))) }));
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => m.type() === 'error' && p.errs.push(m.text()));
    await p.goto('http://localhost:8765/' + docLink[1]);
    await p.waitForSelector('.quotation .qd-qr canvas');
    const txt = await p.textContent('.quotation');
    const tag = w + scheme + lang;
    ok(lang === 'th' ? txt.includes('ใบเสนอราคา') && txt.includes('1234567890123') && txt.includes('สี่พันสองร้อยเจ็ดสิบห้าบาทถ้วน') && txt.includes('ยืนราคาถึง') && txt.includes('บริษัท ตัวอย่าง จำกัด')
                     : txt.includes('Quotation') && txt.includes('1 Moo 1') && txt.includes('Valid until'), tag + ' quotation: seller, tax ID, buyer, total (4,275), validity');
    ok(/QT-\d{4}-[0-9A-Z]+-1/.test(txt), tag + ' quotation number');
    ok(await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0, tag + ' no horizontal scroll');
    await p.screenshot({ path: `${out}/quotation-${tag}.png`, fullPage: true });
    if (w === 1366 && lang === 'th') {
      await p.emulateMedia({ media: 'print' });
      ok(await p.isHidden('.site-header') && await p.isHidden('.receipt-actions'), 'print shows only the quotation');
      await p.screenshot({ path: `${out}/quotation-print.png`, fullPage: true });
      await p.pdf({ path: `${out}/quotation.pdf`, format: 'A4', printBackground: true });
      await p.emulateMedia({ media: 'screen' });
      await p.click('.receipt-actions .btn-outline');
      await p.waitForSelector('#pay-go');
      ok(await p.isVisible('#pay-view') && !/doc=quote/.test(p.url()), 'back to the pay page');
      await p.click('text=ใบเสนอราคา (พิมพ์ / PDF)');
      await p.waitForSelector('.quotation');
      ok(/doc=quote/.test(p.url()), 'button on the pay page opens it again');
    }
    ok(!p.errs.length, tag + ' no console errors ' + p.errs.join(' | '));
    await ctx.close();
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });

// Phase 6 in the browser: admin quote → customer pays (fake Beam) → receipt → points, rewards, admin payments
const { chromium } = require('../lib/browser');
const { load } = require('../lib/mock');
const out = require('../lib/paths').out(__filename);
const g = load(require('../lib/paths').CODE_GS);
g.ctx.setup();
const URL = 'https://script.google.com/macros/s/TEST/exec';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const P = g.post;
const signIn = (email, name) => { P({ action: 'requestCode', email }); const tk = P({ action: 'verifyCode', email, code: g.lastCode() }).token; if (name) P({ action: 'updateProfile', token: tk, profile: { name } }); return tk; };
const admin = signIn('owner@example.com', 'เจ้าของ ร้าน');
const cust = signIn('nida@example.com', 'นิดา ใจดี');
g.props.BEAM_MERCHANT_ID_TEST = 'm'; g.props.BEAM_API_KEY_TEST = 'k';
g.props.RECEIPT_TAX_ID = '1234567890123'; g.props.RECEIPT_ADDRESS = 'เลขที่ 1 หมู่ที่ 1 ตำบลตัวอย่าง อำเภอตัวอย่าง จังหวัดตัวอย่าง 10000';
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const mk = (cat, pages) => {
  const c = P({ action: 'createJob', lang: 'th', job: { name: 'นิดา ใจดี', email: 'nida@example.com', phone: '0812345678', langPair: 'th-en', category: cat, pages, neededBy: day(7), consent: true, certified: true, files: [{ name: 'a.pdf', size: 3 }], idFiles: [] } });
  P({ action: 'uploadFile', jobNo: c.jobNo, uploadToken: c.uploadToken, kind: 'doc', name: 'a.pdf', data: 'QUJD' });
  P({ action: 'finishJob', jobNo: c.jobNo, uploadToken: c.uploadToken });
  return c.jobNo;
};
const j1 = mk('official', 3), j0 = mk('business', 40);
// an earlier paid job → 45 points; plus one reward
P({ action: 'adminSaveQuote', token: admin, jobNo: j0, items: [{ text: 'แปลสัญญา 40 หน้า', amount: 4500 }] });
P({ action: 'payStart', jobNo: j0, t: P({ action: 'myJob', token: cust, jobNo: j0 }).job.payToken });
g.beam.pay(Object.keys(g.beam.links).pop(), 'CARD'); g.ctx.checkPayments();
P({ action: 'adminSaveReward', token: admin, reward: { nameTh: 'แก้วน้ำเก็บความเย็น TransCOM', nameEn: 'TransCOM tumbler', points: 30, stock: 10 } });
P({ action: 'adminSaveReward', token: admin, reward: { nameTh: 'ส่วนลดค่าส่งไปรษณีย์ฟรี 1 ครั้ง', nameEn: 'One free postage', points: 80 } });
P({ action: 'adminSaveCoupon', token: admin, isNew: true, coupon: { code: 'WELCOME5', kind: 'percent', value: 5, perUser: 1, stackable: true } });
const tokens = { customer: cust, admin, guest: '' };

(async () => {
  const b = await chromium.launch();
  async function open(role, w, h, scheme, path, lang) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
    await ctx.addInitScript(([tk, l]) => { try { if (tk) localStorage.setItem('tr_session', tk); localStorage.setItem('tr_lang', l); } catch (e) {} }, [tokens[role], lang || 'th']);
    await ctx.route('https://script.google.com/macros/s/AKfy**', r => r.abort());
    await ctx.route('https://playground-pay.beamcheckout.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Beam checkout (fake)</h1>' }));
    await ctx.route('**/js/config.js*', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/appsScriptUrl: "[^"]*"/, `appsScriptUrl: "${URL}"`) }); });
    await ctx.route(URL, async r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(P(JSON.parse(r.request().postData()))) }));
    const p = await ctx.newPage(); p.errs = [];
    p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && p.errs.push(m.text()));
    p.on('dialog', d => d.accept(d.type() === 'prompt' ? 'ส่งที่บ้าน' : undefined));
    await p.goto('http://localhost:8765/' + path);
    return { ctx, p };
  }
  const overflow = p => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const nav = (p, text) => p.locator('#dash-nav .dash-link', { hasText: text }).first().click();

  // 1) admin makes the quote
  let { ctx, p } = await open('admin', 1366, 900, 'light', '#account');
  await p.waitForSelector('#dash-nav');
  await p.evaluate(() => {});
  await nav(p, 'งานทั้งหมด');
  await p.locator('.job-item-btn', { hasText: j1 }).click();
  await p.waitForSelector('.quote-form');
  const items = await p.$$eval('.quote-item input', i => i.map(x => x.value));
  ok(items.length === 4 && /ค่าแปล/.test(items[0]) && items[1] !== '' && /รับรอง/.test(items[2]), 'quote form pre-filled from the price list: ' + items.join(' | '));
  ok(/ระบบแนะนำ|ยังไม่มีส่วนลด/.test(await p.textContent('.quote-form')), 'shows the suggested discount line');
  await p.locator('.quote-item input[type=number]').first().fill('1500');
  ok((await p.textContent('.quote-sum')).includes('1,800.00'), 'live total: 1,500 + 300 = 1,800');
  const qf = p.locator('.quote-form', { has: p.locator('.quote-item') });
  await qf.locator('textarea').fill('ส่งงานภายใน 3 วันทำการหลังชำระเงิน');
  await p.screenshot({ path: out + '/a-quote-form-1366.png', fullPage: true });
  await qf.locator('.btn-primary').click();
  await p.waitForSelector('.pay-list .pay-item');
  ok((await p.textContent('#dash-view')).includes('ใบเสนอราคาฉบับที่ 1') && (await p.textContent('.job-top .status-chip')).includes('ส่งใบเสนอราคาแล้ว'), 'quote sent → job "quote sent"');
  await p.screenshot({ path: out + '/a-quote-sent-1366.png', fullPage: true });
  ok(!p.errs.length, 'admin: no console errors ' + p.errs.join(' | '));
  await ctx.close();
  const mail = g.mail.filter(m => m.to === 'nida@example.com').pop();
  const link = /href="([^"]*\?pay=[^"]+)"/.exec(mail.htmlBody)[1].replace(/&amp;/g, '&').replace('https://www.prathaitranslation.com/', '');

  // 2) guest browser: open the link from the email
  for (const [w, h, scheme, lang] of [[1366, 900, 'light', 'th'], [390, 844, 'dark', 'th'], [320, 700, 'light', 'en']]) {
    ({ ctx, p } = await open('guest', w, h, scheme, link, lang));
    await p.waitForSelector('#pay-view .quote-table');
    ok(await p.isVisible('#pay') && /1,800\.00|THB 1,800\.00/.test(await p.textContent('#pay-view')), w + ' pay page shows the quote total');
    ok(await overflow(p) <= 0, w + ' no horizontal scroll');
    await p.screenshot({ path: out + `/pay-${w}${scheme}.png`, fullPage: true });
    ok(!p.errs.length, w + ' no console errors ' + p.errs.join(' | '));
    await ctx.close();
  }
  ({ ctx, p } = await open('guest', 1366, 900, 'light', link));
  await p.waitForSelector('#pay-coupon');
  ok((await p.textContent('.pay-test')).includes('โหมดทดสอบ'), 'test-mode notice');
  await p.fill('#pay-coupon', 'nope'); await p.click('.coupon-row .btn');
  await p.waitForSelector('#pay-coupon-err:not([hidden])');
  ok((await p.textContent('#pay-coupon-err')).includes('ไม่ถูกต้อง'), 'bad code explained');
  await p.fill('#pay-coupon', 'welcome5'); await p.click('.coupon-row .btn');
  await p.waitForSelector('tfoot .disc');
  ok((await p.textContent('#pay-go')).includes('1,710.00'), 'code applied: 1,800 − 5% = 1,710 on the Pay button');
  await p.screenshot({ path: out + '/pay-coupon-1366.png', fullPage: true });
  await Promise.all([p.waitForURL(/playground-pay\.beamcheckout\.com/), p.click('#pay-go')]);
  ok(true, 'Pay → sent to Beam checkout');
  const lid = Object.keys(g.beam.links).pop();
  ok(g.beam.links[lid].order.netAmount === 171000, 'Beam link for 171000 satang');
  // customer pays on Beam; Beam sends them back
  g.beam.pay(lid, 'QR_PROMPT_PAY');
  await p.goto('http://localhost:8765/' + link + '&back=1');
  await p.waitForSelector('.pay-done');
  ok((await p.textContent('.pay-done')).includes('ชำระเงินสำเร็จ') && (await p.textContent('.pay-done')).includes('RC-'), 'back from Beam → paid, receipt number shown');
  await p.screenshot({ path: out + '/pay-paid-1366.png', fullPage: true });
  await p.click('.pay-receipt-row .btn');
  await p.waitForSelector('.receipt');
  const rtext = await p.textContent('.receipt');
  ok(rtext.includes('1234567890123') && rtext.includes('TransCOM Language Service') && rtext.includes('หนึ่งพันเจ็ดร้อยสิบบาทถ้วน') && rtext.includes('ไม่ใช่ใบกำกับภาษี'), 'receipt: tax ID, seller, amount in Thai words, not-a-tax-invoice note');
  ok(/\?receipt=TEST-RC-/.test(p.url()), 'receipt has its own link (reload works)');
  await p.screenshot({ path: out + '/receipt-1366.png', fullPage: true });
  await p.emulateMedia({ media: 'print' });
  await p.screenshot({ path: out + '/receipt-print.png', fullPage: true });
  ok(await p.isHidden('.site-header') && await p.isHidden('.receipt-actions'), 'print: only the receipt');
  await p.emulateMedia({ media: 'screen' });
  await p.pdf({ path: out + '/receipt.pdf', format: 'A4' }).catch(() => {});
  ok(!p.errs.length, 'guest: no console errors ' + p.errs.join(' | '));
  await ctx.close();
  // cancelled link
  ({ ctx, p } = await open('guest', 390, 844, 'light', link + '&cancelled=1'));
  await p.waitForSelector('.pay-done');
  ok(true, 'after paying, an old cancel link still shows paid');
  await ctx.close();

  // 3) customer dashboard: payments, points, rewards
  for (const [w, h, scheme] of [[1366, 900, 'light'], [390, 844, 'dark']]) {
    ({ ctx, p } = await open('customer', w, h, scheme, '#account'));
    await p.waitForSelector('#dash-nav');
    await nav(p, 'ภาพรวม');
    await p.waitForSelector('.mem-card');
    // 1366 redeems a 30-point gift below, so the 390 round sees the balance after it
    const pts = w === 1366 ? '62' : '32';
    ok((await p.textContent('.mem-card')).includes(pts), w + ' overview: membership card with ' + pts + ' points' + (w === 1366 ? ' (45 + 17)' : ' (62 − 30 redeemed)'));
    await p.screenshot({ path: out + `/c-overview-${w}${scheme}.png`, fullPage: true });
    await nav(p, 'ประวัติการชำระ');
    await p.waitForSelector('.pay-list');
    ok((await p.$$('.pay-list .pay-item')).length === 2, w + ' payment history: 2 payments');
    await p.screenshot({ path: out + `/c-history-${w}${scheme}.png`, fullPage: true });
    await nav(p, 'แต้มและสิทธิสมาชิก');
    await p.waitForSelector('.mem-table');
    ok((await p.textContent('.mem-card')).includes('Bronze'), w + ' points page: Bronze (62 ≥ 50)');
    if (w === 1366) {
      await p.locator('.mem-reward', { hasText: 'แก้วน้ำ' }).locator('button').click();
      await p.waitForSelector('.mem-card + .dash-card, .pay-list');
      await p.waitForTimeout(300);
      ok((await p.textContent('.mem-points-n')) === '32', 'redeem 30 → 32 left');
    }
    ok(await overflow(p) <= 0, w + ' no horizontal scroll');
    await p.screenshot({ path: out + `/c-points-${w}${scheme}.png`, fullPage: true });
    await nav(p, 'ดูใบเสนอราคา');
    await p.waitForSelector('#dash-view .job-list, #dash-view .job-empty');
    await p.screenshot({ path: out + `/c-quotes-${w}${scheme}.png`, fullPage: true });
    ok(!p.errs.length, w + ' customer: no console errors ' + p.errs.join(' | '));
    await ctx.close();
  }

  // 4) admin: payments + rewards + overview
  ({ ctx, p } = await open('admin', 1366, 900, 'light', '#account'));
  await p.waitForSelector('#dash-nav');
  await p.waitForSelector('.dash-stat-money');
  await p.screenshot({ path: out + '/a-overview-money-1366.png', fullPage: true });
  await nav(p, 'การชำระเงิน');
  await p.waitForSelector('.pay-list');
  ok((await p.$$('#dash-view .pay-item')).length === 2 && (await p.inputValue('input.mono')).includes('?hook='), 'admin payments: 2 test payments + webhook URL');
  // refund the PromptPay one (full only)
  await p.locator('.pay-item', { hasText: 'QR พร้อมเพย์' }).locator('text=คืนเงิน').click();
  ok(await p.locator('.refund-form input[type=number]').evaluate(i => i.readOnly), 'PromptPay refund amount is fixed (full only)');
  await p.screenshot({ path: out + '/a-payments-1366.png', fullPage: true });
  await p.locator('.refund-form .btn-danger').click();
  await p.waitForSelector('.flag-warn:has-text("กำลังคืนเงิน")');
  ok(true, 'refund sent → "refund in progress"');
  await nav(p, 'ของสมนาคุณ');
  await p.waitForSelector('text=คำขอแลกของสมนาคุณ');
  await p.locator('.pay-item', { hasText: 'RW-' }).locator('button', { hasText: 'ส่งแล้ว' }).click();
  await p.waitForSelector('.flag-ok:has-text("ส่งแล้ว")');
  ok(true, 'admin marks the reward sent');
  await p.screenshot({ path: out + '/a-rewards-1366.png', fullPage: true });
  ok(!p.errs.length, 'admin: no console errors ' + p.errs.join(' | '));
  await ctx.close();
  await b.close();
})().catch(e => { console.error(e); process.exitCode = 1; process.exit(1); });

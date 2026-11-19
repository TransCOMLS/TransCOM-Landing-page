// Phase 8 in the browser: accountant (records) and auditor (reads) dashboards — overview, ledger + entry form + evidence,
// reports, receipt register, withholding tax list + printable 50 ทวิ (two copies), yearly summary, categories, change log, CSV
const { chromium } = require('../lib/browser');
const { load } = require('../lib/mock');
const OUT = require('../lib/paths').out(__filename), out = f => require('path').join(OUT, f);
const g = load(require('../lib/paths').CODE_GS);
const C = g.ctx;
C.setup();
const URL = 'https://script.google.com/macros/s/TEST/exec';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const P = g.post;
const signIn = email => { P({ action: 'requestCode', email }); return P({ action: 'verifyCode', email, code: g.lastCode() }).token; };
const admin = signIn('owner@example.com'), acc = signIn('acc@example.com'), aud = signIn('audit@example.com');
P({ action: 'adminSetUser', token: admin, email: 'acc@example.com', role: 'accountant' });
P({ action: 'adminSetUser', token: admin, email: 'audit@example.com', role: 'auditor' });
P({ action: 'updateProfile', token: acc, profile: { name: 'สมใจ บัญชี' } });
P({ action: 'updateProfile', token: aud, profile: { name: 'สำนักงานบัญชี' } });
// a live payment
g.props.BEAM_MODE = 'live'; g.props.BEAM_MERCHANT_ID = 'm'; g.props.BEAM_API_KEY = 'k'; g.props.RECEIPT_TAX_ID = '1100500000001'; g.props.RECEIPT_ADDRESS = '1 ถนนทดสอบ กรุงเทพฯ';
const r = P({ action: 'createJob', job: { name: 'คุณลูกค้า', email: 'cust@example.com', langPair: 'th-en', category: 'official', pages: 2, neededBy: '2099-01-01', consent: true, files: [{ name: 'a.pdf', size: 3 }], idFiles: [] } });
P({ action: 'uploadFile', jobNo: r.jobNo, uploadToken: r.uploadToken, kind: 'doc', name: 'a.pdf', data: 'QUJD' });
P({ action: 'finishJob', jobNo: r.jobNo, uploadToken: r.uploadToken });
P({ action: 'adminSaveQuote', token: admin, jobNo: r.jobNo, items: [{ text: 'ค่าแปล', amount: 1200 }] });
const tk = /[?&]t=([0-9a-f]{32})/.exec(g.mail.filter(m => m.to === 'cust@example.com').pop().htmlBody.replace(/&amp;/g, '&'))[1];
P({ action: 'payStart', jobNo: r.jobNo, t: tk });
g.beam.pay(Object.keys(g.beam.links).pop(), 'QR_PROMPT_PAY');
P({ action: 'payCheck', jobNo: r.jobNo, t: tk }); C.checkPayments();
// a translator paid last month with tax withheld
const last = C.recentMonths_(2, 'Asia/Bangkok')[1];
C.appendRow_(C.table_('Translators', C.TRANSLATOR_COLS), { email: 'tr@example.com', status: 'อนุมัติ', name: 'ผู้แปล ทดสอบ', idNumber: "'1101700000001", address: '99 ถนนทดสอบ' });
C.appendRow_(C.table_('Payouts', C.PAYOUT_COLS), { month: last, email: 'tr@example.com', name: 'ผู้แปล ทดสอบ', jobs: 'x', gross: 3220, wht: 96.6, net: 3123.4, paidAt: new Date(last + '-20T10:00:00+07:00') });

(async () => {
  const b = await chromium.launch();
  async function open(w, h, scheme, token) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, acceptDownloads: true });
    await ctx.addInitScript(tk2 => { try { localStorage.setItem('tr_session', tk2); localStorage.setItem('tr_lang', 'th'); } catch (e) {} }, token);
    await ctx.route('**/js/config.js*', async rt => { const res = await rt.fetch(); rt.fulfill({ response: res, body: (await res.text()).replace(/appsScriptUrl: "[^"]*"/, `appsScriptUrl: "${URL}"`) }); });
    await ctx.route(URL, async rt => rt.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(P(JSON.parse(rt.request().postData()))) }));
    const p = await ctx.newPage(); p.errs = [];
    p.on('pageerror', e => p.errs.push(e.message));
    p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && p.errs.push(m.text()));
    await p.goto('http://localhost:8765/#account');
    await p.waitForSelector('#dash-nav .dash-link');
    return { ctx, p };
  }
  const overflow = p => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const nav = (p, text) => p.locator('#dash-nav .dash-link', { hasText: text }).first().click();
  const field = (p, label) => p.locator('#dash-view .acc-form .field', { has: p.locator('label', { hasText: label }) }).first();

  // ---- accountant, PC
  let { ctx, p } = await open(1366, 900, 'light', acc);
  await p.waitForSelector('#dash-view .acc-todo, #dash-view .dash-stats');
  const menu = await p.textContent('#dash-nav');
  ok(['ภาพรวมบัญชี', 'สมุดรายรับรายจ่าย', 'รายงานการเงิน', 'ทะเบียนใบเสร็จ', 'ภาษีหัก ณ ที่จ่าย', 'สรุปภาษีเงินได้ประจำปี', 'หมวดบัญชี', 'บันทึกการแก้ไข', 'การชำระเงิน', 'จ่ายค่าตอบแทน'].every(x => menu.includes(x)), 'accountant menu: accounting pages + payments + translator pay');
  ok(!/งานทั้งหมด|ผู้ใช้และบทบาท|สมัครเป็นผู้แปล/.test(menu), 'no jobs, users or translator pages');
  ok((await p.textContent('#dash-role')) === 'ฝ่ายบัญชี', 'role shown: ฝ่ายบัญชี');
  await p.waitForSelector('#dash-view .acc-meter');
  const ovText = await p.textContent('#dash-view');
  ok(/1,200\.00/.test(ovText) && /เกณฑ์จดทะเบียนภาษีมูลค่าเพิ่ม/.test(ovText) && /ภ\.ง\.ด\.3/.test(ovText), 'overview: income this month, VAT meter, PND 3 reminder for last month');
  await p.screenshot({ path: out('acc-overview-1366.png'), fullPage: true });

  // ledger: online sale + Beam fee listed; add an expense with withholding + evidence
  await nav(p, 'สมุดรายรับรายจ่าย');
  await p.waitForSelector('#dash-view .acc-list');
  ok(/รับชำระจากลูกค้า/.test(await p.textContent('#dash-view .acc-list')) && /ค่าธรรมเนียมรับชำระเงิน/.test(await p.textContent('#dash-view .acc-list')), 'ledger lists the online payment and its Beam fee');
  await p.click('#dash-view button:has-text("+ บันทึกรายการ")');
  await p.waitForSelector('#dash-view .acc-form');
  await field(p, 'หมวด').locator('select').selectOption('professional');
  await field(p, 'รายการ').locator('input').fill('ค่าทำบัญชีรายเดือน');
  await field(p, 'จำนวนเงิน').locator('input').fill('1500');
  await field(p, 'ภาษีหัก ณ ที่จ่าย').locator('input').fill('45');
  await p.locator('#dash-view .acc-form button:has-text("บันทึกข้อมูล")').click();
  await p.waitForSelector('#dash-view .acc-form .form-status:not([hidden])');
  ok(/เลขผู้เสียภาษี/.test(await p.textContent('#dash-view .acc-form .form-status')), 'withholding without the payee details → clear error, form kept');
  await field(p, 'คู่ค้า').locator('input').fill('สมชาย บัญชีดี');
  await field(p, 'เลขประจำตัวผู้เสียภาษี').locator('input').fill('3100100000001');
  await p.locator('#dash-view .acc-form').getByLabel('ที่อยู่', { exact: true }).fill('1 ถนนบัญชี กรุงเทพฯ');
  await p.locator('#dash-view .acc-form input[type=file]').setInputFiles({ name: 'bill.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') });
  await p.locator('#dash-view .acc-form button:has-text("บันทึกข้อมูล")').click();
  await p.waitForFunction(() => !document.querySelector('#dash-view .acc-form') && /ค่าทำบัญชีรายเดือน/.test(document.querySelector('#dash-view').textContent));
  const row = p.locator('#dash-view .acc-item', { hasText: 'ค่าทำบัญชีรายเดือน' });
  ok(/ค่าบริการวิชาชีพ/.test(await row.textContent()) && /หลักฐาน 1 ไฟล์/.test(await row.textContent()) && /50 ทวิ \d{4}\/0001/.test(await row.textContent()), 'saved with evidence and a 50 ทวิ number');
  ok(g.drive.files.some(f => /bill\.pdf$/.test(f.name)), 'evidence file stored in Drive');
  // CSV
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#dash-view button:has-text("ดาวน์โหลด CSV")')]);
  const csvText = require('fs').readFileSync(await dl.path(), 'utf8');
  ok(csvText.charCodeAt(0) === 0xfeff && /ค่าทำบัญชีรายเดือน/.test(csvText) && /^﻿วันที่,ประเภท,หมวด/.test(csvText), 'ledger CSV: UTF-8 BOM, Thai headers, the entry');
  await p.screenshot({ path: out('acc-ledger-1366.png'), fullPage: true });
  // void needs a reason
  await row.locator('button:has-text("ยกเลิกรายการ")').click();
  ok(await row.locator('.refund-form input').count() === 1, 'void asks for a reason');
  await row.locator('.refund-form button:has-text("ยกเลิก")').last().click();

  // reports + receipts + tax
  await nav(p, 'รายงานการเงิน');
  await p.waitForSelector('#dash-view .acc-bars');
  ok((await p.locator('#dash-view .acc-bars li').count()) === 12 && /รับชำระออนไลน์/.test(await p.textContent('#dash-view .acc-table')), 'report: 12 months + table');
  await nav(p, 'ทะเบียนใบเสร็จ');
  await p.waitForSelector('#dash-view .acc-receipt-table');
  ok(/ไม่มีเลขขาด/.test(await p.textContent('#dash-view')), 'receipt register: numbers checked for gaps');
  await nav(p, 'สรุปภาษีเงินได้');
  await p.waitForSelector('#dash-view .dash-dl');
  ok(/ภ\.ง\.ด\.94/.test(await p.textContent('#dash-view')) && /ภ\.ง\.ด\.90/.test(await p.textContent('#dash-view')) && !/แบบเหมา/.test(await p.textContent('#dash-view .dash-dl')), 'tax summary: half + full year; no flat-rate line until set');

  // withholding: last month's payout → 50 ทวิ
  await nav(p, 'ภาษีหัก ณ ที่จ่าย');
  await p.waitForSelector('#dash-view .acc-table');
  ok(/ผู้แปล ทดสอบ/.test(await p.textContent('#dash-view .acc-table')) && /1-1017-00000-00-1/.test(await p.textContent('#dash-view .acc-table')), 'PND 3 list: payee + formatted tax ID');
  await p.click('#dash-view .acc-table button:has-text("50 ทวิ")');
  await p.waitForSelector('.print-sheet .wht-doc');
  const docs = p.locator('.print-sheet .wht-doc');
  const dt = await docs.first().textContent();
  ok(await docs.count() === 2 && /ฉบับที่ 1/.test(dt) && /ฉบับที่ 2/.test(await docs.nth(1).textContent()), 'two copies with the same text (ฉบับที่ 1 / 2)');
  ok(/ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร/.test(dt) && /\(4\) ภ\.ง\.ด\.3/.test(dt) && /มาตรา 3 เตรส/.test(dt) && /ออกให้ตลอดไป/.test(dt) && /มาตรา 35/.test(dt), 'official form: all boxes, income row 5 (3 เตรส), payer options, warning');
  ok(/1-1005-00000-00-1/.test(dt) && /เก้าสิบหกบาทหกสิบสตางค์/.test(dt) && /3,220\.00/.test(dt) && /96\.60/.test(dt), 'payer tax ID, amount, tax and tax in Thai words');
  ok(await p.locator('.print-sheet .wht-doc .wht-tick .is-on').count() === 4, 'ticked: ภ.ง.ด.3 and "หัก ณ ที่จ่าย" on each copy');
  await p.screenshot({ path: out('acc-50tawi-1366.png'), fullPage: true });
  await p.emulateMedia({ media: 'print' });
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('.site-header')).display === 'none' && getComputedStyle(document.querySelector('.print-sheet .receipt-actions')).display === 'none'), 'print: only the paper');
  await p.emulateMedia({ media: 'screen' });
  await p.keyboard.press('Escape');
  ok(await p.locator('.print-sheet').count() === 0, 'Escape closes the document');

  // categories + log + close a month
  await nav(p, 'หมวดบัญชี');
  await p.waitForSelector('#dash-view .dash-users');
  ok(/ค่าไปรษณีย์และขนส่ง/.test(await p.inputValue('#dash-view .dash-users input >> nth=4').catch(() => '')) || /ค่าไปรษณีย์และขนส่ง/.test(await p.evaluate(() => Array.from(document.querySelectorAll('#dash-view input')).map(i => i.value).join('|'))), 'categories editable');
  await nav(p, 'บันทึกการแก้ไข');
  await p.waitForSelector('#dash-view .pay-list');
  ok(/บันทึกรายการ/.test(await p.textContent('#dash-view .pay-list')) && /acc@example\.com/.test(await p.textContent('#dash-view .pay-list')), 'change log shows the entry and who made it');
  ok(!p.errs.length, 'no page errors (accountant) ' + p.errs.join(' | '));
  await ctx.close();

  // ---- auditor: read-only
  ({ ctx, p } = await open(1366, 900, 'dark', aud));
  await p.waitForSelector('#dash-view .acc-meter');
  ok(/ดูและดาวน์โหลดข้อมูลได้อย่างเดียว/.test(await p.textContent('#dash-view')) && !(await p.locator('#dash-view button:has-text("ปิดงวด")').count()), 'auditor: read-only notice, no closing');
  await nav(p, 'สมุดรายรับรายจ่าย');
  await p.waitForSelector('#dash-view .acc-list');
  ok(!(await p.locator('#dash-view button:has-text("+ บันทึกรายการ")').count()) && !(await p.locator('#dash-view .acc-item button:has-text("แก้ไข")').count()), 'auditor cannot add or edit');
  ok(await p.locator('#dash-view .acc-evidence button:has-text("ดาวน์โหลด")').count() >= 1, 'auditor can download evidence');
  await p.screenshot({ path: out('acc-ledger-1366-dark.png'), fullPage: true });
  await nav(p, 'การชำระเงิน');
  await p.waitForSelector('#dash-view .pay-list');
  ok(!(await p.locator('#dash-view button:has-text("คืนเงิน")').count()), 'no refund button outside admin');
  ok(!p.errs.length, 'no page errors (auditor) ' + p.errs.join(' | '));
  await ctx.close();

  // ---- phone 320 / 390 and tablet: no sideways scrolling
  for (const [w, h] of [[390, 844], [320, 640], [768, 1024]]) {
    ({ ctx, p } = await open(w, h, 'light', acc));
    await p.waitForSelector('#dash-view .acc-meter');
    for (const page of ['สมุดรายรับรายจ่าย', 'รายงานการเงิน', 'ภาษีหัก ณ ที่จ่าย']) {
      await nav(p, page);
      await p.waitForSelector('#dash-view .dash-card');
      await p.waitForTimeout(150);
      ok(await overflow(p) <= 0, `${w}px ${page}: no sideways scroll`);
    }
    if (w === 390) {
      await p.screenshot({ path: out('acc-wht-390.png'), fullPage: true });
      await p.click('#dash-view .acc-table button:has-text("50 ทวิ")');
      await p.waitForSelector('.print-sheet .wht-doc');
      ok(await overflow(p) <= 0, '390px 50 ทวิ: page does not scroll sideways (table scrolls inside)');
      await p.screenshot({ path: out('acc-50tawi-390.png') });
    }
    await ctx.close();
  }

  // ---- admin has the accounting group too
  ({ ctx, p } = await open(1366, 900, 'light', admin));
  ok(/สมุดรายรับรายจ่าย/.test(await p.textContent('#dash-nav')) && /งานทั้งหมด/.test(await p.textContent('#dash-nav')), 'admin menu: work + accounting');
  await nav(p, 'ผู้ใช้และบทบาท');
  await p.waitForSelector('#dash-view .dash-user select');
  ok(/ฝ่ายบัญชี/.test(await p.textContent('#dash-view .dash-user select >> nth=0')) && /ผู้ตรวจบัญชีภายนอก/.test(await p.textContent('#dash-view .dash-user select >> nth=0')), 'roles to pick include accountant + external accountant');
  await ctx.close();
  await b.close();
})().catch(e => { console.log('FAIL crashed: ' + e.message); process.exitCode = 1; process.exit(1); });

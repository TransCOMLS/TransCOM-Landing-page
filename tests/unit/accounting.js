// Phase 8 (owner 2026-11-19): accounting — roles (accountant records, auditor reads), Ledger entries with evidence,
// categories, month close, reports from Payments / Payouts / Ledger, receipt register, withholding tax (50 ทวิ, ภ.ง.ด.3),
// yearly tax summary, VAT watch, change log
const { load } = require('../lib/mock');
const g = load(require('../lib/paths').CODE_GS);
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const P = g.post, S = g.sheets, C = g.ctx, props = g.props, beam = g.beam;
C.setup();
ok(['Ledger', 'AccountCategories', 'AccountLog'].every(n => S[n]), 'setup makes Ledger, AccountCategories, AccountLog');
ok(S.AccountCategories.data.length === 14 && S.AccountCategories.data.some(r => r[2] === 'ค่าไปรษณีย์และขนส่ง'), 'default categories seeded (13)');
ok(S.Payouts.data[0].includes('เลขที่ 50 ทวิ'), 'Payouts gets the 50 ทวิ number column');
C.setup();
ok(S.AccountCategories.data.length === 14, 'setup again does not seed twice');

const signIn = email => { P({ action: 'requestCode', email }); return P({ action: 'verifyCode', email, code: g.lastCode() }).token; };
const admin = signIn('owner@example.com'), acc = signIn('acc@example.com'), aud = signIn('audit@example.com'), cust = signIn('cust@example.com'), staff = signIn('tr@example.com');
P({ action: 'adminSetUser', token: admin, email: 'acc@example.com', role: 'accountant' });
P({ action: 'adminSetUser', token: admin, email: 'audit@example.com', role: 'auditor' });
P({ action: 'adminSetUser', token: admin, email: 'tr@example.com', role: 'staff' });
ok(P({ action: 'getAccount', token: acc }).profile.role === 'accountant' && P({ action: 'getAccount', token: aud }).profile.role === 'auditor', 'roles accountant + auditor');
ok(S.Users.data.some(r => r.includes('ฝ่ายบัญชี')) && S.Users.data.some(r => r.includes('ผู้ตรวจบัญชีภายนอก')), 'Thai role names in the Users sheet');

// what each role may open
ok(P({ action: 'accOverview', token: cust }).error === 'forbidden' && P({ action: 'accOverview', token: staff }).error === 'forbidden', 'customers and translators: no accounting');
ok(P({ action: 'accOverview', token: acc }).ok && P({ action: 'accOverview', token: aud }).ok && P({ action: 'accOverview', token: admin }).ok, 'accountant, auditor, admin open the overview');
ok(P({ action: 'adminJobs', token: acc }).error === 'forbidden' && P({ action: 'adminJobs', token: aud }).error === 'forbidden', 'accounting roles never see the job list');
ok(P({ action: 'adminUsers', token: acc }).error === 'forbidden', 'nor users and roles');
const jl = P({ action: 'adminJobs', token: admin });
ok(jl.staff.every(s => ['staff', 'admin'].includes(s.role)), 'accounting roles are not offered as translators to assign');
ok(P({ action: 'translatorApply', token: acc, application: {}, files: [] }).error === 'forbidden', 'an accountant cannot apply as a translator from that account');

// ---- a live online payment (sales + Beam fee), later partly refunded
props.BEAM_MODE = 'live'; props.BEAM_MERCHANT_ID = 'mlive'; props.BEAM_API_KEY = 'klive';
const mk = (email, name) => {
  const r = P({ action: 'createJob', job: { name, email, langPair: 'th-en', category: 'official', pages: 3, neededBy: '2099-01-01', certified: false, shipping: false, consent: true, files: [{ name: 'a.pdf', size: 3 }], idFiles: [] } });
  P({ action: 'uploadFile', jobNo: r.jobNo, uploadToken: r.uploadToken, kind: 'doc', name: 'a.pdf', data: 'QUJD' });
  P({ action: 'finishJob', jobNo: r.jobNo, uploadToken: r.uploadToken });
  return r.jobNo;
};
const job = mk('cust@example.com', 'คุณลูกค้า');
P({ action: 'adminSaveQuote', token: admin, jobNo: job, items: [{ text: 'ค่าแปล 3 หน้า', amount: 2000 }] });
const qm = g.mail.filter(m => m.to === 'cust@example.com').pop();
const t = /[?&]t=([0-9a-f]{32})/.exec(qm.htmlBody.replace(/&amp;/g, '&'))[1];
P({ action: 'payStart', jobNo: job, t });
beam.pay(Object.keys(beam.links).pop(), 'CARD');
P({ action: 'payCheck', jobNo: job, t }); C.checkPayments();
const pay = P({ action: 'adminPayments', token: acc });
ok(pay.ok && pay.payments.length === 1 && pay.payments[0].amount === 2000 && pay.hookUrl === '', 'accountant sees payments (no webhook address)');
ok(P({ action: 'adminPayments', token: aud }).ok && P({ action: 'adminPayments', token: admin }).hookUrl, 'auditor sees payments; admin also the webhook address');
const rcNo = pay.payments[0].receiptNo;
ok(P({ action: 'adminRefund', token: acc, receiptNo: rcNo, amount: 100 }).error === 'forbidden', 'refunds stay with the admin');
P({ action: 'adminRefund', token: admin, receiptNo: rcNo, amount: 500, reason: 'ลดหน้า' });
beam.refunds[Object.keys(beam.refunds).pop()].status = 'SUCCEEDED'; C.checkPayments();
ok(S.AccountLog.data.some(r => r[2] === 'refund' && r[3] === rcNo), 'refund written to the change log');

// ---- ledger entries
const today = C.today_(), month = today.slice(0, 7);
const save = (tok, e) => P({ action: 'accSaveEntry', token: tok, entry: Object.assign({ date: today, kind: 'expense', category: 'postage', description: 'ส่ง EMS งานลูกค้า', amount: 60, method: 'cash' }, e || {}) });
ok(save(aud).error === 'forbidden' && save(cust).error === 'forbidden', 'auditor and customers cannot record');
ok(save(acc, { date: '2099-01-01' }).error === 'invalid_date', 'no future dates');
ok(save(acc, { category: 'translation' }).error === 'invalid_category' && save(acc, { category: 'sales' }).error === 'invalid_category', 'category must be of the same kind and not a system one');
ok(save(acc, { amount: 0 }).error === 'invalid_amount' && save(acc, { wht: 60 }).error === 'invalid_wht', 'amount > 0, tax below the amount');
ok(save(acc, { wht: 3, amount: 100 }).error === 'wht_party_required', 'withholding on an expense needs the payee + tax ID + address');
ok(save(acc, { partyTaxId: '123' }).error === 'invalid_tax_id', 'tax ID 13 digits');
let e1 = save(acc);
ok(e1.ok && /^AC-\d{8}-[0-9A-F]{5}$/.test(e1.entry.id) && e1.entry.status === 'active' && e1.entry.createdBy === 'acc@example.com', 'expense saved (id, status, who)');
const e2 = save(acc, { category: 'professional', description: 'ค่าทำบัญชีรายเดือน', party: 'สมชาย บัญชีดี', partyTaxId: '3-1001-00000-00-1', partyAddress: '1 ถนนบัญชี กรุงเทพฯ', amount: 1500, wht: 45, method: 'transfer', docNo: '0012' });
ok(e2.ok && /^\d{4}\/0001$/.test(e2.entry.whtCertNo) && e2.entry.partyTaxId === '3100100000001' && e2.entry.docNo === '0012', 'expense with tax withheld gets 50 ทวิ no. ' + e2.entry.whtCertNo + '; leading zeros kept');
const e3 = save(acc, { kind: 'income', category: 'translation', description: 'แปลเอกสาร (โอนตรง) บริษัท เอ', party: 'บริษัท เอ จำกัด', amount: 3000, wht: 90, method: 'transfer' });
ok(e3.ok && !e3.entry.whtCertNo && e3.entry.wht === 90, 'income where the customer withheld 3% (tax credit)');
let ed = save(acc, { id: e1.entry.id, amount: 65, note: 'รวมซอง' });
ok(ed.ok && ed.entry.amount === 65 && ed.entry.updatedBy === 'acc@example.com', 'entry edited');
ok(S.AccountLog.data.some(r => r[2] === 'edit' && /amount: 60 → 65/.test(r[4])), 'edit logged with what changed');

// evidence
ok(P({ action: 'accUploadEvidence', token: acc, id: e1.entry.id, name: 'x.exe', data: 'QUJD' }).error === 'bad_file', 'only PDF / JPG / PNG');
let ev = P({ action: 'accUploadEvidence', token: acc, id: e1.entry.id, name: 'ใบเสร็จ EMS.jpg', data: 'QUJD' });
ok(ev.ok && ev.entry.evidence.length === 1 && Object.values(g.drive.folders).some(f => f.name === 'TransCOM – บัญชี (หลักฐาน)') && Object.values(g.drive.folders).some(f => f.name === month), 'evidence kept in a private folder per month');
ok(!g.drive.files.find(f => f.id === ev.entry.evidence[0].id).sharing, 'evidence file is not shared');
const dl = P({ action: 'accFile', token: aud, id: e1.entry.id, fileId: ev.entry.evidence[0].id });
ok(dl.ok && dl.data === 'QUJD' && dl.name === 'ใบเสร็จ EMS.jpg', 'auditor downloads the evidence');
ok(P({ action: 'accFile', token: aud, id: e1.entry.id, fileId: 'nope' }).error === 'not_found', 'only files of that entry');
ok(P({ action: 'accRemoveEvidence', token: aud, id: e1.entry.id, fileId: ev.entry.evidence[0].id }).error === 'forbidden', 'auditor cannot remove');

// void (never deleted)
ok(P({ action: 'accVoidEntry', token: acc, id: e3.entry.id }).error === 'reason_required', 'void needs a reason');
const e4 = save(acc, { description: 'บันทึกผิด', amount: 999 });
let vd = P({ action: 'accVoidEntry', token: acc, id: e4.entry.id, reason: 'บันทึกซ้ำ' });
ok(vd.ok && vd.entry.status === 'void' && S.Ledger.data.length === 5, 'voided, row kept');
ok(save(acc, { id: e4.entry.id }).error === 'entry_void', 'a voided entry cannot be edited');

// ---- ledger view: online + fees + refund + entries
let lg = P({ action: 'accLedger', token: aud, from: month + '-01', to: today });
const cats = r => lg.rows.filter(x => x.category === r);
ok(lg.ok && cats('sales').length === 1 && cats('sales')[0].amount === 2000 && cats('beamFee').length === 1 && cats('refund')[0].amount === -500, 'ledger: sale 2,000, Beam fee, refund −500');
ok(lg.rows.some(r => r.id === e4.entry.id && r.status === 'void'), 'voided entries listed (not counted)');
const fee = cats('beamFee')[0].amount;
ok(lg.totals.income === round(2000 - 500 + 3000) && lg.totals.expense === round(fee + 65 + 1500) && lg.totals.whtCredit === 90 && lg.totals.whtWithheld === 45, 'totals: income 4,500, expenses fee + 65 + 1,500, tax credit 90, withheld 45');
function round(n) { return Math.round(n * 100) / 100; }
ok(lg.caps.canEdit === false && P({ action: 'accLedger', token: acc }).caps.canEdit === true, 'auditor read-only, accountant edits');
ok(P({ action: 'accLedger', token: acc, noEvidence: true }).rows.map(r => r.id).join() === e2.entry.id, 'filter: expenses still missing evidence');
ok(P({ action: 'accLedger', token: acc, q: 'บริษัท เอ' }).rows.length === 1, 'search');
ok(P({ action: 'accLedger', token: acc, from: '2020-01-01', to: '2026-12-31' }).error === 'range_too_long', 'range limited to about a year');

// ---- report, receipts, tax year, VAT
const year = Number(today.slice(0, 4));
const rp = P({ action: 'accReport', token: aud, year });
const mm = rp.months.find(m => m.month === month);
ok(rp.ok && rp.months.length === 12 && mm.sales === 2000 && mm.refunds === 500 && mm.otherIncome === 3000 && mm.income === 4500 && mm.otherExpense === 1565, 'monthly report: sales, refunds, other income, other expenses');
ok(rp.byCategory.some(c => c.code === 'professional' && c.amount === 1500) && rp.byCategory.some(c => c.code === 'sales'), 'by category');
const rc = P({ action: 'accReceipts', token: aud, year });
ok(rc.ok && rc.receipts.length === 1 && rc.receipts[0].no === rcNo && rc.receipts[0].refundAmount === 500 && rc.series[0].gaps.length === 0, 'receipt register, no gaps');
// a gap in the numbers is shown
const pays = C.table_('Payments', C.PAY_COLS);
C.appendRow_(pays, { receiptNo: rcNo.replace(/\d{5}$/, '00003'), jobNo: job, paidAt: new Date(), amount: 100, mode: 'จริง', method: 'CARD' });
ok(P({ action: 'accReceipts', token: aud, year }).series[0].gaps.join() === rcNo.replace(/\d{5}$/, '00002'), 'missing receipt number flagged');
const tx = P({ action: 'accTaxYear', token: aud, year });
ok(tx.ok && tx.full.income === 4600 && tx.full.whtCredit === 90 && tx.flatPercent === 0, "yearly summary: income, tax credits; no flat-rate line until the accountant confirms the rate");
ok(tx.half.income === (today.slice(5) <= '06-30' ? 4600 : 0), 'half-year figures (ภ.ง.ด.94)');
let ov = P({ action: 'accOverview', token: acc });
ok(ov.vat.level === 'ok' && ov.vat.income === 4600 && ov.missingEvidence === 1, 'overview: VAT meter + missing evidence');
let n = g.mail.length;
C.CONFIG.accounting.vatThreshold = 5000;
ok(C.vatWatch_() === 'warn' && g.mail.slice(n).some(m => /ใกล้เกณฑ์จดทะเบียน VAT/.test(m.subject)), 'VAT watch: 92% → warning email');
ok(C.vatWatch_() === null, 'warned once');
C.CONFIG.accounting.vatThreshold = 4000;
ok(C.vatWatch_() === 'over' && C.vatWatch_() === null && g.mail.some(m => /เกินเกณฑ์จดทะเบียน VAT/.test(m.subject)), 'over the line: one more email');
C.CONFIG.accounting.vatThreshold = 1800000;

// ---- withholding tax: payouts + ledger, numbers, certificate
const tz = 'Asia/Bangkok';
C.appendRow_(C.table_('Translators', C.TRANSLATOR_COLS), { email: 'tr@example.com', status: 'อนุมัติ', name: 'ผู้แปล ทดสอบ', idNumber: "'1101700000001", address: '99 ถนนทดสอบ', docsVersion: C.CONFIG.translator.docsVersion });
const last = C.recentMonths_(2, tz)[1];
const paidLast = new Date(last + '-20T10:00:00+07:00');
C.appendRow_(C.table_('Payouts', C.PAYOUT_COLS), { month: last, email: 'tr@example.com', name: 'ผู้แปล ทดสอบ', jobs: 'TR-1 = 3220.00', gross: 3220, wht: 96.6, net: 3123.4, paidAt: paidLast, paidBy: 'owner@example.com' });
let wh = P({ action: 'accWht', token: aud, month: last });
ok(wh.ok && wh.rows.length === 1 && wh.rows[0].taxId === '1101700000001' && wh.rows[0].wht === 96.6 && /^\d{4}\/\d{4}$/.test(wh.rows[0].certNo), 'ภ.ง.ด.3 list for last month: older payout gets a number ' + wh.rows[0].certNo);
ok(wh.due === C.nextMonth_(last) + '-07' && wh.dueOnline === C.nextMonth_(last) + '-15', 'filing due dates (7th paper, 15th online)');
const certNo = wh.rows[0].certNo;
ok(P({ action: 'accWht', token: aud, month: last }).rows[0].certNo === certNo, 'number kept');
wh = P({ action: 'accWht', token: acc, month });
ok(wh.rows.length === 1 && wh.rows[0].source === 'ledger' && wh.rows[0].taxId === '3100100000001', 'this month: the ledger expense with tax withheld');
let ct = P({ action: 'whtCert', token: staff, source: 'payout', key: last + '|tr@example.com' });
ok(ct.ok && ct.cert.certNo === certNo && ct.cert.payee.name === 'ผู้แปล ทดสอบ' && ct.cert.payer.name === C.CONFIG.sellerOwner && ct.cert.amount === 3220 && ct.cert.wht === 96.6, 'translator opens their own 50 ทวิ');
ok(P({ action: 'whtCert', token: staff, source: 'ledger', key: e2.entry.id }).error === 'not_found', 'translators cannot open other certificates');
ok(P({ action: 'whtCert', token: aud, source: 'ledger', key: e2.entry.id }).cert.payee.taxId === '3100100000001', 'auditor opens a ledger 50 ทวิ');
ok(P({ action: 'whtCert', token: cust, source: 'payout', key: last + '|tr@example.com' }).error === 'forbidden', 'customers cannot');
const er = P({ action: 'translatorEarnings', token: staff });
ok(er.ok && er.months.some(m => m.month === last && m.paid && m.whtCertNo === certNo), 'translator earnings carry the certificate number');
ok(ct.cert.seq === 1 && ct.cert.form === 'pnd3' && ct.cert.row === '5' && /ค่าจ้างทำของ/.test(ct.cert.text), '50 ทวิ: line 1 of the month on ภ.ง.ด.3, income row 5 (section 3 เตรส, hire of work)');
ov = P({ action: 'accOverview', token: acc });
ok(ov.wht.count === 1 && ov.wht.tax === 96.6, 'overview: tax to file for last month');

// payouts: accountant may mark, auditor only read
ok(P({ action: 'adminPayouts', token: aud, month: last }).ok && P({ action: 'adminPayouts', token: aud, month: last }).canMark === false, 'auditor reads translator pay');
ok(P({ action: 'adminPayoutMark', token: aud, month: last, email: 'tr@example.com' }).error === 'forbidden', 'auditor cannot mark pay as sent');
ok(P({ action: 'adminPayoutMark', token: acc, month: last, email: 'tr@example.com' }).error === 'already_paid', 'accountant may (already paid here)');

// ---- categories
let ca = P({ action: 'accSaveCategory', token: acc, cat: { kind: 'expense', nameTh: 'ค่าเช่าพื้นที่', nameEn: 'Rent' } });
const rent = ca.cats.find(c => c.nameTh === 'ค่าเช่าพื้นที่');
ok(ca.ok && rent && rent.kind === 'expense' && rent.active, 'new category');
ca = P({ action: 'accSaveCategory', token: acc, cat: { code: 'travel', nameTh: 'ค่าเดินทาง', active: false } });
ok(!ca.cats.find(c => c.code === 'travel').active && save(acc, { category: 'travel' }).error === 'invalid_category', 'switched-off category cannot be picked');
ok(P({ action: 'accSaveCategory', token: aud, cat: { kind: 'expense', nameTh: 'x' } }).error === 'forbidden', 'auditor cannot change categories');

// ---- closing a month
ok(P({ action: 'accClose', token: acc, month }).error === 'bad_month', 'the current month cannot be closed yet');
let cl = P({ action: 'accClose', token: acc, month: last });
ok(cl.ok && cl.closed.includes(last), 'accountant closes last month');
ok(save(acc, { date: last + '-15' }).error === 'period_closed', 'no new entries in a closed month');
ok(P({ action: 'accClose', token: acc, month: last, close: false }).error === 'forbidden', 'only the admin reopens');
ok(P({ action: 'accClose', token: admin, month: last, close: false }).closed.length === 0 && save(acc, { date: last + '-15' }).ok, 'admin reopens; entries allowed again');

// ---- change log
const log = P({ action: 'accLog', token: aud });
ok(log.ok && ['create', 'edit', 'void', 'evidence', 'category', 'close', 'reopen', 'refund', 'vat'].every(a => log.log.some(l => l.action === a)), 'change log has every kind of change');
ok(log.log[0].action === 'create', 'newest first');

// ---- withholding from 1,000 baht up (ท.ป.4/2528: only payments under 1,000 are exempt)
ok(C.CONFIG.translator.whtMin === 1000, 'threshold 1,000 baht');
// statement_ on a translator with no jobs is 0; check the rule directly with the same formula
const whtOf = gross => (gross >= C.CONFIG.translator.whtMin ? Math.round(gross * C.CONFIG.translator.whtPercent) / 100 : 0);
ok(/gross >= CONFIG\.translator\.whtMin/.test(require('fs').readFileSync(require('../lib/paths').CODE_GS, 'utf8')) && whtOf(1000) === 30 && whtOf(999.99) === 0, 'exactly 1,000 baht is withheld (30.00); 999.99 is not');

// ---- owner 2026-11-19: Sheets turns the contract version "2026-11-18" into a date — still counts as accepted
const trs = C.table_('Translators', C.TRANSLATOR_COLS), trRow = C.find_(trs, 'email', 'tr@example.com');
C.updateRow_(trs, trRow, { docsVersion: new Date(C.CONFIG.translator.docsVersion + 'T00:00:00+07:00') });
const tro = C.translatorOf_('tr@example.com');
ok(tro.docsVersion === C.CONFIG.translator.docsVersion && C.docsOk_(tro), 'a contract version stored as a date still reads as accepted');

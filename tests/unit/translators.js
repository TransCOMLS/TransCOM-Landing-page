// Phase 7 (owner 2026-11-18): translators apply → admin approves → accept the documents → open list / assigned jobs
// → files after payment → confirm + ready → admin approves or returns → monthly pay; quality; reminders
const { load } = require('../lib/mock');
const g = load(require('../lib/paths').CODE_GS);
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const P = g.post, S = g.sheets, V = g.ctx.CONFIG.translator.docsVersion;
g.ctx.setup();
ok(['Translators', 'Payouts'].every(n => S[n]) && !S.GlossaryProposals, 'setup makes Translators + Payouts (no glossary page: dropped by the owner)');
ok(P({ action: 'glossarySearch', token: 'x' }).error === 'unknown_action', 'glossary actions are gone');
ok(['กำหนดส่งของผู้แปล', 'ผู้แปลรับงานเมื่อ', 'ค่าแปล (ฐานคิดผู้แปล)', 'ร้านส่งกลับให้แก้ (ครั้ง)'].every(h => S.Jobs.data[0].includes(h)), 'Jobs has the translator columns');
ok(g.triggers.includes('translatorChecks'), 'hourly translator reminder trigger');

const signIn = email => { P({ action: 'requestCode', email }); return P({ action: 'verifyCode', email, code: g.lastCode() }).token; };
const admin = signIn('owner@example.com'), cust = signIn('nida@example.com'), tA = signIn('anan@example.com'), tB = signIn('bee@example.com');
const future = d => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
function job(pair, days, opts) {
  const c = P({ action: 'createJob', job: Object.assign({ name: 'นิดา', email: 'nida@example.com', langPair: pair, category: 'official', pages: 2, neededBy: future(days), consent: true, files: [{ name: 'a.pdf', size: 3 }], idFiles: [] }, opts || {}) });
  P({ action: 'uploadFile', jobNo: c.jobNo, uploadToken: c.uploadToken, kind: 'doc', name: 'a.pdf', data: 'QUJD' });
  P({ action: 'finishJob', jobNo: c.jobNo, uploadToken: c.uploadToken });
  return c.jobNo;
}
const app = (name, extra) => Object.assign({ name, idNumber: '1-1017-00000-01-2', address: '12 ถนนสุขุมวิท แขวงคลองเตย กรุงเทพฯ', phone: '0899999999',
  languages: ['en'], categories: ['civil', 'official'], testType: 'ielts', testScore: 7, bankName: 'กสิกรไทย', bankAccount: '012-3-45678-9', bankAccountName: name, consent: true }, extra || {});

// ---- apply (customer account) → admin approves
ok(P({ action: 'translatorApply', token: tA, application: app('อนันต์ แปลดี', { idNumber: '123' }), files: [{ kind: 'cv', name: 'cv.pdf', data: 'QUJD' }, { kind: 'test', name: 'ielts.pdf', data: 'QUJD' }] }).error === 'invalid_id_number', 'ID number must be 13 digits');
ok(P({ action: 'translatorApply', token: tA, application: app('อนันต์ แปลดี'), files: [] }).error === 'files_required', 'CV / documents required');
// English test (owner 2026-11-19): picked test + score, checked against CEFR B1; proof file required
const cvOnly = [{ kind: 'cv', name: 'cv.pdf', data: 'QUJD' }], withProof = cvOnly.concat([{ kind: 'test', name: 'score.pdf', data: 'QUJD' }]);
const tryTest = (type, score, files) => P({ action: 'translatorApply', token: tA, application: app('อนันต์ แปลดี', { testType: type, testScore: score }), files: files || withProof }).error;
ok(tryTest('', '') === 'test_required', 'test type required');
ok(tryTest('toeic', 545) === 'below_b1' && tryTest('ielts', 3.5) === 'below_b1' && tryTest('toefl', 41) === 'below_b1' && tryTest('cambridge', 139) === 'below_b1' && tryTest('cefr', 'A2') === 'below_b1', 'below B1 refused (TOEIC 545, IELTS 3.5, TOEFL 41, Cambridge 139, CEFR A2)');
ok(tryTest('cutep', 34) === 'below_b1' && tryTest('tugetcbt', 35) === 'below_b1' && tryTest('kuept', 32) === 'below_b1' && tryTest('kuept', 81) === 'invalid_score', 'Thai tests: CU-TEP 34, TU-GET CBT 35, KU-EPT 32 below B1; KU-EPT out of 80');
ok(tryTest('toeic', 1200) === 'invalid_score' && tryTest('ielts', 'x') === 'invalid_score' && tryTest('cefr', 'D1') === 'invalid_score', 'out-of-range or nonsense scores refused');
ok(tryTest('toeic', 925, cvOnly) === 'test_proof_required', 'proof of the score required');
ok(JSON.stringify(g.ctx.CONFIG.translator.tests) === JSON.stringify((() => { global.window = {}; eval(require('fs').readFileSync(require('path').join(require('../lib/paths').ROOT, 'js', 'config.js'), 'utf8'));
  const o = {}; window.APP_CONFIG.translatorTests.forEach(x => { o[x.id] = x.levels ? { levels: x.levels, b1: x.b1 } : x.id === 'other' ? {} : { min: x.min, max: x.max, b1: x.b1 }; }); return o; })()), 'test thresholds match between config.js and Code.gs');
ok(P({ action: 'translatorApply', token: tA, application: app('อนันต์ แปลดี', { languages: ['xx'] }), files: [{ kind: 'cv', name: 'cv.pdf', data: 'QUJD' }, { kind: 'test', name: 'ielts.pdf', data: 'QUJD' }] }).error === 'pairs_required', 'at least one known language pair');
let n = g.mail.length;
let me = P({ action: 'translatorApply', token: tA, application: app('อนันต์ แปลดี'), files: [{ kind: 'cv', name: 'cv.pdf', data: 'QUJD' }, { kind: 'test', name: 'ielts.pdf', data: 'QUJD' }, { kind: 'id', name: 'id.jpg', data: 'QUJD' }] });
ok(me.ok && me.translator.status === 'applied' && me.translator.idNumber === '1101700000012' && me.translator.bankAccount === '012-3-45678-9' && me.role === 'customer', 'application saved (status applied, still a customer)');
ok(me.translator.pairs.join() === 'th-en,en-th' && me.translator.testType === 'ielts' && me.translator.testResult === 'pass' && /IELTS 7 — ผ่านเกณฑ์ B1/.test(me.translator.level), 'English picked → both directions; IELTS 7 recorded as passing B1');
ok(g.mail.slice(n).some(m => /ใบสมัครผู้แปลใหม่/.test(m.subject)), 'admin emailed about the application');
ok(Object.values(g.drive.folders).some(f => f.name === 'TransCOM – ผู้แปล (ส่วนตัว)') && g.drive.files.some(f => /^cv - cv\.pdf$/.test(f.name)), 'files kept in a private translator folder');
ok(P({ action: 'staffJobs', token: tA }).error === 'forbidden', 'an applicant cannot open staff pages');
let at = P({ action: 'adminTranslators', token: admin });
ok(at.ok && at.translators.length === 1 && at.translators[0].status === 'applied', 'admin sees the application');
ok(P({ action: 'adminTranslators', token: cust }).error === 'forbidden', 'customers cannot list translators');
n = g.mail.length;
at = P({ action: 'adminTranslatorUpdate', token: admin, email: 'anan@example.com', decision: 'approve' });
ok(at.translators[0].status === 'approved' && P({ action: 'getAccount', token: tA }).profile.role === 'staff', 'approve → role staff');
ok(g.mail.slice(n).some(m => m.to === 'anan@example.com' && /อนุมัติ/.test(m.subject)), 'applicant emailed');

// ---- documents must be accepted (current version, typed name)
ok(P({ action: 'staffJobs', token: tA }).error === 'contract_required', 'no work before accepting the documents');
const html = '<h2>สัญญา</h2>' + '<p>ข้อความสัญญา</p>'.repeat(60);
ok(P({ action: 'translatorAccept', token: tA, version: 'old', name: 'อนันต์ แปลดี', html }).error === 'docs_changed', 'an old version cannot be accepted');
ok(P({ action: 'translatorAccept', token: tA, version: V, name: 'คนอื่น', html }).error === 'name_mismatch', 'typed name must match the profile');
n = g.mail.length;
me = P({ action: 'translatorAccept', token: tA, version: V, name: '  อนันต์   แปลดี ', html });
ok(me.ok && me.docsOk && me.translator.docsVersion === V && me.translator.acceptedAt, 'accepted: version + date recorded');
const cm = g.mail.slice(n).filter(m => /สัญญาผู้แปล/.test(m.subject));
ok(cm.length === 2 && cm.every(m => m.attachments && m.attachments[0].type === 'application/pdf') && g.drive.files.some(f => /^สัญญาผู้แปล/.test(f.name)), 'PDF copy kept in Drive and emailed to both sides');
ok(g.drive.imports >= 1 && (g.drive.opened || []).length >= 1 && cm[0].attachments[0].fromDoc && g.drive.files.filter(f => f.name === 'imported doc').every(f => f.trashed), 'contract PDF made via Google Docs (letterhead, Sarabun); the temporary Doc is trashed');

// existing staff (added by admin before Phase 7): fill the same form → approved at once
P({ action: 'adminSetUser', token: admin, email: 'bee@example.com', role: 'staff' });
ok(P({ action: 'staffJobs', token: tB }).error === 'translator_profile', 'old staff without a profile: asked for it first');
me = P({ action: 'translatorApply', token: tB, application: app('บี ภาษาเก่ง', { languages: ['zh'], testType: 'other', testScore: 'HSK 5' }), files: [{ kind: 'cv', name: 'cv.pdf', data: 'QUJD' }, { kind: 'test', name: 'ielts.pdf', data: 'QUJD' }] });
ok(me.translator.status === 'approved' && me.translator.testResult === 'review' && me.translator.pairs.join() === 'th-zh,zh-th', 'existing staff: approved at once; "other" test waits for a look at the proof; prepared language stored');
P({ action: 'translatorAccept', token: tB, version: V, name: 'บี ภาษาเก่ง', html });

// ---- open list (priced, not given to anyone; only my language pairs) + claim
const j1 = job('th-en', 6), j2 = job('th-en', 6), j3 = job('th-en', 6);
let sj = P({ action: 'staffJobs', token: tA });
ok(sj.ok && sj.open.length === 0, 'received (not priced) jobs are not on the open list');
[j1, j2, j3].forEach(j => P({ action: 'adminSaveQuote', token: admin, jobNo: j, items: [{ text: 'ค่าแปล 2 หน้า', amount: 600 }, { text: 'ค่ารับรองคำแปล', amount: 300 }] }));
sj = P({ action: 'staffJobs', token: tA });
ok(sj.open.map(j => j.jobNo).sort().join() === [j1, j2, j3].sort().join(), 'quoted jobs appear on the open list');
ok(P({ action: 'staffJobs', token: tB }).open.length === 0, 'a translator only sees languages they take (bee: Chinese)');
ok(sj.open[0].pay && sj.open[0].pay.base === 900 && sj.open[0].pay.amount === 630, 'pay shown up front: 70% of the quote subtotal (certified flag off → no deduction)');
n = g.mail.length;
sj = P({ action: 'translatorClaim', token: tA, jobNo: j1 });
ok(sj.ok && sj.jobs.some(j => j.jobNo === j1 && j.acceptedAt && j.translatorDue) && !sj.open.some(j => j.jobNo === j1), 'claim: mine at once, accepted, due date set, off the list');
ok(g.mail.slice(n).some(m => /ผู้แปลขอรับงาน/.test(m.subject)), 'admin emailed about the claim');
ok(P({ action: 'translatorClaim', token: tB, jobNo: j1 }).error === 'already_taken' || P({ action: 'translatorClaim', token: tB, jobNo: j1 }).error === 'not_open', 'first come, first served');
let d1 = P({ action: 'staffJob', token: tA, jobNo: j1 }).job;
ok(d1.files.length === 0 && d1.filesLocked && !d1.canWork, 'before payment: details only, no files');
ok(P({ action: 'staffUpdate', token: tA, jobNo: j1, step: 'start' }).error === 'not_paid', 'cannot start before the customer pays');
const fid = P({ action: 'adminJob', token: admin, jobNo: j1 }).job.files[0].id;
ok(P({ action: 'jobFile', token: tA, jobNo: j1, fileId: fid }).error === 'not_found', 'file download refused before payment');
P({ action: 'adminUpdateJob', token: admin, jobNo: j1, status: 'paid' });
d1 = P({ action: 'staffJob', token: tA, jobNo: j1 }).job;
ok(d1.files.length === 1 && d1.canWork && P({ action: 'jobFile', token: tA, jobNo: j1, fileId: fid }).ok, 'after payment: files open');
ok(!('email' in d1) && !('name' in d1) && !('phone' in d1), 'translator never gets customer contact details');

// ---- admin assigns: accept / decline
ok(P({ action: 'adminUpdateJob', token: admin, jobNo: j2, assignee: 'bee@example.com' }).ok, 'admin can assign any translator');
n = g.mail.length;
let r = P({ action: 'translatorRespond', token: tB, jobNo: j2, accept: false, reason: '' });
ok(r.error === 'reason_required', 'declining needs a reason');
r = P({ action: 'translatorRespond', token: tB, jobNo: j2, accept: false, reason: 'ไม่ว่างสัปดาห์นี้' });
ok(r.ok && !r.jobs.some(j => j.jobNo === j2) && P({ action: 'adminJob', token: admin, jobNo: j2 }).job.assignee === '', 'decline: job back to unassigned');
ok(g.mail.slice(n).some(m => /ผู้แปลปฏิเสธงาน/.test(m.subject) && /ไม่ว่างสัปดาห์นี้/.test(m.htmlBody)), 'admin emailed with the reason');
P({ action: 'adminUpdateJob', token: admin, jobNo: j2, assignee: 'anan@example.com' });
ok(P({ action: 'staffJob', token: tA, jobNo: j2 }).job.files.length === 0, 'assigned but not accepted: no files');
P({ action: 'adminUpdateJob', token: admin, jobNo: j2, status: 'paid' });
ok(P({ action: 'uploadTranslation', token: tA, jobNo: j2, name: 'x.pdf', data: 'QUJD' }).error === 'accept_first', 'must accept before working');
r = P({ action: 'translatorRespond', token: tA, jobNo: j2, accept: true });
ok(r.ok && P({ action: 'translatorRespond', token: tA, jobNo: j2, accept: true }).error === 'already_accepted', 'accept once');

// reminders: not accepted in time (admin), due tomorrow + late (translator)
P({ action: 'adminUpdateJob', token: admin, jobNo: j3, assignee: 'anan@example.com' });
const H = S.Jobs.data[0], rowOf = j => S.Jobs.data.find(x => x[0] === j);
rowOf(j3)[H.indexOf('มอบหมายเมื่อ')] = new Date(Date.now() - 3 * 3600e3);
rowOf(j1)[H.indexOf('กำหนดส่งของผู้แปล')] = new Date(Date.now() + 864e5);
rowOf(j2)[H.indexOf('กำหนดส่งของผู้แปล')] = new Date(Date.now() - 2 * 864e5);
n = g.mail.length;
g.ctx.translatorChecks();
const rem = g.mail.slice(n);
ok(rem.some(m => /ยังไม่ตอบรับงาน/.test(m.subject) && new RegExp(j3).test(m.subject)), 'admin reminded: assigned job not accepted after 2 hours');
ok(rem.some(m => m.to === 'anan@example.com' && /ใกล้ถึงกำหนดส่งงาน/.test(m.subject)), 'translator reminded the day before the due date');
ok(rem.some(m => /anan@example.com/.test(m.to) && /owner@example.com/.test(m.to) && /เลยกำหนดส่งงาน/.test(m.subject)), 'late: translator + admin emailed');
n = g.mail.length; g.ctx.translatorChecks();
ok(g.mail.length === n, 'each reminder is sent once');
ok(P({ action: 'adminUpdateJob', token: admin, jobNo: j3, translatorDue: '2026-13-40' }).error === 'invalid_date', 'due date checked');
ok(P({ action: 'adminUpdateJob', token: admin, jobNo: j3, translatorDue: future(4) }).job.translatorDue === future(4), 'admin sets the translator due date');

// ---- ready (confirmation tick) → admin returns / approves
P({ action: 'staffUpdate', token: tA, jobNo: j1, step: 'start' });
P({ action: 'uploadTranslation', token: tA, jobNo: j1, name: 'a-EN.pdf', data: 'WFla' });
ok(P({ action: 'staffUpdate', token: tA, jobNo: j1, step: 'ready' }).error === 'confirm_required', 'ready needs the confirmation tick');
ok(P({ action: 'staffUpdate', token: tA, jobNo: j1, step: 'ready', confirm: true }).job.translatorConfirmedAt, 'confirmation time recorded');
ok(P({ action: 'adminUpdateJob', token: admin, jobNo: j1, review: 'return', reviewNote: '' }).error === 'reason_required', 'send-back needs what to fix');
n = g.mail.length;
let aj = P({ action: 'adminUpdateJob', token: admin, jobNo: j1, review: 'return', reviewNote: 'ชื่อหน่วยงานไม่ตรง Glossary' });
ok(!aj.job.readyAt && aj.job.returnCount === 1 && g.mail.slice(n).some(m => m.to === 'anan@example.com' && /ส่งงานกลับให้แก้/.test(m.subject)), 'returned: ready cleared, counted, translator emailed');
ok(P({ action: 'adminUpdateJob', token: admin, jobNo: j1, review: 'approve' }).error === 'not_ready', 'cannot approve until it is ready again');
P({ action: 'staffUpdate', token: tA, jobNo: j1, step: 'ready', confirm: true });
aj = P({ action: 'adminUpdateJob', token: admin, jobNo: j1, review: 'approve' });
ok(aj.job.status === 'review' && aj.job.approvedAt, 'approve → รอลูกค้าตรวจ, approval date kept');
ok(P({ action: 'staffJob', token: tA, jobNo: j1 }).job.files.length === 2 && !P({ action: 'staffJob', token: tA, jobNo: j1 }).job.canWork, 'during the customer check: files visible, no edits');
P({ action: 'requestRevision', token: cust, jobNo: j1, text: 'แก้ชื่อเขตให้ถูกต้อง' });
ok(P({ action: 'adminJob', token: admin, jobNo: j1 }).job.revisionCount === 1, 'customer correction counted');
P({ action: 'staffUpdate', token: tA, jobNo: j1, step: 'ready', confirm: true });
P({ action: 'adminUpdateJob', token: admin, jobNo: j1, review: 'approve' });
P({ action: 'confirmTranslation', token: cust, jobNo: j1 });
d1 = P({ action: 'staffJob', token: tA, jobNo: j1 }).job;
ok(d1.status === 'delivered' && d1.files.length === 0 && P({ action: 'jobFile', token: tA, jobNo: j1, fileId: fid }).error === 'not_found', 'delivered: access to the files ends');

// ---- pay: base (auto / set), adjustments, monthly statement, no withholding (sole proprietor), mark paid (frozen)
let aj1 = P({ action: 'adminJob', token: admin, jobNo: j1 }).job;
ok(aj1.translatorPay.base === 900 && aj1.translatorPay.amount === 630 && !aj1.translatorBaseSet, 'auto base = quote subtotal (not certified/shipped here)');
const jc = job('th-en', 6, { certified: true, shipping: true, address: '1 ถนนทดสอบ เขตบางรัก กรุงเทพฯ 10500' });
P({ action: 'adminSaveQuote', token: admin, jobNo: jc, items: [{ text: 'ค่าแปล', amount: 900 }, { text: 'ค่ารับรอง', amount: 300 }, { text: 'ค่าส่ง', amount: 50 }] });
ok(P({ action: 'adminJob', token: admin, jobNo: jc }).job.translatorPay === undefined, 'no translator yet: no pay box');
P({ action: 'translatorClaim', token: tA, jobNo: jc });
ok(P({ action: 'adminJob', token: admin, jobNo: jc }).job.translatorPay.base === 900, 'certified + posted: certification and shipping fees left out (1,250 − 300 − 50)');
aj1 = P({ action: 'adminUpdateJob', token: admin, jobNo: j1, translatorPay: { base: 1000, adjust: -150, note: 'งานด่วนส่งช้า คืนลูกค้า 15%' } }).job;
ok(aj1.translatorPay.amount === 550 && aj1.translatorBaseSet, 'manual base + adjustment: 700 − 150 = 550 (policy example)');
const month = new Date().toISOString().slice(0, 7);
let er = P({ action: 'translatorEarnings', token: tA });
ok(er.ok && er.months[0].month === month && er.months[0].gross === 550 && er.months[0].wht === 0 && er.months[0].net === 550, 'month under 1,000: no tax withheld');
ok(er.pending.length >= 1, 'jobs not yet delivered listed as pending');
P({ action: 'adminUpdateJob', token: admin, jobNo: j1, translatorPay: { base: 4600, adjust: 0, note: '' } });
er = P({ action: 'translatorEarnings', token: tA });
ok(er.months[0].gross === 3220 && er.months[0].wht === 0 && er.months[0].net === 3220 && er.withhold === false, 'owner 2026-11-19: the shop is a sole proprietor → no tax withheld (ท.ป.4/2528 ข้อ 8), 3,220 paid in full');
g.ctx.CONFIG.translator.withhold = true;   // the switch for a juristic-person shop: 3% from 1,000 baht
ok(P({ action: 'translatorEarnings', token: tA }).months[0].net === 3123.4, 'switch on: 3,220 − 3% = 3,123.40');
g.ctx.CONFIG.translator.withhold = false;
ok(P({ action: 'translatorEarnings', token: admin }).error === 'forbidden', 'earnings are per translator');
let po = P({ action: 'adminPayouts', token: admin, month });
ok(po.ok && po.statements.length === 1 && po.statements[0].email === 'anan@example.com' && /กสิกรไทย/.test(po.statements[0].bank), 'admin payout list with bank details');
n = g.mail.length;
po = P({ action: 'adminPayoutMark', token: admin, month, email: 'anan@example.com', ref: 'KBank 123' });
ok(po.statements[0].paid && S.Payouts.data.length === 2 && g.mail.slice(n).some(m => m.to === 'anan@example.com' && /3220\.00/.test(m.htmlBody) && /ไม่หักภาษี/.test(m.htmlBody)), 'marked paid: Payouts row + translator emailed (no tax withheld)');
ok(P({ action: 'adminPayoutMark', token: admin, month, email: 'anan@example.com' }).error === 'already_paid', 'a month is paid once');
P({ action: 'adminUpdateJob', token: admin, jobNo: j1, translatorPay: { base: 100, adjust: 0, note: '' } });
ok(P({ action: 'translatorEarnings', token: tA }).months[0].net === 3220, 'paid months keep their frozen figures');
P({ action: 'adminTranslatorUpdate', token: admin, email: 'anan@example.com', rate: 75 });
ok(P({ action: 'adminJob', token: admin, jobNo: jc }).job.translatorPay.rate === 75, 'per-translator rate');
ok(P({ action: 'adminTranslatorUpdate', token: admin, email: 'anan@example.com', rate: 150 }).error === 'invalid_rate', 'rate 0–100 only');

// ---- quality
const q = P({ action: 'adminTranslators', token: admin }).translators.find(t => t.email === 'anan@example.com').quality;
ok(q.done === 1 && q.returns === 1 && q.revisions === 1, 'quality: delivered jobs, send-backs, customer corrections');
ok(P({ action: 'translatorMe', token: tA }).quality.done === 1, 'translator sees their own figures');

// ---- profile, availability, suspend
me = P({ action: 'translatorProfile', token: tA, profile: { available: false, languages: ['en', 'ja'] } });
ok(!me.translator.available && me.translator.pairs.join() === 'th-en,en-th,th-ja,ja-th', 'translator updates languages + availability');
ok(P({ action: 'staffJobs', token: tA }).open.length === 0 && P({ action: 'translatorClaim', token: tA, jobNo: j2 }).error === 'not_available', 'not available: no open list, no claiming');
ok(P({ action: 'translatorProfile', token: tA, profile: { languages: [] } }).error === 'pairs_required', 'at least one language kept');
P({ action: 'adminTranslatorUpdate', token: admin, email: 'bee@example.com', decision: 'suspend', note: 'ทดสอบ' });
ok(P({ action: 'getAccount', token: tB }).profile.role === 'customer' && P({ action: 'staffJobs', token: tB }).error === 'forbidden', 'suspended: back to customer, no staff pages');
const staffOpts = P({ action: 'adminJob', token: admin, jobNo: j3 }).staff;
ok(staffOpts.find(s => s.email === 'anan@example.com').translator.docsOk, 'assign menu knows who has accepted the documents');

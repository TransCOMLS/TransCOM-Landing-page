const { load } = require('../lib/mock');
const g = load(require('../lib/paths').CODE_GS);
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const P = g.post;
g.ctx.setup();

// ---- setup: new columns, Discounts sheet
const U = g.sheets.Users, J = g.sheets.Jobs, D = g.sheets.Discounts;
ok(U.data[0].includes('บทบาท') && U.data[0].includes('ประเภทลูกค้า'), 'Users has role + customer type columns');
ok(['ผู้รับผิดชอบ', 'แปลเสร็จเมื่อ', 'คำขอยกเลิก', 'บันทึกภายใน'].every(h => J.data[0].includes(h)), 'Jobs has the Phase 5 columns');
ok(D && D.data.length === 5 && D.data[1][1] === 'general', 'Discounts sheet seeded with 4 customer types');
// an old sheet without the new columns gets them added on the right, data kept
U.data[0] = U.data[0].slice(0, 9); U.data.push(['old@example.com', 'Old', '', '', '', '', 'th', '', '']);
g.ctx.setup();
ok(U.data[0].length === 14 && U.data[0][9] === 'บทบาท' && U.data[1][0] === 'old@example.com', 'setup adds missing columns to an existing sheet, data untouched');

// ---- sign in helpers
const signIn = email => { P({ action: 'requestCode', email }); return P({ action: 'verifyCode', email, code: g.lastCode() }).token; };
const admin = signIn('owner@example.com');           // provider / script owner = admin
const cust = signIn('nida@example.com');
const other = signIn('mali@example.com');
ok(P({ action: 'getAccount', token: admin }).profile.role === 'admin', 'provider email is admin without any setting');
ok(P({ action: 'getAccount', token: cust }).profile.role === 'customer' && P({ action: 'getAccount', token: cust }).profile.customerType === 'general', 'new user = customer, type general');

// ---- a job with an ID file
const future = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
const c = P({ action: 'createJob', lang: 'th', job: { name: 'นิดา', email: 'nida@example.com', phone: '0812345678', address: '1 ถนนหนึ่ง แขวงสอง เขตสาม กรุงเทพฯ 10100', shipping: true, langPair: 'th-en', category: 'civil', pages: 1, neededBy: future, consent: true, idConsent: true, nameSpelling: 'Nida', files: [{ name: 'birth.pdf', size: 3 }], idFiles: [{ name: 'id.jpg', size: 3 }] } });
P({ action: 'uploadFile', jobNo: c.jobNo, uploadToken: c.uploadToken, kind: 'doc', name: 'birth.pdf', data: 'QUJD' });
P({ action: 'uploadFile', jobNo: c.jobNo, uploadToken: c.uploadToken, kind: 'id', name: 'id.jpg', data: 'QUJD' });
P({ action: 'finishJob', jobNo: c.jobNo, uploadToken: c.uploadToken });
const jobNo = c.jobNo;

// ---- permissions
ok(P({ action: 'adminOverview', token: cust }).error === 'forbidden', 'customer cannot open admin actions');
ok(P({ action: 'staffJobs', token: cust }).error === 'forbidden', 'customer cannot open staff actions');
ok(P({ action: 'adminSetUser', token: cust, email: 'nida@example.com', role: 'admin' }).error === 'forbidden', 'customer cannot make themselves admin');
ok(P({ action: 'myJob', token: other, jobNo }).error === 'not_found', 'another customer cannot see the job');
let mj = P({ action: 'myJob', token: cust, jobNo });
ok(mj.ok && mj.job.status === 'received' && mj.job.files.length === 0, 'customer sees own job, no files before delivery');

// ---- admin adds a staff member who has never signed in
let us = P({ action: 'adminSetUser', token: admin, email: 'ploy@example.com', role: 'staff' });
ok(us.ok && us.users.find(u => u.email === 'ploy@example.com').role === 'staff', 'admin adds staff by email');
ok(P({ action: 'adminSetUser', token: admin, email: 'owner@example.com', role: 'customer' }).error === 'cannot_demote_self', 'admin cannot demote themselves');
us = P({ action: 'adminSetUser', token: admin, email: 'nida@example.com', customerType: 'corporate' });
ok(us.users.find(u => u.email === 'nida@example.com').customerType === 'corporate' && U.data.some(r => r.includes('องค์กร/บริษัท')), 'admin sets customer type (Thai label in sheet)');
const staff = signIn('ploy@example.com');
ok(P({ action: 'getAccount', token: staff }).profile.role === 'staff', 'staff signs in with role staff');
ok(P({ action: 'adminJobs', token: staff }).error === 'forbidden', 'staff cannot open admin job list');
ok(P({ action: 'deleteAccount', token: staff }).error === 'forbidden', 'staff cannot delete their account from the site');

// ---- assign
ok(P({ action: 'staffJob', token: staff, jobNo }).error === 'not_found', 'staff cannot open an unassigned job');
const mailsBefore = g.mail.length;
let aj = P({ action: 'adminUpdateJob', token: admin, jobNo, assignee: 'ploy@example.com' });
ok(aj.ok && aj.job.assignee === 'ploy@example.com' && g.mail.slice(mailsBefore).some(m => m.to === 'ploy@example.com'), 'admin assigns job; staff gets an email');
ok(P({ action: 'adminUpdateJob', token: admin, jobNo, assignee: 'nida@example.com' }).error === 'invalid_choice', 'cannot assign to a customer');
const sl = P({ action: 'staffJobs', token: staff });
ok(sl.ok && sl.jobs.length === 1 && sl.jobs[0].jobNo === jobNo, 'staff sees the assigned job');
let sj = P({ action: 'staffJob', token: staff, jobNo });
ok(sj.ok && sj.job.nameSpelling === 'NIDA' && sj.job.files.length === 2, 'staff job detail: spelling + source and ID files');
ok(!('email' in sj.job) && !('phone' in sj.job) && !('address' in sj.job) && !('name' in sj.job), 'staff never gets customer contact details or address');
const src = sj.job.files.find(f => f.kind === 'doc');
const dl = P({ action: 'jobFile', token: staff, jobNo, fileId: src.id });
ok(dl.ok && dl.name === 'birth.pdf' && Buffer.from(dl.data, 'base64').toString() === 'ABC', 'staff downloads a source file');
ok(P({ action: 'jobFile', token: cust, jobNo, fileId: src.id }).error === 'not_found', 'customer cannot download source files through the API');

// ---- staff work
let up = P({ action: 'staffUpdate', token: staff, jobNo, step: 'ready' });
ok(up.error === 'no_translation', 'cannot mark ready without a translation file');
const n0 = g.mail.length;
up = P({ action: 'staffUpdate', token: staff, jobNo, step: 'start', note: 'เริ่มแปล' });
ok(up.ok && up.job.status === 'inProgress' && g.mail.slice(n0).some(m => m.to === 'nida@example.com' && /กำลังแปล/.test(m.subject)), 'staff starts: status กำลังแปล, customer emailed');
ok(P({ action: 'uploadTranslation', token: staff, jobNo, name: 'evil.exe', data: 'QUJD' }).error === 'bad_file', 'translation upload: file type checked');
const t1 = P({ action: 'uploadTranslation', token: staff, jobNo, name: 'birth-EN.pdf', data: 'WFla' });
const t2 = P({ action: 'uploadTranslation', token: staff, jobNo, name: 'wrong.pdf', data: 'WFla' });
ok(t1.ok && t2.ok && Object.values(g.drive.folders).some(f => f.name === 'งานแปล (ส่งลูกค้า)'), 'translations stored in their own subfolder');
ok(P({ action: 'deleteTranslation', token: staff, jobNo, fileId: t2.file.id }).ok, 'staff removes a wrong upload');
up = P({ action: 'staffUpdate', token: staff, jobNo, step: 'ready' });
ok(up.ok && up.job.readyAt && g.mail.some(m => /แปลเสร็จ รอตรวจ/.test(m.subject)), 'ready for checking: date set, admin emailed');
ok(/อัปโหลดไฟล์งานแปล birth-EN.pdf/.test(up.job.internalNotes) && /ploy@example.com/.test(up.job.internalNotes), 'internal notes log who did what');
ok(!('internalNotes' in P({ action: 'myJob', token: cust, jobNo }).job), 'customer never sees internal notes');

// ---- admin overview + list
const ov = P({ action: 'adminOverview', token: admin });
ok(ov.ok && ov.counts.inProgress === 1 && ov.open === 1 && ov.ready === 1 && ov.unassigned === 0 && ov.dueSoon === 1, 'overview counts (open, ready, due soon)');
const al = P({ action: 'adminJobs', token: admin, q: 'นิดา' });
ok(al.ok && al.jobs.length === 1 && al.jobs[0].email === 'nida@example.com' && al.staff.some(s => s.email === 'ploy@example.com'), 'admin search by name; staff list for the assign menu');
ok(P({ action: 'adminJobs', token: admin, q: 'nobody' }).jobs.length === 0, 'search with no match');

// ---- deliver → customer downloads
const n1 = g.mail.length;
aj = P({ action: 'adminUpdateJob', token: admin, jobNo, status: 'delivered' });
ok(aj.ok && aj.job.status === 'delivered' && aj.job.deliveredAt && g.mail.slice(n1).some(m => m.to === 'nida@example.com' && /\?job=/.test(m.htmlBody)), 'admin delivers: dates set, customer emailed with a link to the job page');
mj = P({ action: 'myJob', token: cust, jobNo });
ok(mj.job.files.length === 1 && mj.job.files[0].name === 'birth-EN.pdf', 'customer sees the delivered translation only');
const cd = P({ action: 'jobFile', token: cust, jobNo, fileId: mj.job.files[0].id });
ok(cd.ok && Buffer.from(cd.data, 'base64').toString() === 'XYZ', 'customer downloads the translation');
ok(P({ action: 'deleteTranslation', token: staff, jobNo, fileId: mj.job.files[0].id }).error === 'job_closed', 'staff cannot delete a delivered file');

// ---- cancel request
const c2 = P({ action: 'createJob', job: { name: 'นิดา', email: 'nida@example.com', langPair: 'en-th', category: 'other', pages: 2, neededBy: future, consent: true, files: [{ name: 'a.pdf', size: 3 }], idFiles: [] } });
P({ action: 'uploadFile', jobNo: c2.jobNo, uploadToken: c2.uploadToken, kind: 'doc', name: 'a.pdf', data: 'QUJD' });
P({ action: 'finishJob', jobNo: c2.jobNo, uploadToken: c2.uploadToken });
ok(P({ action: 'requestCancel', token: cust, jobNo, reason: 'x' }).error === 'cannot_cancel', 'cannot ask to cancel a delivered job');
ok(P({ action: 'requestCancel', token: other, jobNo: c2.jobNo }).error === 'not_found', 'cannot cancel someone else\'s job');
const n2 = g.mail.length;
ok(P({ action: 'requestCancel', token: cust, jobNo: c2.jobNo, reason: 'ส่งผิดไฟล์' }).ok && g.mail.slice(n2).some(m => /คำขอยกเลิก/.test(m.subject)), 'customer asks to cancel; admin emailed');
ok(P({ action: 'getAccount', token: cust }).jobs.find(j => j.jobNo === c2.jobNo).cancelRequested, 'history shows the pending request');
ok(P({ action: 'adminOverview', token: admin }).cancelRequests === 1, 'overview counts the request');
aj = P({ action: 'adminUpdateJob', token: admin, jobNo: c2.jobNo, cancel: 'approve' });
ok(aj.job.status === 'cancelled' && !aj.job.cancelRequest, 'admin approves: job cancelled, request cleared');

// ---- discounts
let ds = P({ action: 'adminDiscounts', token: admin });
ok(ds.ok && ds.items.length === 4, 'discount settings read');
const items = ds.items.map(i => Object.assign({}, i, { percent: i.code === 'student' ? 10 : i.code === 'corporate' ? 5 : 0 }));
items.push({ kind: 'tier', code: 'gold', nameTh: 'Gold', nameEn: 'Gold', percent: 7, minSpend: 20000, active: true });
ds = P({ action: 'adminSaveDiscounts', token: admin, items });
ok(ds.ok && ds.items.length === 5 && ds.items.find(i => i.code === 'student').percent === 10 && ds.items.find(i => i.code === 'gold').minSpend === 20000, 'discounts saved (types + a tier)');
ok(P({ action: 'adminSaveDiscounts', token: admin, items: [{ kind: 'type', code: 'vip', percent: 5 }] }).error === 'invalid_choice', 'unknown customer type refused');
ok(P({ action: 'adminSaveDiscounts', token: admin, items: [{ kind: 'tier', code: 'x', percent: 150 }] }).error === 'invalid_number', 'percent over 100 refused');
ok(P({ action: 'adminSaveDiscounts', token: cust, items }).error === 'forbidden', 'customer cannot change discounts');

// ---- sheet edits still work (status from the sheet → email)
const sc = J.data[0].indexOf('สถานะ') + 1;
ok(typeof g.ctx.onJobEdit === 'function' && sc > 0, 'onJobEdit still present');

// ---- review step: customer checks the files before delivery
const c3 = P({ action: 'createJob', job: { name: 'นิดา', email: 'nida@example.com', langPair: 'th-en', category: 'civil', pages: 1, neededBy: future, consent: true, idConsent: true, files: [{ name: 'b.pdf', size: 3 }], idFiles: [{ name: 'i.jpg', size: 3 }] } });
P({ action: 'uploadFile', jobNo: c3.jobNo, uploadToken: c3.uploadToken, kind: 'doc', name: 'b.pdf', data: 'QUJD' });
P({ action: 'uploadFile', jobNo: c3.jobNo, uploadToken: c3.uploadToken, kind: 'id', name: 'i.jpg', data: 'QUJD' });
P({ action: 'finishJob', jobNo: c3.jobNo, uploadToken: c3.uploadToken });
const j3 = c3.jobNo;
P({ action: 'adminUpdateJob', token: admin, jobNo: j3, assignee: 'ploy@example.com', status: 'inProgress' });
P({ action: 'uploadTranslation', token: staff, jobNo: j3, name: 'b-EN.pdf', data: 'WFla' });
ok(P({ action: 'requestRevision', token: cust, jobNo: j3, text: 'แก้ชื่อ' }).error === 'not_ready', 'cannot ask for corrections before review');
ok(P({ action: 'myJob', token: cust, jobNo: j3 }).job.files.length === 0, 'customer sees no files while translating');
let n3 = g.mail.length;
let r3 = P({ action: 'adminUpdateJob', token: admin, jobNo: j3, status: 'review' });
const rm = g.mail.slice(n3).find(m => m.to === 'nida@example.com');
ok(r3.job.status === 'review' && rm && /รอลูกค้าตรวจ/.test(rm.subject) && /\?job=/.test(rm.htmlBody) && /ดูและตรวจงานแปล/.test(rm.htmlBody), 'status รอลูกค้าตรวจ: customer emailed with "view and check" link');
ok(!r3.job.deliveredAt, 'review is not delivery yet (no delivered date)');
let mj3 = P({ action: 'myJob', token: cust, jobNo: j3 });
ok(mj3.job.status === 'review' && mj3.job.files.length === 1, 'customer sees the translation during review');
ok(P({ action: 'jobFile', token: cust, jobNo: j3, fileId: mj3.job.files[0].id }).ok, 'customer downloads it during review');
ok(P({ action: 'requestRevision', token: cust, jobNo: j3, text: 'x' }).error === 'revision_text', 'correction request needs some text');
ok(P({ action: 'requestRevision', token: other, jobNo: j3, text: 'แก้ชื่อหมู่บ้าน' }).error === 'not_found', 'another customer cannot ask for corrections');
n3 = g.mail.length;
mj3 = P({ action: 'requestRevision', token: cust, jobNo: j3, text: 'ชื่ออำเภอสะกดผิด ควรเป็น Bang Phli' });
const toTeam = g.mail.slice(n3).find(m => /ลูกค้าขอแก้ไข/.test(m.subject));
ok(mj3.ok && mj3.job.status === 'inProgress' && toTeam && /ploy@example.com/.test(toTeam.to) && /Bang Phli/.test(toTeam.htmlBody), 'corrections: back to กำลังแปล, admin + assigned staff emailed with the text');
const sv = P({ action: 'staffJob', token: staff, jobNo: j3 }).job;
ok(/Bang Phli/.test(sv.revisionRequest) && /ลูกค้าขอแก้ไข/.test(sv.internalNotes) && !sv.readyAt, 'staff sees the correction request; ready flag cleared');
P({ action: 'adminUpdateJob', token: admin, jobNo: j3, status: 'review' });
n3 = g.mail.length;
mj3 = P({ action: 'confirmTranslation', token: cust, jobNo: j3 });
const done = g.mail.slice(n3).find(m => m.to === 'nida@example.com');
ok(mj3.ok && mj3.job.status === 'delivered' && mj3.job.confirmedAt && mj3.job.deliveredAt, 'customer confirms during review: job delivered + confirmed');
ok(done && /ส่งมอบแล้ว/.test(done.subject) && /ขอบคุณที่ยืนยัน/.test(done.htmlBody), 'thank-you delivery email after confirming');
const jr = J.data.find(r => r[0] === j3), H = J.data[0];
ok(Math.round((new Date(jr[H.indexOf('กำหนดลบข้อมูล')]) - Date.now()) / 864e5) === 15 && jr[H.indexOf('คำขอแก้ไขล่าสุด')] === '', 'civil job: delete-by 15 days after confirming; correction request cleared');
ok(P({ action: 'requestRevision', token: cust, jobNo: j3, text: 'แก้อีกนิด' }).error === 'already_confirmed', 'no corrections after confirming');
// delivered directly by admin: customer can still confirm or ask within revisionDays
const mjd = P({ action: 'myJob', token: cust, jobNo });
ok(mjd.job.status === 'delivered' && mjd.job.revisionUntil && !mjd.job.confirmedAt, 'directly delivered job: correction window shown');
ok(P({ action: 'confirmTranslation', token: cust, jobNo }).job.confirmedAt, 'customer confirms a delivered job on the site');
ok(P({ action: 'confirmTranslation', token: cust, jobNo: c2.jobNo }).error === 'not_ready', 'cannot confirm a cancelled job');
// sheet dropdown: the new status is understood when typed in the sheet
ok(g.ctx.statusCode_('รอลูกค้าตรวจ') === 'review' && P({ action: 'adminOverview', token: admin }).counts.review === 0, 'status label from the sheet maps to review');

// ---- no cancelling once the customer can see the translation
const c4 = P({ action: 'createJob', job: { name: 'นิดา', email: 'nida@example.com', langPair: 'th-en', category: 'other', pages: 1, neededBy: future, consent: true, files: [{ name: 'c.pdf', size: 3 }], idFiles: [] } });
P({ action: 'uploadFile', jobNo: c4.jobNo, uploadToken: c4.uploadToken, kind: 'doc', name: 'c.pdf', data: 'QUJD' });
P({ action: 'finishJob', jobNo: c4.jobNo, uploadToken: c4.uploadToken });
ok(P({ action: 'requestCancel', token: cust, jobNo: c4.jobNo, reason: 'เปลี่ยนใจ' }).ok, 'cancel request before payment is accepted');
let a4 = P({ action: 'adminUpdateJob', token: admin, jobNo: c4.jobNo, status: 'paid' });
ok(!a4.job.cancelRequest && /ปิดคำขอยกเลิกอัตโนมัติ/.test(a4.job.internalNotes), 'reaching ชำระเงินแล้ว closes the pending cancel request (logged)');
ok(P({ action: 'requestCancel', token: cust, jobNo: c4.jobNo, reason: 'x' }).error === 'cannot_cancel', 'customer cannot ask to cancel after payment');
P({ action: 'adminUpdateJob', token: admin, jobNo: c4.jobNo, status: 'review' });
// even a request written into the sheet by hand can't be approved at review
const H4 = J.data[0], row4 = J.data.find(r => r[0] === c4.jobNo); row4[H4.indexOf('คำขอแก้ไขล่าสุด') - 2] = 'manual';
row4[H4.indexOf('คำขอยกเลิก')] = '2026-11-06 — manual';
ok(P({ action: 'requestCancel', token: cust, jobNo: c4.jobNo, reason: 'x' }).error === 'cannot_cancel', 'customer cannot cancel at รอลูกค้าตรวจ');
ok(P({ action: 'adminUpdateJob', token: admin, jobNo: c4.jobNo, cancel: 'approve' }).error === 'cannot_cancel', 'admin cannot approve a cancel request at รอลูกค้าตรวจ');
ok(P({ action: 'adminUpdateJob', token: admin, jobNo: c4.jobNo, cancel: 'reject' }).ok, 'rejecting it still works');

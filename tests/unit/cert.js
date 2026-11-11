const { load } = require('../lib/mock');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const g = load(require('../lib/paths').CODE_GS, { realJobNo: true }); g.ctx.setup(); const P = g.post;
const C = g.sheets.Certificates;
ok(C && C.data[0].includes('รหัสตรวจสอบ') && C.data[0].includes('วันที่รับรอง') && !C.data[0].some(h => /ชื่อ–|อีเมล|โทร/.test(h)), 'setup: Certificates sheet, no customer name/email/phone columns');
ok(g.sheets.Jobs.data[0].includes('รหัสตรวจสอบการรับรอง'), 'Jobs has the code column');
const signIn = e => { P({ action: 'requestCode', email: e }); return P({ action: 'verifyCode', email: e, code: g.lastCode() }).token; };
const admin = signIn('owner@example.com'), cust = signIn('nida@example.com'), staff = signIn('staff@example.com');
P({ action: 'adminSetUser', token: admin, email: 'staff@example.com', role: 'staff' });
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
function job(certified, email) {
  const c = P({ action: 'createJob', lang: 'th', job: { name: 'นิดา ใจดี', email: email || 'nida@example.com', langPair: 'th-en', category: 'civil', pages: 2, neededBy: day(5), consent: true, certified, requiresId: true, idConsent: true, files: [{ name: 'a.pdf', size: 3 }], idFiles: [{ name: 'id.jpg', size: 3 }] } });
  P({ action: 'uploadFile', jobNo: c.jobNo, uploadToken: c.uploadToken, kind: 'doc', name: 'a.pdf', data: 'QUJD' });
  P({ action: 'uploadFile', jobNo: c.jobNo, uploadToken: c.uploadToken, kind: 'id', name: 'id.jpg', data: 'QUJD' });
  const f = P({ action: 'finishJob', jobNo: c.jobNo, uploadToken: c.uploadToken });
  if (!f.ok) console.log(JSON.stringify(c), JSON.stringify(f));
  return c.jobNo;
}
const j1 = job(true), j0 = job(false);
// not certified → no code
ok(P({ action: 'adminJob', token: admin, jobNo: j0 }).job.cert === null, 'job without certification: no code');
// certified → code on first view, stable
let a = P({ action: 'adminJob', token: admin, jobNo: j1 }).job.cert;
ok(a && /^[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}$/.test(a.code) && a.status === 'pending' && a.url === 'https://www.prathaitranslation.com/?verify=' + a.code, 'certified job gets a code + link, status pending: ' + a.code);
ok(P({ action: 'adminJob', token: admin, jobNo: j1 }).job.cert.code === a.code && C.data.length === 2, 'same code on the next view, one row');
const code = a.code;
// public check while pending
let v = P({ action: 'verifyCert', code: code.toLowerCase().replace(/-/g, ' ') });
ok(v.ok && v.cert.status === 'pending' && v.cert.certifiedAt === '' && v.cert.pages === 2 && v.cert.category === 'civil', 'public check (any case/spaces): pending, no date yet');
ok(!JSON.stringify(v).includes('นิดา') && !JSON.stringify(v).includes('nida@'), 'public check never shows the customer name or email');
ok(P({ action: 'verifyCert', code: 'AAAA-BBBB-CCCC' }).error === 'not_found' && P({ action: 'verifyCert', code: 'xyz' }).error === 'invalid_code', 'unknown code → not_found; bad format → invalid_code');
// staff: assigned → doc title; not assigned → not_found
P({ action: 'adminUpdateJob', token: admin, jobNo: j1, assignee: 'staff@example.com' });
ok(P({ action: 'staffJob', token: staff, jobNo: j1 }).job.cert.code === code, 'assigned staff sees the code');
let u = P({ action: 'certUpdate', token: staff, jobNo: j1, docTitle: 'สูติบัตร', status: 'valid' });
ok(u.ok && u.cert.docTitle === 'สูติบัตร' && u.cert.status === 'pending', 'staff sets the document title (status change ignored for staff)');
ok(P({ action: 'certUpdate', token: cust, jobNo: j1, docTitle: 'x' }).error === 'forbidden', 'customers cannot edit');
// flow: paid → inProgress → review → customer confirms → certified with that date
['paid', 'inProgress', 'review'].forEach(s => P({ action: 'adminUpdateJob', token: admin, jobNo: j1, status: s }));
ok(P({ action: 'verifyCert', code }).cert.status === 'pending', 'still pending while the customer checks');
const mj = P({ action: 'myJob', token: cust, jobNo: j1 });
ok(mj.job.cert && mj.job.cert.code === code && mj.job.cert.docTitle === undefined, 'customer job page shows code + link (not the editable fields)');
P({ action: 'confirmTranslation', token: cust, jobNo: j1 });
v = P({ action: 'verifyCert', code });
const today = new Date().toISOString().slice(0, 10);
ok(v.cert.status === 'valid' && v.cert.certifiedAt === today && v.cert.docTitle === 'สูติบัตร' && v.cert.certifier.includes('TransCOM'), 'customer accepts → certified, date = acceptance day, title + certifier shown');
// admin withdraws / restores, sets certifier
u = P({ action: 'certUpdate', token: admin, jobNo: j1, status: 'revoked' });
ok(u.cert.status === 'revoked' && P({ action: 'verifyCert', code }).cert.status === 'revoked' && P({ action: 'verifyCert', code }).cert.certifiedAt === '', 'admin withdraws → page shows withdrawn');
P({ action: 'certUpdate', token: admin, jobNo: j1, status: 'valid', certifier: 'นางสาว ก. (นักแปลรับรอง)' });
v = P({ action: 'verifyCert', code });
ok(v.cert.status === 'valid' && v.cert.certifier === 'นางสาว ก. (นักแปลรับรอง)' && v.cert.certifiedAt === today, 'admin restores + names the certifier');
// survives the privacy purge (civil job data deleted after 15 days)
const J = g.sheets.Jobs, h = J.data[0], row = J.data.find(r => r[0] === j1);
row[h.indexOf('กำหนดลบข้อมูล')] = new Date(Date.now() - 864e5);
g.ctx.purgeDueJobs();
ok(String(row[h.indexOf('ชื่อ–นามสกุล')] || '') === '' && P({ action: 'verifyCert', code }).cert.status === 'valid', 'after the job\'s personal data is deleted, the certificate still checks');
// cancelled certified job → withdrawn
const j2 = job(true);
const c2 = P({ action: 'adminJob', token: admin, jobNo: j2 }).job.cert.code;
P({ action: 'adminUpdateJob', token: admin, jobNo: j2, status: 'cancelled' });
ok(P({ action: 'verifyCert', code: c2 }).cert.status === 'revoked', 'cancelled job → certificate withdrawn');
// delivered directly by admin (no confirmation) → valid with delivery date
const j3 = job(true);
const c3 = P({ action: 'adminJob', token: admin, jobNo: j3 }).job.cert.code;
P({ action: 'adminUpdateJob', token: admin, jobNo: j3, status: 'delivered' });
ok(P({ action: 'verifyCert', code: c3 }).cert.status === 'valid', 'delivered without a confirmation → certified on the delivery day');
// brute-force guard
for (let i = 0; i < 300; i++) P({ action: 'verifyCert', code: 'ZZZZ-ZZZZ-' + String(1000 + i).replace(/[01]/g, '2').slice(0, 4).replace(/\d/g, d => 'ABCDEFGHJK'[d]) });
ok(P({ action: 'verifyCert', code }).error === 'rate_limited', '300 misses in an hour pause lookups');

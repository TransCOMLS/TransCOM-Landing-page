const { load } = require('../lib/mock');
const g = load(require('../lib/paths').CODE_GS);
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const P = g.post;
g.ctx.setup();
ok(g.triggers.includes('onJobEdit') && g.triggers.includes('purgeDueJobs'), 'setup installs the edit + daily triggers');
g.ctx.setup();
ok(g.triggers.length === new Set(g.triggers).size && g.triggers.includes('checkPayments') && g.triggers.length === 3, 'running setup again does not duplicate triggers (edit, daily purge, 15-min payment check)');
ok(Object.values(g.drive.folders).some(f => f.name === 'TransCOM – งานแปล'), 'setup creates the private jobs folder');

const future = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
const b64 = n => Buffer.alloc(n, 7).toString('base64');
const base = () => ({
  name: 'สมชาย ใจดี', email: 'Somchai@Example.com', line: '@somchai', phone: '081-234-5678',
  langPair: 'th-en', category: 'business', pages: 3, neededBy: future, certified: true,
  nameSpelling: 'somchai jaidee', notes: '=SUM(A1)', consent: true,
  files: [{ name: 'contract.pdf', size: 1000 }, { name: 'page2.jpg', size: 500 }], idFiles: []
});

// ---- validation
ok(P({ action: 'createJob', job: Object.assign(base(), { consent: false }) }).error === 'consent', 'consent required');
ok(P({ action: 'createJob', job: Object.assign(base(), { neededBy: '2020-01-01' }) }).error === 'invalid_date', 'past date rejected');
ok(P({ action: 'createJob', job: Object.assign(base(), { files: [] }) }).error === 'files_required', 'files required');
ok(P({ action: 'createJob', job: Object.assign(base(), { category: 'civil' }) }).error === 'id_required', 'civil needs ID files + ack');
ok(P({ action: 'createJob', job: Object.assign(base(), { shipping: true, address: 'short' }) }).error === 'invalid_address', 'address required for post');
ok(P({ action: 'createJob', hp: 'spam', job: base() }).error === 'rejected', 'honeypot rejects bots');
ok(P({ action: 'createJob', job: Object.assign(base(), { files: Array.from({ length: 11 }, (_, i) => ({ name: i + '.pdf', size: 1 })) }) }).error === 'too_many_files', 'max 10 files');

// ---- happy path
let r = P({ action: 'createJob', lang: 'th', job: base() });
ok(r.ok && r.jobNo === 'TR-2569-0001' && /^[0-9a-f]{64}$/.test(r.uploadToken), 'job created: ' + r.jobNo);
const J = g.sheets.Jobs, head = J.data[0], col = h => head.indexOf(h);
let row = J.data[1];
ok(row[col('สถานะ')] === '', 'status empty until files are in');
ok(row[col('หมายเหตุ')] === '=SUM(A1)' && row[col('การสะกดชื่อ')] === 'SOMCHAI JAIDEE' && row[col('อีเมล')] === 'somchai@example.com', 'row saved (formula-safe, spelling upper-case, email normalised)');
ok(P({ action: 'finishJob', jobNo: r.jobNo, uploadToken: r.uploadToken }).error === 'upload_incomplete', 'cannot finish before uploads');
ok(P({ action: 'uploadFile', jobNo: r.jobNo, uploadToken: 'x'.repeat(64), kind: 'doc', name: 'contract.pdf', data: b64(1000) }).error === 'upload_expired', 'wrong upload token rejected');
ok(P({ action: 'uploadFile', jobNo: r.jobNo, uploadToken: r.uploadToken, kind: 'doc', name: 'evil.exe', data: b64(10) }).error === 'unexpected_file', 'file not in the list rejected');
ok(P({ action: 'uploadFile', jobNo: r.jobNo, uploadToken: r.uploadToken, kind: 'doc', name: 'contract.pdf', data: b64(1000) }).ok, 'upload 1');
ok(P({ action: 'uploadFile', jobNo: r.jobNo, uploadToken: r.uploadToken, kind: 'doc', name: 'contract.pdf', data: b64(1000) }).ok && g.drive.files.length === 1, 'retrying the same file does not duplicate it');
ok(P({ action: 'uploadFile', jobNo: r.jobNo, uploadToken: r.uploadToken, kind: 'doc', name: 'page2.jpg', data: b64(500) }).ok, 'upload 2');
const mailsBefore = g.mail.length;
let f = P({ action: 'finishJob', jobNo: r.jobNo, uploadToken: r.uploadToken });
ok(f.ok && f.jobNo === 'TR-2569-0001', 'finish');
row = J.data[1];
ok(row[col('สถานะ')] === 'ได้รับงานแล้ว' && row[col('จำนวนไฟล์')] === 2, 'status "received", 2 files');
const newMails = g.mail.slice(mailsBefore);
ok(newMails.length === 2 && newMails[0].to === 'somchai@example.com' && /TR-2569-0001/.test(newMails[0].subject) && newMails[1].to === 'owner@example.com', 'customer receipt + provider notice');
ok(/drive\.google\.com\/drive\/folders/.test(newMails[1].htmlBody) && !/<script/i.test(newMails[1].htmlBody), 'provider email links the folder, text escaped');
ok(P({ action: 'finishJob', jobNo: r.jobNo, uploadToken: r.uploadToken }).error === 'upload_expired', 'finished upload cannot be reused');
const folder = Object.values(g.drive.folders).find(x => x.name.startsWith('TR-2569-0001'));
ok(folder && g.drive.files.every(x => x.folder === folder.id) && g.drive.files[1].type === 'image/jpeg', 'files in the job folder with the right type');

// ---- civil job with ID files: separate subfolder
let c = P({ action: 'createJob', lang: 'en', job: Object.assign(base(), { category: 'civil', idFiles: [{ name: 'id.jpg', size: 10 }], idConsent: true, files: [{ name: 'birth.pdf', size: 10 }] }) });
ok(c.jobNo === 'TR-2569-0002', 'running number: ' + c.jobNo);
P({ action: 'uploadFile', jobNo: c.jobNo, uploadToken: c.uploadToken, kind: 'doc', name: 'birth.pdf', data: b64(10) });
P({ action: 'uploadFile', jobNo: c.jobNo, uploadToken: c.uploadToken, kind: 'id', name: 'id.jpg', data: b64(10) });
ok(P({ action: 'finishJob', jobNo: c.jobNo, uploadToken: c.uploadToken }).ok, 'civil job finished');
const idFile = g.drive.files.find(x => x.name === 'id.jpg');
ok(idFile && g.drive.folders[idFile.folder].name.startsWith('บัตร'), 'ID file in its own subfolder');
ok(/received your job/.test(g.mail[g.mail.length - 2].subject), 'English receipt for an English customer');

// ---- rate limit (5 per hour per email)
for (let i = 0; i < 3; i++) P({ action: 'createJob', job: base() });
ok(P({ action: 'createJob', job: base() }).error === 'rate_limited', 'max 5 jobs per email per hour');

// ---- status change emails via the edit trigger
const civilRow = 3, statusCol = col('สถานะ') + 1;
const editEvent = (rowNo, value, old) => {
  J.data[rowNo - 1][statusCol - 1] = value;
  return { range: { getSheet: () => J, getColumn: () => statusCol, getNumColumns: () => 1, getRow: () => rowNo, getNumRows: () => 1 }, oldValue: old, value };
};
let n0 = g.mail.length;
g.ctx.onJobEdit(editEvent(civilRow, 'ส่งใบเสนอราคาแล้ว', 'ได้รับงานแล้ว'));
ok(g.mail.length === n0 + 1 && /quote/i.test(g.mail[g.mail.length - 1].htmlBody), 'status → quoted: email sent');
n0 = g.mail.length;
g.ctx.onJobEdit(editEvent(civilRow, 'ส่งใบเสนอราคาแล้ว', 'ส่งใบเสนอราคาแล้ว'));
ok(g.mail.length === n0, 'same status again: no email');
g.ctx.onJobEdit(editEvent(civilRow, 'ส่งมอบแล้ว', 'กำลังแปล'));
const delivered = J.data[civilRow - 1];
const dAt = delivered[col('ส่งมอบเมื่อ')], dBy = delivered[col('กำหนดลบข้อมูล')];
ok(Object.prototype.toString.call(dAt) === '[object Date]' && Math.round((new Date(dBy) - Date.now()) / 864e5) === 90, 'delivered: date + delete-by (+90 days) set: ' + dAt + ' / ' + dBy);
const deliveryMail = g.mail[g.mail.length - 1].htmlBody;
ok(/\?job=TR-2569-0002#account/.test(deliveryMail) && /ID copy/.test(deliveryMail) && !/confirm=/.test(deliveryMail), 'delivery email links to the job page (no one-click confirm) + ID deletion note');
const link = g.ctx.confirmUrl_('TR-2569-0002');   // older emails still carry this link

// ---- confirm link
const qs = new URL(link.replace(/&amp;/g, '&')).searchParams;
let page = g.ctx.doGet({ parameter: { confirm: qs.get('confirm'), t: 'bad' } }).getContent();
ok(/not valid/.test(page), 'tampered link refused');
page = g.ctx.doGet({ parameter: { confirm: qs.get('confirm'), t: qs.get('t') } }).getContent();
ok(/confirmed/.test(page), 'confirm page');
const due = new Date(J.data[civilRow - 1][col('กำหนดลบข้อมูล')]);
ok(Math.round((due - Date.now()) / 864e5) === 15, 'civil job: delete-by moved to 15 days after confirming');

// ---- history: unfinished jobs hidden
const tok = P({ action: 'requestCode', email: 'somchai@example.com' }) && P({ action: 'verifyCode', email: 'somchai@example.com', code: g.lastCode() }).token;
const hist = P({ action: 'getAccount', token: tok }).jobs.map(j => j.jobNo);
ok(hist.includes('TR-2569-0001') && hist.includes('TR-2569-0002') && hist.length === 2, 'account history shows finished jobs only: ' + hist.join());

// ---- daily clean-up
J.data[civilRow - 1][col('กำหนดลบข้อมูล')] = new Date(Date.now() - 1000);
const civilFolderId = (J.data[civilRow - 1][col('โฟลเดอร์ไฟล์')].match(/folders\/(\w+)/) || [])[1];
g.ctx.purgeDueJobs();
const purged = J.data[civilRow - 1];
ok(g.drive.folders[civilFolderId].trashed, 'due job: folder moved to the bin');
ok(purged[col('ชื่อ–นามสกุล')] === '' && purged[col('อีเมล')] === '' && purged[col('ลบข้อมูลแล้วเมื่อ')] && purged[col('เลขที่งาน')] === 'TR-2569-0002', 'personal data cleared, job number kept');
ok(!g.drive.folders[(J.data[1][col('โฟลเดอร์ไฟล์')].match(/folders\/(\w+)/) || [])[1]].trashed, 'jobs not yet due are untouched');

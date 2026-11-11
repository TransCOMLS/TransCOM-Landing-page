const { load } = require('../lib/mock');
const g = load(require('../lib/paths').CODE_GS);
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const P = g.post;
g.ctx.setup();

// ---- setup builds Dashboard + Glossary, idempotently
const D = g.sheets.Dashboard, G = g.sheets.Glossary;
ok(D && D.data.length > 20, 'Dashboard sheet built (' + (D && D.data.length) + ' rows)');
const formulas = D.data.flat().filter(v => typeof v === 'string' && v[0] === '=');
const heads = g.sheets.Jobs.data[0];
const missing = [];
formulas.forEach(f => { (f.match(/MATCH\("([^"]+)"/g) || []).forEach(m => { const h = m.slice(7, -1); if (!heads.includes(h)) missing.push(h); }); });
ok(formulas.length >= 20 && !missing.length, 'every Dashboard formula points at a real Jobs header (' + formulas.length + ' formulas) ' + missing.join());
const bal = f => { let d = 0, q = false; for (const c of f) { if (c === '"') q = !q; else if (!q) { if (c === '(') d++; if (c === ')') d--; if (d < 0) return false; } } return d === 0 && !q; };
ok(formulas.every(bal), 'formulas have balanced brackets and quotes');
ok(D.data.some(r => r[0] === 'ได้รับงานแล้ว') && D.data.some(r => r[3] === 'เอกสารอื่น ๆ'), 'status + category rows (incl. "other")');
ok(G && G.data[0][0] === 'คำศัพท์ (ไทย)' && G.data.length > 20, 'Glossary created with seed terms');
G.data.push(['คำของเจ้าของ', 'Owner term', '', '']);
const glossLen = G.data.length;
g.ctx.setup();
ok(G.data.length === glossLen && g.sheets.Dashboard.data.length === D.data.length, 'running setup again keeps the owner\'s glossary rows and rebuilds the dashboard');

// ---- a finished job
const future = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
const job = { name: 'สมชาย ใจดี', email: 'somchai@example.com', langPair: 'th-en', category: 'other', pages: 2, neededBy: future, consent: true, files: [{ name: 'a.pdf', size: 10 }], idFiles: [] };
const c = P({ action: 'createJob', job });
const unfinished = c.jobNo;
ok(P({ action: 'trackJob', jobNo: unfinished, email: 'somchai@example.com' }).error === 'not_found', 'unfinished upload: not found');
P({ action: 'uploadFile', jobNo: c.jobNo, uploadToken: c.uploadToken, kind: 'doc', name: 'a.pdf', data: Buffer.alloc(10).toString('base64') });
P({ action: 'finishJob', jobNo: c.jobNo, uploadToken: c.uploadToken });
ok(/เอกสารอื่น ๆ/.test(g.mail[g.mail.length - 2].htmlBody), 'receipt email shows the category name, not the code');

let r = P({ action: 'trackJob', jobNo: ' tr-2569-0001 ', email: 'SomChai@Example.com ' });
ok(r.ok && r.job.status === 'received' && r.job.jobNo === 'TR-2569-0001', 'lookup works (case and spaces ignored)');
ok(r.job.neededBy === future && /^\d{4}-\d{2}-\d{2}$/.test(r.job.submittedAt) && r.job.deliveredAt === '', 'dates as yyyy-MM-dd');
const keys = Object.keys(r.job).sort().join();
ok(keys === 'category,confirmedAt,deliveredAt,jobNo,langPair,neededBy,pages,status,submittedAt', 'only status fields returned: ' + keys);
ok(!JSON.stringify(r).includes('สมชาย') && !JSON.stringify(r).includes('drive'), 'no name or folder link in the reply');

ok(P({ action: 'trackJob', jobNo: 'TR-2569-0001', email: 'other@example.com' }).error === 'not_found', 'wrong email: not found');
ok(P({ action: 'trackJob', jobNo: 'TR-2569-0099', email: 'somchai@example.com' }).error === 'not_found', 'wrong number: same not found');
ok(P({ action: 'trackJob', jobNo: 'hello', email: 'somchai@example.com' }).error === 'invalid_jobNo', 'bad number format');
ok(P({ action: 'trackJob', jobNo: 'TR-2569-0001', email: 'nope' }).error === 'invalid_email', 'bad email format');

// status changes in the sheet show up
const J = g.sheets.Jobs, col = h => J.data[0].indexOf(h);
J.data[1][col('สถานะ')] = 'กำลังแปล';
ok(P({ action: 'trackJob', jobNo: 'TR-2569-0001', email: 'somchai@example.com' }).job.status === 'inProgress', 'status from the sheet (Thai label → code)');
J.data[1][col('สถานะ')] = 'รอเอกสารเพิ่ม';
ok(P({ action: 'trackJob', jobNo: 'TR-2569-0001', email: 'somchai@example.com' }).job.status === 'other', 'unknown label → other');
J.data[1][col('สถานะ')] = 'ส่งมอบแล้ว';
J.data[1][col('ส่งมอบเมื่อ')] = new Date();
r = P({ action: 'trackJob', jobNo: 'TR-2569-0001', email: 'somchai@example.com' });
ok(r.job.status === 'delivered' && /^\d{4}-\d{2}-\d{2}$/.test(r.job.deliveredAt), 'delivered with date');

// purged jobs disappear
J.data[1][col('ลบข้อมูลแล้วเมื่อ')] = new Date();
ok(P({ action: 'trackJob', jobNo: 'TR-2569-0001', email: 'somchai@example.com' }).error === 'not_found', 'job with deleted data: not found');

// rate limit per email
let last;
for (let i = 0; i < 40; i++) last = P({ action: 'trackJob', jobNo: 'TR-2569-0001', email: 'flood@example.com' });
ok(last.error === 'rate_limited', 'max lookups per email per hour');
ok(P({ action: 'trackJob', jobNo: 'TR-2569-0001', email: 'calm@example.com' }).error === 'not_found', 'other emails not affected');

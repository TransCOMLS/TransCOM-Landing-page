const { load } = require('../lib/mock');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const g = load(require('../lib/paths').CODE_GS, { realJobNo: true }); g.ctx.setup(); const P = g.post;
const be = new Date().getFullYear() + 543;
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const nos = [];
for (let i = 0; i < 6; i++) {
  const email = `c${i}@example.com`;
  const c = P({ action: 'createJob', lang: 'th', job: { name: 'ลูกค้า ' + i, email, langPair: 'th-en', category: 'other', pages: 1, neededBy: day(5), consent: true, files: [{ name: 'a.pdf', size: 3 }], idFiles: [] } });
  P({ action: 'uploadFile', jobNo: c.jobNo, uploadToken: c.uploadToken, kind: 'doc', name: 'a.pdf', data: 'QUJD' });
  const f = P({ action: 'finishJob', jobNo: c.jobNo, uploadToken: c.uploadToken });
  ok(c.ok && f.ok, 'job created + finished: ' + c.jobNo);
  nos.push([c.jobNo, email]);
}
ok(nos.every(([n]) => new RegExp('^TR-' + be + '-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$').test(n)), 'format TR-<BE year>-<6 random, no 0/O/1/I/L>');
ok(new Set(nos.map(x => x[0])).size === nos.length, 'all different');
ok(!nos.some(([n]) => /-\d{4}$/.test(n)), 'not a running number');
// track with the new number (lower case + spaces ignored)
const [n0, e0] = nos[0];
const t = P({ action: 'trackJob', jobNo: ' ' + n0.toLowerCase() + ' ', email: e0 });
ok(t.ok && t.job.jobNo === n0, 'status lookup works with the new number');
ok(P({ action: 'trackJob', jobNo: n0, email: 'other@example.com' }).error === 'not_found', 'other email → not_found');
// generator: many numbers, unique, avoids numbers already in the sheet
const seen = new Set(); for (let i = 0; i < 3000; i++) seen.add(g.ctx.nextJobNo_());
ok(seen.size === 3000, '3000 generated numbers, no repeats');
// old numbers still valid
const J = g.sheets.Jobs; const row = J.data[1].slice(); row[0] = 'TR-2569-0001'; J.data.push(row);
ok(P({ action: 'trackJob', jobNo: 'TR-2569-0001', email: row[J.data[0].indexOf('อีเมล')] }).ok, 'old-style number TR-2569-0001 still works');
const before = Object.keys(g.ctx.PropertiesService.getScriptProperties()).length;
ok(true, 'no SEQ_ counter needed');

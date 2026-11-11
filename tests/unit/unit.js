const { load } = require('../lib/mock');
const g = load(require('../lib/paths').CODE_GS); const P = g.post; const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
g.ctx.setup();
assert(g.sheets.Users && g.sheets.Jobs && g.sheets._sessions && g.sheets._sessions.hidden, 'setup creates Users, Jobs, hidden _sessions');
assert(P({ action: 'nope' }).error === 'unknown_action', 'unknown action');
assert(P({ action: 'requestCode', email: 'bad' }).error === 'invalid_email', 'invalid email rejected');
let r = P({ action: 'requestCode', email: ' Somchai@Example.com ', lang: 'th' });
assert(r.ok && g.mail.length === 1 && g.mail[0].to === 'somchai@example.com', 'code emailed to normalised address');
assert(/รหัสเข้าสู่ระบบ/.test(g.mail[0].subject), 'Thai email subject');
const code = g.lastCode();
assert(P({ action: 'requestCode', email: 'somchai@example.com' }).error === 'too_soon', 'resend throttled');
assert(P({ action: 'verifyCode', email: 'somchai@example.com', code: '12345' }).error === 'code_invalid', 'malformed code');
const wrong = code === '000000' ? '000001' : '000000';
assert(P({ action: 'verifyCode', email: 'somchai@example.com', code: wrong }).error === 'code_invalid', 'wrong code');
r = P({ action: 'verifyCode', email: 'somchai@example.com', code });
assert(r.ok && /^[0-9a-f]{64}$/.test(r.token) && r.isNew && r.profile.email === 'somchai@example.com', 'verify creates account + session');
const tok = r.token;
assert(P({ action: 'verifyCode', email: 'somchai@example.com', code }).error === 'code_expired', 'code is single use');
assert(!JSON.stringify(g.sheets._sessions.data).includes(tok), 'token not stored in plain text');
assert(!JSON.stringify(g.cache).includes(code), 'code not stored in plain text');
assert(g.sheets.Users.data.length === 2, 'one user row');
r = P({ action: 'updateProfile', token: tok, profile: { name: '=HYPERLINK("x")', line: '@my.line', phone: '081-234-5678', nameSpelling: 'somchai jaidee', langPair: 'th-en' } });
assert(r.ok && r.profile.nameSpelling === 'SOMCHAI JAIDEE', 'profile saved, spelling upper-cased');
assert(P({ action: 'updateProfile', token: tok, profile: { phone: '12' } }).error === 'invalid_phone', 'bad phone rejected');
assert(P({ action: 'updateProfile', token: tok, profile: { line: 'ไทย' } }).error === 'invalid_line', 'bad LINE rejected');
// jobs (as Phase 3 will write them; status as Thai label)
const J = g.sheets.Jobs, head = J.data[0];
const row = o => head.map(h => o[h] === undefined ? '' : o[h]);
J.appendRow(row({ 'เลขที่งาน': 'TR-2569-0001', 'วันที่ส่งงาน': new Date('2026-10-01'), 'สถานะ': 'กำลังแปล', 'อีเมล': 'SOMCHAI@example.com', 'คู่ภาษา': 'th-en', 'ประเภทเอกสาร': 'official', 'จำนวนหน้า': 2 }));
J.appendRow(row({ 'เลขที่งาน': 'TR-2569-0002', 'วันที่ส่งงาน': new Date('2026-10-05'), 'สถานะ': 'ส่งมอบแล้ว', 'อีเมล': 'somchai@example.com', 'ประเภทเอกสาร': 'academic' }));
J.appendRow(row({ 'เลขที่งาน': 'TR-2569-0003', 'วันที่ส่งงาน': new Date('2026-10-06'), 'สถานะ': '', 'อีเมล': 'other@example.com' }));
r = P({ action: 'getAccount', token: tok });
assert(r.ok && r.jobs.length === 2 && r.jobs[0].jobNo === 'TR-2569-0002' && r.jobs[0].status === 'delivered' && r.jobs[1].status === 'inProgress', 'history: own jobs only, newest first, status codes');
assert(r.profile.name === '=HYPERLINK("x")', 'formula-looking text round-trips as text');
assert(P({ action: 'getAccount', token: 'f'.repeat(64) }).error === 'session_expired', 'unknown token rejected');
// second sign-in reuses the account
g.cache.clear();
P({ action: 'requestCode', email: 'somchai@example.com', lang: 'en' });
assert(/sign-in code/.test(g.mail[g.mail.length - 1].subject), 'English email subject');
r = P({ action: 'verifyCode', email: 'somchai@example.com', code: g.lastCode() });
assert(r.ok && !r.isNew && g.sheets.Users.data.length === 2 && r.profile.line === '@my.line', 'returning user, no duplicate');
const tok2 = r.token;
// brute force
g.cache.clear(); P({ action: 'requestCode', email: 'x@example.com' }); const c2 = g.lastCode();
for (let i = 0; i < 5; i++) P({ action: 'verifyCode', email: 'x@example.com', code: c2 === '111111' ? '222222' : '111111' });
assert(P({ action: 'verifyCode', email: 'x@example.com', code: c2 }).error === 'too_many_attempts', 'locked after 5 wrong codes');
// hourly limit
g.cache.clear(); let last;
for (let i = 0; i < 6; i++) { [...g.cache.keys()].filter(k => k.startsWith('code:')).forEach(k => g.cache.delete(k)); last = P({ action: 'requestCode', email: 'y@example.com' }); }
assert(last.error === 'rate_limited', 'max 5 codes per hour');
// logout + delete
assert(P({ action: 'logout', token: tok }).ok && P({ action: 'getAccount', token: tok }).error === 'session_expired', 'logout ends that session');
assert(P({ action: 'getAccount', token: tok2 }).ok, 'other session still valid');
assert(P({ action: 'deleteAccount', token: tok2 }).ok, 'delete account');
assert(g.sheets.Users.data.length === 1 && P({ action: 'getAccount', token: tok2 }).error === 'session_expired', 'user row + sessions removed');
assert(J.data.length === 4, 'jobs kept after account deletion');

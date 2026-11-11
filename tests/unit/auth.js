const { load } = require('../lib/mock');
const g = load(require('../lib/paths').CODE_GS);
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const P = g.post;
g.ctx.setup();
const U = g.sheets.Users;
const H = U.data[0];
ok(['รหัสผ่าน (เข้ารหัส — ห้ามแก้)', 'ตั้งรหัสผ่านเมื่อ', 'อีเมลสำรอง'].every(h => H.includes(h)), 'Users has password + backup email columns');
// existing sheet without them → setup adds them, data kept
U.data[0] = H.slice(0, 11); U.data.push(['old@example.com', 'Old', '', '', '', '', 'th', '', '', '', '']);
g.ctx.setup();
ok(U.data[0].length === 14 && U.data[0][13] === 'อีเมลสำรอง' && U.data[1][0] === 'old@example.com', 'setup adds the 3 new columns on the right, data untouched');
const col = h => U.data[0].indexOf(h);
const rowOf = e => U.data.find(r => r[0] === e);
const signIn = (email, as) => { P({ action: 'requestCode', email }); return P({ action: 'verifyCode', email, code: g.lastCode() }); };
const lastTo = to => g.mail.filter(m => m.to === to).pop();

// ---- first sign-in with an emailed code (unchanged), fresh
let r = signIn('nida@example.com');
ok(r.ok && r.isNew && r.fresh && r.profile.hasPassword === false && r.profile.backupEmail === '', 'first sign-in with an emailed code: new account, no password');
const tok1 = r.token;
ok(P({ action: 'getAccount', token: tok1 }).fresh === true, 'getAccount says the sign-in is fresh');

// ---- password login before one is set: generic error
ok(P({ action: 'login', email: 'nida@example.com', password: 'Secret123' }).error === 'login_invalid', 'no password yet → login_invalid');
ok(P({ action: 'login', email: 'nobody@example.com', password: 'Secret123' }).error === 'login_invalid', 'unknown email → same login_invalid (no account discovery)');

// ---- set a password
ok(P({ action: 'setPassword', token: tok1, password: 'short1' }).error === 'password_weak', 'too short → password_weak');
ok(P({ action: 'setPassword', token: tok1, password: 'abcdefgh' }).error === 'password_weak', 'letters only → password_weak');
ok(P({ action: 'setPassword', token: tok1, password: '12345678' }).error === 'password_weak', 'numbers only → password_weak');
r = P({ action: 'setPassword', token: tok1, password: 'รหัสผ่าน2569' });
ok(r.ok && r.profile.hasPassword, 'Thai letters + numbers accepted; profile.hasPassword');
const stored = rowOf('nida@example.com')[col('รหัสผ่าน (เข้ารหัส — ห้ามแก้)')];
ok(/^v1\$2000\$[0-9a-f]{32}\$[0-9a-f]{64}$/.test(stored) && !stored.includes('2569'), 'sheet stores only a salted hash: ' + stored.slice(0, 20) + '…');
ok(lastTo('nida@example.com').subject.includes('ตั้งรหัสผ่านแล้ว'), 'notice email: password set');

// ---- sign in with the password
r = P({ action: 'login', email: 'NIDA@example.com ', password: 'รหัสผ่าน2569' });
ok(r.ok && r.token && r.fresh === false && r.profile.email === 'nida@example.com', 'login with email + password (case/space-insensitive email)');
const tok2 = r.token;
ok(P({ action: 'login', email: 'nida@example.com', password: 'wrong1234' }).error === 'login_invalid', 'wrong password → login_invalid');
ok(P({ action: 'getAccount', token: tok2 }).fresh === false, 'password sign-in is not fresh');

// ---- change password needs the current one (not fresh)
ok(P({ action: 'setPassword', token: tok2, password: 'NewPass99' }).error === 'password_current', 'change without current password → password_current');
ok(P({ action: 'setPassword', token: tok2, password: 'NewPass99', current: 'nope' }).error === 'password_current', 'wrong current password → password_current');
r = P({ action: 'setPassword', token: tok2, password: 'NewPass99', current: 'รหัสผ่าน2569' });
ok(r.ok, 'change with the current password');
ok(P({ action: 'getAccount', token: tok1 }).error === 'session_expired' && P({ action: 'getAccount', token: tok2 }).ok, 'other devices signed out; this one stays');
ok(lastTo('nida@example.com').subject.includes('เปลี่ยนรหัสผ่านแล้ว'), 'notice email: password changed');

// ---- forgot password: sign in with an emailed code, then set a new one without the old
const tok3 = signIn('nida@example.com').token;
r = P({ action: 'setPassword', token: tok3, password: 'Forgot2024' });
ok(r.ok, 'forgot password: after an emailed code, a new password needs no old one');
ok(P({ action: 'login', email: 'nida@example.com', password: 'Forgot2024' }).ok && P({ action: 'login', email: 'nida@example.com', password: 'NewPass99' }).error === 'login_invalid', 'new password works, old one does not');

// ---- lockout after 5 wrong passwords
g.cache.clear && 0;
for (let i = 0; i < 5; i++) P({ action: 'login', email: 'nida@example.com', password: 'bad' + i + 'xxxxx' });
ok(P({ action: 'login', email: 'nida@example.com', password: 'Forgot2024' }).error === 'password_locked', '5 wrong passwords → pause, even with the right one');
for (const k of [...g.cache.keys()]) if (k.startsWith('pwfail:')) g.cache.delete(k);   // 15 minutes later

// ---- remove password
const tok4 = P({ action: 'login', email: 'nida@example.com', password: 'Forgot2024' }).token;
ok(P({ action: 'removePassword', token: tok4 }).error === 'password_current', 'remove needs the current password');
r = P({ action: 'removePassword', token: tok4, current: 'Forgot2024' });
ok(r.ok && !r.profile.hasPassword && rowOf('nida@example.com')[col('รหัสผ่าน (เข้ารหัส — ห้ามแก้)')] === '', 'password removed; back to emailed codes');
ok(lastTo('nida@example.com').subject.includes('ลบรหัสผ่านแล้ว'), 'notice email: password removed');

// ---- backup email
ok(P({ action: 'requestBackupCode', token: tok4, backupEmail: 'nida@example.com' }).error === 'backup_same', 'backup = main email → backup_same');
signIn('other@example.com');
ok(P({ action: 'requestBackupCode', token: tok4, backupEmail: 'other@example.com' }).error === 'email_in_use', 'another account\'s email → email_in_use');
r = P({ action: 'requestBackupCode', token: tok4, backupEmail: 'Nida.Backup@Gmail.com' });
const bm = lastTo('nida.backup@gmail.com');
ok(r.ok && bm && bm.subject.includes('รหัสยืนยันอีเมลสำรอง'), 'code sent to the backup address');
ok(P({ action: 'verifyBackupCode', token: tok4, code: '000000' === g.lastCode() ? '111111' : '000000' }).error === 'code_invalid', 'wrong code → code_invalid');
r = P({ action: 'verifyBackupCode', token: tok4, code: /(\d{6})/.exec(bm.subject)[1] });
ok(r.ok && r.profile.backupEmail === 'nida.backup@gmail.com', 'backup email confirmed and saved');
ok(lastTo('nida@example.com').subject.includes('เพิ่มอีเมลสำรองแล้ว'), 'notice email to the main address');

// sign in with the backup email → same account
r = signIn('nida.backup@gmail.com');
ok(r.ok && !r.isNew && r.profile.email === 'nida@example.com', 'emailed code to the backup address signs in to the same account');
ok(!U.data.some(x => x[0] === 'nida.backup@gmail.com'), 'no second account created for the backup address');
// backup + password login
const tokB = r.token;
P({ action: 'setPassword', token: tokB, password: 'Backup777' });
ok(P({ action: 'getAccount', token: tok4 }).error === 'session_expired', 'setting a password signs out the other devices');
ok(P({ action: 'login', email: 'nida.backup@gmail.com', password: 'Backup777' }).profile.email === 'nida@example.com', 'password login with the backup email works too');
// someone else cannot take it as their backup
const otherTok = signIn('other@example.com').token;
ok(P({ action: 'requestBackupCode', token: otherTok, backupEmail: 'nida.backup@gmail.com' }).error === 'email_in_use', 'a backup address cannot be reused by another account');
// remove backup
r = P({ action: 'removeBackupEmail', token: tokB });
ok(r.ok && r.profile.backupEmail === '' && lastTo('nida@example.com').subject.includes('ลบอีเมลสำรองแล้ว'), 'remove backup email + notice');

// ---- admin changes the email (lost both inboxes)
const admin = signIn('owner@example.com').token;
// give nida a job so it moves
const c = P({ action: 'createJob', lang: 'th', job: { name: 'นิดา', email: 'nida@example.com', langPair: 'th-en', category: 'other', pages: 1, neededBy: new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10), consent: true, files: [{ name: 'a.pdf', size: 3 }], idFiles: [] } });
P({ action: 'uploadFile', jobNo: c.jobNo, uploadToken: c.uploadToken, kind: 'doc', name: 'a.pdf', data: 'QUJD' });
P({ action: 'finishJob', jobNo: c.jobNo, uploadToken: c.uploadToken });
ok(P({ action: 'adminChangeEmail', token: otherTok, email: 'nida@example.com', newEmail: 'nida.new@example.com' }).error === 'forbidden', 'customers cannot change emails');
ok(P({ action: 'adminChangeEmail', token: admin, email: 'nida@example.com', newEmail: 'other@example.com' }).error === 'email_in_use', 'cannot move onto an existing account');
ok(P({ action: 'adminChangeEmail', token: admin, email: 'owner@example.com', newEmail: 'x@example.com' }).error === 'fixed_admin', 'fixed admin email cannot be changed');
const before = g.mail.length;
r = P({ action: 'adminChangeEmail', token: admin, email: 'nida@example.com', newEmail: 'Nida.New@example.com' });
ok(r.ok && r.users.some(u => u.email === 'nida.new@example.com') && !r.users.some(u => u.email === 'nida@example.com'), 'admin moves the account to the new email');
const J = g.sheets.Jobs, jc = J.data[0].indexOf('อีเมล'), nc = J.data[0].indexOf('บันทึกภายใน');
const jr = J.data.find(x => x[0] === c.jobNo);
ok(jr[jc] === 'nida.new@example.com' && String(jr[nc]).includes('อีเมลลูกค้าเปลี่ยนจาก nida@example.com'), 'jobs move with the account (+ internal note)');
ok(P({ action: 'getAccount', token: tokB }).error === 'session_expired', 'old sessions signed out');
const sent = g.mail.slice(before).map(m => m.to);
ok(sent.includes('nida.new@example.com') && sent.includes('nida@example.com'), 'notice to both the new and the old address');
r = signIn('nida.new@example.com');
ok(!r.isNew && r.profile.name === 'นิดา' || !r.isNew, 'sign in with the new email → existing account');
ok(P({ action: 'getAccount', token: r.token }).jobs.some(j => j.jobNo === c.jobNo), 'job history visible under the new email');
ok(P({ action: 'login', email: 'nida.new@example.com', password: 'Backup777' }).ok, 'password still works after the email change');
// admin list shows backup + password state
const list = P({ action: 'adminUsers', token: admin }).users.find(u => u.email === 'nida.new@example.com');
ok(list.hasPassword === true && list.backupEmail === '', 'admin user list shows password state and backup email');
// profile never leaks the hash
ok(!JSON.stringify(P({ action: 'getAccount', token: r.token })).includes('v1$'), 'password hash never sent to the browser');

// ---- forgot password (separate flow): code → set new password → signed in
{
  const em = 'reset@example.com';
  P({ action: 'requestCode', email: em }); const t0 = P({ action: 'verifyCode', email: em, code: g.lastCode() }).token;
  P({ action: 'setPassword', token: t0, password: 'OldPass111' });
  r = P({ action: 'requestCode', email: em, purpose: 'reset' });
  const rm = g.mail[g.mail.length - 1];
  ok(r.ok && /รหัสตั้งรหัสผ่านใหม่/.test(rm.subject) && /รหัสผ่านเดิมยังใช้ได้/.test(rm.body), 'forgot: reset-code email (own wording)');
  const rc = g.lastCode();
  ok(P({ action: 'verifyCode', email: em, code: rc }).error === 'code_invalid', 'a reset code cannot sign in directly');
  const v = P({ action: 'verifyResetCode', email: em, code: rc });
  ok(v.ok && /^[0-9a-f]{64}$/.test(v.resetToken) && !v.token, 'reset code → permission to set a password, no session yet');
  ok(P({ action: 'getAccount', token: v.resetToken }).error === 'session_expired', 'the reset permission is not a sign-in');
  ok(P({ action: 'resetPassword', resetToken: v.resetToken, password: 'weak' }).error === 'password_weak', 'reset: weak password refused');
  r = P({ action: 'resetPassword', resetToken: v.resetToken, password: 'NewPass222' });
  ok(r.ok && r.token && !r.isNew && r.profile.hasPassword, 'reset: new password set and signed in');
  ok(P({ action: 'getAccount', token: t0 }).error === 'session_expired', 'reset: every other sign-in ended');
  ok(P({ action: 'resetPassword', resetToken: v.resetToken, password: 'Again3333' }).error === 'reset_expired', 'reset permission works once');
  ok(P({ action: 'login', email: em, password: 'NewPass222' }).ok && P({ action: 'login', email: em, password: 'OldPass111' }).error === 'login_invalid', 'new password works, old one does not');
  ok(lastTo(em).subject.includes('เปลี่ยนรหัสผ่านแล้ว'), 'notice email after reset');
  // a login code can't be used on the reset step
  P({ action: 'requestCode', email: em });
  ok(P({ action: 'verifyResetCode', email: em, code: g.lastCode() }).error === 'code_invalid', 'a sign-in code cannot be used to reset');
  // lockout cleared by a reset
  for (let i = 0; i < 5; i++) P({ action: 'login', email: em, password: 'bad' + i + 'xxxxx' });
  ok(P({ action: 'login', email: em, password: 'NewPass222' }).error === 'password_locked', 'locked after 5 misses');
  g.cache.delete('code:' + em);   // a minute later (resend wait)
  P({ action: 'requestCode', email: em, purpose: 'reset' });
  const v2 = P({ action: 'verifyResetCode', email: em, code: g.lastCode() });
  ok(P({ action: 'resetPassword', resetToken: v2.resetToken, password: 'Unlock444' }).ok && P({ action: 'login', email: em, password: 'Unlock444' }).ok, 'reset lifts the pause');
  // unknown email: same replies (no account discovery); finishing the reset creates the account
  r = P({ action: 'requestCode', email: 'ghost@example.com', purpose: 'reset' });
  const v3 = P({ action: 'verifyResetCode', email: 'ghost@example.com', code: g.lastCode() });
  r = P({ action: 'resetPassword', resetToken: v3.resetToken, password: 'Ghost5555' });
  ok(r.ok && r.isNew && r.profile.email === 'ghost@example.com', 'unknown email: reset works like signing up (nothing reveals who has an account)');
}

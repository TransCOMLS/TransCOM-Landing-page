/**
 * TransCOM — Google Apps Script backend (Web App, bound to the Google Sheet)
 *
 * Customer accounts (sign in with a one-time emailed code, no passwords), job
 * submission (Phase 3: createJob → uploadFile → finishJob) and the public status
 * lookup (Phase 4: trackJob). setup() also builds the "Dashboard" and "Glossary" sheets.
 *
 * Setup (once): open the Sheet → Extensions → Apps Script → paste this file →
 * run setup() → Deploy → New deployment → Web app, Execute as "Me",
 * Who has access "Anyone" → copy the /exec URL into js/config.js (appsScriptUrl).
 *
 * Requests: POST, body = JSON text { action, lang, ... } sent as text/plain
 * (avoids a CORS preflight). Replies: { ok: true, ... } or { ok: false, error }.
 */

var CONFIG = {
  serviceName: 'TransCOM',
  // Shown in every email (header picture, buttons and footer)
  siteUrl: 'https://www.prathaitranslation.com',
  contactEmail: 'contact@prathaitranslation.com',
  contactPhone: '080-629-7450',
  lineId: '@transcomls',
  lineUrl: 'https://line.me/R/ti/p/@transcomls',
  codeTtlMin: 10,        // sign-in code valid for (minutes)
  codeMaxAttempts: 5,    // wrong codes allowed before a new code is needed
  codeResendSec: 60,     // wait before another code can be sent to the same email
  codeMaxPerHour: 5,     // codes per email per hour
  sessionDays: 30,       // how long a sign-in lasts
  passwordMin: 8,        // optional password (set after the first sign-in with an emailed code)
  passwordIters: 2000,   // HMAC-SHA256 rounds per password check (slows down guessing)
  passwordMaxFails: 5,   // wrong passwords per email in 15 minutes, then a pause
  passwordFailsPerHour: 300,  // wrong passwords from everyone together, then a pause
  freshMin: 15,          // after signing in with an emailed code, a new password can be set without the old one
  maxJobs: 50,           // jobs returned in the account history
  idRetentionDays: 15,   // civil registration jobs (ID attached): delete data this many
                         // days after the customer confirms the translation
  retentionDays: 90,     // other jobs: delete files and personal data this many days after delivery
  revisionDays: 7,       // customers may ask for corrections within this many days

  // Job submission (Phase 3)
  jobPrefix: 'TR',       // job numbers: TR-<Buddhist year>-0001
  maxFiles: 10,          // per job, documents + ID files together
  maxFileMB: 10,
  allowedExt: ['pdf', 'jpg', 'jpeg', 'png', 'docx'],
  idCategories: ['civil'],   // categories that need an ID card attached
  jobsPerHour: 5,        // jobs per email per hour (stops floods)
  uploadHours: 6,        // how long an unfinished upload can be resumed

  // Status lookup (Phase 4)
  lookupsPerHour: 30,    // per email (stops someone trying job numbers one by one)
  lookupFailsPerHour: 300  // wrong lookups from everyone together, then a pause
};

// Category codes sent by the website (js/config.js categories) → names for the Sheet,
// emails and the Dashboard. Add a line here when a category is added to config.js.
var CATEGORY_NAMES = {
  civil:    ['เอกสารทะเบียนราษฎร', 'Civil registration documents'],
  official: ['เอกสารราชการ', 'Official documents'],
  academic: ['เอกสารการศึกษา', 'Academic documents'],
  business: ['เอกสารธุรกิจและสัญญา', 'Business & contracts'],
  other:    ['เอกสารอื่น ๆ', 'Other documents']
};
function categoryName_(code, th) {
  var n = CATEGORY_NAMES[String(code || '')];
  return n ? n[th ? 0 : 1] : String(code || '-');
}

var SHEETS = { users: 'Users', jobs: 'Jobs', sessions: '_sessions', promotions: 'Promotions', news: 'News',
              dashboard: 'Dashboard', glossary: 'Glossary', discounts: 'Discounts',
              coupons: 'Coupons', couponUses: 'CouponUses' };

// Column headers (Thai, for the owner) and the keys the code uses.
// Columns are found by header text, so the owner may reorder them.
var USER_COLS = [
  ['email', 'อีเมล'],
  ['name', 'ชื่อ–นามสกุล'],
  ['line', 'LINE ID'],
  ['phone', 'โทรศัพท์'],
  ['nameSpelling', 'การสะกดชื่อ (หนังสือเดินทาง)'],
  ['langPair', 'คู่ภาษาที่ใช้บ่อย'],
  ['lang', 'ภาษาเว็บไซต์'],
  ['createdAt', 'สมัครเมื่อ'],
  ['lastLoginAt', 'เข้าสู่ระบบล่าสุด'],
  ['role', 'บทบาท'],                    // Phase 5: ลูกค้า (ว่าง) / พนักงาน / ผู้ดูแลระบบ
  ['customerType', 'ประเภทลูกค้า'],     // Phase 5: ทั่วไป / องค์กร/บริษัท / เอเจนซี่/ตัวแทน / นักเรียน/นักศึกษา
  ['passwordHash', 'รหัสผ่าน (เข้ารหัส — ห้ามแก้)'],   // optional; salted + peppered, never the password itself
  ['passwordSetAt', 'ตั้งรหัสผ่านเมื่อ'],
  ['backupEmail', 'อีเมลสำรอง']          // verified with a code; can receive sign-in codes
];

// Phase 5: roles. Admin sets them on the website (or in the "บทบาท" column).
// The provider email, the script owner and Script Property ADMIN_EMAILS are always admins.
var ROLES = [
  { code: 'customer', th: 'ลูกค้า' },
  { code: 'staff',    th: 'พนักงาน' },
  { code: 'admin',    th: 'ผู้ดูแลระบบ' }
];
var CUSTOMER_TYPES = [
  { code: 'general',   th: 'ทั่วไป',             en: 'General' },
  { code: 'corporate', th: 'องค์กร/บริษัท',      en: 'Corporate' },
  { code: 'agency',    th: 'เอเจนซี่/ตัวแทน',     en: 'Agency' },
  { code: 'student',   th: 'นักเรียน/นักศึกษา',   en: 'Student' }
];
// Discounts sheet (Admin edits on the website). Used on quotes from Phase 6.
var DISCOUNT_COLS = [
  ['kind', 'ชนิด'],                 // type = ประเภทลูกค้า, tier = ขั้นสมาชิกตามยอดใช้จ่าย
  ['code', 'รหัส'],
  ['nameTh', 'ชื่อ (ไทย)'],
  ['nameEn', 'ชื่อ (EN)'],
  ['percent', 'ส่วนลด (%)'],
  ['minSpend', 'ยอดสะสมขั้นต่ำ (บาท)'],
  ['active', 'ใช้งาน']
];
var TRANSLATED_FOLDER = 'งานแปล (ส่งลูกค้า)';

// Phase 3 writes these columns; history reads them.
var JOB_COLS = [
  ['jobNo', 'เลขที่งาน'],
  ['submittedAt', 'วันที่ส่งงาน'],
  ['status', 'สถานะ'],
  ['name', 'ชื่อ–นามสกุล'],
  ['email', 'อีเมล'],
  ['line', 'LINE ID'],
  ['phone', 'โทรศัพท์'],
  ['langPair', 'คู่ภาษา'],
  ['category', 'ประเภทเอกสาร'],
  ['pages', 'จำนวนหน้า'],
  ['neededBy', 'วันที่ต้องการรับงาน'],
  ['certified', 'รับรองคำแปล'],
  ['shipping', 'จัดส่งฉบับจริง'],
  ['address', 'ที่อยู่จัดส่ง'],
  ['nameSpelling', 'การสะกดชื่อ'],
  ['notes', 'หมายเหตุ'],
  ['folder', 'โฟลเดอร์ไฟล์'],
  ['lang', 'ภาษาลูกค้า'],
  ['requiresId', 'แนบบัตร (ทะเบียนราษฎร)'],
  ['confirmedAt', 'ลูกค้ายืนยันความถูกต้องเมื่อ'],
  ['deleteBy', 'กำหนดลบข้อมูล'],
  ['fileCount', 'จำนวนไฟล์'],
  ['deliveredAt', 'ส่งมอบเมื่อ'],
  ['purgedAt', 'ลบข้อมูลแล้วเมื่อ'],
  ['assignee', 'ผู้รับผิดชอบ'],          // Phase 5: staff email
  ['readyAt', 'แปลเสร็จเมื่อ'],          // staff marked the translation ready for checking
  ['cancelRequest', 'คำขอยกเลิก'],       // customer's request, waiting for Admin
  ['internalNotes', 'บันทึกภายใน'],      // staff/admin only — customers never see this
  ['revisionRequest', 'คำขอแก้ไขล่าสุด']  // the customer's latest "please correct" message
];

// Home page content the owner edits in the Sheet (tick "แสดง" to publish).
// Text may use {civilFrom} {minPrice} {expressDays} {normalDays} {certFee}.
var PROMO_COLS = [
  ['active', 'แสดง'],
  ['start', 'เริ่ม'],
  ['end', 'สิ้นสุด'],
  ['tagTh', 'ป้าย (ไทย)'],
  ['tagEn', 'ป้าย (EN)'],
  ['titleTh', 'หัวข้อ (ไทย)'],
  ['titleEn', 'หัวข้อ (EN)'],
  ['textTh', 'รายละเอียด (ไทย)'],
  ['textEn', 'รายละเอียด (EN)'],
  ['cta', 'ปุ่มไปหน้า'],
  ['id', 'รหัสโพสต์']          // set by the system; edits from the dashboard find the row by it
];
var NEWS_COLS = [
  ['active', 'แสดง'],
  ['date', 'วันที่'],
  ['titleTh', 'หัวข้อ (ไทย)'],
  ['titleEn', 'หัวข้อ (EN)'],
  ['textTh', 'รายละเอียด (ไทย)'],
  ['textEn', 'รายละเอียด (EN)'],
  ['image', 'รูปภาพ (ลิงก์)'],     // square picture; a Google Drive share link works too
  ['cta', 'ปุ่มไปหน้า'],
  ['id', 'รหัสโพสต์']
];

// Discount codes (Admin manages them on the website). Applied on quotes from Phase 6;
// checkCoupon_ already validates them. Uses are logged in "CouponUses".
var COUPON_COLS = [
  ['code', 'โค้ด'],
  ['active', 'ใช้งาน'],
  ['kind', 'ชนิดส่วนลด'],          // percent | amount
  ['value', 'มูลค่า'],               // % or THB
  ['maxDiscount', 'ลดสูงสุด (บาท)'], // cap for % codes; 0 = no cap
  ['minSpend', 'ยอดขั้นต่ำ (บาท)'],
  ['start', 'เริ่ม'],
  ['end', 'สิ้นสุด'],
  ['maxUses', 'จำนวนสิทธิ์ทั้งหมด'], // 0 = unlimited (e.g. 100 = first 100 people)
  ['perUser', 'ใช้ได้ต่อบัญชี'],     // 0 = unlimited, 1 = once per account
  ['membersOnly', 'เฉพาะสมาชิก'],
  ['note', 'หมายเหตุ'],
  ['createdAt', 'สร้างเมื่อ']
];
var COUPON_USE_COLS = [
  ['code', 'โค้ด'],
  ['email', 'อีเมล'],
  ['jobNo', 'เลขที่งาน'],
  ['discount', 'ส่วนลด (บาท)'],
  ['at', 'ใช้เมื่อ']
];
var CTA_PAGES = ['services', 'pricing', 'calculator', 'submit', 'track', 'account', 'how', 'faq', 'contact', 'news', 'privacy', 'terms'];

var SESSION_COLS = [
  ['tokenHash', 'tokenHash'],
  ['email', 'email'],
  ['createdAt', 'createdAt'],
  ['expiresAt', 'expiresAt']
];

// Status dropdown in "Jobs" (Thai label in the sheet → code sent to the website)
var STATUSES = [
  { code: 'received',   th: 'ได้รับงานแล้ว',      en: 'Received',   color: '#e8f0fe', text: '#1a4fa0' },
  { code: 'quoted',     th: 'ส่งใบเสนอราคาแล้ว', en: 'Quote sent', color: '#fef7e0', text: '#8a5a00' },
  { code: 'paid',       th: 'ชำระเงินแล้ว',       en: 'Paid',       color: '#e6f4ea', text: '#137333' },
  { code: 'inProgress', th: 'กำลังแปล',          en: 'Translating', color: '#e3f2fd', text: '#01417b' },
  { code: 'review',     th: 'รอลูกค้าตรวจ',       en: 'Ready for your review', color: '#f3e8ff', text: '#6b3fa0' },
  { code: 'delivered',  th: 'ส่งมอบแล้ว',         en: 'Delivered',  color: '#d2f0dc', text: '#0b6b2d' },
  { code: 'cancelled',  th: 'ยกเลิก',            en: 'Cancelled',  color: '#f1f3f4', text: '#566072' }
];

// Language pair codes sent by the website → names for emails
var LANG_PAIR_NAMES = {
  'th-en': ['ไทย → อังกฤษ', 'Thai → English'],
  'en-th': ['อังกฤษ → ไทย', 'English → Thai']
};
function langPairName_(code, th) {
  var n = LANG_PAIR_NAMES[String(code || '')];
  return n ? n[th ? 0 : 1] : String(code || '-');
}

var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/;
var LINE_RE = /^[A-Za-z0-9._\-@]{0,60}$/;

/* ======================================================================
   Web app entry points
   ====================================================================== */

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.confirm) return confirmPage_(p.confirm, p.t);
  return json_({ ok: true, service: CONFIG.serviceName });
}

function doPost(e) {
  var out;
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var action = ACTIONS[req.action];
    out = action ? action(req) : { ok: false, error: 'unknown_action' };
  } catch (err) {
    if (!err.code) console.error(err && err.stack || err);
    out = { ok: false, error: err.code || 'server' };
  }
  return json_(out);
}

var ACTIONS = {
  requestCode: requestCode_,
  verifyCode: verifyCode_,
  getAccount: getAccount_,
  login: login_,
  setPassword: setPassword_,
  removePassword: removePassword_,
  requestBackupCode: requestBackupCode_,
  verifyBackupCode: verifyBackupCode_,
  removeBackupEmail: removeBackupEmail_,
  updateProfile: updateProfile_,
  logout: logout_,
  deleteAccount: deleteAccount_,
  getContent: getContent_,
  createJob: createJob_,
  uploadFile: uploadFile_,
  finishJob: finishJob_,
  trackJob: trackJob_,
  // Phase 5 — customer
  myJob: myJob_,
  jobFile: jobFile_,
  requestCancel: requestCancel_,
  confirmTranslation: confirmTranslation_,
  requestRevision: requestRevision_,
  // Phase 5 — staff (and admin)
  staffJobs: staffJobs_,
  staffJob: staffJob_,
  uploadTranslation: uploadTranslation_,
  deleteTranslation: deleteTranslation_,
  staffUpdate: staffUpdate_,
  // Phase 5 — admin
  adminOverview: adminOverview_,
  adminJobs: adminJobs_,
  adminJob: adminJob_,
  adminUpdateJob: adminUpdateJob_,
  adminUsers: adminUsers_,
  adminSetUser: adminSetUser_,
  adminDiscounts: adminDiscounts_,
  adminSaveDiscounts: adminSaveDiscounts_,
  // visitors, discount codes, posts
  visit: visit_,
  checkCoupon: checkCoupon_,
  adminCoupons: adminCoupons_,
  adminSaveCoupon: adminSaveCoupon_,
  adminDeleteCoupon: adminDeleteCoupon_,
  adminPosts: adminPosts_,
  adminSavePost: adminSavePost_,
  adminDeletePost: adminDeletePost_,
  adminUploadImage: adminUploadImage_,
  adminChangeEmail: adminChangeEmail_
};

/* ======================================================================
   Sign in with an emailed code
   ====================================================================== */

function requestCode_(req) {
  var email = email_(req.email);
  var lang = req.lang === 'en' ? 'en' : 'th';
  var cache = CacheService.getScriptCache();
  var now = Date.now();

  return withLock_(function () {
    var prev = parse_(cache.get('code:' + email));
    if (prev && now - prev.sentAt < CONFIG.codeResendSec * 1000) fail_('too_soon');

    var sent = parseInt(cache.get('sent:' + email) || '0', 10);
    if (sent >= CONFIG.codeMaxPerHour) fail_('rate_limited');

    var code = randomCode_();
    var entry = { h: hash_(code + '|' + email), a: 0, sentAt: now, exp: now + CONFIG.codeTtlMin * 60000 };
    cache.put('code:' + email, JSON.stringify(entry), CONFIG.codeTtlMin * 60);
    cache.put('sent:' + email, String(sent + 1), 3600);

    sendCodeMail_(email, code, lang);
    // Same reply whether or not the email has an account (no account discovery)
    return { ok: true, resendSec: CONFIG.codeResendSec };
  });
}

function verifyCode_(req) {
  var email = email_(req.email);
  var code = String(req.code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) fail_('code_invalid');
  var cache = CacheService.getScriptCache();
  var key = 'code:' + email;

  return withLock_(function () {
    var entry = parse_(cache.get(key));
    var now = Date.now();
    if (!entry || now > entry.exp) fail_('code_expired');
    if (entry.a >= CONFIG.codeMaxAttempts) fail_('too_many_attempts');

    if (hash_(code + '|' + email) !== entry.h) {
      entry.a += 1;
      var left = Math.max(1, Math.floor((entry.exp - now) / 1000));
      cache.put(key, JSON.stringify(entry), left);
      fail_(entry.a >= CONFIG.codeMaxAttempts ? 'too_many_attempts' : 'code_invalid');
    }
    cache.remove(key);

    var users = table_(SHEETS.users, USER_COLS);
    var user = userByLogin_(users, email);   // the account's email, or its verified backup email
    var isNew = !user;
    var stamp = new Date();
    if (isNew) {
      appendRow_(users, { email: email, lang: req.lang === 'en' ? 'en' : 'th', createdAt: stamp, lastLoginAt: stamp });
      user = { email: email, lang: req.lang === 'en' ? 'en' : 'th' };
    } else {
      updateRow_(users, user, { lastLoginAt: stamp });
    }
    var token = createSession_(email_(user.email, true));
    markFresh_(token);
    return { ok: true, token: token, isNew: isNew, fresh: true, profile: profile_(user) };
  });
}

/* ======================================================================
   Account
   ====================================================================== */

function getAccount_(req) {
  var email = auth_(req.token);
  var user = find_(table_(SHEETS.users, USER_COLS), 'email', email);
  if (!user) fail_('session_expired');
  return { ok: true, profile: profile_(user), jobs: jobsFor_(email), fresh: isFresh_(req.token) };
}


function updateProfile_(req) {
  var email = auth_(req.token);
  var p = req.profile || {};
  var changes = {
    name: text_(p.name, 120),
    line: text_(p.line, 60),
    phone: text_(p.phone, 20),
    nameSpelling: text_(p.nameSpelling, 200).toUpperCase(),
    langPair: text_(p.langPair, 20),
    lang: p.lang === 'en' ? 'en' : 'th'
  };
  if (!LINE_RE.test(changes.line)) fail_('invalid_line');
  if (changes.phone) {
    var digits = changes.phone.replace(/\D/g, '');
    if (!/^[+\d][\d\s\-()]*$/.test(changes.phone) || digits.length < 9 || digits.length > 15) fail_('invalid_phone');
  }
  return withLock_(function () {
    var users = table_(SHEETS.users, USER_COLS);
    var user = find_(users, 'email', email);
    if (!user) fail_('session_expired');
    updateRow_(users, user, changes);
    for (var k in changes) user[k] = changes[k];
    return { ok: true, profile: profile_(user) };
  });
}

function logout_(req) {
  var hash = hash_(String(req.token || ''));
  withLock_(function () {
    var sessions = table_(SHEETS.sessions, SESSION_COLS);
    deleteRows_(sessions, function (r) { return r.tokenHash === hash; });
  });
  return { ok: true };
}

// PDPA: the person can delete their account. Jobs stay in "Jobs" for the
// retention period in the privacy policy (needed to finish and invoice work).
function deleteAccount_(req) {
  var email = auth_(req.token);
  if (roleOf_(email) !== 'customer') fail_('forbidden');   // staff/admin: ask an admin
  withLock_(function () {
    var users = table_(SHEETS.users, USER_COLS);
    deleteRows_(users, function (r) { return email_(r.email, true) === email; });
    var sessions = table_(SHEETS.sessions, SESSION_COLS);
    deleteRows_(sessions, function (r) { return r.email === email; });
  });
  return { ok: true };
}

/* ======================================================================
   Optional password and backup email (owner's request 2026-11-06)
   - Everyone signs up with an emailed code. Afterwards they may set a
     password; without one they keep signing in with emailed codes.
   - A verified backup email can receive sign-in codes too, so losing the
     main inbox does not lock the person out. No SMS (it costs per message).
   - If both are lost, an admin changes the account's email (adminChangeEmail).
   ====================================================================== */

// The account for an email: its main email, or a verified backup email
function userByLogin_(users, email) {
  var u = find_(users, 'email', email);
  if (u) return u;
  for (var i = 0; i < users.rows.length; i++) {
    if (users.rows[i].email && email_(users.rows[i].backupEmail, true) === email) return users.rows[i];
  }
  return null;
}

function hex_(bytes) {
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

// Salted, peppered, iterated HMAC-SHA256 ("v1$rounds$salt$hash"). The pepper lives in
// Script Properties, so the Users sheet alone is not enough to test guesses.
function pwHash_(password, salt, rounds) {
  rounds = rounds || CONFIG.passwordIters;
  salt = salt || Utilities.getUuid().replace(/-/g, '');
  var key = Utilities.newBlob(salt + '|' + pepper_()).getBytes();
  var h = Utilities.computeHmacSha256Signature(Utilities.newBlob(String(password)).getBytes(), key);
  for (var i = 1; i < rounds; i++) h = Utilities.computeHmacSha256Signature(h, key);
  return 'v1$' + rounds + '$' + salt + '$' + hex_(h);
}

function pwCheck_(password, stored) {
  var parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'v1') return false;
  var rounds = parseInt(parts[1], 10);
  if (!(rounds > 0 && rounds <= 100000)) return false;
  var a = pwHash_(password, parts[2], rounds), b = String(stored);
  var diff = a.length ^ b.length;
  for (var i = 0; i < a.length && i < b.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function checkNewPassword_(pw, email) {
  pw = String(pw || '');
  if (pw.length < CONFIG.passwordMin || pw.length > 100) fail_('password_weak');
  if (!/\d/.test(pw) || !/[^\d\s]/.test(pw)) fail_('password_weak');     // letters (any language) and numbers
  if (pw.toLowerCase() === String(email).toLowerCase()) fail_('password_weak');
  return pw;
}

// Signed in with an emailed code in the last few minutes (may set a new password without the old one)
function markFresh_(token) {
  CacheService.getScriptCache().put('fresh:' + hash_(token), '1', CONFIG.freshMin * 60);
}
function isFresh_(token) {
  return !!CacheService.getScriptCache().get('fresh:' + hash_(String(token || '')));
}

function pwFailGuard_(email) {
  var cache = CacheService.getScriptCache();
  var fails = parseInt(cache.get('pwfail:' + email) || '0', 10);
  var all = parseInt(cache.get('pwfail:all') || '0', 10);
  if (fails >= CONFIG.passwordMaxFails) fail_('password_locked');
  if (all >= CONFIG.passwordFailsPerHour) fail_('rate_limited');
  return function failed() {
    cache.put('pwfail:' + email, String(fails + 1), 900);
    cache.put('pwfail:all', String(all + 1), 3600);
  };
}

// Sign in with email (main or backup) + password. One generic error for every miss.
function login_(req) {
  var email = email_(req.email);
  var pw = String(req.password || '');
  var failed = pwFailGuard_(email);
  var users = table_(SHEETS.users, USER_COLS);
  var user = userByLogin_(users, email);
  var good = !!(user && user.passwordHash && pw.length <= 100 && pwCheck_(pw, user.passwordHash));
  if (!user || !user.passwordHash) pwHash_(pw || 'x');      // same work either way (no account discovery)
  if (!good) { failed(); fail_('login_invalid'); }
  CacheService.getScriptCache().remove('pwfail:' + email);
  return withLock_(function () {
    var t2 = table_(SHEETS.users, USER_COLS);
    var u = find_(t2, 'email', email_(user.email, true));
    if (!u) fail_('login_invalid');
    updateRow_(t2, u, { lastLoginAt: new Date() });
    return { ok: true, token: createSession_(email_(u.email, true)), isNew: false, fresh: false, profile: profile_(u) };
  });
}

// Set or change the password. With a password already set, the current one is needed
// unless the person signed in with an emailed code in the last few minutes (forgot password).
function setPassword_(req) {
  var email = auth_(req.token);
  var pw = checkNewPassword_(req.password, email);
  var fresh = isFresh_(req.token);
  var failed = pwFailGuard_(email);
  return withLock_(function () {
    var users = table_(SHEETS.users, USER_COLS);
    var user = find_(users, 'email', email);
    if (!user) fail_('session_expired');
    var had = !!user.passwordHash;
    if (had && !fresh && !pwCheck_(String(req.current || ''), user.passwordHash)) { failed(); fail_('password_current'); }
    updateRow_(users, user, { passwordHash: pwHash_(pw), passwordSetAt: new Date() });
    user = find_(table_(SHEETS.users, USER_COLS), 'email', email);
    endOtherSessions_(email, req.token);
    securityMail_(user, had ? 'pwChanged' : 'pwSet');
    return { ok: true, profile: profile_(user) };
  });
}

// Back to emailed codes only
function removePassword_(req) {
  var email = auth_(req.token);
  var fresh = isFresh_(req.token);
  var failed = pwFailGuard_(email);
  return withLock_(function () {
    var users = table_(SHEETS.users, USER_COLS);
    var user = find_(users, 'email', email);
    if (!user) fail_('session_expired');
    if (!user.passwordHash) return { ok: true, profile: profile_(user) };
    if (!fresh && !pwCheck_(String(req.current || ''), user.passwordHash)) { failed(); fail_('password_current'); }
    updateRow_(users, user, { passwordHash: '', passwordSetAt: '' });
    user = find_(table_(SHEETS.users, USER_COLS), 'email', email);
    securityMail_(user, 'pwRemoved');
    return { ok: true, profile: profile_(user) };
  });
}

function endOtherSessions_(email, keepToken) {
  var keep = hash_(String(keepToken || ''));
  deleteRows_(table_(SHEETS.sessions, SESSION_COLS), function (r) { return r.email === email && r.tokenHash !== keep; });
}

// An email that is not free to be someone's backup / new address
function emailTaken_(users, email, exceptUser) {
  return users.rows.some(function (r) {
    if (!r.email || r === exceptUser) return false;
    return email_(r.email, true) === email || email_(r.backupEmail, true) === email;
  });
}

// Step 1: send a code to the new backup email
function requestBackupCode_(req) {
  var email = auth_(req.token);
  var backup = email_(req.backupEmail);
  if (backup === email) fail_('backup_same');
  var lang = req.lang === 'en' ? 'en' : 'th';
  var cache = CacheService.getScriptCache();
  var now = Date.now();
  return withLock_(function () {
    var users = table_(SHEETS.users, USER_COLS);
    var me = find_(users, 'email', email);
    if (!me) fail_('session_expired');
    if (emailTaken_(users, backup, me)) fail_('email_in_use');
    var prev = parse_(cache.get('bcode:' + email));
    if (prev && now - prev.sentAt < CONFIG.codeResendSec * 1000) fail_('too_soon');
    var sent = parseInt(cache.get('sent:' + backup) || '0', 10);
    if (sent >= CONFIG.codeMaxPerHour) fail_('rate_limited');
    var code = randomCode_();
    cache.put('bcode:' + email, JSON.stringify({ h: hash_(code + '|' + backup), b: backup, a: 0, sentAt: now, exp: now + CONFIG.codeTtlMin * 60000 }), CONFIG.codeTtlMin * 60);
    cache.put('sent:' + backup, String(sent + 1), 3600);
    sendCodeMail_(backup, code, lang, 'backup');
    return { ok: true, resendSec: CONFIG.codeResendSec };
  });
}

// Step 2: the code proves the person can read the backup inbox
function verifyBackupCode_(req) {
  var email = auth_(req.token);
  var code = String(req.code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) fail_('code_invalid');
  var cache = CacheService.getScriptCache();
  var key = 'bcode:' + email;
  return withLock_(function () {
    var entry = parse_(cache.get(key));
    var now = Date.now();
    if (!entry || now > entry.exp) fail_('code_expired');
    if (entry.a >= CONFIG.codeMaxAttempts) fail_('too_many_attempts');
    if (hash_(code + '|' + entry.b) !== entry.h) {
      entry.a += 1;
      cache.put(key, JSON.stringify(entry), Math.max(1, Math.floor((entry.exp - now) / 1000)));
      fail_(entry.a >= CONFIG.codeMaxAttempts ? 'too_many_attempts' : 'code_invalid');
    }
    cache.remove(key);
    var users = table_(SHEETS.users, USER_COLS);
    var user = find_(users, 'email', email);
    if (!user) fail_('session_expired');
    if (emailTaken_(users, entry.b, user)) fail_('email_in_use');
    updateRow_(users, user, { backupEmail: entry.b });
    user = find_(table_(SHEETS.users, USER_COLS), 'email', email);
    securityMail_(user, 'backupSet');
    return { ok: true, profile: profile_(user) };
  });
}

function removeBackupEmail_(req) {
  var email = auth_(req.token);
  return withLock_(function () {
    var users = table_(SHEETS.users, USER_COLS);
    var user = find_(users, 'email', email);
    if (!user) fail_('session_expired');
    if (user.backupEmail) {
      updateRow_(users, user, { backupEmail: '' });
      user = find_(table_(SHEETS.users, USER_COLS), 'email', email);
      securityMail_(user, 'backupRemoved');
    }
    return { ok: true, profile: profile_(user) };
  });
}

// Admin: move an account to a new email (the person lost the old inbox).
// Check who they are first (LINE / phone). Jobs and code uses move with the account;
// the person is signed out everywhere and both addresses get a notice.
function adminChangeEmail_(req) {
  var me = need_(req, ['admin']);
  var from = email_(req.email), to = email_(req.newEmail);
  if (from === to) fail_('invalid_email');
  if (bootstrapAdmins_().indexOf(from) > -1) fail_('fixed_admin');
  var moved = [], after = null;
  withLock_(function () {
    var users = table_(SHEETS.users, USER_COLS);
    var u = find_(users, 'email', from);
    if (!u) fail_('not_found');
    if (emailTaken_(users, to, u)) fail_('email_in_use');
    var changes = { email: to };
    if (email_(u.backupEmail, true) === to) changes.backupEmail = '';
    updateRow_(users, u, changes);
    if (ss_().getSheetByName(SHEETS.jobs)) {
      var jobs = table_(SHEETS.jobs, JOB_COLS);
      jobs.rows.forEach(function (r) {
        if (r.jobNo && email_(r.email, true) === from) { updateRow_(jobs, r, { email: to }); moved.push(r); }
      });
    }
    if (ss_().getSheetByName(SHEETS.couponUses)) {
      var uses = table_(SHEETS.couponUses, COUPON_USE_COLS);
      uses.rows.forEach(function (r) { if (email_(r.email, true) === from) updateRow_(uses, r, { email: to }); });
    }
    deleteRows_(table_(SHEETS.sessions, SESSION_COLS), function (r) { return r.email === from; });
    after = find_(table_(SHEETS.users, USER_COLS), 'email', to);
  });
  // note_ takes the lock itself, so it runs after ours is released
  moved.forEach(function (r) { note_(r, me.email, 'อีเมลลูกค้าเปลี่ยนจาก ' + from + ' เป็น ' + to); });
  securityMail_(after, 'emailChanged', to);
  securityMail_(after, 'emailChanged', from);
  return adminUsers_(req);
}

// Short security notices (sent to the account's email unless `to` is given)
function securityMail_(user, kind, to) {
  if (!user) return;
  var th = user.lang !== 'en';
  var email = String(user.email || '');
  var T = {
    pwSet:        ['ตั้งรหัสผ่านแล้ว', 'Password set', 'บัญชีของท่านตั้งรหัสผ่านแล้ว ต่อไปเข้าสู่ระบบด้วยรหัสผ่าน หรือรหัสทางอีเมลก็ได้', 'A password was set on your account. You can now sign in with it, or with an emailed code.'],
    pwChanged:    ['เปลี่ยนรหัสผ่านแล้ว', 'Password changed', 'รหัสผ่านของบัญชีถูกเปลี่ยน และอุปกรณ์อื่นที่เข้าสู่ระบบอยู่ถูกออกจากระบบแล้ว', 'Your password was changed and other devices were signed out.'],
    pwRemoved:    ['ลบรหัสผ่านแล้ว', 'Password removed', 'บัญชีของท่านไม่มีรหัสผ่านแล้ว เข้าสู่ระบบด้วยรหัสทางอีเมลตามเดิม', 'Your account no longer has a password. Sign in with an emailed code.'],
    backupSet:    ['เพิ่มอีเมลสำรองแล้ว', 'Backup email added', 'เพิ่มอีเมลสำรองแล้ว: ' + String(user.backupEmail || '') + ' — ใช้รับรหัสเข้าสู่ระบบได้หากเข้าอีเมลหลักไม่ได้', 'Backup email added: ' + String(user.backupEmail || '') + ' — it can receive sign-in codes if you cannot reach your main inbox.'],
    backupRemoved:['ลบอีเมลสำรองแล้ว', 'Backup email removed', 'อีเมลสำรองถูกลบออกจากบัญชีแล้ว', 'The backup email was removed from your account.'],
    emailChanged: ['อีเมลบัญชีถูกเปลี่ยน', 'Account email changed', 'ผู้ดูแลระบบเปลี่ยนอีเมลของบัญชีเป็น ' + email + ' ตามคำขอ ประวัติงานย้ายไปด้วยแล้ว', 'At your request, our team changed the account email to ' + email + '. Your job history moved with it.']
  }[kind];
  if (!T) return;
  var title = th ? T[0] : T[1], line = th ? T[2] : T[3];
  var small = th ? 'หากท่านไม่ได้ทำรายการนี้ โปรดติดต่อเราทันทีทาง LINE ' + CONFIG.lineId + ' หรือโทร ' + CONFIG.contactPhone
                 : 'If this was not you, contact us now on LINE ' + CONFIG.lineId + ' or call ' + CONFIG.contactPhone + '.';
  try {
    MailApp.sendEmail({
      to: to || email,
      subject: CONFIG.serviceName + ': ' + title,
      body: line + '\n\n' + small + '\n\n— ' + CONFIG.serviceName,
      htmlBody: mailLayout_({ th: th, preheader: line, title: title, intro: [esc_(line)], small: esc_(small) }),
      name: CONFIG.serviceName
    });
  } catch (e) { console.log('securityMail_: ' + e); }
}

function profile_(u) {
  var email = String(u.email || '');
  return {
    email: email,
    role: roleOf_(email, u),
    customerType: typeCode_(u.customerType),
    name: String(u.name || ''),
    line: String(u.line || ''),
    phone: String(u.phone || ''),
    nameSpelling: String(u.nameSpelling || ''),
    langPair: String(u.langPair || ''),
    lang: u.lang === 'en' ? 'en' : 'th',
    hasPassword: !!String(u.passwordHash || ''),
    backupEmail: String(u.backupEmail || '')
  };
}

function jobsFor_(email) {
  if (!ss_().getSheetByName(SHEETS.jobs)) return [];
  var jobs = table_(SHEETS.jobs, JOB_COLS);
  return jobs.rows
    .filter(function (r) { return r.jobNo && r.status && email_(r.email, true) === email; })
    .map(function (r) {
      return {
        jobNo: String(r.jobNo),
        submittedAt: iso_(r.submittedAt),
        status: statusCode_(r.status),
        langPair: String(r.langPair || ''),
        category: String(r.category || ''),
        pages: r.pages === '' || r.pages == null ? null : Number(r.pages),
        neededBy: iso_(r.neededBy),
        deliveredAt: iso_(r.deliveredAt),
        cancelRequested: !!String(r.cancelRequest || '').trim(),
        purged: !!r.purgedAt
      };
    })
    .sort(function (a, b) { return (b.submittedAt || '').localeCompare(a.submittedAt || ''); })
    .slice(0, CONFIG.maxJobs);
}

function statusCode_(label) {
  var v = String(label || '').trim();
  for (var i = 0; i < STATUSES.length; i++) {
    if (STATUSES[i].th === v || STATUSES[i].code === v) return STATUSES[i].code;
  }
  return v ? 'other' : 'received';
}

/* ======================================================================
   Phase 5 — roles and dashboards
   customer: own jobs, delivered files, cancel request
   staff:    jobs assigned to them (no customer contact details), files, upload translation
   admin:    everything, assign staff, statuses, users, discount settings
   Every action checks the role on the server.
   ====================================================================== */

function bootstrapAdmins_() {
  var list = String(PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS') || '').split(/[,\s]+/);
  list.push(providerEmail_());
  try { list.push(Session.getEffectiveUser().getEmail()); } catch (e) { /* not available */ }
  return list.map(function (e) { return String(e || '').trim().toLowerCase(); }).filter(Boolean);
}

function roleCode_(label) {
  var v = String(label || '').trim();
  for (var i = 0; i < ROLES.length; i++) if (ROLES[i].th === v || ROLES[i].code === v) return ROLES[i].code;
  return 'customer';
}
function roleLabel_(code) {
  for (var i = 0; i < ROLES.length; i++) if (ROLES[i].code === code) return ROLES[i].th;
  return '';
}
function typeCode_(label) {
  var v = String(label || '').trim();
  for (var i = 0; i < CUSTOMER_TYPES.length; i++) if (CUSTOMER_TYPES[i].th === v || CUSTOMER_TYPES[i].code === v) return CUSTOMER_TYPES[i].code;
  return 'general';
}
function typeLabel_(code) {
  for (var i = 0; i < CUSTOMER_TYPES.length; i++) if (CUSTOMER_TYPES[i].code === code) return CUSTOMER_TYPES[i].th;
  return CUSTOMER_TYPES[0].th;
}

function roleOf_(email, user) {
  email = String(email || '').toLowerCase();
  if (bootstrapAdmins_().indexOf(email) > -1) return 'admin';
  if (user === undefined) user = find_(table_(SHEETS.users, USER_COLS), 'email', email);
  return user ? roleCode_(user.role) : 'customer';
}

// Signed-in person with one of the given roles → { email, role }
function need_(req, roles) {
  var email = auth_(req.token);
  var role = roleOf_(email);
  if (roles.indexOf(role) === -1) fail_('forbidden');
  return { email: email, role: role };
}

function jobRow_(jobs, jobNo) {
  jobNo = String(jobNo || '').trim().toUpperCase();
  if (!JOBNO_RE.test(jobNo)) fail_('not_found');
  for (var i = 0; i < jobs.rows.length; i++) {
    if (String(jobs.rows[i].jobNo).trim().toUpperCase() === jobNo && String(jobs.rows[i].status || '').trim()) return jobs.rows[i];
  }
  fail_('not_found');
}

function folderOf_(row) {
  var m = /folders\/([\w-]+)/.exec(String(row.folder || ''));
  if (!m || row.purgedAt) return null;
  try { return DriveApp.getFolderById(m[1]); } catch (e) { return null; }
}
function subFolder_(folder, test, create) {
  var it = folder.getFolders();
  while (it.hasNext()) { var f = it.next(); if (test(f.getName())) return f; }
  return create ? folder.createFolder(create) : null;
}
function fileInfo_(f, kind) {
  return { id: f.getId(), name: f.getName(), size: f.getSize(), kind: kind };
}
function filesIn_(folder, kind) {
  var out = [];
  if (!folder) return out;
  var it = folder.getFiles();
  while (it.hasNext()) out.push(fileInfo_(it.next(), kind));
  return out.sort(function (a, b) { return a.name.localeCompare(b.name); });
}
// Files of a job: source documents, ID copies, translations
function jobFiles_(row, kinds) {
  var folder = folderOf_(row);
  if (!folder) return [];
  var out = [];
  if (kinds.indexOf('doc') > -1) out = out.concat(filesIn_(folder, 'doc'));
  if (kinds.indexOf('id') > -1) out = out.concat(filesIn_(subFolder_(folder, function (n) { return n.indexOf('บัตร') === 0; }), 'id'));
  if (kinds.indexOf('translation') > -1) out = out.concat(filesIn_(subFolder_(folder, function (n) { return n === TRANSLATED_FOLDER; }), 'translation'));
  return out;
}

function jobSummary_(r, tz) {
  return {
    jobNo: String(r.jobNo),
    status: statusCode_(r.status),
    category: String(r.category || ''),
    langPair: String(r.langPair || ''),
    pages: r.pages === '' || r.pages == null ? null : Number(r.pages),
    certified: r.certified === true || String(r.certified).toUpperCase() === 'TRUE',
    shipping: r.shipping === true || String(r.shipping).toUpperCase() === 'TRUE',
    requiresId: String(r.requiresId).toUpperCase() === 'TRUE',
    submittedAt: day_(r.submittedAt, tz),
    neededBy: day_(r.neededBy, tz),
    deliveredAt: day_(r.deliveredAt, tz),
    confirmedAt: day_(r.confirmedAt, tz),
    readyAt: day_(r.readyAt, tz),
    cancelRequested: !!String(r.cancelRequest || '').trim(),
    purged: !!r.purgedAt
  };
}

/* ---------- customer ---------- */

function myJob_(req) {
  var me = need_(req, ['customer', 'staff', 'admin']);
  var jobs = table_(SHEETS.jobs, JOB_COLS);
  var r = jobRow_(jobs, req.jobNo);
  if (email_(r.email, true) !== me.email) fail_('not_found');
  var job = jobSummary_(r, ss_().getSpreadsheetTimeZone());
  job.files = job.status === 'delivered' || job.status === 'review' ? jobFiles_(r, ['translation']) : [];
  job.revisionRequest = String(r.revisionRequest || '');
  if (job.status === 'delivered' && !job.confirmedAt && r.deliveredAt) {
    job.revisionUntil = day_(addDays_(new Date(r.deliveredAt), CONFIG.revisionDays), ss_().getSpreadsheetTimeZone());
  }
  return { ok: true, job: job };
}

// Download one file (base64). Customer: own delivered translations. Staff: assigned jobs. Admin: any.
function jobFile_(req) {
  var me = need_(req, ['customer', 'staff', 'admin']);
  var jobs = table_(SHEETS.jobs, JOB_COLS);
  var r = jobRow_(jobs, req.jobNo);
  var kinds;
  if (me.role === 'admin') kinds = ['doc', 'id', 'translation'];
  else if (me.role === 'staff' && email_(r.assignee, true) === me.email) kinds = ['doc', 'id', 'translation'];
  else if (email_(r.email, true) === me.email && ['review', 'delivered'].indexOf(statusCode_(r.status)) > -1) kinds = ['translation'];
  else fail_('not_found');
  var hit = jobFiles_(r, kinds).filter(function (f) { return f.id === String(req.fileId || ''); })[0];
  if (!hit) fail_('not_found');
  var file = DriveApp.getFileById(hit.id);
  return { ok: true, name: hit.name, mime: file.getMimeType(), data: Utilities.base64Encode(file.getBlob().getBytes()) };
}

function requestCancel_(req) {
  var me = need_(req, ['customer', 'staff', 'admin']);
  var reason = text_(req.reason, 500);
  var row = withLock_(function () {
    var jobs = table_(SHEETS.jobs, JOB_COLS);
    var r = jobRow_(jobs, req.jobNo);
    if (email_(r.email, true) !== me.email) fail_('not_found');
    var code = statusCode_(r.status);
    if (['received', 'quoted'].indexOf(code) === -1) fail_('cannot_cancel');   // work has started: contact us
    if (String(r.cancelRequest || '').trim()) return r;
    var tz = ss_().getSpreadsheetTimeZone();
    var note = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm') + ' — ' + (reason || '-');
    updateRow_(jobs, r, { cancelRequest: note });
    r.cancelRequest = note;
    return r;
  });
  try {
    MailApp.sendEmail({
      to: providerEmail_(), replyTo: String(row.email), name: CONFIG.serviceName,
      subject: 'คำขอยกเลิก ' + row.jobNo + ' — ' + row.name,
      htmlBody: mailLayout_({ th: true, title: 'ลูกค้าขอยกเลิกงาน ' + row.jobNo,
        intro: ['เหตุผล: ' + esc_(reason || '-'), 'อนุมัติหรือปฏิเสธได้ในหน้า <b>บัญชีของฉัน → งานทั้งหมด</b> บนเว็บไซต์'],
        button: { label: 'เปิดหน้าจัดการ', url: CONFIG.siteUrl + '/#account' } })
    });
  } catch (e) { console.error('cancel mail ' + row.jobNo + ': ' + e); }
  return { ok: true };
}

// The customer checked the files and confirms they are correct
function confirmTranslation_(req) {
  var me = need_(req, ['customer', 'staff', 'admin']);
  var r = jobRow_(table_(SHEETS.jobs, JOB_COLS), req.jobNo);
  if (email_(r.email, true) !== me.email) fail_('not_found');
  var code = statusCode_(r.status);
  if (code !== 'review' && code !== 'delivered') fail_('not_ready');
  confirm_(r.jobNo);
  return myJob_(req);
}

// The customer asks for corrections: back to "กำลังแปล", the team gets the details
function requestRevision_(req) {
  var me = need_(req, ['customer', 'staff', 'admin']);
  var text = text_(req.text, 1500);
  if (text.length < 5) fail_('revision_text');
  var r = jobRow_(table_(SHEETS.jobs, JOB_COLS), req.jobNo);
  if (email_(r.email, true) !== me.email) fail_('not_found');
  var code = statusCode_(r.status);
  if (code === 'delivered') {
    if (r.confirmedAt) fail_('already_confirmed');
    var since = r.deliveredAt ? (Date.now() - new Date(r.deliveredAt).getTime()) / 864e5 : 0;
    if (since > CONFIG.revisionDays) fail_('revision_closed');
  } else if (code !== 'review') fail_('not_ready');
  var tz = ss_().getSpreadsheetTimeZone();
  var stamp = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
  withLock_(function () {
    var t = table_(SHEETS.jobs, JOB_COLS), row = jobRow_(t, r.jobNo);
    updateRow_(t, row, { revisionRequest: stamp + ' — ' + text, readyAt: '' });
  });
  note_(r, me.email, 'ลูกค้าขอแก้ไข: ' + text);
  setStatus_(r.jobNo, 'inProgress', null);
  try {
    var to = [providerEmail_()];
    if (r.assignee && email_(r.assignee, true) !== providerEmail_().toLowerCase()) to.push(email_(r.assignee, true));
    MailApp.sendEmail({
      to: to.join(','), replyTo: String(r.email), name: CONFIG.serviceName,
      subject: 'ลูกค้าขอแก้ไขงาน ' + r.jobNo,
      htmlBody: mailLayout_({ th: true, status: 'inProgress', title: 'ลูกค้าขอแก้ไขงาน ' + r.jobNo,
        intro: ['รายละเอียดที่ลูกค้าแจ้ง:', '<b>' + esc_(text).replace(/\n/g, '<br>') + '</b>', 'สถานะกลับเป็น "กำลังแปล" แล้ว แก้ไฟล์แล้วอัปโหลดใหม่ จากนั้นเปลี่ยนเป็น "รอลูกค้าตรวจ" อีกครั้ง'],
        button: { label: 'เปิดหน้าจัดการ', url: CONFIG.siteUrl + '/#account' } })
    });
  } catch (e) { console.error('revision mail ' + r.jobNo + ': ' + e); }
  return myJob_(req);
}

/* ---------- staff ---------- */

function staffJobs_(req) {
  var me = need_(req, ['staff', 'admin']);
  var tz = ss_().getSpreadsheetTimeZone();
  var jobs = table_(SHEETS.jobs, JOB_COLS).rows.filter(function (r) {
    return r.jobNo && String(r.status || '').trim() && !r.purgedAt && email_(r.assignee, true) === me.email;
  }).map(function (r) { return jobSummary_(r, tz); });
  jobs.sort(function (a, b) { return (a.neededBy || '9').localeCompare(b.neededBy || '9'); });
  return { ok: true, jobs: jobs };
}

// What a translator needs — never the customer's contact details or address
function staffView_(r, tz) {
  var j = jobSummary_(r, tz);
  j.nameSpelling = String(r.nameSpelling || '');
  j.notes = String(r.notes || '');
  j.internalNotes = String(r.internalNotes || '');
  j.revisionRequest = String(r.revisionRequest || '');
  j.files = jobFiles_(r, ['doc', 'id', 'translation']);
  return j;
}

function staffJob_(req) {
  var me = need_(req, ['staff', 'admin']);
  var r = jobRow_(table_(SHEETS.jobs, JOB_COLS), req.jobNo);
  if (me.role !== 'admin' && email_(r.assignee, true) !== me.email) fail_('not_found');
  return { ok: true, job: staffView_(r, ss_().getSpreadsheetTimeZone()) };
}

function canWork_(me, r) {
  if (me.role !== 'admin' && email_(r.assignee, true) !== me.email) fail_('not_found');
  if (r.purgedAt || ['cancelled'].indexOf(statusCode_(r.status)) > -1) fail_('job_closed');
}

function uploadTranslation_(req) {
  var me = need_(req, ['staff', 'admin']);
  var r = jobRow_(table_(SHEETS.jobs, JOB_COLS), req.jobNo);
  canWork_(me, r);
  var name = safeFileName_(req.name);
  var ext = (name.match(/\.([a-z0-9]+)$/i) || [])[1];
  if (!ext || CONFIG.allowedExt.indexOf(ext.toLowerCase()) === -1) fail_('bad_file');
  var bytes;
  try { bytes = Utilities.base64Decode(String(req.data || '')); } catch (e) { fail_('bad_file'); }
  if (!bytes.length) fail_('bad_file');
  if (bytes.length > CONFIG.maxFileMB * 1048576) fail_('too_large');
  var folder = folderOf_(r);
  if (!folder) fail_('job_closed');
  var out = subFolder_(folder, function (n) { return n === TRANSLATED_FOLDER; }, TRANSLATED_FOLDER);
  var f = out.createFile(Utilities.newBlob(bytes, mimeFor_(ext), name));
  note_(r, me.email, 'อัปโหลดไฟล์งานแปล ' + name);
  return { ok: true, file: fileInfo_(f, 'translation') };
}

function deleteTranslation_(req) {
  var me = need_(req, ['staff', 'admin']);
  var r = jobRow_(table_(SHEETS.jobs, JOB_COLS), req.jobNo);
  canWork_(me, r);
  if (statusCode_(r.status) === 'delivered' && me.role !== 'admin') fail_('job_closed');
  var hit = jobFiles_(r, ['translation']).filter(function (f) { return f.id === String(req.fileId || ''); })[0];
  if (!hit) fail_('not_found');
  DriveApp.getFileById(hit.id).setTrashed(true);
  note_(r, me.email, 'ลบไฟล์งานแปล ' + hit.name);
  return { ok: true };
}

// Append a line to "บันทึกภายใน" (newest first)
function note_(r, by, text) {
  withLock_(function () {
    var jobs = table_(SHEETS.jobs, JOB_COLS);
    var row = jobRow_(jobs, r.jobNo);
    var tz = ss_().getSpreadsheetTimeZone();
    var line = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm') + ' ' + by + ': ' + text_(text, 600);
    var all = (line + '\n' + String(row.internalNotes || '')).slice(0, 20000);
    updateRow_(jobs, row, { internalNotes: all });
    r.internalNotes = all;
  });
}

// Staff: start translating (status → กำลังแปล, customer is emailed), mark ready for checking, add a note
function staffUpdate_(req) {
  var me = need_(req, ['staff', 'admin']);
  var jobs = table_(SHEETS.jobs, JOB_COLS);
  var r = jobRow_(jobs, req.jobNo);
  canWork_(me, r);
  if (req.note) note_(r, me.email, req.note);
  if (req.step === 'start') {
    if (statusCode_(r.status) !== 'inProgress') setStatus_(r.jobNo, 'inProgress', me.email);
  } else if (req.step === 'ready') {
    if (!jobFiles_(r, ['translation']).length) fail_('no_translation');
    withLock_(function () {
      var t = table_(SHEETS.jobs, JOB_COLS), row = jobRow_(t, r.jobNo);
      updateRow_(t, row, { readyAt: new Date() });
    });
    note_(r, me.email, 'แปลเสร็จ รอตรวจ');
    try {
      MailApp.sendEmail({
        to: providerEmail_(), name: CONFIG.serviceName,
        subject: 'แปลเสร็จ รอตรวจ ' + r.jobNo,
        htmlBody: mailLayout_({ th: true, title: 'งาน ' + r.jobNo + ' แปลเสร็จแล้ว',
          intro: [esc_(me.email) + ' อัปโหลดไฟล์งานแปลแล้ว ตรวจแล้วกด "ส่งมอบ" ในหน้าจัดการ'],
          button: { label: 'เปิดหน้าจัดการ', url: CONFIG.siteUrl + '/#account' } })
      });
    } catch (e) { console.error('ready mail ' + r.jobNo + ': ' + e); }
  }
  return { ok: true, job: staffView_(jobRow_(table_(SHEETS.jobs, JOB_COLS), r.jobNo), ss_().getSpreadsheetTimeZone()) };
}

// Change a job's status from the website (same effects as editing the sheet)
function setStatus_(jobNo, code, by) {
  if (!statusLabel_(code)) fail_('invalid_choice');
  var jobs, row;
  withLock_(function () {
    jobs = table_(SHEETS.jobs, JOB_COLS);
    row = jobRow_(jobs, jobNo);
    updateRow_(jobs, row, { status: statusLabel_(code) });
    row.status = statusLabel_(code);
  });
  afterStatus_(jobs, row, code);
  if (by) note_(row, by, 'เปลี่ยนสถานะเป็น ' + statusLabel_(code));
}

/* ---------- admin ---------- */

function adminOverview_(req) {
  need_(req, ['admin']);
  var tz = ss_().getSpreadsheetTimeZone();
  var today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var soon = Utilities.formatDate(addDays_(new Date(), 3), tz, 'yyyy-MM-dd');
  var counts = {}, open = 0, dueSoon = 0, overdue = 0, cancelRequests = 0, ready = 0, unassigned = 0, months = {};
  STATUSES.forEach(function (s) { counts[s.code] = 0; });
  table_(SHEETS.jobs, JOB_COLS).rows.forEach(function (r) {
    if (!r.jobNo || !String(r.status || '').trim()) return;
    var code = statusCode_(r.status);
    counts[code] = (counts[code] || 0) + 1;
    var m = day_(r.submittedAt, tz).slice(0, 7);
    if (m) months[m] = (months[m] || 0) + 1;
    if (code === 'delivered' || code === 'cancelled') return;
    open++;
    var need = day_(r.neededBy, tz);
    if (need && need < today) overdue++;
    else if (need && need <= soon) dueSoon++;
    if (String(r.cancelRequest || '').trim()) cancelRequests++;
    if (r.readyAt) ready++;
    if (!String(r.assignee || '').trim()) unassigned++;
  });
  return { ok: true, counts: counts, open: open, dueSoon: dueSoon, overdue: overdue,
           cancelRequests: cancelRequests, ready: ready, unassigned: unassigned, months: months,
           visits: visitStats_() };
}

function adminJobs_(req) {
  need_(req, ['admin']);
  var tz = ss_().getSpreadsheetTimeZone();
  var q = String(req.q || '').trim().toLowerCase();
  var list = table_(SHEETS.jobs, JOB_COLS).rows.filter(function (r) {
    if (!r.jobNo || !String(r.status || '').trim()) return false;
    if (!q) return true;
    return [r.jobNo, r.name, r.email, r.assignee].some(function (v) { return String(v || '').toLowerCase().indexOf(q) > -1; });
  }).map(function (r) {
    var j = jobSummary_(r, tz);
    j.name = String(r.name || '');
    j.email = String(r.email || '');
    j.assignee = String(r.assignee || '');
    return j;
  });
  list.sort(function (a, b) { return b.jobNo.localeCompare(a.jobNo); });
  return { ok: true, jobs: list.slice(0, 500), staff: staffList_() };
}

function staffList_() {
  var admins = bootstrapAdmins_();
  return table_(SHEETS.users, USER_COLS).rows.filter(function (u) {
    var e = email_(u.email, true);
    return e && (roleCode_(u.role) !== 'customer' || admins.indexOf(e) > -1);
  }).map(function (u) {
    var e = email_(u.email, true);
    return { email: e, name: String(u.name || ''), role: roleOf_(e, u) };
  });
}

function adminJob_(req) {
  need_(req, ['admin']);
  var r = jobRow_(table_(SHEETS.jobs, JOB_COLS), req.jobNo);
  var j = staffView_(r, ss_().getSpreadsheetTimeZone());
  ['name', 'email', 'line', 'phone', 'address', 'assignee', 'cancelRequest', 'folder', 'lang'].forEach(function (k) { j[k] = String(r[k] || ''); });
  var u = find_(table_(SHEETS.users, USER_COLS), 'email', email_(r.email, true));
  j.customerType = u ? typeCode_(u.customerType) : 'general';
  return { ok: true, job: j, staff: staffList_() };
}

function adminUpdateJob_(req) {
  var me = need_(req, ['admin']);
  var jobNo = String(req.jobNo || '').trim().toUpperCase();
  var r = jobRow_(table_(SHEETS.jobs, JOB_COLS), jobNo);
  if (req.assignee !== undefined) {
    var to = String(req.assignee || '').trim().toLowerCase();
    if (to && !staffList_().some(function (s) { return s.email === to; })) fail_('invalid_choice');
    if (to !== email_(r.assignee, true)) {
      withLock_(function () {
        var t = table_(SHEETS.jobs, JOB_COLS), row = jobRow_(t, jobNo);
        updateRow_(t, row, { assignee: to });
      });
      note_(r, me.email, to ? 'มอบหมายให้ ' + to : 'ยกเลิกการมอบหมาย');
      if (to && to !== me.email) {
        try {
          MailApp.sendEmail({
            to: to, name: CONFIG.serviceName, subject: 'งานใหม่ที่มอบหมายให้คุณ ' + jobNo,
            htmlBody: mailLayout_({ th: true, title: 'มีงานแปลมอบหมายให้คุณ', intro: ['เลขที่งาน <b>' + esc_(jobNo) + '</b> · ' +
              esc_(categoryName_(r.category, true)) + ' · ' + esc_(langPairName_(r.langPair, true)) + ' · ต้องการ ' + esc_(dateText_(r.neededBy, true))],
              button: { label: 'เปิดงาน', url: CONFIG.siteUrl + '/#account' } })
          });
        } catch (e) { console.error('assign mail ' + jobNo + ': ' + e); }
      }
    }
  }
  if (req.cancel === 'approve' || req.cancel === 'reject') {
    // Once the customer has the translation to check, the job can't be cancelled (stops getting the work for free)
    if (req.cancel === 'approve' && ['review', 'delivered'].indexOf(statusCode_(r.status)) > -1) fail_('cannot_cancel');
    withLock_(function () {
      var t = table_(SHEETS.jobs, JOB_COLS), row = jobRow_(t, jobNo);
      updateRow_(t, row, { cancelRequest: '' });
    });
    note_(r, me.email, req.cancel === 'approve' ? 'อนุมัติคำขอยกเลิก' : 'ปฏิเสธคำขอยกเลิก');
    if (req.cancel === 'approve') setStatus_(jobNo, 'cancelled', null);
  }
  if (req.status && statusCode_(r.status) !== req.status) setStatus_(jobNo, String(req.status), me.email);
  if (req.note) note_(r, me.email, req.note);
  return adminJob_({ token: req.token, jobNo: jobNo });
}

function adminUsers_(req) {
  need_(req, ['admin']);
  var counts = {};
  table_(SHEETS.jobs, JOB_COLS).rows.forEach(function (r) {
    if (!r.jobNo || !String(r.status || '').trim()) return;
    var e = email_(r.email, true);
    counts[e] = (counts[e] || 0) + 1;
  });
  var tz = ss_().getSpreadsheetTimeZone();
  var users = table_(SHEETS.users, USER_COLS).rows.filter(function (u) { return u.email; }).map(function (u) {
    var e = email_(u.email, true);
    return { email: e, name: String(u.name || ''), phone: String(u.phone || ''), role: roleOf_(e, u),
             backupEmail: String(u.backupEmail || ''), hasPassword: !!String(u.passwordHash || ''),
             customerType: typeCode_(u.customerType), jobs: counts[e] || 0,
             createdAt: day_(u.createdAt, tz), lastLoginAt: day_(u.lastLoginAt, tz),
             fixedAdmin: bootstrapAdmins_().indexOf(e) > -1 };
  });
  users.sort(function (a, b) { return (b.lastLoginAt || '').localeCompare(a.lastLoginAt || ''); });
  return { ok: true, users: users };
}

// Set role / customer type. Adding a staff member who never signed in creates their row.
function adminSetUser_(req) {
  var me = need_(req, ['admin']);
  var email = email_(req.email);
  var changes = {};
  if (req.role !== undefined) {
    var role = String(req.role);
    if (!roleLabel_(role)) fail_('invalid_choice');
    if (email === me.email && role !== 'admin') fail_('cannot_demote_self');
    changes.role = role === 'customer' ? '' : roleLabel_(role);
  }
  if (req.customerType !== undefined) {
    var type = String(req.customerType);
    if (!CUSTOMER_TYPES.some(function (t) { return t.code === type; })) fail_('invalid_choice');
    changes.customerType = typeLabel_(type);
  }
  withLock_(function () {
    var users = table_(SHEETS.users, USER_COLS);
    var u = find_(users, 'email', email);
    if (u) updateRow_(users, u, changes);
    else appendRow_(users, Object.assign({ email: email, lang: 'th', createdAt: new Date() }, changes));
  });
  return adminUsers_(req);
}

function discountRows_() {
  if (!ss_().getSheetByName(SHEETS.discounts)) return [];
  return table_(SHEETS.discounts, DISCOUNT_COLS).rows.filter(function (r) { return r.code; }).map(function (r) {
    return { kind: r.kind === 'tier' ? 'tier' : 'type', code: String(r.code), nameTh: String(r.nameTh || ''), nameEn: String(r.nameEn || ''),
             percent: Math.max(0, Math.min(100, Number(r.percent) || 0)), minSpend: Math.max(0, Number(r.minSpend) || 0), active: active_(r) };
  });
}

function adminDiscounts_(req) {
  need_(req, ['admin']);
  return { ok: true, items: discountRows_() };
}

// Replace the whole Discounts table (type rows for each customer type + any number of tiers)
function adminSaveDiscounts_(req) {
  need_(req, ['admin']);
  var items = (req.items || []).slice(0, 50).map(function (it) {
    var kind = it.kind === 'tier' ? 'tier' : 'type';
    var code = String(it.code || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30);
    if (!code) fail_('invalid_choice');
    if (kind === 'type' && !CUSTOMER_TYPES.some(function (t) { return t.code === code; })) fail_('invalid_choice');
    var pct = Number(it.percent), min = Number(it.minSpend || 0);
    if (!(pct >= 0 && pct <= 100) || !(min >= 0)) fail_('invalid_number');
    return [kind, code, text_(it.nameTh, 60), text_(it.nameEn, 60), Math.round(pct * 100) / 100, Math.round(min), it.active !== false];
  });
  withLock_(function () {
    var sh = ensureSheet_(SHEETS.discounts, DISCOUNT_COLS);
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, DISCOUNT_COLS.length).clearContent();
    if (items.length) sh.getRange(2, 1, items.length, DISCOUNT_COLS.length).setValues(items.map(function (r) { return r.map(safe_); }));
  });
  return adminDiscounts_(req);
}

/* ======================================================================
   Visitor counter (public): one count per browser per day (the website remembers the
   day in tr_visit). Totals live in Script Properties: VISITS_TOTAL and VISITS_<yyyy-MM-dd>.
   ====================================================================== */

function visit_(req) {
  var props = PropertiesService.getScriptProperties();
  var tz = ss_().getSpreadsheetTimeZone();
  var today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var cache = CacheService.getScriptCache();
  if (req.isNew === true) {
    var lock = LockService.getScriptLock();
    if (lock.tryLock(3000)) {
      try {
        props.setProperty('VISITS_TOTAL', String((parseInt(props.getProperty('VISITS_TOTAL') || '0', 10) || 0) + 1));
        props.setProperty('VISITS_' + today, String((parseInt(props.getProperty('VISITS_' + today) || '0', 10) || 0) + 1));
      } finally { lock.releaseLock(); }
      cache.remove('visits');
    }
  }
  var hit = cache.get('visits');
  var total = hit ? parseInt(hit, 10) : (parseInt(props.getProperty('VISITS_TOTAL') || '0', 10) || 0);
  if (!hit) cache.put('visits', String(total), 60);
  return { ok: true, total: total };
}

function visitStats_() {
  var props = PropertiesService.getScriptProperties();
  var tz = ss_().getSpreadsheetTimeZone();
  var days = [];
  for (var i = 6; i >= 0; i--) {
    var d = Utilities.formatDate(addDays_(new Date(), -i), tz, 'yyyy-MM-dd');
    days.push({ day: d, count: parseInt(props.getProperty('VISITS_' + d) || '0', 10) || 0 });
  }
  return { total: parseInt(props.getProperty('VISITS_TOTAL') || '0', 10) || 0, days: days };
}

/* ======================================================================
   Discount codes
   ====================================================================== */

function couponRow_(r, tz, uses) {
  return {
    code: String(r.code || '').toUpperCase(),
    active: active_(r),
    kind: r.kind === 'amount' ? 'amount' : 'percent',
    value: Number(r.value) || 0,
    maxDiscount: Number(r.maxDiscount) || 0,
    minSpend: Number(r.minSpend) || 0,
    start: day_(r.start, tz),
    end: day_(r.end, tz),
    maxUses: Number(r.maxUses) || 0,
    perUser: r.perUser === '' || r.perUser == null ? 1 : Number(r.perUser) || 0,
    membersOnly: active_({ active: r.membersOnly }),
    note: String(r.note || ''),
    used: uses ? (uses[String(r.code || '').toUpperCase()] || 0) : 0
  };
}
function couponUses_() {
  var out = {};
  rowsIfSheet_(SHEETS.couponUses, COUPON_USE_COLS).forEach(function (u) {
    var c = String(u.code || '').toUpperCase();
    if (!c) return;
    out[c] = (out[c] || 0) + 1;
    var k = c + '|' + email_(u.email, true);
    out[k] = (out[k] || 0) + 1;
  });
  return out;
}

// Is this code usable now by this person for this amount? → { ok, discount } or fail_(reason)
function evalCoupon_(code, email, amount) {
  code = String(code || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) fail_('coupon_invalid');
  var tz = ss_().getSpreadsheetTimeZone();
  var today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var uses = couponUses_();
  var row = rowsIfSheet_(SHEETS.coupons, COUPON_COLS).filter(function (r) { return String(r.code || '').toUpperCase() === code; })[0];
  if (!row) fail_('coupon_invalid');
  var c = couponRow_(row, tz, uses);
  if (!c.active) fail_('coupon_invalid');
  if (c.start && today < c.start) fail_('coupon_not_started');
  if (c.end && today > c.end) fail_('coupon_expired');
  if (c.maxUses && c.used >= c.maxUses) fail_('coupon_used_up');
  if ((c.membersOnly || c.perUser) && !email) fail_('coupon_sign_in');
  if (c.perUser && email && (uses[code + '|' + email] || 0) >= c.perUser) fail_('coupon_already_used');
  amount = Number(amount) || 0;
  if (c.minSpend && amount && amount < c.minSpend) fail_('coupon_min_spend');
  var discount = c.kind === 'percent' ? amount * c.value / 100 : c.value;
  if (c.kind === 'percent' && c.maxDiscount) discount = Math.min(discount, c.maxDiscount);
  if (amount) discount = Math.min(discount, amount);
  return { code: code, kind: c.kind, value: c.value, minSpend: c.minSpend, discount: Math.round(discount * 100) / 100 };
}

// Customers (and the quote screen in Phase 6) can check a code
function checkCoupon_(req) {
  var email = '';
  if (req.token) { try { email = auth_(req.token); } catch (e) { email = ''; } }
  var cache = CacheService.getScriptCache(), key = 'cc:' + (email || 'guest');
  var n = parseInt(cache.get(key) || '0', 10);
  if (n >= 30) fail_('rate_limited');                // stops guessing codes
  cache.put(key, String(n + 1), 3600);
  return { ok: true, coupon: evalCoupon_(req.code, email, req.amount) };
}

function adminCoupons_(req) {
  need_(req, ['admin']);
  var tz = ss_().getSpreadsheetTimeZone(), uses = couponUses_();
  var list = rowsIfSheet_(SHEETS.coupons, COUPON_COLS).filter(function (r) { return r.code; })
    .map(function (r) { return couponRow_(r, tz, uses); });
  return { ok: true, coupons: list };
}

function adminSaveCoupon_(req) {
  need_(req, ['admin']);
  var c = req.coupon || {};
  var code = String(c.code || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) fail_('coupon_code');
  var kind = c.kind === 'amount' ? 'amount' : 'percent';
  var value = Number(c.value), maxDiscount = Number(c.maxDiscount || 0), minSpend = Number(c.minSpend || 0);
  var maxUses = parseInt(c.maxUses || 0, 10), perUser = parseInt(c.perUser == null ? 1 : c.perUser, 10);
  if (!(value > 0) || (kind === 'percent' && value > 100) || !(maxDiscount >= 0) || !(minSpend >= 0) || !(maxUses >= 0) || !(perUser >= 0)) fail_('invalid_number');
  var dateOk = function (d) { return !d || /^\d{4}-\d{2}-\d{2}$/.test(d); };
  if (!dateOk(c.start) || !dateOk(c.end) || (c.start && c.end && c.end < c.start)) fail_('invalid_date');
  withLock_(function () {
    var t = table_(SHEETS.coupons, COUPON_COLS);
    var row = t.rows.filter(function (r) { return String(r.code || '').toUpperCase() === code; })[0];
    if (req.isNew && row) fail_('coupon_exists');
    var obj = { code: code, active: c.active !== false, kind: kind, value: value, maxDiscount: maxDiscount, minSpend: minSpend,
                start: c.start || '', end: c.end || '', maxUses: maxUses, perUser: perUser, membersOnly: c.membersOnly === true,
                note: text_(c.note, 200) };
    if (row) updateRow_(t, row, obj);
    else { obj.createdAt = new Date(); appendRow_(t, obj); }
  });
  return adminCoupons_(req);
}

function adminDeleteCoupon_(req) {
  need_(req, ['admin']);
  var code = String(req.code || '').trim().toUpperCase();
  withLock_(function () {
    var t = table_(SHEETS.coupons, COUPON_COLS);
    deleteRows_(t, function (r) { return String(r.code || '').toUpperCase() === code; });
  });
  return adminCoupons_(req);
}

/* ======================================================================
   News & offers from the dashboard (same "News" / "Promotions" sheets the owner can edit)
   ====================================================================== */

function postSheet_(kind) {
  return kind === 'promo' ? { name: SHEETS.promotions, cols: PROMO_COLS } : { name: SHEETS.news, cols: NEWS_COLS };
}

function adminPosts_(req) {
  need_(req, ['admin']);
  var ps = postSheet_(req.kind), tz = ss_().getSpreadsheetTimeZone();
  var t = table_(ps.name, ps.cols);
  var out = [];
  withLock_(function () {
    t = table_(ps.name, ps.cols);
    t.rows.forEach(function (r) {
      if (!r.titleTh && !r.titleEn) return;
      if (!r.id) updateRow_(t, r, { id: Utilities.getUuid().slice(0, 8) });   // give older rows an id
      out.push({
        id: String(r.id), active: active_(r),
        date: day_(r.date, tz), start: day_(r.start, tz), end: day_(r.end, tz),
        tagTh: String(r.tagTh || ''), tagEn: String(r.tagEn || ''),
        titleTh: String(r.titleTh || ''), titleEn: String(r.titleEn || ''),
        textTh: String(r.textTh || ''), textEn: String(r.textEn || ''),
        image: String(r.image || ''), imageUrl: imageUrl_(r.image), cta: String(r.cta || '')
      });
    });
  });
  out.sort(function (a, b) { return (b.date || b.start || '').localeCompare(a.date || a.start || ''); });
  return { ok: true, kind: req.kind === 'promo' ? 'promo' : 'news', posts: out };
}

function adminSavePost_(req) {
  need_(req, ['admin']);
  var ps = postSheet_(req.kind), p = req.post || {};
  var obj = {
    active: p.active === true,
    titleTh: text_(p.titleTh, 200), titleEn: text_(p.titleEn, 200),
    textTh: String(p.textTh || '').replace(/\r/g, '').slice(0, 4000), textEn: String(p.textEn || '').replace(/\r/g, '').slice(0, 4000),
    cta: CTA_PAGES.indexOf(String(p.cta || '')) > -1 ? String(p.cta) : ''
  };
  if (!obj.titleTh && !obj.titleEn) fail_('post_title');
  var dateOk = function (d) { return !d || /^\d{4}-\d{2}-\d{2}$/.test(d); };
  if (req.kind === 'promo') {
    if (!dateOk(p.start) || !dateOk(p.end)) fail_('invalid_date');
    obj.start = p.start || ''; obj.end = p.end || '';
    obj.tagTh = text_(p.tagTh, 40); obj.tagEn = text_(p.tagEn, 40);
  } else {
    if (!dateOk(p.date)) fail_('invalid_date');
    obj.date = p.date || Utilities.formatDate(new Date(), ss_().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
    var img = String(p.image || '').trim();
    if (img && !/^https:\/\/[^\s"'<>]+$/.test(img)) fail_('post_image');
    obj.image = img;
  }
  withLock_(function () {
    var t = table_(ps.name, ps.cols);
    var row = p.id ? t.rows.filter(function (r) { return String(r.id) === String(p.id); })[0] : null;
    if (p.id && !row) fail_('not_found');
    if (row) updateRow_(t, row, obj);
    else { obj.id = Utilities.getUuid().slice(0, 8); appendRow_(t, obj); }
  });
  CacheService.getScriptCache().remove('content');    // the website shows it at once
  return adminPosts_(req);
}

function adminDeletePost_(req) {
  need_(req, ['admin']);
  var ps = postSheet_(req.kind);
  withLock_(function () {
    var t = table_(ps.name, ps.cols);
    deleteRows_(t, function (r) { return String(r.id) === String(req.id || '-'); });
  });
  CacheService.getScriptCache().remove('content');
  return adminPosts_(req);
}

// Post pictures go to a public folder ("anyone with the link can view")
function imagesFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('IMAGES_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* deleted: make a new one */ } }
  var folder = DriveApp.createFolder('TransCOM – รูปข่าวสาร (สาธารณะ)');
  try { folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { /* org policy: file sharing below */ }
  props.setProperty('IMAGES_FOLDER_ID', folder.getId());
  return folder;
}

function adminUploadImage_(req) {
  need_(req, ['admin']);
  var name = safeFileName_(req.name || 'image.jpg');
  var ext = ((name.match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase();
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].indexOf(ext) === -1) fail_('bad_file');
  var bytes;
  try { bytes = Utilities.base64Decode(String(req.data || '')); } catch (e) { fail_('bad_file'); }
  if (!bytes.length) fail_('bad_file');
  if (bytes.length > 5 * 1048576) fail_('too_large');
  var mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
  var file = imagesFolder_().createFile(Utilities.newBlob(bytes, mime, name));
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
  catch (e) { file.setTrashed(true); fail_('sharing_blocked'); }
  var link = 'https://drive.google.com/file/d/' + file.getId() + '/view';
  return { ok: true, image: link, imageUrl: imageUrl_(link) };
}

/* ======================================================================
   Status lookup (Phase 4, public): job number + the email the job was sent with.
   A wrong number, a wrong email, an unfinished upload and a job whose data has been
   deleted all get the same "not_found", so guessing teaches nothing. Only the status
   and dates go back — never names, files or the address.
   ====================================================================== */

var JOBNO_RE = /^[A-Z]{1,5}-\d{4}-\d{4,}$/;

function trackJob_(req) {
  var email = email_(req.email);
  var jobNo = String(req.jobNo || '').trim().toUpperCase();
  if (!JOBNO_RE.test(jobNo)) fail_('invalid_jobNo');

  var cache = CacheService.getScriptCache();
  var mine = parseInt(cache.get('track:' + email) || '0', 10);
  var fails = parseInt(cache.get('trackfail') || '0', 10);
  if (mine >= CONFIG.lookupsPerHour || fails >= CONFIG.lookupFailsPerHour) fail_('rate_limited');
  cache.put('track:' + email, String(mine + 1), 3600);

  var r = null;
  if (ss_().getSheetByName(SHEETS.jobs)) {
    var t = table_(SHEETS.jobs, JOB_COLS);
    for (var i = 0; i < t.rows.length; i++) {
      if (String(t.rows[i].jobNo).trim().toUpperCase() === jobNo) { r = t.rows[i]; break; }
    }
  }
  if (!r || !String(r.status || '').trim() || r.purgedAt || email_(r.email, true) !== email) {
    cache.put('trackfail', String(fails + 1), 3600);
    fail_('not_found');
  }
  var tz = ss_().getSpreadsheetTimeZone();
  return {
    ok: true,
    job: {
      jobNo: jobNo,
      status: statusCode_(r.status),
      category: String(r.category || ''),
      langPair: String(r.langPair || ''),
      pages: r.pages === '' || r.pages == null ? null : Number(r.pages),
      submittedAt: day_(r.submittedAt, tz),
      neededBy: day_(r.neededBy, tz),
      deliveredAt: day_(r.deliveredAt, tz),
      confirmedAt: day_(r.confirmedAt, tz)
    }
  };
}

/* ======================================================================
   Home page content (public)
   ====================================================================== */

function getContent_() {
  var cache = CacheService.getScriptCache();
  var hit = parse_(cache.get('content'));
  if (hit) return hit;
  var tz = ss_().getSpreadsheetTimeZone();
  var out = {
    ok: true,
    promotions: rowsIfSheet_(SHEETS.promotions, PROMO_COLS).filter(active_).map(function (r) {
      return {
        start: day_(r.start, tz), end: day_(r.end, tz),
        tag: { th: str_(r.tagTh), en: str_(r.tagEn) },
        title: { th: str_(r.titleTh), en: str_(r.titleEn) },
        text: { th: longStr_(r.textTh), en: longStr_(r.textEn) },
        cta: CTA_PAGES.indexOf(str_(r.cta)) > -1 ? str_(r.cta) : ''
      };
    }).filter(function (p) { return p.title.th || p.title.en; }),
    news: rowsIfSheet_(SHEETS.news, NEWS_COLS).filter(active_).map(function (r) {
      return {
        date: day_(r.date, tz),
        title: { th: str_(r.titleTh), en: str_(r.titleEn) },
        text: { th: longStr_(r.textTh), en: longStr_(r.textEn) },
        image: imageUrl_(r.image),
        cta: CTA_PAGES.indexOf(str_(r.cta)) > -1 ? str_(r.cta) : ''
      };
    }).filter(function (n) { return n.title.th || n.title.en; })
  };
  cache.put('content', JSON.stringify(out), 300);   // 5 minutes
  return out;
}

function rowsIfSheet_(name, cols) {
  return ss_().getSheetByName(name) ? table_(name, cols).rows : [];
}
function active_(r) { return r.active === true || String(r.active).toUpperCase() === 'TRUE'; }
function str_(v) { return String(v == null ? '' : v).trim().slice(0, 600); }
function longStr_(v) { return String(v == null ? '' : v).trim().slice(0, 4000); }

// https links only; a Google Drive share link becomes a direct image link
// (the file must be shared as "Anyone with the link")
function imageUrl_(v) {
  var s = str_(v);
  var m = /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]{10,})/.exec(s);
  if (m) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w1080';
  return /^https:\/\/[^\s"'<>]+$/.test(s) ? s : '';
}
function day_(v, tz) {
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v)) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  var s = str_(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}

/* ======================================================================
   Jobs (Phase 3): create → upload each file → finish
   Files go one per request (a request can't carry many 10 MB files),
   so an interrupted upload can be resumed with the same job number.
   ====================================================================== */

var LANG_PAIR_RE = /^[a-z]{2}-[a-z]{2}$/;
var CATEGORY_RE = /^[a-z]{2,20}$/;

function createJob_(req) {
  if (req.hp) fail_('rejected');                       // honeypot field filled in by a bot
  var j = req.job || {};
  var email = email_(j.email);
  var name = text_(j.name, 120);
  if (!name) fail_('invalid_name');
  var langPair = text_(j.langPair, 10);
  var category = text_(j.category, 20);
  if (!LANG_PAIR_RE.test(langPair) || !CATEGORY_RE.test(category)) fail_('invalid_choice');
  var pages = j.pages === null || j.pages === undefined || j.pages === '' ? '' : parseInt(j.pages, 10);
  if (pages !== '' && !(pages >= 1 && pages <= 999)) fail_('invalid_pages');
  var tz = ss_().getSpreadsheetTimeZone();
  var today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var neededBy = String(j.neededBy || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(neededBy) || neededBy < today) fail_('invalid_date');
  if (j.consent !== true) fail_('consent');
  var line = text_(j.line, 60), phone = text_(j.phone, 20);
  if (!LINE_RE.test(line)) fail_('invalid_line');
  if (phone) {
    var digits = phone.replace(/\D/g, '');
    if (!/^[+\d][\d\s\-()]*$/.test(phone) || digits.length < 9 || digits.length > 15) fail_('invalid_phone');
  }
  var shipping = j.shipping === true;
  var address = shipping ? text_(j.address, 400) : '';
  if (shipping && address.length < 15) fail_('invalid_address');

  var requiresId = CONFIG.idCategories.indexOf(category) > -1;
  var docs = fileList_(j.files);
  var ids = requiresId ? fileList_(j.idFiles) : [];
  if (!docs.length) fail_('files_required');
  if (requiresId && (!ids.length || j.idConsent !== true)) fail_('id_required');
  if (docs.length + ids.length > CONFIG.maxFiles) fail_('too_many_files');

  var cache = CacheService.getScriptCache();
  var sent = parseInt(cache.get('jobs:' + email) || '0', 10);
  if (sent >= CONFIG.jobsPerHour) fail_('rate_limited');

  var lang = req.lang === 'en' ? 'en' : 'th';
  var token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  return withLock_(function () {
    var jobNo = nextJobNo_();
    var folder = jobsFolder_().createFolder(jobNo + ' – ' + name.slice(0, 40));
    var idFolder = ids.length ? folder.createFolder('บัตร-เอกสารราชการ (ลบภายใน ' + CONFIG.idRetentionDays + ' วันหลังยืนยัน)') : null;
    var jobs = table_(SHEETS.jobs, JOB_COLS);
    appendRow_(jobs, {
      jobNo: jobNo, submittedAt: new Date(), status: '', name: name, email: email, line: line, phone: phone,
      langPair: langPair, category: category, pages: pages, neededBy: neededBy, certified: j.certified === true,
      shipping: shipping, address: address, nameSpelling: text_(j.nameSpelling, 200).toUpperCase(),
      notes: text_(j.notes, 2000), folder: folder.getUrl(), lang: lang, requiresId: requiresId, fileCount: 0
    });
    cache.put('jobs:' + email, String(sent + 1), 3600);
    var up = {
      h: hash_(token), folder: folder.getId(), idFolder: idFolder ? idFolder.getId() : '',
      expect: { doc: docs.map(function (f) { return f.name; }), id: ids.map(function (f) { return f.name; }) },
      got: { doc: [], id: [] }
    };
    cache.put('up:' + jobNo, JSON.stringify(up), CONFIG.uploadHours * 3600);
    return { ok: true, jobNo: jobNo, uploadToken: token };
  });
}

function uploadFile_(req) {
  var jobNo = String(req.jobNo || '');
  var up = upload_(jobNo, req.uploadToken);
  var kind = req.kind === 'id' ? 'id' : 'doc';
  var name = safeFileName_(req.name);
  if (up.expect[kind].indexOf(String(req.name)) === -1) fail_('unexpected_file');
  var ext = (name.match(/\.([a-z0-9]+)$/i) || [])[1];
  if (!ext || CONFIG.allowedExt.indexOf(ext.toLowerCase()) === -1) fail_('bad_file');
  var bytes;
  try { bytes = Utilities.base64Decode(String(req.data || '')); } catch (e) { fail_('bad_file'); }
  if (!bytes.length) fail_('bad_file');
  if (bytes.length > CONFIG.maxFileMB * 1048576) fail_('too_large');

  // Already stored (a retry after a dropped connection): don't save it twice
  if (up.got[kind].indexOf(String(req.name)) === -1) {
    var folder = DriveApp.getFolderById(kind === 'id' ? up.idFolder : up.folder);
    folder.createFile(Utilities.newBlob(bytes, mimeFor_(ext), name));
    up.got[kind].push(String(req.name));
    CacheService.getScriptCache().put('up:' + jobNo, JSON.stringify(up), CONFIG.uploadHours * 3600);
  }
  return { ok: true };
}

function finishJob_(req) {
  var jobNo = String(req.jobNo || '');
  var up = upload_(jobNo, req.uploadToken);
  var missing = ['doc', 'id'].some(function (k) {
    return up.expect[k].some(function (n) { return up.got[k].indexOf(n) === -1; });
  });
  if (missing) fail_('upload_incomplete');

  var row = withLock_(function () {
    var jobs = table_(SHEETS.jobs, JOB_COLS);
    var r = find_(jobs, 'jobNo', jobNo);
    if (!r) fail_('server');
    if (!r.status) {
      updateRow_(jobs, r, { status: statusLabel_('received'), fileCount: up.got.doc.length + up.got.id.length });
      r.status = statusLabel_('received');
    }
    return r;
  });
  CacheService.getScriptCache().remove('up:' + jobNo);
  try { sendNewJobMails_(row); } catch (e) { console.error('mail failed for ' + jobNo + ': ' + e); }
  return { ok: true, jobNo: jobNo };
}

function upload_(jobNo, token) {
  if (!/^[A-Z]+-\d{4}-\d{4,}$/.test(jobNo)) fail_('upload_expired');
  var up = parse_(CacheService.getScriptCache().get('up:' + jobNo));
  if (!up || up.h !== hash_(String(token || ''))) fail_('upload_expired');
  return up;
}

function fileList_(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, CONFIG.maxFiles + 1).map(function (f) {
    return { name: String((f && f.name) || '').slice(0, 200), size: Number(f && f.size) || 0 };
  }).filter(function (f) { return f.name; });
}

function safeFileName_(n) {
  return String(n || 'file').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 150);
}

function mimeFor_(ext) {
  return {
    pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }[ext.toLowerCase()] || 'application/octet-stream';
}

// TR-2569-0001 — running number per Buddhist year, kept in Script Properties
function nextJobNo_() {
  var props = PropertiesService.getScriptProperties();
  var be = Number(Utilities.formatDate(new Date(), ss_().getSpreadsheetTimeZone(), 'yyyy')) + 543;
  var key = 'SEQ_' + be;
  var n = parseInt(props.getProperty(key) || '0', 10) + 1;
  props.setProperty(key, String(n));
  return CONFIG.jobPrefix + '-' + be + '-' + ('000' + n).slice(-Math.max(4, String(n).length));
}

// Private Drive folder for job files (created by setup(), or on first use)
function jobsFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('JOBS_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* deleted: make a new one */ }
  }
  var folder = DriveApp.createFolder('TransCOM – งานแปล');
  props.setProperty('JOBS_FOLDER_ID', folder.getId());
  return folder;
}

function statusLabel_(code) {
  for (var i = 0; i < STATUSES.length; i++) if (STATUSES[i].code === code) return STATUSES[i].th;
  return '';
}

/* ======================================================================
   Emails about jobs
   ====================================================================== */

function providerEmail_() {
  return PropertiesService.getScriptProperties().getProperty('PROVIDER_EMAIL') ||
    Session.getEffectiveUser().getEmail();
}

function yesNo_(v, th) { return v === true || String(v).toUpperCase() === 'TRUE' ? (th ? 'ต้องการ' : 'Yes') : (th ? 'ไม่ต้องการ' : 'No'); }

function dateText_(v, th) {
  if (!v) return '-';
  var d = Object.prototype.toString.call(v) === '[object Date]' ? v : new Date(String(v) + 'T00:00:00');
  if (isNaN(d)) return String(v);
  var tz = ss_().getSpreadsheetTimeZone();
  var y = Number(Utilities.formatDate(d, tz, 'yyyy'));
  return Utilities.formatDate(d, tz, 'd/M/') + (th ? y + 543 : y);
}

function esc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/* ---------- Branded email layout ----------
   Table-based HTML with inline styles (works in Gmail, Outlook, Apple Mail and phones).
   o = { th, preheader, title, status (code), steps (code), intro: [html], rows: [[label, text]],
         button: { label, url }, after: [html], small: html }                                   */
var MAIL_STEPS = ['received', 'quoted', 'paid', 'inProgress', 'review', 'delivered'];

function mailLayout_(o) {
  var th = o.th !== false, F = 'Sarabun,Tahoma,Arial,sans-serif';
  var st = o.status ? STATUSES.filter(function (x) { return x.code === o.status; })[0] : null;
  var h = '';
  // hidden preview text (the line shown next to the subject in the inbox)
  if (o.preheader) h += '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">' + esc_(o.preheader) + '</div>';
  h += '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef3f9;padding:24px 12px">' +
    '<tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;border-collapse:separate">';
  // header picture (navy fallback colour when images are off)
  h += '<tr><td style="background:#01417b;border-radius:16px 16px 0 0;overflow:hidden;line-height:0">' +
    '<a href="' + esc_(CONFIG.siteUrl) + '"><img src="' + esc_(CONFIG.siteUrl) + '/img/email/header.jpg" width="600" alt="' +
    esc_(CONFIG.serviceName) + ' — ' + (th ? 'บริการแปลเอกสาร' : 'Document translation') +
    '" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:16px 16px 0 0;color:#ffffff;font:700 22px ' + F + '"></a></td></tr>';
  // card
  h += '<tr><td style="background:#ffffff;padding:28px 28px 8px;font-family:' + F + ';font-size:15px;line-height:1.65;color:#1d2433">';
  if (st) h += '<span style="display:inline-block;padding:4px 14px;border-radius:999px;background:' + st.color + ';color:' + st.text +
    ';font-size:13px;font-weight:700;margin-bottom:10px">' + esc_(th ? st.th : st.en) + '</span>';
  h += '<h1 style="margin:0 0 14px;font-size:22px;line-height:1.35;color:#01417b;font-family:' + F + '">' + esc_(o.title) + '</h1>';
  (o.intro || []).forEach(function (p) { h += '<p style="margin:0 0 12px">' + p + '</p>'; });
  if (o.steps) h += mailSteps_(o.steps, th);
  if (o.rows && o.rows.length) {
    h += '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;border:1px solid #d9dee7;border-radius:12px;border-collapse:separate;overflow:hidden">';
    o.rows.forEach(function (r, i) {
      var bg = i % 2 ? '#ffffff' : '#f6f8fb';
      h += '<tr><td style="background:' + bg + ';padding:9px 14px;width:42%;color:#566072;font-size:14px;vertical-align:top;font-family:' + F + '">' + esc_(r[0]) +
        '</td><td style="background:' + bg + ';padding:9px 14px;font-weight:600;font-size:14px;vertical-align:top;word-break:break-word;font-family:' + F + '">' +
        (r[2] ? r[1] : esc_(r[1])) + '</td></tr>';
    });
    h += '</table>';
  }
  if (o.button && o.button.url) {
    h += '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 8px"><tr>' +
      '<td style="background:#01417b;border-radius:999px"><a href="' + esc_(o.button.url) + '" style="display:inline-block;padding:13px 30px;' +
      'color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;font-family:' + F + '">' + esc_(o.button.label) + ' →</a></td></tr></table>';
  }
  (o.after || []).forEach(function (p) { h += '<p style="margin:12px 0 0">' + p + '</p>'; });
  if (o.small) h += '<p style="margin:16px 0 0;font-size:13px;color:#566072">' + o.small + '</p>';
  h += '<p style="margin:22px 0 20px;color:#566072">' + (th ? 'ขอบคุณที่ใช้บริการ<br>ทีมงาน ' : 'Thank you,<br>The ') + esc_(CONFIG.serviceName) + (th ? '' : ' team') + '</p></td></tr>';
  // footer
  var link = 'color:#ffffff;text-decoration:none;font-weight:600';
  h += '<tr><td style="background:#0f1b2e;border-radius:0 0 16px 16px;padding:20px 28px;font-family:' + F + ';font-size:13px;line-height:1.8;color:#b8c4d6">' +
    '<span style="color:#ffffff;font-weight:700;font-size:15px">' + esc_(CONFIG.serviceName) + '</span> · ' + (th ? 'บริการแปลเอกสาร ไทย ⇄ อังกฤษ' : 'Thai ⇄ English document translation') + '<br>' +
    '☎ <a href="tel:' + esc_(CONFIG.contactPhone.replace(/-/g, '')) + '" style="' + link + '">' + esc_(CONFIG.contactPhone) + '</a> &nbsp;·&nbsp; ' +
    'LINE <a href="' + esc_(CONFIG.lineUrl) + '" style="' + link + '">' + esc_(CONFIG.lineId) + '</a> &nbsp;·&nbsp; ' +
    '<a href="mailto:' + esc_(CONFIG.contactEmail) + '" style="' + link + '">' + esc_(CONFIG.contactEmail) + '</a><br>' +
    '<a href="' + esc_(CONFIG.siteUrl) + '" style="' + link + '">' + esc_(CONFIG.siteUrl.replace(/^https:\/\//, '')) + '</a> &nbsp;·&nbsp; ' +
    (th ? 'ทุกวัน 09:00–17:00 น.' : 'Daily 9:00–17:00 (GMT+7)') + '<br>' +
    '<span style="color:#7f8ba0;font-size:12px">' + (th ? 'อีเมลฉบับนี้ส่งจากระบบอัตโนมัติ หากมีคำถาม ตอบกลับอีเมลนี้ได้เลย'
      : 'This email was sent automatically. Just reply if you have any questions.') + '</span></td></tr>';
  h += '</table></td></tr></table>';
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:#eef3f9">' + h + '</body></html>';
}

// Five-step progress row: done ✓ · current (highlighted) · still to come
function mailSteps_(code, th) {
  var at = MAIL_STEPS.indexOf(code);
  if (at < 0) return '';
  var F = 'Sarabun,Tahoma,Arial,sans-serif';
  var cells = MAIL_STEPS.map(function (c, i) {
    var st = STATUSES.filter(function (x) { return x.code === c; })[0];
    var done = i < at || (i === at && c === 'delivered'), cur = i === at;
    var dot = done ? '#0b6b2d' : cur ? '#006192' : '#ffffff';
    var ring = done ? '#0b6b2d' : cur ? '#006192' : '#b9c1ce';
    var mark = done ? '✓' : String(i + 1);
    return '<td align="center" valign="top" style="width:' + Math.floor(100 / MAIL_STEPS.length) + '%;padding:0 2px;font-family:' + F + '">' +
      '<div style="width:30px;height:30px;line-height:30px;border-radius:50%;margin:0 auto;background:' + dot + ';border:2px solid ' + ring +
      ';color:' + (done || cur ? '#ffffff' : '#7f8ba0') + ';font-weight:700;font-size:14px">' + mark + '</div>' +
      '<div style="margin-top:6px;font-size:12px;line-height:1.3;color:' + (cur ? '#01417b' : done ? '#1d2433' : '#7f8ba0') + ';font-weight:' + (cur ? 700 : 400) + '">' +
      esc_(th ? st.th : st.en) + '</div></td>';
  }).join('');
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 6px;background:#f6f8fb;border-radius:12px;padding:14px 6px"><tr>' + cells + '</tr></table>';
}

function trackUrl_() { return CONFIG.siteUrl + '/#track'; }
// The job's page in My account (the customer signs in with the same email, then it opens)
function jobUrl_(jobNo) { return CONFIG.siteUrl + '/?job=' + encodeURIComponent(jobNo) + '#account'; }

function sendNewJobMails_(r) {
  var th = r.lang !== 'en';
  var summaryTh = [
    ['เลขที่งาน', r.jobNo], ['ประเภทเอกสาร', categoryName_(r.category, true)], ['คู่ภาษา', langPairName_(r.langPair, true)],
    ['จำนวนหน้า (โดยประมาณ)', r.pages || '-'], ['วันที่ต้องการรับงาน', dateText_(r.neededBy, true)],
    ['รับรองคำแปล', yesNo_(r.certified, true)], ['รับฉบับจริงทางไปรษณีย์', yesNo_(r.shipping, true)]
  ];
  var summaryEn = [
    ['Job number', r.jobNo], ['Document category', categoryName_(r.category, false)], ['Language pair', langPairName_(r.langPair, false)],
    ['Pages (approx.)', r.pages || '-'], ['Needed by', dateText_(r.neededBy, false)],
    ['Certified translation', yesNo_(r.certified, false)], ['Paper copy by post', yesNo_(r.shipping, false)]
  ];

  // 1) Customer receipt
  MailApp.sendEmail({
    to: String(r.email),
    subject: th ? 'ได้รับงานแปลแล้ว เลขที่งาน ' + r.jobNo + ' — ' + CONFIG.serviceName
                : 'We have received your job ' + r.jobNo + ' — ' + CONFIG.serviceName,
    htmlBody: mailLayout_(th ? {
      th: true, status: 'received', steps: 'received',
      preheader: 'เลขที่งาน ' + r.jobNo + ' — เราจะตรวจสอบเอกสารและส่งใบเสนอราคาให้ทางอีเมลนี้',
      title: 'ได้รับงานแปลของท่านแล้ว',
      intro: ['เรียนคุณ' + esc_(r.name),
        'ขอบคุณที่ใช้บริการ เราได้รับเอกสารของท่านเรียบร้อยแล้ว ทีมงานจะตรวจสอบเอกสารและส่ง<b>ใบเสนอราคา</b>ให้ทางอีเมลนี้'],
      rows: summaryTh,
      button: { label: 'ติดตามสถานะงาน', url: trackUrl_() },
      small: 'ใช้เลขที่งาน <b>' + esc_(r.jobNo) + '</b> และอีเมลนี้ในหน้าติดตามงาน'
    } : {
      th: false, status: 'received', steps: 'received',
      preheader: 'Job ' + r.jobNo + ' — we will check your documents and email you a quote.',
      title: 'Your job has been received',
      intro: ['Dear ' + esc_(r.name) + ',',
        'Thank you. We have received your documents and will email you a <b>quote</b> after checking them.'],
      rows: summaryEn,
      button: { label: 'Track your job', url: trackUrl_() },
      small: 'Use job number <b>' + esc_(r.jobNo) + '</b> and this email on the tracking page.'
    }),
    name: CONFIG.serviceName,
    replyTo: providerEmail_()
  });

  // 2) Notice to the provider, with everything needed to quote
  var all = summaryTh.concat([
    ['ชื่อ', r.name], ['อีเมล', r.email], ['LINE ID', r.line || '-'], ['โทรศัพท์', r.phone || '-'],
    ['การสะกดชื่อ', r.nameSpelling || '-'], ['ที่อยู่จัดส่ง', r.address || '-'], ['หมายเหตุ', r.notes || '-'],
    ['แนบบัตร (ทะเบียนราษฎร)', yesNo_(r.requiresId, true)],
    ['ชีต Jobs', '<a href="' + esc_(ss_().getUrl()) + '" style="color:#006192">เปิดชีต Jobs</a>', true]
  ]);
  MailApp.sendEmail({
    to: providerEmail_(),
    subject: 'งานใหม่ ' + r.jobNo + ' — ' + r.name,
    htmlBody: mailLayout_({
      th: true, status: 'received',
      preheader: r.name + ' · ' + categoryName_(r.category, true) + ' · ต้องการ ' + dateText_(r.neededBy, true),
      title: 'มีงานแปลใหม่ ' + r.jobNo,
      intro: ['ลูกค้าส่งงานใหม่จากเว็บไซต์ ตรวจไฟล์แล้วส่งใบเสนอราคา และเปลี่ยนสถานะในชีต Jobs'],
      rows: all,
      button: { label: 'เปิดโฟลเดอร์ไฟล์', url: r.folder }
    }),
    name: CONFIG.serviceName,
    replyTo: String(r.email)
  });
}

// Installable "On edit" trigger (created by setup): email the customer when the status changes
function onJobEdit(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet();
  if (sh.getName() !== SHEETS.jobs) return;
  var statusCol = colIndex_(sh, 'สถานะ');
  var first = e.range.getColumn(), last = first + e.range.getNumColumns() - 1;
  if (!statusCol || statusCol < first || statusCol > last) return;
  var jobs = table_(SHEETS.jobs, JOB_COLS);
  for (var r = e.range.getRow(); r < e.range.getRow() + e.range.getNumRows(); r++) {
    if (r < 2) continue;
    var row = jobs.rows[r - 2];
    if (!row || !row.jobNo || row.purgedAt) continue;
    if (e.range.getNumRows() === 1 && e.oldValue === row.status) continue;
    afterStatus_(jobs, row, statusCode_(row.status));
  }
}

// Side effects of a new status (sheet edit or website): delivery dates, then the customer email
function afterStatus_(jobs, row, code) {
  // Paid or further on: a cancel request still waiting can't be approved any more (closed automatically)
  if (['paid', 'inProgress', 'review', 'delivered'].indexOf(code) > -1 && String(row.cancelRequest || '').trim()) {
    updateRow_(jobs, row, { cancelRequest: '' });
    try { note_(row, 'system', 'ปิดคำขอยกเลิกอัตโนมัติ (งานถึงขั้น ' + statusLabel_(code) + ' แล้ว)'); } catch (e) { /* note only */ }
  }
  if (code === 'delivered') {
    var changes = { deliveredAt: new Date() };
    if (!row.deleteBy) changes.deleteBy = addDays_(new Date(), CONFIG.retentionDays);
    updateRow_(jobs, row, changes);
    for (var k in changes) row[k] = changes[k];
  }
  try { sendStatusMail_(row, code); } catch (err) { console.error('status mail ' + row.jobNo + ': ' + err); }
}

function sendStatusMail_(r, code) {
  var th = r.lang !== 'en';
  var text = {
    quoted:     ['ผู้ให้บริการส่งใบเสนอราคาให้ท่านแล้ว กรุณาตรวจสอบอีเมลที่ได้รับ', 'We have sent you a quote. Please check your email.'],
    paid:       ['ได้รับการชำระเงินแล้ว เราจะเริ่มแปลเอกสารของท่าน', 'Payment received. We will start translating your documents.'],
    inProgress: ['เอกสารของท่านอยู่ระหว่างการแปลและตรวจทาน', 'Your documents are being translated and reviewed.'],
    review:     ['งานแปลพร้อมให้ท่านตรวจแล้ว กรุณาเปิดดูไฟล์บนเว็บไซต์ แล้วกดยืนยันว่าถูกต้อง หรือแจ้งจุดที่ต้องการแก้ไข',
                 'Your translation is ready for you to check. Please open the files on our website, then confirm it is correct or tell us what to change.'],
    delivered:  ['ส่งมอบงานแปลแล้ว ดาวน์โหลดไฟล์ได้ที่หน้างานบนเว็บไซต์ หากพบข้อผิดพลาด แจ้งได้ภายใน ' + CONFIG.revisionDays + ' วัน',
                 'Your translation has been delivered. Download the files from the job page on our website — you can ask for corrections within ' + CONFIG.revisionDays + ' days.'],
    cancelled:  ['งานนี้ถูกยกเลิกแล้ว หากมีข้อสงสัย กรุณาตอบกลับอีเมลนี้', 'This job has been cancelled. Reply to this email if you have any questions.']
  }[code];
  if (!text || !r.email) return;
  var st = STATUSES.filter(function (x) { return x.code === code; })[0];
  var o = {
    th: th, status: code, steps: code === 'cancelled' ? '' : code,
    preheader: (th ? 'เลขที่งาน ' : 'Job ') + r.jobNo + ' — ' + (th ? text[0] : text[1]),
    title: (th ? 'งาน ' : 'Job ') + r.jobNo + (th ? ': ' + st.th : ': ' + st.en),
    intro: [th ? 'เรียนคุณ' + esc_(r.name) : 'Dear ' + esc_(r.name) + ',', esc_(th ? text[0] : text[1])],
    button: { label: th ? 'ติดตามสถานะงาน' : 'Track your job', url: trackUrl_() }
  };
  var civil = String(r.requiresId).toUpperCase() === 'TRUE';
  var idNote = civil ? (th ? ' เมื่อยืนยันแล้ว ข้อมูลและไฟล์ทั้งหมดของงานนี้ รวมถึงสำเนาบัตร จะถูกลบภายใน ' + CONFIG.idRetentionDays + ' วัน'
                           : ' Once you confirm, all data and files for this job, including the ID copy, are deleted within ' + CONFIG.idRetentionDays + ' days.') : '';
  // Review and delivery link to the job page: the customer looks at the files before confirming
  if (code === 'review') {
    o.button = { label: th ? 'ดูและตรวจงานแปล' : 'View and check the translation', url: jobUrl_(r.jobNo) };
    o.small = (th ? 'เข้าสู่ระบบด้วยอีเมลนี้ (ไม่ต้องใช้รหัสผ่าน) แล้วระบบจะเปิดหน้างานให้' : 'Sign in with this email (no password needed) and the job page opens.') + idNote;
  }
  if (code === 'delivered') {
    o.button = { label: th ? 'ดูและดาวน์โหลดงานแปล' : 'View and download the translation', url: jobUrl_(r.jobNo) };
    if (r.confirmedAt) {
      o.intro[1] = esc_(th ? 'ขอบคุณที่ยืนยันความถูกต้อง งานนี้เสร็จสมบูรณ์แล้ว ดาวน์โหลดไฟล์งานแปลได้ที่หน้างานบนเว็บไซต์'
                           : 'Thank you for confirming. This job is complete — you can download the translated files from the job page.');
    } else {
      o.small = (th ? 'ตรวจงานแปลแล้ว กดยืนยันความถูกต้องหรือแจ้งแก้ไขได้ที่หน้างาน' : 'After checking, confirm the translation or ask for corrections on the job page.') + idNote;
    }
  }
  if (code === 'cancelled') o.button = { label: th ? 'ติดต่อเรา' : 'Contact us', url: CONFIG.siteUrl + '/#contact' };
  MailApp.sendEmail({
    to: String(r.email),
    subject: (th ? 'สถานะงาน ' : 'Job ') + r.jobNo + ': ' + (th ? st.th : st.en) + ' — ' + CONFIG.serviceName,
    htmlBody: mailLayout_(o),
    name: CONFIG.serviceName,
    replyTo: providerEmail_()
  });
}

/* ======================================================================
   "The translation is correct" link (from the delivery email)
   ====================================================================== */

function confirmToken_(jobNo) { return hash_(jobNo + '|confirm').slice(0, 32); }

function confirmUrl_(jobNo) {
  var base = ScriptApp.getService().getUrl();
  return base ? base + '?confirm=' + encodeURIComponent(jobNo) + '&t=' + confirmToken_(jobNo) : '';
}

// The customer confirms the translation is correct (job page, or the link in older emails).
// From "รอลูกค้าตรวจ" this also delivers the job. Civil jobs: delete-by moves to idRetentionDays.
function confirm_(jobNo) {
  var row = withLock_(function () {
    var jobs = table_(SHEETS.jobs, JOB_COLS);
    var r = find_(jobs, 'jobNo', jobNo);
    if (!r) return null;
    if (!r.confirmedAt) {
      var changes = { confirmedAt: new Date(), revisionRequest: '' };
      if (String(r.requiresId).toUpperCase() === 'TRUE') {
        var due = addDays_(new Date(), CONFIG.idRetentionDays);
        if (!r.deleteBy || new Date(r.deleteBy) > due) changes.deleteBy = due;
      }
      updateRow_(jobs, r, changes);
    }
    return r;
  });
  if (row && statusCode_(row.status) === 'review') setStatus_(row.jobNo, 'delivered', null);
  return row;
}

function confirmPage_(jobNo, token) {
  jobNo = String(jobNo || '');
  var ok = token && String(token) === confirmToken_(jobNo);
  var msg;
  if (ok && confirm_(jobNo)) msg = 'ขอบคุณที่ยืนยัน งาน ' + jobNo + ' เรียบร้อยแล้ว<br>Thank you — job ' + jobNo + ' is confirmed.';
  if (!msg) msg = 'ลิงก์ไม่ถูกต้องหรือหมดอายุ<br>This link is not valid.';
  var good = msg.indexOf('ขอบคุณ') === 0;
  return HtmlService.createHtmlOutput(
    '<div style="font-family:Sarabun,Tahoma,Arial,sans-serif;max-width:520px;margin:40px auto;border-radius:16px;overflow:hidden;' +
    'box-shadow:0 12px 28px rgba(16,24,40,.12);border:1px solid #d9dee7;text-align:center;color:#1d2433;font-size:17px;line-height:1.7">' +
    '<img src="' + esc_(CONFIG.siteUrl) + '/img/email/header.jpg" alt="' + esc_(CONFIG.serviceName) + '" style="display:block;width:100%;height:auto;background:#01417b">' +
    '<div style="padding:28px 24px 30px"><div style="font-size:44px;line-height:1;color:' + (good ? '#0b6b2d' : '#b42318') + '">' + (good ? '✓' : '!') + '</div>' +
    '<p style="margin:12px 0 18px">' + msg.split('<br>').map(esc_).join('<br>') + '</p>' +
    '<a href="' + esc_(CONFIG.siteUrl) + '" target="_top" style="display:inline-block;padding:12px 28px;border-radius:999px;background:#01417b;color:#fff;' +
    'text-decoration:none;font-weight:700">' + esc_(CONFIG.siteUrl.replace(/^https:\/\//, '')) + '</a></div></div>'
  ).setTitle(CONFIG.serviceName).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ======================================================================
   Daily clean-up (time-driven trigger created by setup)
   Civil registration jobs: idRetentionDays after the customer confirms.
   Other jobs: retentionDays after delivery. Files go to the Drive bin,
   personal details are cleared; job number, dates and status stay.
   ====================================================================== */

function purgeDueJobs() {
  var now = new Date();
  withLock_(function () {
    var jobs = table_(SHEETS.jobs, JOB_COLS);
    jobs.rows.forEach(function (r) {
      if (!r.jobNo || r.purgedAt || !r.deleteBy) return;
      if (new Date(r.deleteBy).getTime() > now.getTime()) return;
      var id = (String(r.folder || '').match(/folders\/([\w-]+)/) || [])[1];
      if (id) { try { DriveApp.getFolderById(id).setTrashed(true); } catch (e) { console.error('trash ' + r.jobNo + ': ' + e); } }
      updateRow_(jobs, r, {
        name: '', email: '', line: '', phone: '', address: '', nameSpelling: '', notes: '', folder: '',
        purgedAt: now
      });
    });
  });
}

function addDays_(d, n) { return new Date(d.getTime() + n * 86400000); }

function installTriggers_() {
  var have = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  if (have.indexOf('onJobEdit') === -1) ScriptApp.newTrigger('onJobEdit').forSpreadsheet(ss_()).onEdit().create();
  if (have.indexOf('purgeDueJobs') === -1) ScriptApp.newTrigger('purgeDueJobs').timeBased().everyDays(1).atHour(3).create();
}

/* ======================================================================
   Sessions
   ====================================================================== */

function createSession_(email) {
  var token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  var now = new Date();
  var sessions = table_(SHEETS.sessions, SESSION_COLS);
  // Tidy up: drop expired sign-ins
  deleteRows_(sessions, function (r) { return new Date(r.expiresAt).getTime() < now.getTime(); });
  sessions = table_(SHEETS.sessions, SESSION_COLS);
  appendRow_(sessions, {
    tokenHash: hash_(token),
    email: email,
    createdAt: now,
    expiresAt: new Date(now.getTime() + CONFIG.sessionDays * 86400000)
  });
  return token;
}

function auth_(token) {
  token = String(token || '');
  if (!/^[0-9a-f]{64}$/.test(token)) fail_('session_expired');
  var hash = hash_(token);
  var s = find_(table_(SHEETS.sessions, SESSION_COLS), 'tokenHash', hash);
  if (!s || new Date(s.expiresAt).getTime() < Date.now()) fail_('session_expired');
  return String(s.email);
}

/* ======================================================================
   Email
   ====================================================================== */

function sendCodeMail_(email, code, lang, kind) {
  var th = lang !== 'en';
  var backup = kind === 'backup';
  var subject = backup
    ? (th ? 'รหัสยืนยันอีเมลสำรอง ' + CONFIG.serviceName + ': ' + code : CONFIG.serviceName + ' backup email code: ' + code)
    : (th ? 'รหัสเข้าสู่ระบบ ' + CONFIG.serviceName + ': ' + code : CONFIG.serviceName + ' sign-in code: ' + code);
  var lines = th
    ? [backup ? 'รหัสยืนยันอีเมลสำรองของท่านคือ' : 'รหัสเข้าสู่ระบบของท่านคือ', code, 'รหัสนี้ใช้ได้ ' + CONFIG.codeTtlMin + ' นาที และใช้ได้ครั้งเดียว',
       'หากท่านไม่ได้ขอรหัสนี้ โปรดเพิกเฉยต่ออีเมลฉบับนี้']
    : [backup ? 'Your code to confirm this backup email is' : 'Your sign-in code is', code, 'It is valid for ' + CONFIG.codeTtlMin + ' minutes and can be used once.',
       'If you did not ask for this code, you can ignore this email.'];
  var html = mailLayout_({
    th: th,
    preheader: lines[0] + ' ' + code,
    title: backup ? (th ? 'ยืนยันอีเมลสำรอง' : 'Confirm your backup email') : (th ? 'รหัสเข้าสู่ระบบของท่าน' : 'Your sign-in code'),
    intro: [esc_(lines[0]) + ':',
      '<span style="display:inline-block;margin:4px 0;padding:14px 26px;border-radius:12px;background:#eef2f8;border:1px dashed #b9c1ce;' +
      'font-size:34px;font-weight:700;letter-spacing:8px;color:#01417b;font-family:Consolas,Menlo,monospace">' + code + '</span>',
      esc_(lines[2])],
    small: esc_(lines[3])
  });
  MailApp.sendEmail({
    to: email,
    subject: subject,
    body: lines[0] + ' ' + code + '\n\n' + lines[2] + '\n' + lines[3] + '\n\n— ' + CONFIG.serviceName,
    htmlBody: html,
    name: CONFIG.serviceName
  });
}

/* ======================================================================
   Setup (run once from the editor)
   ====================================================================== */

function setup() {
  var users = ensureSheet_(SHEETS.users, USER_COLS);
  var jobs = ensureSheet_(SHEETS.jobs, JOB_COLS);
  var sessions = ensureSheet_(SHEETS.sessions, SESSION_COLS);
  sessions.hideSheet();
  // Columns added by later phases go on the right of existing sheets; data is untouched
  console.log('setup: columns');
  addMissingColumns_(users, USER_COLS);
  addMissingColumns_(jobs, JOB_COLS);
  // Phase 5: dropdowns for role and customer type on "Users"
  [['บทบาท', ROLES.filter(function (r) { return r.code !== 'customer'; }).map(function (r) { return r.th; })],
   ['ประเภทลูกค้า', CUSTOMER_TYPES.map(function (t) { return t.th; })]].forEach(function (d) {
    var c = colIndex_(users, d[0]);
    if (c) users.getRange(2, c, users.getMaxRows() - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(d[1], true).setAllowInvalid(false).build());
  });
  ensureSheet_(SHEETS.coupons, COUPON_COLS);
  ensureSheet_(SHEETS.couponUses, COUPON_USE_COLS);
  // Phase 5: discount settings, one row per customer type (0 % until the owner sets them)
  if (!ss_().getSheetByName(SHEETS.discounts)) {
    var disc = ensureSheet_(SHEETS.discounts, DISCOUNT_COLS);
    disc.getRange(2, 1, CUSTOMER_TYPES.length, DISCOUNT_COLS.length).setValues(CUSTOMER_TYPES.map(function (t) {
      return ['type', t.code, t.th, t.en, 0, 0, true];
    }));
  }

  // Status dropdown with colours on "Jobs"
  var statusCol = colIndex_(jobs, 'สถานะ');
  if (statusCol) {
    var range = jobs.getRange(2, statusCol, jobs.getMaxRows() - 1, 1);
    range.setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(STATUSES.map(function (s) { return s.th; }), true)
      .setAllowInvalid(false).build());
    var rules = jobs.getConditionalFormatRules().filter(function (r) {
      return r.getRanges().every(function (g) { return g.getColumn() !== statusCol; });
    });
    STATUSES.forEach(function (s) {
      rules.push(SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(s.th).setBackground(s.color).setRanges([range]).build());
    });
    jobs.setConditionalFormatRules(rules);
  }
  users.setColumnWidth(1, 240);
  console.log('setup: Drive folder + triggers');
  jobsFolder_();       // private Drive folder for job files
  installTriggers_();  // status emails (on edit) + daily clean-up

  // Home page content: tick boxes in "แสดง"; one example row (not shown) to copy
  [[SHEETS.promotions, PROMO_COLS, [false, '', '', 'ตัวอย่าง', 'Example', 'หัวข้อโปรโมชั่น', 'Offer title',
     'รายละเอียดสั้น ๆ', 'Short description', 'calculator']],
   [SHEETS.news, NEWS_COLS, [false, new Date(), 'หัวข้อข่าว', 'News title', 'รายละเอียด', 'Details', '', 'services']]]
    .forEach(function (def) {
      var isNew = !ss_().getSheetByName(def[0]);
      var sh = ensureSheet_(def[0], def[1]);
      addMissingColumns_(sh, def[1]);
      if (isNew) sh.appendRow(def[2]);
      var col = colIndex_(sh, 'แสดง');
      if (col) sh.getRange(2, col, sh.getMaxRows() - 1, 1).insertCheckboxes();
    });
  console.log('setup: Dashboard + Glossary');
  buildDashboard_();
  buildGlossary_();
  pepper_();
  console.log('setup: done');
}

/* ======================================================================
   "Dashboard" sheet (Phase 4): formulas only, rebuilt by setup().
   Columns of "Jobs" are found by their header (MATCH), so reordering them is fine.
   ====================================================================== */

function buildDashboard_() {
  var ss = ss_();
  var sh = ss.getSheetByName(SHEETS.dashboard) || ss.insertSheet(SHEETS.dashboard, 0);
  sh.clear();
  var J = "'" + SHEETS.jobs + "'!";
  var col = function (key) {
    var header = JOB_COLS.filter(function (c) { return c[0] === key; })[0][1];
    return 'INDEX(' + J + '$A$2:$AZ, 0, MATCH("' + header + '", ' + J + '$A$1:$AZ$1, 0))';
  };
  var status = col('status'), need = col('neededBy'), sub = col('submittedAt');
  var open = ', ' + status + ', "?*", ' + status + ', "<>' + statusLabel_('delivered') + '", ' +
             status + ', "<>' + statusLabel_('cancelled') + '"';
  var q = function (s) { return '"' + s + '"'; };

  var rows = [
    ['ภาพรวมงาน — ' + CONFIG.serviceName, '', '', '', ''],
    ['คำนวณจากชีต Jobs อัตโนมัติ · ไม่ต้องพิมพ์ในชีตนี้ (สร้างใหม่ได้ด้วย setup)', '', '', '', ''],
    ['', '', '', '', ''],
    ['สถานะ', 'จำนวนงาน', '', 'ประเภทเอกสาร', 'จำนวนงาน']
  ];
  var cats = Object.keys(CATEGORY_NAMES);
  var statusRows = STATUSES.map(function (s) {
    return [s.th, '=COUNTIF(' + status + ', ' + q(s.th) + ')'];
  });
  statusRows.push(['รวมทั้งหมด', '=COUNTIF(' + status + ', "?*")']);
  var n = Math.max(statusRows.length, cats.length + 1);
  for (var i = 0; i < n; i++) {
    var left = statusRows[i] || ['', ''];
    var right = i < cats.length
      ? [CATEGORY_NAMES[cats[i]][0], '=COUNTIFS(' + col('category') + ', ' + q(cats[i]) + ', ' + status + ', "?*")']
      : (i === cats.length ? ['รหัสอื่น / ไม่ระบุ', '=COUNTIF(' + status + ', "?*")-SUM(E5:E' + (4 + cats.length) + ')'] : ['', '']);
    rows.push([left[0], left[1], '', right[0], right[1]]);
  }
  var first = 5, statusEnd = first + STATUSES.length - 1;
  rows.push(['', '', '', '', '']);
  var followRow = rows.length + 1;
  rows.push(['ต้องติดตาม', 'จำนวนงาน', '', '', '']);
  var openCount = STATUSES.map(function (x) { return x.code; }).indexOf('delivered');   // received … review
  rows.push(['งานที่ยังไม่เสร็จ', '=SUM(B' + first + ':B' + (first + openCount - 1) + ')', '', '', '']);
  rows.push(['ครบกำหนดภายใน 3 วัน', '=COUNTIFS(' + need + ', ">="&TODAY(), ' + need + ', "<="&TODAY()+3' + open + ')', '', '', '']);
  rows.push(['เลยวันที่ลูกค้าต้องการแล้ว', '=COUNTIFS(' + need + ', "<"&TODAY()' + open + ')', '', '', '']);
  rows.push(['จะลบข้อมูลภายใน 7 วัน', '=COUNTIFS(' + col('deleteBy') + ', ">="&TODAY(), ' + col('deleteBy') + ', "<="&TODAY()+7, ' + col('purgedAt') + ', "")', '', '', '']);
  rows.push(['', '', '', '', '']);
  var monthRow = rows.length + 1;
  rows.push(['งานรายเดือน (6 เดือนล่าสุด)', 'จำนวนงาน', '', '', '']);
  for (var m = 0; m < 6; m++) {
    var r = rows.length + 1;
    rows.push(['=EOMONTH(TODAY(), ' + (-m - 1) + ')+1',
      '=COUNTIFS(' + sub + ', ">="&A' + r + ', ' + sub + ', "<"&EDATE(A' + r + ', 1), ' + status + ', "?*")', '', '', '']);
  }

  sh.getRange(1, 1, rows.length, 5).setValues(rows);
  sh.getRange(1, 1).setFontSize(16).setFontWeight('bold');
  sh.getRange(2, 1).setFontColor('#5f6368');
  [4, followRow, monthRow].forEach(function (r) {
    sh.getRange(r, 1, 1, r === 4 ? 5 : 2).setFontWeight('bold').setBackground('#e8f0fe');
  });
  sh.getRange(4, 3).setBackground(null);
  sh.getRange(first + STATUSES.length, 1, 1, 2).setFontWeight('bold');
  sh.getRange(monthRow + 1, 1, 6, 1).setNumberFormat('mmmm yyyy').setHorizontalAlignment('left');
  sh.setColumnWidth(1, 260); sh.setColumnWidth(2, 110); sh.setColumnWidth(3, 30);
  sh.setColumnWidth(4, 220); sh.setColumnWidth(5, 110);
  sh.setFrozenRows(0);
  return sh;
}

/* ======================================================================
   "Glossary" sheet (Phase 4): the provider's own word list so names of documents,
   offices and places are translated the same way every time. Created once with
   common civil-registration terms; the owner adds rows. The website does not read it.
   ====================================================================== */

var GLOSSARY_COLS = [
  ['th', 'คำศัพท์ (ไทย)'],
  ['en', 'English'],
  ['group', 'หมวด'],
  ['notes', 'หมายเหตุ / ที่มา']
];

var GLOSSARY_SEED = [
  ['สูติบัตร', 'Birth Certificate', 'ทะเบียนราษฎร', ''],
  ['มรณบัตร', 'Death Certificate', 'ทะเบียนราษฎร', ''],
  ['ทะเบียนบ้าน', 'House Registration', 'ทะเบียนราษฎร', 'ท.ร.14'],
  ['บัตรประจำตัวประชาชน', 'Thai National ID Card', 'ทะเบียนราษฎร', ''],
  ['เลขประจำตัวประชาชน', 'Personal Identification Number', 'ทะเบียนราษฎร', '13 หลัก'],
  ['ใบสำคัญการสมรส', 'Marriage Certificate', 'ทะเบียนราษฎร', 'คร.3'],
  ['ทะเบียนสมรส', 'Marriage Registration', 'ทะเบียนราษฎร', 'คร.2'],
  ['ใบสำคัญการหย่า', 'Divorce Certificate', 'ทะเบียนราษฎร', 'คร.7'],
  ['ทะเบียนหย่า', 'Divorce Registration', 'ทะเบียนราษฎร', 'คร.6'],
  ['หนังสือสำคัญการเปลี่ยนชื่อ', 'Certificate of Change of Name', 'ทะเบียนราษฎร', 'ช.3'],
  ['หนังสือรับรองการใช้คำนำหน้านาม', 'Certificate of Use of Title', 'ทะเบียนราษฎร', ''],
  ['นายทะเบียน', 'Registrar', 'หน่วยงาน', ''],
  ['สำนักทะเบียนอำเภอ', 'District Registration Office', 'หน่วยงาน', ''],
  ['สำนักทะเบียนท้องถิ่น', 'Local Registration Office', 'หน่วยงาน', ''],
  ['กรมการปกครอง', 'Department of Provincial Administration', 'หน่วยงาน', ''],
  ['จังหวัด', 'Province', 'ที่อยู่', ''],
  ['อำเภอ / เขต', 'District', 'ที่อยู่', 'เขต = กรุงเทพฯ'],
  ['ตำบล / แขวง', 'Sub-district', 'ที่อยู่', 'แขวง = กรุงเทพฯ'],
  ['หมู่ที่', 'Village No. (Moo)', 'ที่อยู่', ''],
  ['นาย', 'Mr.', 'คำนำหน้า', ''],
  ['นาง', 'Mrs.', 'คำนำหน้า', ''],
  ['นางสาว', 'Miss', 'คำนำหน้า', ''],
  ['เด็กชาย', 'Master', 'คำนำหน้า', ''],
  ['เด็กหญิง', 'Miss', 'คำนำหน้า', ''],
  ['พ.ศ.', 'B.E. (Buddhist Era)', 'วันที่', 'ค.ศ. = พ.ศ. − 543']
];

function buildGlossary_() {
  var isNew = !ss_().getSheetByName(SHEETS.glossary);
  var sh = ensureSheet_(SHEETS.glossary, GLOSSARY_COLS);
  if (isNew) {
    sh.getRange(2, 1, GLOSSARY_SEED.length, GLOSSARY_COLS.length).setValues(GLOSSARY_SEED);
    sh.setColumnWidth(1, 260); sh.setColumnWidth(2, 300); sh.setColumnWidth(3, 120); sh.setColumnWidth(4, 220);
  }
  return sh;
}

function addMissingColumns_(sh, cols) {
  var last = Math.max(sh.getLastColumn(), 1);
  var head = sh.getRange(1, 1, 1, last).getValues()[0].map(function (h) { return String(h).trim(); });
  var add = cols.filter(function (c) { return head.indexOf(c[1]) === -1; }).map(function (c) { return c[1]; });
  if (!add.length) return;
  var start = head.filter(String).length ? last + 1 : 1;
  // A new Google Sheet has only 26 columns (A–Z): make room before writing past the edge
  var need = start + add.length - 1 - sh.getMaxColumns();
  if (need > 0) sh.insertColumnsAfter(sh.getMaxColumns(), need);
  sh.getRange(1, start, 1, add.length).setValues([add]).setFontWeight('bold');
}

function ensureSheet_(name, cols) {
  var ss = ss_();
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    if (cols.length > sh.getMaxColumns()) sh.insertColumnsAfter(sh.getMaxColumns(), cols.length - sh.getMaxColumns());
    sh.getRange(1, 1, 1, cols.length).setValues([cols.map(function (c) { return c[1]; })]);
  }
  sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
  sh.setFrozenRows(1);
  return sh;
}

/* ======================================================================
   Sheet helpers — rows as objects, columns found by header text
   ====================================================================== */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function table_(name, cols) {
  var sh = ss_().getSheetByName(name);
  if (!sh) sh = ensureSheet_(name, cols);
  var lastRow = sh.getLastRow(), lastCol = Math.max(sh.getLastColumn(), 1);
  var values = lastRow ? sh.getRange(1, 1, lastRow, lastCol).getValues() : [[]];
  var head = values[0].map(function (h) { return String(h).trim(); });
  var idx = {};
  cols.forEach(function (c) {
    var i = head.indexOf(c[1]);
    if (i > -1) idx[c[0]] = i;
  });
  var rows = values.slice(1).map(function (r, i) {
    var o = { _row: i + 2, _values: r };
    for (var k in idx) o[k] = r[idx[k]];
    return o;
  });
  return { sheet: sh, idx: idx, width: lastCol, rows: rows };
}

function find_(t, key, value) {
  for (var i = 0; i < t.rows.length; i++) {
    var v = t.rows[i][key];
    if (key === 'email' ? email_(v, true) === value : v === value) return t.rows[i];
  }
  return null;
}

function appendRow_(t, obj) {
  var row = [];
  for (var c = 0; c < t.width; c++) row.push('');
  for (var k in obj) if (k in t.idx) row[t.idx[k]] = safe_(obj[k]);
  t.sheet.appendRow(row);
}

function updateRow_(t, rowObj, changes) {
  var row = rowObj._values.slice();
  for (var k in changes) if (k in t.idx) row[t.idx[k]] = safe_(changes[k]);
  t.sheet.getRange(rowObj._row, 1, 1, row.length).setValues([row]);
  // keep the in-memory copy current, so a second update of the same row can't undo the first
  rowObj._values = row;
  for (var c in changes) rowObj[c] = changes[c];
}

function deleteRows_(t, test) {
  // bottom-up so row numbers stay valid
  for (var i = t.rows.length - 1; i >= 0; i--) {
    if (test(t.rows[i])) t.sheet.deleteRow(t.rows[i]._row);
  }
}

function colIndex_(sh, header) {
  var head = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  var i = head.indexOf(header);
  return i === -1 ? 0 : i + 1;
}

/* ======================================================================
   Small helpers
   ====================================================================== */

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) fail_('busy');
  try { return fn(); } finally { lock.releaseLock(); }
}

function fail_(code) {
  var err = new Error(code);
  err.code = code;
  throw err;
}

// Normalised email; throws unless lenient
function email_(v, lenient) {
  var e = String(v || '').trim().toLowerCase();
  if (!lenient && (e.length > 160 || !EMAIL_RE.test(e))) fail_('invalid_email');
  return e;
}

function text_(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

// Stop text typed by customers from being read as a formula by Sheets
function safe_(v) {
  return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v;
}

function iso_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v)) return v.toISOString();
  return v ? String(v) : '';
}

function parse_(s) {
  try { return s ? JSON.parse(s) : null; } catch (e) { return null; }
}

function randomCode_() {
  var hex = Utilities.getUuid().replace(/-/g, '');
  var n = parseInt(hex.slice(0, 12), 16) % 1000000;
  return ('00000' + n).slice(-6);
}

function pepper_() {
  var props = PropertiesService.getScriptProperties();
  var p = props.getProperty('PEPPER');
  if (!p) {
    p = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    props.setProperty('PEPPER', p);
  }
  return p;
}

function hash_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s + '|' + pepper_(), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

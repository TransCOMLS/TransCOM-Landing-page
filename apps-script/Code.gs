/**
 * TransCOM — Google Apps Script backend (Web App, bound to the Google Sheet)
 *
 * This part: customer accounts — sign in with a one-time code sent by email
 * (no passwords), profile, job history. Phase 3 adds job submission (doPost
 * action "submitJob") and writes rows to the "Jobs" sheet defined here.
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
  codeTtlMin: 10,        // sign-in code valid for (minutes)
  codeMaxAttempts: 5,    // wrong codes allowed before a new code is needed
  codeResendSec: 60,     // wait before another code can be sent to the same email
  codeMaxPerHour: 5,     // codes per email per hour
  sessionDays: 30,       // how long a sign-in lasts
  maxJobs: 50,           // jobs returned in the account history
  idRetentionDays: 15    // civil registration jobs (ID attached): delete data this many
                         // days after the customer confirms the translation (Phase 3)
};

var SHEETS = { users: 'Users', jobs: 'Jobs', sessions: '_sessions', promotions: 'Promotions', news: 'News' };

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
  ['lastLoginAt', 'เข้าสู่ระบบล่าสุด']
];

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
  ['nameSpelling', 'การสะกดชื่อ'],
  ['notes', 'หมายเหตุ'],
  ['folder', 'โฟลเดอร์ไฟล์'],
  ['lang', 'ภาษาลูกค้า'],
  ['requiresId', 'แนบบัตร (ทะเบียนราษฎร)'],
  ['confirmedAt', 'ลูกค้ายืนยันความถูกต้องเมื่อ'],
  ['deleteBy', 'กำหนดลบข้อมูล']
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
  ['cta', 'ปุ่มไปหน้า']
];
var NEWS_COLS = [
  ['active', 'แสดง'],
  ['date', 'วันที่'],
  ['titleTh', 'หัวข้อ (ไทย)'],
  ['titleEn', 'หัวข้อ (EN)'],
  ['textTh', 'รายละเอียด (ไทย)'],
  ['textEn', 'รายละเอียด (EN)']
];
var CTA_PAGES = ['services', 'pricing', 'calculator', 'submit', 'track', 'account', 'how', 'faq', 'contact'];

var SESSION_COLS = [
  ['tokenHash', 'tokenHash'],
  ['email', 'email'],
  ['createdAt', 'createdAt'],
  ['expiresAt', 'expiresAt']
];

// Status dropdown in "Jobs" (Thai label in the sheet → code sent to the website)
var STATUSES = [
  { code: 'received',   th: 'ได้รับงานแล้ว',      color: '#e8f0fe' },
  { code: 'quoted',     th: 'ส่งใบเสนอราคาแล้ว', color: '#fef7e0' },
  { code: 'paid',       th: 'ชำระเงินแล้ว',       color: '#e6f4ea' },
  { code: 'inProgress', th: 'กำลังแปล',          color: '#e3f2fd' },
  { code: 'delivered',  th: 'ส่งมอบแล้ว',         color: '#d2f0dc' },
  { code: 'cancelled',  th: 'ยกเลิก',            color: '#f1f3f4' }
];

var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/;
var LINE_RE = /^[A-Za-z0-9._\-@]{0,60}$/;

/* ======================================================================
   Web app entry points
   ====================================================================== */

function doGet() {
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
  updateProfile: updateProfile_,
  logout: logout_,
  deleteAccount: deleteAccount_,
  getContent: getContent_
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
    var user = find_(users, 'email', email);
    var isNew = !user;
    var stamp = new Date();
    if (isNew) {
      appendRow_(users, { email: email, lang: req.lang === 'en' ? 'en' : 'th', createdAt: stamp, lastLoginAt: stamp });
      user = { email: email, lang: req.lang === 'en' ? 'en' : 'th' };
    } else {
      updateRow_(users, user, { lastLoginAt: stamp });
    }
    var token = createSession_(email);
    return { ok: true, token: token, isNew: isNew, profile: profile_(user) };
  });
}

/* ======================================================================
   Account
   ====================================================================== */

function getAccount_(req) {
  var email = auth_(req.token);
  var user = find_(table_(SHEETS.users, USER_COLS), 'email', email);
  if (!user) fail_('session_expired');
  return { ok: true, profile: profile_(user), jobs: jobsFor_(email) };
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
  withLock_(function () {
    var users = table_(SHEETS.users, USER_COLS);
    deleteRows_(users, function (r) { return email_(r.email, true) === email; });
    var sessions = table_(SHEETS.sessions, SESSION_COLS);
    deleteRows_(sessions, function (r) { return r.email === email; });
  });
  return { ok: true };
}

function profile_(u) {
  return {
    email: String(u.email || ''),
    name: String(u.name || ''),
    line: String(u.line || ''),
    phone: String(u.phone || ''),
    nameSpelling: String(u.nameSpelling || ''),
    langPair: String(u.langPair || ''),
    lang: u.lang === 'en' ? 'en' : 'th'
  };
}

function jobsFor_(email) {
  if (!ss_().getSheetByName(SHEETS.jobs)) return [];
  var jobs = table_(SHEETS.jobs, JOB_COLS);
  return jobs.rows
    .filter(function (r) { return r.jobNo && email_(r.email, true) === email; })
    .map(function (r) {
      return {
        jobNo: String(r.jobNo),
        submittedAt: iso_(r.submittedAt),
        status: statusCode_(r.status),
        langPair: String(r.langPair || ''),
        category: String(r.category || ''),
        pages: r.pages === '' || r.pages == null ? null : Number(r.pages),
        neededBy: iso_(r.neededBy)
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
        text: { th: str_(r.textTh), en: str_(r.textEn) },
        cta: CTA_PAGES.indexOf(str_(r.cta)) > -1 ? str_(r.cta) : ''
      };
    }).filter(function (p) { return p.title.th || p.title.en; }),
    news: rowsIfSheet_(SHEETS.news, NEWS_COLS).filter(active_).map(function (r) {
      return {
        date: day_(r.date, tz),
        title: { th: str_(r.titleTh), en: str_(r.titleEn) },
        text: { th: str_(r.textTh), en: str_(r.textEn) }
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
function day_(v, tz) {
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v)) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  var s = str_(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
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

function sendCodeMail_(email, code, lang) {
  var th = lang !== 'en';
  var subject = th
    ? 'รหัสเข้าสู่ระบบ ' + CONFIG.serviceName + ': ' + code
    : CONFIG.serviceName + ' sign-in code: ' + code;
  var lines = th
    ? ['รหัสเข้าสู่ระบบของท่านคือ', code, 'รหัสนี้ใช้ได้ ' + CONFIG.codeTtlMin + ' นาที และใช้ได้ครั้งเดียว',
       'หากท่านไม่ได้ขอรหัสนี้ โปรดเพิกเฉยต่ออีเมลฉบับนี้']
    : ['Your sign-in code is', code, 'It is valid for ' + CONFIG.codeTtlMin + ' minutes and can be used once.',
       'If you did not ask for this code, you can ignore this email.'];
  var html =
    '<div style="font-family:Sarabun,Tahoma,Arial,sans-serif;font-size:16px;color:#1d2433">' +
    '<p>' + lines[0] + '</p>' +
    '<p style="font-size:32px;font-weight:700;letter-spacing:6px;color:#01417b;margin:8px 0">' + code + '</p>' +
    '<p>' + lines[2] + '</p><p style="color:#566072">' + lines[3] + '</p>' +
    '<p style="color:#566072">— ' + CONFIG.serviceName + '</p></div>';
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

  // Home page content: tick boxes in "แสดง"; one example row (not shown) to copy
  [[SHEETS.promotions, PROMO_COLS, [false, '', '', 'ตัวอย่าง', 'Example', 'หัวข้อโปรโมชั่น', 'Offer title',
     'รายละเอียดสั้น ๆ', 'Short description', 'calculator']],
   [SHEETS.news, NEWS_COLS, [false, new Date(), 'หัวข้อข่าว', 'News title', 'รายละเอียด', 'Details']]]
    .forEach(function (def) {
      var isNew = !ss_().getSheetByName(def[0]);
      var sh = ensureSheet_(def[0], def[1]);
      if (isNew) sh.appendRow(def[2]);
      var col = colIndex_(sh, 'แสดง');
      if (col) sh.getRange(2, col, sh.getMaxRows() - 1, 1).insertCheckboxes();
    });
  pepper_();
}

function ensureSheet_(name, cols) {
  var ss = ss_();
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
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

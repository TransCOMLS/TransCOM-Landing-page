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
  codeTtlMin: 10,        // sign-in code valid for (minutes)
  codeMaxAttempts: 5,    // wrong codes allowed before a new code is needed
  codeResendSec: 60,     // wait before another code can be sent to the same email
  codeMaxPerHour: 5,     // codes per email per hour
  sessionDays: 30,       // how long a sign-in lasts
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
              dashboard: 'Dashboard', glossary: 'Glossary' };

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
  ['purgedAt', 'ลบข้อมูลแล้วเมื่อ']
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
  ['textEn', 'รายละเอียด (EN)'],
  ['image', 'รูปภาพ (ลิงก์)'],     // square picture; a Google Drive share link works too
  ['cta', 'ปุ่มไปหน้า']
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
  updateProfile: updateProfile_,
  logout: logout_,
  deleteAccount: deleteAccount_,
  getContent: getContent_,
  createJob: createJob_,
  uploadFile: uploadFile_,
  finishJob: finishJob_,
  trackJob: trackJob_
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
    .filter(function (r) { return r.jobNo && r.status && email_(r.email, true) === email; })
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
        text: { th: str_(r.textTh), en: str_(r.textEn) },
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

function mailHtml_(title, rows, paragraphs) {
  var table = rows.map(function (r) {
    return '<tr><td style="padding:4px 12px 4px 0;color:#566072;vertical-align:top">' + esc_(r[0]) +
      '</td><td style="padding:4px 0;vertical-align:top">' + esc_(r[1]) + '</td></tr>';
  }).join('');
  return '<div style="font-family:Sarabun,Tahoma,Arial,sans-serif;font-size:15px;color:#1d2433;line-height:1.6">' +
    '<p style="font-size:18px;font-weight:700;color:#01417b;margin:0 0 12px">' + esc_(title) + '</p>' +
    (paragraphs || []).map(function (p) { return '<p style="margin:0 0 10px">' + p + '</p>'; }).join('') +
    (rows.length ? '<table style="border-collapse:collapse;margin:8px 0 12px">' + table + '</table>' : '') +
    '<p style="color:#566072;margin:16px 0 0">— ' + esc_(CONFIG.serviceName) + '</p></div>';
}

function sendNewJobMails_(r) {
  var th = r.lang !== 'en';
  var summaryTh = [
    ['เลขที่งาน', r.jobNo], ['ประเภทเอกสาร', categoryName_(r.category, true)], ['คู่ภาษา', r.langPair],
    ['จำนวนหน้า (โดยประมาณ)', r.pages || '-'], ['วันที่ต้องการรับงาน', dateText_(r.neededBy, true)],
    ['รับรองคำแปล', yesNo_(r.certified, true)], ['รับฉบับจริงทางไปรษณีย์', yesNo_(r.shipping, true)]
  ];
  var summaryEn = [
    ['Job number', r.jobNo], ['Document category', categoryName_(r.category, false)], ['Language pair', r.langPair],
    ['Pages (approx.)', r.pages || '-'], ['Needed by', dateText_(r.neededBy, false)],
    ['Certified translation', yesNo_(r.certified, false)], ['Paper copy by post', yesNo_(r.shipping, false)]
  ];

  // 1) Customer receipt
  MailApp.sendEmail({
    to: String(r.email),
    subject: th ? 'ได้รับงานแปลแล้ว เลขที่งาน ' + r.jobNo + ' — ' + CONFIG.serviceName
                : 'We have received your job ' + r.jobNo + ' — ' + CONFIG.serviceName,
    htmlBody: th
      ? mailHtml_('ได้รับงานแปลของท่านแล้ว', summaryTh, [
          'เรียนคุณ' + esc_(r.name),
          'ขอบคุณที่ใช้บริการ เราได้รับเอกสารของท่านเรียบร้อยแล้ว ผู้ให้บริการจะตรวจสอบเอกสารและส่งใบเสนอราคาให้ทางอีเมลนี้',
          'ติดตามสถานะได้ที่หน้า <b>ติดตามงาน</b> บนเว็บไซต์ ด้วยเลขที่งาน <b>' + esc_(r.jobNo) + '</b> และอีเมลนี้'])
      : mailHtml_('Your job has been received', summaryEn, [
          'Dear ' + esc_(r.name) + ',',
          'Thank you. We have received your documents and will email you a quote after checking them.',
          'You can follow your job on the <b>Track a job</b> page with job number <b>' + esc_(r.jobNo) + '</b> and this email.']),
    name: CONFIG.serviceName,
    replyTo: providerEmail_()
  });

  // 2) Notice to the provider, with everything needed to quote
  var all = summaryTh.concat([
    ['ชื่อ', r.name], ['อีเมล', r.email], ['LINE ID', r.line || '-'], ['โทรศัพท์', r.phone || '-'],
    ['การสะกดชื่อ', r.nameSpelling || '-'], ['ที่อยู่จัดส่ง', r.address || '-'], ['หมายเหตุ', r.notes || '-'],
    ['แนบบัตร (ทะเบียนราษฎร)', yesNo_(r.requiresId, true)], ['โฟลเดอร์ไฟล์', r.folder]
  ]);
  MailApp.sendEmail({
    to: providerEmail_(),
    subject: 'งานใหม่ ' + r.jobNo + ' — ' + r.name,
    htmlBody: mailHtml_('มีงานแปลใหม่ ' + r.jobNo, all, [
      'เปิดโฟลเดอร์ไฟล์: <a href="' + esc_(r.folder) + '">' + esc_(r.folder) + '</a>',
      'จัดการงานได้ในชีต <a href="' + esc_(ss_().getUrl()) + '">Jobs</a>']),
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
    var code = statusCode_(row.status);
    if (code === 'delivered') {
      var changes = { deliveredAt: new Date() };
      if (!row.deleteBy) changes.deleteBy = addDays_(new Date(), CONFIG.retentionDays);
      updateRow_(jobs, row, changes);
    }
    try { sendStatusMail_(row, code); } catch (err) { console.error('status mail ' + row.jobNo + ': ' + err); }
  }
}

function sendStatusMail_(r, code) {
  var th = r.lang !== 'en';
  var text = {
    quoted:     ['ผู้ให้บริการส่งใบเสนอราคาให้ท่านแล้ว กรุณาตรวจสอบอีเมลที่ได้รับ', 'We have sent you a quote. Please check your email.'],
    paid:       ['ได้รับการชำระเงินแล้ว เราจะเริ่มแปลเอกสารของท่าน', 'Payment received. We will start translating your documents.'],
    inProgress: ['เอกสารของท่านอยู่ระหว่างการแปลและตรวจทาน', 'Your documents are being translated and reviewed.'],
    delivered:  ['ส่งมอบงานแปลแล้ว กรุณาตรวจสอบงานแปล หากพบข้อผิดพลาด แจ้งได้ภายใน ' + CONFIG.revisionDays + ' วัน',
                 'Your translation has been delivered. Please check it — you can ask for corrections within ' + CONFIG.revisionDays + ' days.'],
    cancelled:  ['งานนี้ถูกยกเลิกแล้ว หากมีข้อสงสัย กรุณาตอบกลับอีเมลนี้', 'This job has been cancelled. Reply to this email if you have any questions.']
  }[code];
  if (!text || !r.email) return;
  var paras = [th ? 'เรียนคุณ' + esc_(r.name) : 'Dear ' + esc_(r.name) + ',', esc_(th ? text[0] : text[1])];
  if (code === 'delivered') {
    var url = confirmUrl_(r.jobNo);
    var idNote = String(r.requiresId).toUpperCase() === 'TRUE'
      ? (th ? ' เมื่อยืนยันแล้ว ข้อมูลและไฟล์ทั้งหมดของงานนี้ รวมถึงสำเนาบัตร จะถูกลบภายใน ' + CONFIG.idRetentionDays + ' วัน'
            : ' Once you confirm, all data and files for this job, including the ID copy, are deleted within ' + CONFIG.idRetentionDays + ' days.')
      : '';
    if (url) paras.push((th ? 'หากงานแปลถูกต้องแล้ว กรุณากดยืนยัน: ' : 'If the translation is correct, please confirm: ') +
      '<a href="' + esc_(url) + '">' + (th ? 'ยืนยันว่างานแปลถูกต้อง' : 'Confirm the translation is correct') + '</a>' + esc_(idNote));
  }
  MailApp.sendEmail({
    to: String(r.email),
    subject: (th ? 'สถานะงาน ' : 'Job ') + r.jobNo + ': ' + (th ? statusLabel_(code) : code),
    htmlBody: mailHtml_((th ? 'งาน ' : 'Job ') + r.jobNo, [], paras),
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

function confirmPage_(jobNo, token) {
  jobNo = String(jobNo || '');
  var ok = token && String(token) === confirmToken_(jobNo);
  var msg;
  if (ok) {
    msg = withLock_(function () {
      var jobs = table_(SHEETS.jobs, JOB_COLS);
      var r = find_(jobs, 'jobNo', jobNo);
      if (!r) return null;
      if (!r.confirmedAt) {
        var changes = { confirmedAt: new Date() };
        if (String(r.requiresId).toUpperCase() === 'TRUE') {
          var due = addDays_(new Date(), CONFIG.idRetentionDays);
          if (!r.deleteBy || new Date(r.deleteBy) > due) changes.deleteBy = due;
        }
        updateRow_(jobs, r, changes);
      }
      return 'ขอบคุณที่ยืนยัน งาน ' + jobNo + ' เรียบร้อยแล้ว<br>Thank you — job ' + jobNo + ' is confirmed.';
    });
  }
  if (!msg) msg = 'ลิงก์ไม่ถูกต้องหรือหมดอายุ<br>This link is not valid.';
  return HtmlService.createHtmlOutput(
    '<div style="font-family:Sarabun,Tahoma,Arial,sans-serif;max-width:520px;margin:48px auto;padding:24px;' +
    'border:1px solid #d9dee7;border-radius:16px;text-align:center;color:#1d2433;font-size:17px;line-height:1.7">' +
    '<p style="font-size:20px;font-weight:700;color:#01417b;margin:0 0 8px">' + esc_(CONFIG.serviceName) + '</p>' +
    msg.split('<br>').map(esc_).join('<br>') + '</div>'
  ).setTitle(CONFIG.serviceName);
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
  jobsFolder_();       // private Drive folder for job files
  installTriggers_();  // status emails (on edit) + daily clean-up

  // Home page content: tick boxes in "แสดง"; one example row (not shown) to copy
  [[SHEETS.promotions, PROMO_COLS, [false, '', '', 'ตัวอย่าง', 'Example', 'หัวข้อโปรโมชั่น', 'Offer title',
     'รายละเอียดสั้น ๆ', 'Short description', 'calculator']],
   [SHEETS.news, NEWS_COLS, [false, new Date(), 'หัวข้อข่าว', 'News title', 'รายละเอียด', 'Details', '', 'services']]]
    .forEach(function (def) {
      var isNew = !ss_().getSheetByName(def[0]);
      var sh = ensureSheet_(def[0], def[1]);
      if (isNew) sh.appendRow(def[2]);
      var col = colIndex_(sh, 'แสดง');
      if (col) sh.getRange(2, col, sh.getMaxRows() - 1, 1).insertCheckboxes();
    });
  buildDashboard_();
  buildGlossary_();
  pepper_();
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
  rows.push(['งานที่ยังไม่เสร็จ', '=SUM(B' + first + ':B' + (first + 3) + ')', '', '', '']);
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

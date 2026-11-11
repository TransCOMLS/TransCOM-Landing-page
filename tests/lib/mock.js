// Minimal in-memory stand-ins for the Apps Script services Code.gs uses.
const fs = require('fs'), vm = require('vm'), crypto = require('crypto');
function load(codePath, opts) {
  opts = opts || {};
  const sheets = {}; const cache = new Map(); const props = {}; const mail = [];
  const chain = () => new Proxy(function () {}, { get: (t, k) => k === 'build' ? () => ({}) : chain(), apply: () => chain() });
  function Sheet(name) {
    this.name = name; this.data = []; this.hidden = false; this.maxCols = 26;
  }
  Sheet.prototype = {
    getName() { return this.name; },
    getLastRow() { return this.data.length; },
    getLastColumn() { return this.data.reduce((m, r) => Math.max(m, r.length), 0); },
    getMaxRows() { return 1000; }, getMaxColumns() { return this.maxCols; }, insertColumnsAfter(after, n) { this.maxCols += n; },
    appendRow(r) { this.maxCols = Math.max(this.maxCols, r.length); this.data.push(r.map(v => typeof v === 'string' && v[0] === "'" ? v.slice(1) : v)); },
    deleteRow(n) { this.data.splice(n - 1, 1); },
    hideSheet() { this.hidden = true; }, setFrozenRows() {}, setColumnWidth() {}, clear() { this.data = []; },
    getConditionalFormatRules() { return []; }, setConditionalFormatRules() {},
    getRange(r, c, nr = 1, nc = 1) {
      const sh = this;
      if (c + nc - 1 > sh.maxCols) throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
      let rp; const api = {
        getValues() { const out = []; for (let i = 0; i < nr; i++) { const row = sh.data[r - 1 + i] || []; const o = []; for (let j = 0; j < nc; j++) o.push(row[c - 1 + j] === undefined ? '' : row[c - 1 + j]); out.push(o); } return out; },
        setValues(v) { for (let i = 0; i < nr; i++) { while (sh.data.length < r + i) sh.data.push([]); for (let j = 0; j < nc; j++) { let x = v[i][j]; if (typeof x === 'string' && x[0] === "'") x = x.slice(1); sh.data[r - 1 + i][c - 1 + j] = x; } } return rp; },
        setFontWeight() { return rp; }, setDataValidation() { return rp; }, insertCheckboxes() { return rp; },
        clearContent() { for (let i = 0; i < nr; i++) { const row = sh.data[r - 1 + i]; if (row) for (let j = 0; j < nc; j++) row[c - 1 + j] = ''; } return rp; },
      };
      rp = new Proxy(api, { get: (t, k) => k in t ? t[k] : () => rp });
      return rp;
    },
  };
  const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = new Sheet(n)), getSpreadsheetTimeZone: () => 'Asia/Bangkok', getUrl: () => 'https://docs.google.com/spreadsheets/d/SHEET' };
  const drive = { folders: {}, files: [], seq: 0 };
  function Folder(name, parent) { this.id = 'F' + (++drive.seq); this.name = name; this.parent = parent; this.trashed = false; drive.folders[this.id] = this; }
  Folder.prototype = {
    getId() { return this.id; }, getUrl() { return 'https://drive.google.com/drive/folders/' + this.id; },
    getName() { return this.name; },
    createFolder(n) { return new Folder(n, this.id); },
    createFile(blob) { const f = new File(blob, this.id); drive.files.push(f); return f; },
    setTrashed(v) { this.trashed = v; },
    setSharing(a) { this.sharing = a; },
    getFolders() { const l = Object.values(drive.folders).filter(f => f.parent === this.id && !f.trashed); return iter(l); },
    getFiles() { return iter(drive.files.filter(f => f.folder === this.id && !f.trashed)); },
  };
  function iter(l) { let i = 0; return { hasNext: () => i < l.length, next: () => l[i++] }; }
  function File(blob, folder) { this.id = 'X' + String(++drive.seq).padStart(14, '0'); this.folder = folder; this.name = blob.name; this.type = blob.type; this.bytes = blob.bytes; this.size = blob.bytes.length; this.trashed = false; }
  File.prototype = { getId() { return this.id; }, getName() { return this.name; }, getSize() { return this.size; }, getMimeType() { return this.type; },
    getBlob() { const b = this.bytes; return { getBytes: () => b }; }, setTrashed(v) { this.trashed = v; }, setSharing(a) { if (drive.blockSharing) throw new Error('policy'); this.sharing = a; } };
  const triggers = [];
  // Fake Beam (Playground-like): payment links, charges, refunds, transactions
  const beam = { links: {}, charges: [], refunds: {}, tx: {}, calls: [], seq: 0, down: false };
  beam.pay = (linkId, method) => {
    const l = beam.links[linkId]; l.status = 'PAID';
    const ch = { chargeId: 'ch_' + (++beam.seq), status: 'SUCCEEDED', amount: l.order.netAmount, currency: 'THB', source: 'PAYMENT_LINK', sourceId: linkId,
                 referenceId: l.order.referenceId, transactionTime: new Date().toISOString(), paymentMethod: { paymentMethodType: method || 'QR_PROMPT_PAY' } };
    beam.charges.push(ch);
    const fee = Math.round(ch.amount * 0.0165), vat = Math.round(fee * 0.07);
    beam.tx[ch.chargeId] = { transactionId: ch.chargeId, transactionType: 'PAYMENT', grossAmount: ch.amount, feeAmount: fee, vatAmount: vat, netAmount: ch.amount - fee - vat };
    return ch;
  };
  const resp = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });
  const UrlFetchApp = { fetch(url, opt) {
    beam.calls.push({ url, method: opt.method, body: opt.payload ? JSON.parse(opt.payload) : null, headers: opt.headers });
    if (beam.down) throw new Error('network');
    if (!/^Basic /.test(opt.headers.Authorization)) return resp(401, {});
    const u = new URL(url), path = u.pathname;
    let m;
    if (opt.method === 'post' && path === '/api/v1/payment-links') {
      const b = JSON.parse(opt.payload);
      const on = Object.keys(b.linkSettings || {}).filter(k => b.linkSettings[k] && b.linkSettings[k].isEnabled);
      if (!on.length) return resp(400, { code: 400, error: { errorCode: 'API_VALIDATION_ERROR', errorMessage: 'inputs are failing validation; at least one payment method must be enabled' } });
      if (on.some(k => (beam.denied || []).includes(k))) return resp(400, { code: 400, error: { errorCode: 'API_VALIDATION_ERROR', errorMessage: 'payment method not available' } });
      const id = 'pl' + (++beam.seq);
      beam.links[id] = Object.assign({ paymentLinkId: id, status: 'ACTIVE', url: 'https://playground-pay.beamcheckout.com/m/' + id }, b);
      return resp(201, { id, url: beam.links[id].url });
    }
    if ((m = /^\/api\/v1\/payment-links\/([^/]+)\/disable$/.exec(path))) { const l = beam.links[m[1]]; if (!l) return resp(404, {}); if (l.status === 'ACTIVE') l.status = 'DISABLED'; return resp(202, {}); }
    if ((m = /^\/api\/v1\/payment-links\/([^/]+)$/.exec(path))) { const l = beam.links[m[1]]; return l ? resp(200, l) : resp(404, { error: { errorCode: 'NOT_FOUND_ERROR' } }); }
    if (path === '/api/v1/charges') { const sid = u.searchParams.get('sourceId'); return resp(200, { data: beam.charges.filter(c => c.sourceId === sid), totalCount: 1 }); }
    if ((m = /^\/api\/v1\/transactions\/([^/]+)$/.exec(path))) { const t = beam.tx[m[1]]; return t ? resp(200, t) : resp(404, {}); }
    if (opt.method === 'post' && path === '/api/v1/refunds') {
      const b = JSON.parse(opt.payload); const id = 're_' + (++beam.seq);
      beam.refunds[id] = { refundId: id, chargeId: b.chargeId, amount: b.amount, status: beam.refundResult || 'PENDING' };
      return resp(201, { refundId: id });
    }
    if ((m = /^\/api\/v1\/refunds\/([^/]+)$/.exec(path))) { const r = beam.refunds[m[1]]; return r ? resp(200, r) : resp(404, {}); }
    return resp(404, {});
  } };
  const ctx = {
    UrlFetchApp,
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, newDataValidation: chain, newConditionalFormatRule: chain },
    CacheService: { getScriptCache: () => ({ get: k => { const e = cache.get(k); return e && e.exp > Date.now() ? e.v : null; }, put: (k, v, s) => cache.set(k, { v, exp: Date.now() + s * 1000 }), remove: k => cache.delete(k) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      computeDigest: (alg, s) => Array.from(crypto.createHash('sha256').update(s, 'utf8').digest()).map(b => b > 127 ? b - 256 : b),
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      formatDate: (d, tz, f) => {
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).map(x => [x.type, x.value]));
        if (f === 'yyyy') return parts.year;
        if (f === 'd/M/') return Number(parts.day) + '/' + Number(parts.month) + '/';
        return parts.year + '-' + parts.month + '-' + parts.day;
      },
      base64Encode: bytes => typeof bytes === 'string' ? Buffer.from(bytes, 'utf8').toString('base64') : Buffer.from(bytes.map(b => b & 255)).toString('base64'),
      sleep: () => {},
      base64Decode: s => { if (!/^[A-Za-z0-9+/=]*$/.test(s)) throw new Error('bad'); return Array.from(Buffer.from(s, 'base64')); },
      newBlob: (bytes, type, name) => ({ bytes, type, name, getBytes: () => (typeof bytes === 'string' ? Array.from(Buffer.from(bytes, 'utf8')).map(x => x > 127 ? x - 256 : x) : bytes) }),
      computeHmacSha256Signature: (value, key) => Array.from(crypto.createHmac('sha256', Buffer.from(key.map(x => x & 255))).update(Buffer.from(value.map(x => x & 255))).digest()).map(x => x > 127 ? x - 256 : x),
    },
    MailApp: { sendEmail: m => mail.push(m) },
    DriveApp: { Access: { ANYONE_WITH_LINK: 'anyone' }, Permission: { VIEW: 'view' }, createFolder: n => new Folder(n, 'root'), getFolderById: id => { if (!drive.folders[id]) throw new Error('no folder'); return drive.folders[id]; },
      getFileById: id => { const f = drive.files.find(x => x.id === id); if (!f) throw new Error('no file'); return f; } },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
    ScriptApp: {
      getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/TEST/exec' }),
      getProjectTriggers: () => triggers.map(h => ({ getHandlerFunction: () => h })),
      newTrigger: h => { const c = new Proxy({}, { get: (t, k) => k === 'create' ? () => triggers.push(h) : () => c }); return c; },
    },
    HtmlService: { createHtmlOutput: html => ({ html, setTitle() { return this; }, addMetaTag() { return this; }, getContent() { return html; } }) },
    ContentService: { createTextOutput: s => ({ s, setMimeType() { return this; }, getContent() { return s; } }), MimeType: { JSON: 'json' } },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(codePath, 'utf8'), ctx, { filename: 'Code.gs' });
  // Older suites expect TR-2569-0001, 0002…; jobnos.js tests the real random numbers ({ realJobNo: true })
  if (!opts.realJobNo) { let n = 0; ctx.nextJobNo_ = () => 'TR-' + (new Date().getFullYear() + 543) + '-' + String(++n).padStart(4, '0'); }
  return {
    ctx, sheets, mail, cache, drive, triggers, beam, props,
    post: body => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).getContent()),
    lastCode: () => { const m = mail[mail.length - 1]; return m && /(\d{6})/.exec(m.subject)[1]; },
  };
}
module.exports = { load };

/*
 * verify.js — "Check a certification" page (#verify). The QR on a certified translation opens
 * /?verify=XXXX-XXXX-XXXX; this page looks the code up (Apps Script action verifyCert) and shows
 * the certification date, the document, the language pair, the pages and who certified it.
 * Never the customer's name (terms 4.6).
 */
(function () {
  "use strict";

  var App = window.App;
  var t = App.t;
  var CFG = App.config;
  var CODE_RE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;
  var last = null;   // last result, redrawn when the language changes

  function $(sel) { return document.querySelector(sel); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function norm(v) {
    var c = String(v || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
    return c.length === 12 ? c.slice(0, 4) + "-" + c.slice(4, 8) + "-" + c.slice(8) : "";
  }

  function longDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
    if (!m) return "";
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    try { return d.toLocaleDateString(App.getLang() === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "long", year: "numeric" }); }
    catch (e) { return iso; }
  }
  function catName(code) { var k = "cat." + code, v = t(k); return v === k ? code : v; }
  function pairName(id) {
    var p = (CFG.languagePairs || []).filter(function (x) { return x.id === id; })[0];
    return p ? (p[App.getLang()] || p.th) : id;
  }

  function render() {
    var box = $("#verify-card");
    if (!box) return;
    box.textContent = "";
    if (!last) { box.hidden = true; return; }
    var c = last;
    box.hidden = false;
    box.className = "verify-card is-" + c.status;
    var head = el("div", "verify-head");
    var icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("class", "verify-icon");
    icon.innerHTML = c.status === "valid"
      ? '<circle cx="12" cy="12" r="10" fill="currentColor" opacity=".15"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'
      : c.status === "revoked"
        ? '<circle cx="12" cy="12" r="10" fill="currentColor" opacity=".15"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'
        : '<circle cx="12" cy="12" r="10" fill="currentColor" opacity=".15"/><path d="M12 7v5.5l3 2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>';
    head.appendChild(icon);
    var ht = el("div");
    ht.appendChild(el("h2", "h3 verify-title", t("verify.result." + c.status)));
    ht.appendChild(el("p", "verify-sub", t("verify.resultText." + c.status, { serviceName: App.fill("{serviceName}") })));
    head.appendChild(ht);
    box.appendChild(head);
    var dl = el("dl", "verify-dl");
    [
      ["verify.f.code", c.code],
      ["verify.f.date", c.status === "valid" ? longDate(c.certifiedAt) : ""],
      ["verify.f.doc", c.docTitle ? c.docTitle + " (" + catName(c.category) + ")" : catName(c.category)],
      ["verify.f.lang", pairName(c.langPair)],
      ["verify.f.pages", c.pages ? t("verify.pagesN", { n: c.pages }) : ""],
      ["verify.f.certifier", c.certifier],
      ["verify.f.jobNo", c.jobNo]
    ].forEach(function (r) {
      if (!r[1]) return;
      var d = el("div");
      d.appendChild(el("dt", null, t(r[0])));
      d.appendChild(el("dd", null, r[1]));
      dl.appendChild(d);
    });
    box.appendChild(dl);
    if (c.status === "valid") box.appendChild(el("p", "note", t("verify.compare")));
    var help = el("p", "note");
    help.appendChild(document.createTextNode(t("verify.help") + " "));
    var a = el("button", "btn-link inline", t("nav.contact"));
    a.type = "button";
    a.setAttribute("data-goto", "contact");
    help.appendChild(a);
    box.appendChild(help);
  }

  function lookup(code, btn) {
    var status = $("#verify-status");
    if (!CFG.appsScriptUrl || !App.api) { App.showStatus(status, "", t("verify.notReady")); return; }
    last = null;
    render();
    App.showStatus(status, "", t("verify.checking"));
    if (btn) btn.disabled = true;
    App.api("verifyCert", { code: code }).then(function (res) {
      App.showStatus(status, "", "");
      last = res.cert;
      render();
      var box = $("#verify-card");
      if (box) box.focus({ preventScroll: false });
    }, function (err) {
      var k = err.code === "not_found" ? "verify.notFound"
        : err.code === "invalid_code" ? "verify.badCode"
        : err.code === "rate_limited" ? "verify.tooMany"
        : err.code === "network" ? "acct.err.network" : "acct.err.server";
      App.showStatus(status, "error", t(k));
    }).then(function () { if (btn) btn.disabled = false; });
  }

  function init() {
    var form = $("#verify-form"), input = $("#v-code");
    if (!form) return;
    input.addEventListener("input", function () { App.setFieldError(input, null); });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var code = norm(input.value);
      if (!code || !CODE_RE.test(code)) { App.setFieldError(input, [t("verify.badCode")]); input.focus(); return; }
      input.value = code;
      App.setFieldError(input, null);
      lookup(code, form.querySelector('button[type="submit"]'));
    });
    document.addEventListener("langchange", render);
    // Opened from a QR: /?verify=XXXX-XXXX-XXXX
    var m = /[?&]verify=([^&#]+)/.exec(location.search || "");
    if (m) {
      var code = norm(decodeURIComponent(m[1]));
      if (App.showTab) App.showTab("verify");
      try { history.replaceState(null, "", location.pathname + "#verify"); } catch (e) { /* sandboxed */ }
      if (code) { input.value = code; lookup(code, null); }
      else App.setFieldError(input, [t("verify.badCode")]);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

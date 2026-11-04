/*
 * track.js — Phase 4: status lookup on the "Track your job" page.
 * app.js checks the form and fires "tracksubmit"; this asks Apps Script (action trackJob)
 * with the job number + email and shows a card: status, a step timeline and what happens next.
 * The server only answers status and dates, and says "not found" for any wrong pair.
 * Without APP_CONFIG.appsScriptUrl the form keeps showing the "coming soon" notice (app.js).
 */
(function () {
  "use strict";

  var App = window.App;
  var CFG = App.config;
  var t = App.t;
  var STEPS = ["received", "quoted", "paid", "inProgress", "delivered"];
  var last = null;      // last job shown, redrawn when the language changes
  var lastErr = null;   // last error code, re-worded when the language changes

  function $(sel) { return document.querySelector(sel); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // "2026-11-04" → local date (no time-zone shift), shown in the page language
  function fmtDay(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
    if (!m) return "";
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    try {
      return d.toLocaleDateString(App.getLang() === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
    } catch (e) { return s; }
  }

  function label(prefix, value) {
    if (!value) return "";
    if (prefix === "pair") {
      var pairs = CFG.languagePairs || [];
      for (var i = 0; i < pairs.length; i++) if (pairs[i].id === value) return pairs[i][App.getLang()] || pairs[i].th;
      return value;
    }
    var key = prefix + "." + value, txt = t(key);
    return txt === key ? value : txt;
  }

  function render(job) {
    var card = $("#track-card");
    if (!card) return;
    card.textContent = "";
    var status = STEPS.indexOf(job.status) > -1 || job.status === "cancelled" ? job.status : "other";

    var head = el("div", "track-head");
    var who = el("div");
    who.appendChild(el("p", "track-label", t("track.jobNo")));
    who.appendChild(el("p", "track-no", job.jobNo));
    head.appendChild(who);
    head.appendChild(el("span", "status-chip status-" + status, t("status." + status)));
    card.appendChild(head);

    var meta = [label("cat", job.category), label("pair", job.langPair)];
    if (job.pages) meta.push(t("acct.pagesN", { pages: job.pages }));
    meta = meta.filter(Boolean).join(" · ");
    if (meta) card.appendChild(el("p", "job-meta", meta));

    if (status !== "cancelled") {
      // Timeline: done ✓ · current (highlighted) · still to come
      var at = status === "other" ? 0 : STEPS.indexOf(status);
      var ol = el("ol", "track-steps");
      ol.setAttribute("aria-label", t("track.stepsLabel"));
      STEPS.forEach(function (s, i) {
        var li = el("li", i < at ? "done" : i === at ? "current" : "todo");
        if (i === at) li.setAttribute("aria-current", "step");
        if (s === "delivered" && status === "delivered") li.className = "done current";
        var dot = el("span", "track-dot");
        dot.setAttribute("aria-hidden", "true");
        li.appendChild(dot);
        var text = el("span", "track-step");
        text.appendChild(el("span", "track-step-name", t("status." + s)));
        var day = s === "received" ? job.submittedAt : s === "delivered" ? job.deliveredAt : "";
        if (day && i <= at) text.appendChild(el("span", "track-step-date", fmtDay(day)));
        li.appendChild(text);
        ol.appendChild(li);
      });
      card.appendChild(ol);
    }

    var next = el("p", "track-next" + (status === "cancelled" ? " is-cancelled" : ""));
    next.textContent = t("track.next." + status);
    card.appendChild(next);
    if (status === "delivered" && job.confirmedAt) {
      card.appendChild(el("p", "track-confirmed", t("track.confirmed", { date: fmtDay(job.confirmedAt) })));
    }

    var dl = el("dl", "track-dates");
    [["track.submittedAt", job.submittedAt], ["track.neededBy", job.neededBy], ["track.deliveredAt", job.deliveredAt]]
      .forEach(function (row) {
        if (!row[1]) return;
        var div = el("div");
        div.appendChild(el("dt", null, t(row[0])));
        div.appendChild(el("dd", null, fmtDay(row[1])));
        dl.appendChild(div);
      });
    if (dl.childNodes.length) card.appendChild(dl);

    var help = el("p", "track-help");
    help.appendChild(document.createTextNode(t("track.help") + " "));
    var link = el("button", "btn-link inline", t("track.contact"));
    link.type = "button";
    link.setAttribute("data-goto", "contact");
    help.appendChild(link);
    card.appendChild(help);
    card.hidden = false;
  }

  function errorText(code) {
    var key = "track.err." + code, txt = t(key);
    return txt === key ? t("track.err.server") : txt;
  }

  function lookup(d) {
    var form = $("#track-form"), out = $("#track-result"), card = $("#track-card");
    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    App.showStatus(out, "", t("track.checking"));
    if (card) card.hidden = true;
    last = null;
    lastErr = null;
    App.api("trackJob", { jobNo: d.jobNo, email: d.email }).then(function (res) {
      App.showStatus(out, "", "");
      last = res.job;
      render(last);
      if (card) { card.focus({ preventScroll: true }); card.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
    }, function (err) {
      lastErr = (err && err.code) || "server";
      App.showStatus(out, "error", errorText(lastErr));
    }).then(function () {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
    });
  }

  function init() {
    document.addEventListener("tracksubmit", function (e) {
      if (!CFG.appsScriptUrl) return;   // not connected yet: app.js shows "coming soon"
      e.preventDefault();
      lookup(e.detail);
    });

    // Changing the number or email hides the old answer
    ["#t-jobNo", "#t-email"].forEach(function (s) {
      var input = $(s);
      if (input) input.addEventListener("input", function () {
        var card = $("#track-card");
        if (card && !card.hidden) { card.hidden = true; last = null; }
        if (lastErr) { App.showStatus($("#track-result"), "", ""); lastErr = null; }
      });
    });

    // Signed-in customers: their email is filled in for them
    document.addEventListener("tabchange", function (e) {
      if (!e.detail || e.detail.tab !== "track") return;
      var email = $("#t-email"), acc = App.account;
      var p = acc && acc.isSignedIn() ? acc.profile() : null;
      if (email && !email.value && p && p.email) email.value = p.email;
    });

    document.addEventListener("langchange", function () {
      if (last) render(last);
      var out = $("#track-result");
      if (lastErr && out && !out.hidden) App.showStatus(out, "error", errorText(lastErr));
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

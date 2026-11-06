/*
 * account.js — customer accounts: sign in with a 6-digit code sent by email,
 * job history, profile (fills in the job form), sign out, delete account.
 * Backend: apps-script/Code.gs (doPost actions). Needs APP_CONFIG.appsScriptUrl.
 *
 * Exposes App.api(action, payload) for Phase 3/4, and App.account
 * ({ token, profile, isSignedIn }).
 */
(function () {
  "use strict";

  var App = window.App;
  var CFG = App.config;
  var t = App.t;
  var TOKEN_KEY = "tr_session";

  var state = {
    token: null,        // kept in localStorage (key tr_session) when the browser allows it
    profile: null,
    jobs: [],
    pendingEmail: "",
    resendAt: 0,
    isNew: false
  };

  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function show(el, on) { if (el) el.hidden = !on; }

  /* ---------- API ---------- */
  function apiError(code) { var e = new Error(code); e.code = code; return e; }

  function api(action, payload) {
    if (!CFG.appsScriptUrl) return Promise.reject(apiError("not_configured"));
    var body = { action: action, lang: App.getLang() };
    for (var k in payload) body[k] = payload[k];
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 30000);
    // text/plain avoids a CORS preflight, which Apps Script does not answer
    return fetch(CFG.appsScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
      redirect: "follow",
      signal: ctrl ? ctrl.signal : undefined
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        clearTimeout(timer);
        if (!res || !res.ok) throw apiError((res && res.error) || "server");
        return res;
      }, function () {
        clearTimeout(timer);
        throw apiError("network");
      });
  }

  function errorText(err) {
    var code = (err && err.code) || "server";
    if (code === "not_configured") return t("acct.offline");
    if (code === "invalid_email") return t("err.email");
    if (code === "invalid_line") return t("err.line");
    if (code === "invalid_phone") return t("err.phone");
    var key = "acct.err." + code;
    var txt = t(key);
    return txt === key ? t("acct.err.server") : txt;
  }

  /* ---------- session ---------- */
  function saveToken(tok) {
    state.token = tok;
    if (tok) App.storage.set(TOKEN_KEY, tok);
    else App.storage.remove(TOKEN_KEY);
  }

  function signedOut(message) {
    saveToken(null);
    state.profile = null;
    state.jobs = [];
    render();
    if (message) App.showStatus($("#acct-signin-status"), "", message);
  }

  function handleAuthError(err, statusEl) {
    if (err.code === "session_expired") { signedOut(t("acct.err.session_expired")); return; }
    App.showStatus(statusEl, "error", errorText(err));
  }

  /* ---------- busy buttons ---------- */
  function busy(btn, on) {
    if (!btn) return;
    if (on) {
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");
      btn.setAttribute("data-label", btn.getAttribute("data-i18n") || "");
      btn.textContent = t("acct.working");
    } else {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      var key = btn.getAttribute("data-label");
      if (key) btn.textContent = t(key);
    }
  }

  /* ---------- rendering ---------- */
  function firstName() {
    var n = state.profile && state.profile.name ? state.profile.name.trim() : "";
    return n ? n.split(/\s+/)[0] : "";
  }

  function render() {
    var configured = !!CFG.appsScriptUrl;
    var signedIn = !!(state.token && state.profile);
    var loading = !!(state.token && !state.profile);

    show($("#acct-offline"), !configured);
    show($("#acct-loading"), configured && loading);
    show($("#acct-signin"), configured && !state.token);
    show($("#acct-home"), configured && signedIn);

    // Header button and menu label
    $all("[data-account-label]").forEach(function (el) {
      el.textContent = signedIn ? (firstName() || t("nav.account")) : (state.token ? t("nav.account") : t("acct.signIn"));
    });
    $all(".account-btn").forEach(function (b) { b.classList.toggle("is-signed-in", signedIn); });

    if (signedIn) {
      var name = firstName();
      $("#acct-hello").textContent = name ? t("acct.hello", { name: name }) : t("acct.helloNoName");
      show($("#acct-welcome"), state.isNew && !state.profile.name);
      fillProfileForm();
      renderJobs();
    }
    renderPrefillHint();
    // js/portal.js draws the dashboard for the person's role
    document.dispatchEvent(new CustomEvent("accountchange", { detail: { signedIn: signedIn, profile: state.profile, jobs: state.jobs } }));
  }

  function fmtDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d)) return String(iso);
    try {
      return d.toLocaleDateString(App.getLang() === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
    } catch (e) { return d.toDateString(); }
  }

  function labelFor(prefix, value) {
    if (!value) return "";
    if (prefix === "pair") {
      for (var i = 0; i < CFG.languagePairs.length; i++) {
        var p = CFG.languagePairs[i];
        if (p.id === value) return p[App.getLang()] || p.th;
      }
      return value;
    }
    var key = "cat." + value;
    var txt = t(key);
    return txt === key ? value : txt;
  }

  function renderJobs() {
    var list = $("#acct-jobs");
    if (!list) return;
    list.textContent = "";
    if (!state.jobs.length) {
      var empty = document.createElement("li");
      empty.className = "job-empty";
      empty.textContent = t("acct.jobsEmpty");
      list.appendChild(empty);
      return;
    }
    state.jobs.forEach(function (j) {
      var li = document.createElement("li");
      li.className = "job-item";

      var top = document.createElement("div");
      top.className = "job-top";
      var no = document.createElement("span");
      no.className = "job-no";
      no.textContent = j.jobNo;
      var chip = document.createElement("span");
      chip.className = "status-chip status-" + (j.status || "other");
      chip.textContent = t("status." + (j.status || "other"));
      top.appendChild(no);
      top.appendChild(chip);

      var meta = document.createElement("p");
      meta.className = "job-meta";
      var parts = [labelFor("cat", j.category), labelFor("pair", j.langPair)];
      if (j.pages) parts.push(t("acct.pagesN", { pages: j.pages }));
      meta.textContent = parts.filter(Boolean).join(" · ");

      var dates = document.createElement("p");
      dates.className = "job-dates";
      var d = [];
      if (j.submittedAt) d.push(t("acct.submitted", { date: fmtDate(j.submittedAt) }));
      if (j.neededBy) d.push(t("acct.neededBy", { date: fmtDate(j.neededBy) }));
      dates.textContent = d.join(" · ");

      li.appendChild(top);
      if (meta.textContent) li.appendChild(meta);
      if (dates.textContent) li.appendChild(dates);
      list.appendChild(li);
    });
  }

  var PROFILE_FIELDS = ["name", "line", "phone", "nameSpelling", "langPair"];

  function fillProfileForm() {
    var p = state.profile;
    $("#p-email").value = p.email || "";
    PROFILE_FIELDS.forEach(function (k) {
      var el = document.getElementById("p-" + k);
      if (el && document.activeElement !== el) el.value = p[k] || "";
    });
  }

  /* ---------- job form: fill in from the account ---------- */
  function renderPrefillHint() {
    var box = $("#acct-prefill");
    if (!box) return;
    var configured = !!CFG.appsScriptUrl;
    var signedIn = !!(state.token && state.profile);
    show(box, configured);
    show($("#acct-prefill-ask"), !signedIn);
    show($("#acct-prefill-done"), signedIn && box.getAttribute("data-filled") === "1");
    if (signedIn && box.getAttribute("data-filled") !== "1") box.hidden = true;
  }

  function prefillJobForm() {
    var p = state.profile;
    if (!p) return;
    var map = { "f-name": p.name, "f-email": p.email, "f-line": p.line, "f-phone": p.phone, "f-nameSpelling": p.nameSpelling, "f-langPair": p.langPair };
    var filled = false;
    for (var id in map) {
      var el = document.getElementById(id);
      if (el && !el.value && map[id]) { el.value = map[id]; filled = true; }
    }
    var box = $("#acct-prefill");
    if (box && filled) box.setAttribute("data-filled", "1");
    renderPrefillHint();
  }

  /* ---------- sign in ---------- */
  var resendTimer = null;

  function updateResend() {
    var btn = $("#a-resend");
    if (!btn) return;
    var left = Math.ceil((state.resendAt - Date.now()) / 1000);
    if (left > 0) {
      btn.disabled = true;
      btn.textContent = t("acct.resendIn", { sec: left });
    } else {
      btn.disabled = false;
      btn.textContent = t("acct.resend");
      clearInterval(resendTimer);
      resendTimer = null;
    }
  }

  function startResendTimer(sec) {
    state.resendAt = Date.now() + (sec || 60) * 1000;
    clearInterval(resendTimer);
    resendTimer = setInterval(updateResend, 1000);
    updateResend();
  }

  function showCodeStep(email) {
    state.pendingEmail = email;
    show($("#acct-email-form"), false);
    show($("#acct-code-form"), true);
    $("#acct-code-sent").textContent = t("acct.codeSent", { email: email });
    App.showStatus($("#acct-signin-status"), "", "");
    var code = $("#a-code");
    code.value = "";
    App.setFieldError(code, null);
    code.focus();
  }

  function showEmailStep() {
    show($("#acct-code-form"), false);
    show($("#acct-email-form"), true);
    App.showStatus($("#acct-signin-status"), "", "");
    $("#a-email").focus();
  }

  function requestCode(email, btn) {
    busy(btn, true);
    return api("requestCode", { email: email })
      .then(function (res) {
        showCodeStep(email);
        startResendTimer(res.resendSec);
      }, function (err) {
        if (err.code === "invalid_email") App.setFieldError($("#a-email"), [t("err.email")]);
        else App.showStatus($("#acct-signin-status"), "error", errorText(err));
      })
      .then(function () {
        busy(btn, false);
        updateResend();   // the resend button has a countdown, not a fixed label
      });
  }

  function initSignIn() {
    var emailForm = $("#acct-email-form");
    var codeForm = $("#acct-code-form");
    if (!emailForm) return;

    emailForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var input = $("#a-email");
      var email = input.value.trim().toLowerCase();
      if (!email) { App.setFieldError(input, [t("err.required")]); input.focus(); return; }
      if (!App.rules.email.test(email)) { App.setFieldError(input, [t("err.email")]); input.focus(); return; }
      App.setFieldError(input, null);
      requestCode(email, emailForm.querySelector('button[type="submit"]'));
    });
    $("#a-email").addEventListener("input", function () { App.setFieldError(this, null); });

    var codeInput = $("#a-code");
    codeInput.addEventListener("input", function () {
      var digits = codeInput.value.replace(/\D/g, "").slice(0, 6);
      if (digits !== codeInput.value) codeInput.value = digits;
      App.setFieldError(codeInput, null);
    });

    codeForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var code = codeInput.value.replace(/\D/g, "");
      if (code.length !== 6) { App.setFieldError(codeInput, [t("acct.err.code_format")]); codeInput.focus(); return; }
      var btn = codeForm.querySelector('button[type="submit"]');
      busy(btn, true);
      api("verifyCode", { email: state.pendingEmail, code: code })
        .then(function (res) {
          saveToken(res.token);
          state.profile = res.profile;
          state.isNew = !!res.isNew;
          state.jobs = [];
          clearInterval(resendTimer);
          show($("#acct-code-form"), false);
          show($("#acct-email-form"), true);
          render();
          loadAccount();          // job history
          var h = $("#acct-hello");
          if (h) { h.tabIndex = -1; h.focus(); }
        }, function (err) {
          if (err.code === "code_invalid") App.setFieldError(codeInput, [errorText(err)]);
          else App.showStatus($("#acct-signin-status"), "error", errorText(err));
          codeInput.select();
        })
        .then(function () { busy(btn, false); });
    });

    $("#a-resend").addEventListener("click", function () {
      requestCode(state.pendingEmail, this);
    });
    $("#a-change").addEventListener("click", showEmailStep);
  }

  /* ---------- signed in ---------- */
  function loadAccount() {
    if (!state.token || !CFG.appsScriptUrl) return Promise.resolve();
    return api("getAccount", { token: state.token })
      .then(function (res) {
        state.profile = res.profile;
        state.jobs = res.jobs || [];
        render();
        if (document.querySelector("#submit:not([hidden])")) prefillJobForm();
      }, function (err) {
        if (err.code === "session_expired") signedOut();
        else if (!state.profile) {
          // Can't reach the server: keep the token, show the error on the sign-in area
          render();
          App.showStatus($("#acct-signin-status"), "error", errorText(err));
        }
      });
  }

  function validateProfile() {
    var bad = null;
    var line = $("#p-line"), phone = $("#p-phone");
    var lv = line.value.trim();
    var lineErr = lv && !App.rules.line.test(lv) ? [t("err.line")] : null;
    App.setFieldError(line, lineErr);
    if (lineErr) bad = bad || line;
    var pv = phone.value.trim(), digits = pv.replace(/\D/g, "");
    var phoneErr = pv && !(/^[+\d][\d\s\-()]*$/.test(pv) && digits.length >= 9 && digits.length <= 15) ? [t("err.phone")] : null;
    App.setFieldError(phone, phoneErr);
    if (phoneErr) bad = bad || phone;
    return bad;
  }

  function initHome() {
    var form = $("#acct-profile");
    if (!form) return;
    var status = $("#acct-profile-status");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var bad = validateProfile();
      if (bad) { bad.focus(); return; }
      var profile = { lang: App.getLang() };
      PROFILE_FIELDS.forEach(function (k) { profile[k] = document.getElementById("p-" + k).value.trim(); });
      var btn = form.querySelector('button[type="submit"]');
      busy(btn, true);
      api("updateProfile", { token: state.token, profile: profile })
        .then(function (res) {
          state.profile = res.profile;
          state.isNew = false;
          render();
          App.showStatus(status, "success", t("acct.saved"));
        }, function (err) { handleAuthError(err, status); })
        .then(function () { busy(btn, false); });
    });
    ["#p-line", "#p-phone"].forEach(function (sel) {
      $(sel).addEventListener("input", function () { App.setFieldError(this, null); App.showStatus(status, "", ""); });
    });

    var refresh = $("#a-refresh");
    if (refresh) refresh.addEventListener("click", function () {
      busy(refresh, true);
      loadAccount().then(function () { busy(refresh, false); });
    });

    $("#a-logout").addEventListener("click", function () {
      var tok = state.token;
      api("logout", { token: tok }).catch(function () { /* signing out locally is enough */ });
      clearJobFormFromAccount();
      signedOut(t("acct.loggedOut"));
      $("#a-email").focus();
    });

    var confirmBox = $("#acct-delete-confirm");
    $("#a-delete").addEventListener("click", function () {
      show(confirmBox, true);
      $("#a-delete-yes").focus();
    });
    $("#a-delete-no").addEventListener("click", function () {
      show(confirmBox, false);
      $("#a-delete").focus();
    });
    $("#a-delete-yes").addEventListener("click", function () {
      var btn = this;
      busy(btn, true);
      api("deleteAccount", { token: state.token })
        .then(function () {
          show(confirmBox, false);
          clearJobFormFromAccount();
          signedOut(t("acct.deleted"));
        }, function (err) { handleAuthError(err, status); })
        .then(function () { busy(btn, false); });
    });
  }

  // After signing out, don't leave the account's details sitting in the job form
  function clearJobFormFromAccount() {
    var p = state.profile;
    if (!p) return;
    var map = { "f-name": p.name, "f-email": p.email, "f-line": p.line, "f-phone": p.phone, "f-nameSpelling": p.nameSpelling };
    for (var id in map) {
      var el = document.getElementById(id);
      if (el && map[id] && el.value === map[id]) el.value = "";
    }
    var box = $("#acct-prefill");
    if (box) box.removeAttribute("data-filled");
  }

  /* ---------- start ---------- */
  function init() {
    state.token = App.storage.get(TOKEN_KEY);
    if (state.token && !/^[0-9a-f]{64}$/.test(state.token)) saveToken(null);

    initSignIn();
    initHome();
    render();
    updateResend();
    loadAccount();

    document.addEventListener("langchange", function () {
      render();
      if (state.pendingEmail && !$("#acct-code-form").hidden) {
        $("#acct-code-sent").textContent = t("acct.codeSent", { email: state.pendingEmail });
      }
      updateResend();
    });
    document.addEventListener("tabchange", function (e) {
      if (e.detail.tab === "submit") prefillJobForm();
    });
    // A job was just sent: refresh the history
    document.addEventListener("jobsubmitted", function () { loadAccount(); });
  }

  App.api = api;
  App.account = {
    token: function () { return state.token; },
    profile: function () { return state.profile; },
    jobs: function () { return state.jobs.slice(); },
    reload: function () { return loadAccount(); },
    isSignedIn: function () { return !!(state.token && state.profile); },
    expired: function () { signedOut(t("acct.err.session_expired")); }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

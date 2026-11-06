/*
 * submit.js — Phase 3: send the job form to Apps Script.
 * createJob (details) → uploadFile (one request per file) → finishJob (emails, status).
 * If the connection drops, pressing Submit again carries on with the same job number and
 * only sends the files that did not arrive. Without APP_CONFIG.appsScriptUrl the form keeps
 * showing the "not open yet" notice (app.js).
 */
(function () {
  "use strict";

  var App = window.App;
  var CFG = App.config;
  var t = App.t;
  var pending = null;   // { key, jobNo, token, sent: { "doc:name": true } } while a job is half-sent

  function $(sel) { return document.querySelector(sel); }

  function readBase64(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(",")[1] || ""); };
      r.onerror = function () { reject(Object.assign(new Error("read"), { code: "bad_file" })); };
      r.readAsDataURL(file);
    });
  }

  // Same file name twice (e.g. "image.jpg" photos): number them so none is lost
  function uniqueNames(list, used) {
    return list.map(function (f) {
      var name = f.name, n = 2;
      var dot = name.lastIndexOf(".");
      var stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : "";
      while (used[name]) name = stem + " (" + (n++) + ")" + ext;
      used[name] = true;
      return { file: f, name: name };
    });
  }

  // Identifies "the same job" so a retry can resume instead of creating a second one
  function jobKey(d, files) {
    return JSON.stringify([d.email, d.name, d.category, d.neededBy, files.map(function (x) { return x.kind + x.name + x.file.size; })]);
  }

  function status(kind, text) { App.showStatus($("#form-status"), kind, text); }

  function progress(value, max) {
    var bar = $("#submit-progress");
    if (!bar) return;
    bar.hidden = value === null;
    if (value !== null) { bar.max = max; bar.value = value; }
  }

  function errorText(err) {
    var code = (err && err.code) || "server";
    var key = "submit.err." + code;
    var txt = t(key);
    if (txt !== key) return txt;
    if (/^invalid_|consent|files_required|id_required/.test(code)) return t("submit.err.check");
    return t("submit.err.server");
  }

  function send(d) {
    var form = $("#job-form");
    var btn = form.querySelector('button[type="submit"]');
    var used = {};
    var files = uniqueNames(d.files, used).map(function (x) { x.kind = "doc"; return x; })
      .concat(uniqueNames(d.idFiles || [], used).map(function (x) { x.kind = "id"; return x; }));
    var key = jobKey(d, files);
    if (pending && pending.key !== key) pending = null;

    form.classList.add("is-sending");
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    status("", t("submit.sending"));
    progress(0, files.length + 1);
    // pop-up over the page until it's done, so nobody closes the page half-way
    App.busy.open({ title: t("busy.sendTitle"), text: t("busy.wait") });
    App.busy.step(t("busy.preparing"), 0, files.length + 1);

    var job = {
      name: d.name, email: d.email, line: d.line, phone: d.phone, langPair: d.langPair, category: d.category,
      pages: d.pages, neededBy: d.neededBy, certified: d.certified, nameSpelling: d.nameSpelling, notes: d.notes,
      shipping: d.shipping, address: d.address, consent: d.consent, idConsent: d.idConsent,
      files: files.filter(function (x) { return x.kind === "doc"; }).map(function (x) { return { name: x.name, size: x.file.size }; }),
      idFiles: files.filter(function (x) { return x.kind === "id"; }).map(function (x) { return { name: x.name, size: x.file.size }; })
    };

    var start = pending ? Promise.resolve(pending) : App.api("createJob", { job: job, hp: d.hp }).then(function (res) {
      pending = { key: key, jobNo: res.jobNo, token: res.uploadToken, sent: {} };
      return pending;
    });

    return start.then(function (p) {
      // One file at a time keeps each request small enough for Apps Script
      var chain = Promise.resolve();
      files.forEach(function (x, i) {
        chain = chain.then(function () {
          status("", t("submit.uploading", { n: i + 1, total: files.length }));
          progress(i, files.length + 1);
          App.busy.step(t("submit.uploading", { n: i + 1, total: files.length }), i, files.length + 1);
          if (p.sent[x.kind + ":" + x.name]) return;
          return readBase64(x.file).then(function (data) {
            return App.api("uploadFile", { jobNo: p.jobNo, uploadToken: p.token, kind: x.kind, name: x.name, data: data });
          }).then(function () { p.sent[x.kind + ":" + x.name] = true; });
        });
      });
      return chain.then(function () {
        status("", t("submit.finishing"));
        progress(files.length, files.length + 1);
        App.busy.step(t("submit.finishing"), files.length, files.length + 1);
        return App.api("finishJob", { jobNo: p.jobNo, uploadToken: p.token });
      });
    }).then(function (res) {
      pending = null;
      showDone(res.jobNo, d.email);
      App.busy.done({ title: t("busy.sentTitle"), text: t("busy.sentText", { jobNo: res.jobNo }) });
    }, function (err) {
      if (err && err.code === "upload_expired") pending = null;   // start over next time
      App.busy.close();
      progress(null);
      status("error", errorText(err));
    }).then(function () {
      form.classList.remove("is-sending");
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
    });
  }

  function showDone(jobNo, email) {
    progress(null);
    status("", "");
    $("#job-form").hidden = true;
    ["#form-prefilled", "#acct-prefill"].forEach(function (s) { var el = $(s); if (el) el.hidden = true; });
    var done = $("#submit-done");
    $("#submit-done-no").textContent = jobNo;
    $("#submit-done-text").textContent = t("submit.doneText", { email: email });
    done.setAttribute("data-email", email);
    done.hidden = false;
    done.focus({ preventScroll: true });
    done.scrollIntoView({ block: "center" });
    // Let the track form and account history know
    var trackNo = $("#t-jobNo"), trackEmail = $("#t-email");
    if (trackNo) trackNo.value = jobNo;
    if (trackEmail) trackEmail.value = email;
    document.dispatchEvent(new CustomEvent("jobsubmitted", { detail: { jobNo: jobNo, email: email } }));
  }

  function init() {
    document.addEventListener("jobsubmit", function (e) {
      if (!CFG.appsScriptUrl) return;   // not connected yet: app.js shows the "not open yet" notice
      e.preventDefault();
      send(e.detail);
    });

    var copy = $("#submit-copy");
    if (copy) copy.addEventListener("click", function () {
      var no = $("#submit-done-no").textContent;
      var done = function () { copy.textContent = t("submit.copied"); setTimeout(function () { copy.textContent = t("submit.copy"); }, 2000); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(no).then(done, function () {});
      else {
        var r = document.createRange(); r.selectNodeContents($("#submit-done-no"));
        var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
        try { document.execCommand("copy"); done(); } catch (err) { /* text stays selected */ }
      }
    });

    var again = $("#submit-another");
    if (again) again.addEventListener("click", function () {
      App.resetJobForm();
      $("#submit-done").hidden = true;
      $("#job-form").hidden = false;
      document.dispatchEvent(new CustomEvent("tabchange", { detail: { tab: "submit" } }));   // re-fill from the account
      var first = $("#f-name");
      if (first) first.focus();
    });

    document.addEventListener("langchange", function () {
      var done = $("#submit-done");
      if (done && !done.hidden) $("#submit-done-text").textContent = t("submit.doneText", { email: done.getAttribute("data-email") || "" });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

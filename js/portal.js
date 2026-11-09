/*
 * portal.js — Phase 5: the signed-in dashboard, one per role.
 *   customer: overview · orders (open / closed / cancel requests) · job detail with timeline,
 *             translated-file downloads and a cancel request · quotes & payment (Phase 6) · settings
 *   staff:    my assigned jobs · job detail (no customer contact details) · source files,
 *             upload translations, start / ready for checking, internal notes · settings
 *   admin:    overview · all jobs (search, filters) · job detail (assign, status, deliver,
 *             cancel requests, notes, files) · users (roles, customer types) · discounts · settings
 * Roles come from the server (profile.role); every action is checked again on the server.
 * The translator is never named to customers.
 */
(function () {
  "use strict";

  var App = window.App;
  var CFG = App.config;
  var t = App.t;
  var STEPS = ["received", "quoted", "paid", "inProgress", "review", "delivered"];
  var OPEN = ["received", "quoted", "paid", "inProgress", "review"];
  var STATUS_CODES = STEPS.concat(["cancelled"]);
  var TYPES = ["general", "corporate", "agency", "student"];

  var state = { role: null, view: null, arg: null, seq: 0 };

  /* ---------- small helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function button(label, cls, onClick) {
    var b = el("button", cls || "btn btn-outline btn-sm", label);
    b.type = "button";
    if (onClick) b.addEventListener("click", onClick);
    return b;
  }
  function busy(btn, on) {
    if (!btn) return;
    btn.disabled = !!on;
    if (on) btn.setAttribute("aria-busy", "true"); else btn.removeAttribute("aria-busy");
  }
  function day(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
    if (!m) {
      var d0 = new Date(s);
      if (!s || isNaN(d0)) return "";
      m = [0, d0.getFullYear(), d0.getMonth() + 1, d0.getDate()];
    }
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    try { return d.toLocaleDateString(App.getLang() === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", year: "numeric" }); }
    catch (e) { return s; }
  }
  function isoDay(d) {
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function catName(c) { var k = "cat." + c, v = t(k); return v === k ? (c || "") : v; }
  function pairName(id) {
    var pairs = CFG.languagePairs || [];
    for (var i = 0; i < pairs.length; i++) if (pairs[i].id === id) return pairs[i][App.getLang()] || pairs[i].th;
    return id || "";
  }
  function statusChip(code) {
    code = STATUS_CODES.indexOf(code) > -1 ? code : "other";
    return el("span", "status-chip status-" + code, t("status." + code));
  }
  function errText(err) {
    var code = (err && err.code) || "server";
    var k = "dash.err." + code, v = t(k);
    if (v !== k) return v;
    k = "acct.err." + code; v = t(k);
    return v !== k ? v : t("acct.err.server");
  }
  function status(box, kind, text) { App.showStatus(box, kind, text); }

  function api(action, payload) {
    payload = payload || {};
    payload.token = App.account.token();
    return App.api(action, payload).catch(function (err) {
      if (err && err.code === "session_expired") App.account.expired();
      throw err;
    });
  }

  // Load something for the current view; drop the answer if the person has moved on
  function load(box, action, payload, draw) {
    var seq = ++state.seq;
    box.appendChild(el("p", "muted dash-loading", t("acct.loading")));
    return api(action, payload).then(function (res) {
      if (seq !== state.seq) return;
      var l = $(".dash-loading", box);
      if (l) l.remove();
      draw(res);
    }, function (err) {
      if (seq !== state.seq) return;
      var l = $(".dash-loading", box);
      if (l) l.remove();
      var s = el("div", "form-status error");
      s.setAttribute("role", "alert");
      s.textContent = errText(err);
      box.appendChild(s);
    });
  }

  function download(jobNo, file, btn) {
    busy(btn, true);
    api("jobFile", { jobNo: jobNo, fileId: file.id }).then(function (res) {
      var bin = atob(res.data), bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var url = URL.createObjectURL(new Blob([bytes], { type: res.mime || "application/octet-stream" }));
      var a = el("a");
      a.href = url; a.download = res.name || file.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }, function (err) { alertBox(btn, errText(err)); }).then(function () { busy(btn, false); });
  }
  function alertBox(near, text) {
    var box = near.closest(".dash-card") || $("#dash-view");
    var s = $(".dash-inline-status", box) || el("div", "dash-inline-status");
    box.appendChild(s);
    status(s, "error", text);
  }

  function readBase64(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(",")[1] || ""); };
      r.onerror = function () { reject({ code: "bad_file" }); };
      r.readAsDataURL(file);
    });
  }

  function sizeText(n) {
    if (n >= 1048576) return (n / 1048576).toFixed(1) + " MB";
    return Math.max(1, Math.round(n / 1024)) + " KB";
  }

  /* ---------- menus ---------- */
  var MENUS = {
    customer: [
      { view: "c-overview", key: "dash.overview" },
      { group: "dash.g.order", items: [{ go: "submit", key: "dash.upload" }, { view: "c-quotes", key: "dash.quotes" }] },
      { group: "dash.g.orders", items: [{ view: "c-orders", arg: "open", key: "dash.ordersOpen" },
                                        { view: "c-orders", arg: "closed", key: "dash.ordersClosed" },
                                        { view: "c-orders", arg: "cancel", key: "dash.ordersCancel" }] },
      { group: "dash.g.payment", items: [{ view: "c-pay", key: "dash.pay" }, { view: "c-payHistory", key: "dash.payHistory" }] },
      { group: "dash.g.account", items: [{ view: "settings", key: "dash.profile" }] }
    ],
    staff: [
      { view: "s-jobs", key: "dash.myJobs" },
      { group: "dash.g.account", items: [{ view: "settings", key: "dash.profile" }] }
    ],
    admin: [
      { view: "a-overview", key: "dash.overview" },
      { group: "dash.g.work", items: [{ view: "a-jobs", arg: "all", key: "dash.allJobs" }, { view: "s-jobs", key: "dash.myJobs" }] },
      { group: "dash.g.admin", items: [{ view: "a-users", key: "dash.users" }, { view: "a-discounts", key: "dash.discounts" },
                                       { view: "a-coupons", key: "dash.coupons" }, { view: "a-posts", arg: "news", key: "dash.posts" }] },
      { group: "dash.g.account", items: [{ view: "settings", key: "dash.profile" }] }
    ]
  };
  var HOME = { customer: "c-overview", staff: "s-jobs", admin: "a-overview" };
  // Detail views highlight their list in the menu
  var PARENT = { "c-job": "c-orders", "s-job": "s-jobs", "a-job": "a-jobs" };

  function drawMenu() {
    var nav = $("#dash-nav");
    if (!nav) return;
    nav.textContent = "";
    var current = PARENT[state.view] || state.view;
    function item(it) {
      var li = el("li");
      var b = button(t(it.key), "dash-link");
      if (it.go) b.setAttribute("data-goto", it.go);
      else {
        var on = it.view === current && (it.arg === undefined || it.arg === state.arg || it.view === "a-posts" || (PARENT[state.view] && it.arg === "open") || (PARENT[state.view] && it.arg === "all"));
        if (on) b.setAttribute("aria-current", "page");
        b.addEventListener("click", function () { show(it.view, it.arg); });
      }
      li.appendChild(b);
      return li;
    }
    (MENUS[state.role] || []).forEach(function (m) {
      var g = el("div", "dash-group");
      if (m.group) g.appendChild(el("p", "dash-group-title", t(m.group)));
      var ul = el("ul");
      (m.items || [m]).forEach(function (it) { ul.appendChild(item(it)); });
      g.appendChild(ul);
      nav.appendChild(g);
    });
    var out = el("div", "dash-group");
    var ul = el("ul"), li = el("li");
    li.appendChild(button(t("acct.logout"), "dash-link dash-logout", function () { var b = $("#a-logout"); if (b) b.click(); }));
    ul.appendChild(li); out.appendChild(ul); nav.appendChild(out);
  }

  /* ---------- page frame ---------- */
  function show(view, arg) {
    state.view = view;
    state.arg = arg;
    draw();
    // customer lists come from the account: fetch fresh statuses (redraws when they arrive)
    if (/^c-(overview|orders)$/.test(view)) App.account.reload();
    var main = $(".dash-main");
    if (main && window.innerWidth < 1024) main.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function draw() {
    if (!state.role) return;
    drawMenu();
    var box = $("#dash-view"), settings = $("#dash-settings");
    if (!box) return;
    state.seq++;
    box.textContent = "";
    var isSettings = state.view === "settings";
    if (settings) settings.hidden = !isSettings;
    box.hidden = isSettings;
    if (isSettings) return;
    (VIEWS[state.view] || VIEWS[HOME[state.role]])(box, state.arg);
  }

  function heading(box, key, extra) {
    var h = el("div", "dash-head");
    h.appendChild(el("h2", "h3", typeof key === "string" ? t(key) : key.text));
    if (extra) h.appendChild(extra);
    box.appendChild(h);
    return h;
  }
  function backButton(view, arg) {
    return button("← " + t("dash.back"), "btn-link", function () { show(view, arg); });
  }
  function card(box, titleKey) {
    var c = el("section", "dash-card");
    if (titleKey) c.appendChild(el("h3", "h4 dash-card-title", t(titleKey)));
    box.appendChild(c);
    return c;
  }
  function stat(grid, n, key, tone, onClick) {
    var s = el(onClick ? "button" : "div", "dash-stat" + (tone ? " tone-" + tone : ""));
    if (onClick) { s.type = "button"; s.addEventListener("click", onClick); }
    s.appendChild(el("span", "dash-stat-n", App.formatNumber(n)));
    s.appendChild(el("span", "dash-stat-label", t(key)));
    grid.appendChild(s);
  }
  function details(rows) {
    var dl = el("dl", "dash-dl");
    rows.forEach(function (r) {
      if (r[1] === "" || r[1] == null) return;
      var d = el("div");
      d.appendChild(el("dt", null, t(r[0])));
      var dd = el("dd");
      if (r[1] instanceof Node) dd.appendChild(r[1]); else dd.textContent = r[1];
      d.appendChild(dd);
      dl.appendChild(d);
    });
    return dl;
  }
  function steps(code) {
    var ol = el("ol", "track-steps dash-steps");
    if (code === "cancelled") return null;
    var at = Math.max(0, STEPS.indexOf(code));
    STEPS.forEach(function (s, i) {
      var li = el("li", i < at ? "done" : i === at ? "current" : "todo");
      if (s === "delivered" && code === "delivered") li.className = "done current";
      var dot = el("span", "track-dot"); dot.setAttribute("aria-hidden", "true");
      li.appendChild(dot);
      var st = el("span", "track-step");
      st.appendChild(el("span", "track-step-name", t("status." + s)));
      li.appendChild(st);
      ol.appendChild(li);
    });
    return ol;
  }
  function empty(box, key) { box.appendChild(el("p", "job-empty", t(key))); }

  // A list of jobs; each row opens the detail view
  function jobList(jobs, open, extra) {
    var ul = el("ul", "job-list");
    jobs.forEach(function (j) {
      var li = el("li");
      var b = el("button", "job-item job-item-btn");
      b.type = "button";
      b.addEventListener("click", function () { open(j); });
      var top = el("span", "job-top");
      top.appendChild(el("span", "job-no", j.jobNo));
      top.appendChild(statusChip(j.status));
      b.appendChild(top);
      var meta = [catName(j.category), pairName(j.langPair)];
      if (j.pages) meta.push(t("acct.pagesN", { pages: j.pages }));
      b.appendChild(el("span", "job-meta", meta.filter(Boolean).join(" · ")));
      var dates = [];
      if (j.submittedAt) dates.push(t("acct.submitted", { date: day(j.submittedAt) }));
      if (j.neededBy) dates.push(t("acct.neededBy", { date: day(j.neededBy) }));
      b.appendChild(el("span", "job-dates", dates.join(" · ")));
      var flags = el("span", "job-flags");
      if (extra) extra(j, flags);
      if (j.cancelRequested) flags.appendChild(el("span", "flag flag-warn", t("dash.flag.cancel")));
      if (j.status === "review" && state.role === "customer") flags.appendChild(el("span", "flag flag-review", t("dash.flag.review")));
      if (flags.childNodes.length) b.appendChild(flags);
      li.appendChild(b);
      ul.appendChild(li);
    });
    return ul;
  }
  function dueFlags(j, flags) {
    if (["delivered", "cancelled"].indexOf(j.status) > -1 || !j.neededBy) return;
    var today = isoDay(new Date()), soon = isoDay(new Date(Date.now() + 3 * 864e5));
    if (j.neededBy < today) flags.appendChild(el("span", "flag flag-bad", t("dash.flag.overdue")));
    else if (j.neededBy <= soon) flags.appendChild(el("span", "flag flag-warn", t("dash.flag.dueSoon")));
    if (j.readyAt) flags.appendChild(el("span", "flag flag-ok", t("dash.flag.ready")));
  }

  /* ---------- files (staff + admin) ---------- */
  function fileList(jobNo, files, canDelete, onChange) {
    var ul = el("ul", "dash-files");
    if (!files.length) { ul.appendChild(el("li", "muted", t("dash.noFiles"))); return ul; }
    files.forEach(function (f) {
      var li = el("li");
      var name = el("span", "dash-file-name", f.name);
      li.appendChild(name);
      li.appendChild(el("span", "dash-file-size", sizeText(f.size)));
      var dl = button(t("dash.download"), "btn btn-outline btn-sm");
      dl.addEventListener("click", function () { download(jobNo, f, dl); });
      li.appendChild(dl);
      if (canDelete) {
        var del = button(t("dash.remove"), "btn-link danger");
        del.addEventListener("click", function () {
          busy(del, true);
          api("deleteTranslation", { jobNo: jobNo, fileId: f.id }).then(onChange, function (err) { alertBox(del, errText(err)); busy(del, false); });
        });
        li.appendChild(del);
      }
      ul.appendChild(li);
    });
    return ul;
  }

  function uploader(jobNo, onDone) {
    var wrap = el("div", "dash-upload");
    var id = "up-" + jobNo;
    var input = el("input", "file-input");
    input.type = "file"; input.multiple = true; input.id = id;
    input.accept = (CFG.allowedExtensions || ["pdf", "jpg", "jpeg", "png", "docx"]).map(function (x) { return "." + x; }).join(",");
    var label = el("label", "file-drop");
    label.htmlFor = id;
    label.appendChild(el("span", "file-drop-btn", t("dash.uploadTranslation")));
    label.appendChild(el("span", "hint", t("form.filesHint")));
    var st = el("div", "form-status"); st.hidden = true; st.setAttribute("role", "status");
    wrap.appendChild(input); wrap.appendChild(label); wrap.appendChild(st);
    input.addEventListener("change", function () {
      var files = Array.prototype.slice.call(input.files || []);
      input.value = "";
      if (!files.length) return;
      var max = (CFG.maxFileMB || 10) * 1048576, allowed = CFG.allowedExtensions || ["pdf", "jpg", "jpeg", "png", "docx"];
      var bad = files.filter(function (f) { var ext = (f.name.split(".").pop() || "").toLowerCase(); return f.size > max || allowed.indexOf(ext) === -1; });
      if (bad.length) { status(st, "error", t("dash.err.bad_file") + " " + bad.map(function (f) { return f.name; }).join(", ")); return; }
      var chain = Promise.resolve();
      App.busy.open({ title: t("busy.uploadTitle"), text: t("busy.wait") });
      files.forEach(function (f, i) {
        chain = chain.then(function () {
          status(st, "", t("submit.uploading", { n: i + 1, total: files.length }));
          App.busy.step(t("submit.uploading", { n: i + 1, total: files.length }), i, files.length);
          return readBase64(f).then(function (data) { return api("uploadTranslation", { jobNo: jobNo, name: f.name, data: data }); });
        });
      });
      chain.then(function () {
        status(st, "success", t("dash.uploaded"));
        App.busy.done({ title: t("busy.uploadedTitle"), text: t("busy.uploadedText", { n: files.length }) });
        onDone();
      }, function (err) { App.busy.close(); status(st, "error", errText(err)); });
    });
    return wrap;
  }

  function notesCard(box, job, saveNote) {
    var c = card(box, "dash.notes");
    c.appendChild(el("p", "note", t("dash.notesHint")));
    var ta = el("textarea");
    ta.rows = 2; ta.maxLength = 600;
    ta.setAttribute("aria-label", t("dash.notes"));
    c.appendChild(ta);
    var save = button(t("dash.addNote"), "btn btn-outline btn-sm");
    save.addEventListener("click", function () {
      if (!ta.value.trim()) return;
      busy(save, true);
      saveNote(ta.value.trim()).catch(function (err) { alertBox(save, errText(err)); busy(save, false); });
    });
    var row = el("div", "actions"); row.appendChild(save); c.appendChild(row);
    if (job.internalNotes) c.appendChild(el("pre", "dash-log", job.internalNotes));
    return c;
  }

  /* ---------- views ---------- */
  var VIEWS = {};

  // ===== customer =====
  VIEWS["c-overview"] = function (box) {
    var jobs = App.account.jobs();
    heading(box, "dash.overview");
    var waiting = jobs.filter(function (j) { return j.status === "review"; });
    if (waiting.length) {
      var w = card(box);
      w.classList.add("dash-attention");
      w.appendChild(el("p", "dash-attention-title", t("dash.toReview", { n: waiting.length })));
      w.appendChild(jobList(waiting, function (j) { show("c-job", j.jobNo); }));
    }
    // No password and no backup email yet: suggest one, so losing the inbox doesn't lock them out
    var me = App.account.profile() || {};
    if (!me.hasPassword && !me.backupEmail) {
      var n = card(box);
      n.classList.add("dash-nudge");
      n.appendChild(el("p", "dash-nudge-text", t("sec.nudge")));
      n.appendChild(button(t("sec.nudgeBtn"), "btn btn-outline btn-sm", function () { show("settings"); }));
    }
    var grid = el("div", "dash-stats");
    stat(grid, jobs.filter(function (j) { return OPEN.indexOf(j.status) > -1; }).length, "dash.stat.open", "", function () { show("c-orders", "open"); });
    stat(grid, jobs.filter(function (j) { return j.status === "quoted"; }).length, "dash.stat.toPay", "warn", function () { show("c-orders", "open"); });
    stat(grid, jobs.filter(function (j) { return j.status === "delivered"; }).length, "dash.stat.delivered", "ok", function () { show("c-orders", "closed"); });
    stat(grid, jobs.length, "dash.stat.all");
    box.appendChild(grid);
    var c = card(box, "dash.recent");
    if (!jobs.length) empty(c, "acct.jobsEmpty");
    else c.appendChild(jobList(jobs.slice(0, 5), function (j) { show("c-job", j.jobNo); }));
    var row = el("div", "actions");
    var go = button(t("acct.newJob"), "btn btn-primary");
    go.setAttribute("data-goto", "submit");
    row.appendChild(go);
    c.appendChild(row);
  };

  VIEWS["c-orders"] = function (box, arg) {
    arg = arg || "open";
    var refresh = button(t("acct.refresh"), "btn-link", function () { App.account.reload(); });
    heading(box, "dash.g.orders", refresh);
    var tabs = el("div", "dash-tabs");
    tabs.setAttribute("role", "tablist");
    [["open", "dash.ordersOpen"], ["closed", "dash.ordersClosed"], ["cancel", "dash.ordersCancel"]].forEach(function (tb) {
      var b = button(t(tb[1]), "dash-tab", function () { show("c-orders", tb[0]); });
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(tb[0] === arg));
      tabs.appendChild(b);
    });
    box.appendChild(tabs);
    var jobs = App.account.jobs().filter(function (j) {
      if (arg === "cancel") return j.cancelRequested;
      if (arg === "closed") return j.status === "delivered" || j.status === "cancelled";
      return OPEN.indexOf(j.status) > -1 || j.status === "other";
    });
    var c = card(box);
    if (!jobs.length) empty(c, "dash.empty." + arg);
    else c.appendChild(jobList(jobs, function (j) { show("c-job", j.jobNo); }));
  };

  VIEWS["c-job"] = function (box, jobNo) {
    heading(box, { text: t("track.jobNo") + " " + jobNo }, backButton("c-orders", "open"));
    load(box, "myJob", { jobNo: jobNo }, function (res) {
      var j = res.job;
      var c = card(box);
      var top = el("div", "job-top");
      top.appendChild(el("span", "job-no", j.jobNo));
      top.appendChild(statusChip(j.status));
      c.appendChild(top);
      var s = steps(j.status);
      if (s) c.appendChild(s);
      c.appendChild(el("p", "track-next" + (j.status === "cancelled" ? " is-cancelled" : ""), t("track.next." + (STATUS_CODES.indexOf(j.status) > -1 ? j.status : "other"))));
      if (j.revisionRequest && j.status === "inProgress") c.appendChild(el("p", "notice", t("dash.revisionSentNote")));
      c.appendChild(details([
        ["form.category", catName(j.category)], ["form.langPair", pairName(j.langPair)],
        ["form.pages", j.pages || ""], ["track.submittedAt", day(j.submittedAt)],
        ["track.neededBy", day(j.neededBy)], ["track.deliveredAt", day(j.deliveredAt)],
        ["dash.certified", j.certified ? t("form.yes") : t("form.no")]
      ]));
      // translated files (from "ready for your review")
      var f = card(box, "dash.translatedFiles");
      var canSee = j.status === "review" || j.status === "delivered";
      if (!canSee) f.appendChild(el("p", "note", t("dash.filesAfterDelivery")));
      else if (!j.files.length) f.appendChild(el("p", "note", t("dash.filesByEmail")));
      else f.appendChild(fileList(j.jobNo, j.files, false));
      // check the translation: confirm, or ask for corrections
      if (j.confirmedAt) f.appendChild(el("p", "track-confirmed", t("dash.confirmedOn", { date: day(j.confirmedAt) })));
      else if (j.status === "review" || j.status === "delivered") reviewCard(box, j);
      certCard(box, j, "customer");
      // cancel request
      if (j.cancelRequested) card(box).appendChild(el("p", "notice notice-warn", t("dash.cancelPending")));
      else if (j.status === "received" || j.status === "quoted") {
        var cc = card(box, "dash.cancelTitle");
        cc.appendChild(el("p", "note", t("dash.cancelHint")));
        var ta = el("textarea"); ta.rows = 2; ta.maxLength = 500; ta.placeholder = t("dash.cancelReason");
        ta.setAttribute("aria-label", t("dash.cancelReason"));
        cc.appendChild(ta);
        var st = el("div", "form-status"); st.hidden = true;
        var b = button(t("dash.cancelSend"), "btn btn-outline btn-sm danger-outline");
        b.addEventListener("click", function () {
          busy(b, true);
          api("requestCancel", { jobNo: j.jobNo, reason: ta.value.trim() }).then(function () {
            App.account.reload().then(function () { show("c-job", j.jobNo); });
          }, function (err) { status(st, "error", errText(err)); busy(b, false); });
        });
        var row = el("div", "actions"); row.appendChild(b);
        cc.appendChild(row); cc.appendChild(st);
      }
    });
  };

  function reviewCard(box, j) {
    var c = card(box, "dash.reviewTitle");
    c.classList.add("dash-review");
    var inWindow = j.status === "review" || !!j.revisionUntil;
    c.appendChild(el("p", null, j.status === "review" ? t("dash.reviewHint") : t("dash.deliveredHint", { date: day(j.revisionUntil) })));
    var st = el("div", "form-status"); st.hidden = true;
    var row = el("div", "actions");
    var ok = button(t("dash.confirm"), "btn btn-primary");
    ok.addEventListener("click", function () {
      busy(ok, true);
      api("confirmTranslation", { jobNo: j.jobNo }).then(function () {
        App.account.reload().then(function () { show("c-job", j.jobNo); });
      }, function (err) { status(st, "error", errText(err)); busy(ok, false); });
    });
    row.appendChild(ok);
    c.appendChild(row);
    if (inWindow) {
      var d = el("details", "dash-revision");
      d.appendChild(el("summary", null, t("dash.revision")));
      var ta = el("textarea"); ta.rows = 4; ta.maxLength = 1500; ta.placeholder = t("dash.revisionPh");
      ta.setAttribute("aria-label", t("dash.revision"));
      d.appendChild(ta);
      var send = button(t("dash.revisionSend"), "btn btn-outline btn-sm");
      send.addEventListener("click", function () {
        if (ta.value.trim().length < 5) { status(st, "error", t("dash.err.revision_text")); ta.focus(); return; }
        busy(send, true);
        api("requestRevision", { jobNo: j.jobNo, text: ta.value.trim() }).then(function () {
          App.account.reload().then(function () { show("c-job", j.jobNo); });
        }, function (err) { status(st, "error", errText(err)); busy(send, false); });
      });
      var r2 = el("div", "actions"); r2.appendChild(send); d.appendChild(r2);
      c.appendChild(d);
    }
    c.appendChild(st);
  }

  // Staff/admin: the customer's latest correction request, shown above the files
  function revisionNotice(box, j) {
    if (!j.revisionRequest) return;
    var n = el("div", "notice notice-warn");
    n.appendChild(el("p", null, t("dash.revisionLatest") + ": " + j.revisionRequest));
    box.appendChild(n);
  }

  function soon(box, titleKey, textKey) {
    heading(box, titleKey);
    var c = card(box);
    c.classList.add("dash-soon");
    c.appendChild(el("p", "dash-soon-badge", t("dash.soon")));
    c.appendChild(el("p", null, t(textKey)));
  }
  VIEWS["c-quotes"] = function (box) { soon(box, "dash.quotes", "dash.soon.quotes"); };
  VIEWS["c-pay"] = function (box) { soon(box, "dash.pay", "dash.soon.pay"); };
  VIEWS["c-payHistory"] = function (box) { soon(box, "dash.payHistory", "dash.soon.payHistory"); };

  // ===== staff =====
  VIEWS["s-jobs"] = function (box) {
    heading(box, "dash.myJobs", button(t("acct.refresh"), "btn-link", function () { draw(); }));
    load(box, "staffJobs", {}, function (res) {
      var open = res.jobs.filter(function (j) { return ["delivered", "cancelled"].indexOf(j.status) === -1; });
      var done = res.jobs.filter(function (j) { return ["delivered", "cancelled"].indexOf(j.status) > -1; });
      var c = card(box, "dash.toDo");
      if (!open.length) empty(c, "dash.empty.staff");
      else c.appendChild(jobList(open, function (j) { show("s-job", j.jobNo); }, dueFlags));
      if (done.length) {
        var d = card(box, "dash.done");
        d.appendChild(jobList(done, function (j) { show("s-job", j.jobNo); }));
      }
    });
  };

  function workCards(box, j, role, reopen) {
    var closed = j.status === "cancelled" || j.purged;
    // source files
    var src = card(box, "dash.sourceFiles");
    src.appendChild(fileList(j.jobNo, j.files.filter(function (f) { return f.kind !== "translation"; }), false));
    if (j.requiresId) src.appendChild(el("p", "note", t("dash.idNote")));
    // translations
    var tr = card(box, "dash.translatedFiles");
    var trFiles = j.files.filter(function (f) { return f.kind === "translation"; });
    tr.appendChild(fileList(j.jobNo, trFiles, !closed && (j.status !== "delivered" || role === "admin"), reopen));
    if (!closed && j.status !== "delivered") tr.appendChild(uploader(j.jobNo, reopen));
  }

  VIEWS["s-job"] = function (box, jobNo) {
    heading(box, { text: t("track.jobNo") + " " + jobNo }, backButton("s-jobs"));
    load(box, "staffJob", { jobNo: jobNo }, function (res) {
      var j = res.job;
      var reopen = function () { show("s-job", j.jobNo); };
      var c = card(box);
      var top = el("div", "job-top");
      top.appendChild(el("span", "job-no", j.jobNo));
      top.appendChild(statusChip(j.status));
      c.appendChild(top);
      c.appendChild(details([
        ["form.category", catName(j.category)], ["form.langPair", pairName(j.langPair)],
        ["form.pages", j.pages || ""], ["track.neededBy", day(j.neededBy)],
        ["dash.certified", j.certified ? t("form.yes") : t("form.no")],
        ["form.nameSpelling", j.nameSpelling], ["dash.customerNotes", j.notes],
        ["dash.readyAt", day(j.readyAt)]
      ]));
      var st = el("div", "form-status"); st.hidden = true;
      var row = el("div", "actions");
      function step(name, label, cls) {
        var b = button(t(label), cls);
        b.addEventListener("click", function () {
          busy(b, true);
          api("staffUpdate", { jobNo: j.jobNo, step: name }).then(reopen, function (err) { status(st, "error", errText(err)); busy(b, false); });
        });
        row.appendChild(b);
      }
      var working = ["delivered", "cancelled"].indexOf(j.status) === -1 && !j.purged;
      if (working && j.status !== "inProgress") step("start", "dash.start", "btn btn-outline");
      if (working && !j.readyAt) step("ready", "dash.ready", "btn btn-primary");
      if (j.readyAt && working) c.appendChild(el("p", "notice", t("dash.readyNote")));
      revisionNotice(c, j);
      if (row.childNodes.length) { c.appendChild(row); c.appendChild(st); }
      workCards(box, j, "staff", reopen);
      certCard(box, j, "staff", reopen);
      notesCard(box, j, function (text) { return api("staffUpdate", { jobNo: j.jobNo, note: text }).then(reopen); });
    });
  };

  // ===== admin =====
  VIEWS["a-overview"] = function (box) {
    heading(box, "dash.overview", button(t("acct.refresh"), "btn-link", function () { draw(); }));
    load(box, "adminOverview", {}, function (o) {
      var grid = el("div", "dash-stats");
      stat(grid, o.open, "dash.stat.open", "", function () { show("a-jobs", "open"); });
      stat(grid, o.dueSoon, "dash.stat.dueSoon", "warn", function () { show("a-jobs", "dueSoon"); });
      stat(grid, o.overdue, "dash.stat.overdue", "bad", function () { show("a-jobs", "overdue"); });
      stat(grid, o.ready, "dash.stat.ready", "ok", function () { show("a-jobs", "ready"); });
      stat(grid, o.cancelRequests, "dash.stat.cancel", "warn", function () { show("a-jobs", "cancel"); });
      stat(grid, o.unassigned, "dash.stat.unassigned", "", function () { show("a-jobs", "unassigned"); });
      box.appendChild(grid);
      if (o.visits) {
        var v = card(box, "dash.visitors");
        var vg = el("div", "dash-stats dash-stats-2");
        stat(vg, o.visits.days[o.visits.days.length - 1].count, "dash.visitsToday", "ok");
        stat(vg, o.visits.total, "dash.visitsTotal");
        v.appendChild(vg);
        var vmax = Math.max.apply(null, o.visits.days.map(function (x) { return x.count; }).concat([1]));
        var vl = el("ul", "dash-bars");
        o.visits.days.forEach(function (x) {
          var li = el("li", "dash-bar-row");
          li.appendChild(el("span", "dash-bar-label", day(x.day)));
          var bar = el("span", "dash-bar"), fill = el("span", "dash-bar-fill");
          fill.style.width = Math.round(100 * x.count / vmax) + "%";
          bar.appendChild(fill); li.appendChild(bar);
          li.appendChild(el("span", "dash-bar-n", App.formatNumber(x.count)));
          vl.appendChild(li);
        });
        v.appendChild(vl);
      }
      // Google's daily email limit (sign-in codes, receipts and status emails all count)
      if (o.mailQuota != null) {
        var mq = card(box);
        mq.appendChild(el("p", "note" + (o.mailQuota < 50 ? " notice notice-warn" : ""), t("dash.mailQuota", { n: App.formatNumber(o.mailQuota) })));
      }
      var c = card(box, "dash.byStatus");
      var ul = el("ul", "dash-bars");
      var max = 1;
      STATUS_CODES.forEach(function (s) { max = Math.max(max, o.counts[s] || 0); });
      STATUS_CODES.forEach(function (s) {
        var li = el("li");
        var b = button("", "dash-bar-row", function () { show("a-jobs", "s:" + s); });
        b.appendChild(statusChip(s));
        var bar = el("span", "dash-bar"); var fill = el("span", "dash-bar-fill status-" + s);
        fill.style.width = Math.round(100 * (o.counts[s] || 0) / max) + "%";
        bar.appendChild(fill); b.appendChild(bar);
        b.appendChild(el("span", "dash-bar-n", App.formatNumber(o.counts[s] || 0)));
        li.appendChild(b); ul.appendChild(li);
      });
      c.appendChild(ul);
      var m = card(box, "dash.byMonth");
      var ml = el("ul", "dash-bars");
      var keys = [], d = new Date();
      for (var i = 5; i >= 0; i--) { var x = new Date(d.getFullYear(), d.getMonth() - i, 1); keys.push(isoDay(x).slice(0, 7)); }
      var mm = Math.max.apply(null, keys.map(function (k) { return o.months[k] || 0; }).concat([1]));
      keys.forEach(function (k) {
        var li = el("li", "dash-bar-row");
        var dt = new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, 1), label;
        try { label = dt.toLocaleDateString(App.getLang() === "th" ? "th-TH" : "en-GB", { month: "short", year: "numeric" }); } catch (e) { label = k; }
        li.appendChild(el("span", "dash-bar-label", label));
        var bar = el("span", "dash-bar"); var fill = el("span", "dash-bar-fill");
        fill.style.width = Math.round(100 * (o.months[k] || 0) / mm) + "%";
        bar.appendChild(fill); li.appendChild(bar);
        li.appendChild(el("span", "dash-bar-n", App.formatNumber(o.months[k] || 0)));
        ml.appendChild(li);
      });
      m.appendChild(ml);
    });
  };

  var FILTERS = ["all", "open", "unassigned", "ready", "dueSoon", "overdue", "cancel", "delivered", "cancelled"];
  function matches(j, f) {
    var today = isoDay(new Date()), soonDay = isoDay(new Date(Date.now() + 3 * 864e5));
    var open = OPEN.indexOf(j.status) > -1;
    switch (f) {
      case "open": return open;
      case "unassigned": return open && !j.assignee;
      case "ready": return open && !!j.readyAt;
      case "dueSoon": return open && j.neededBy && j.neededBy >= today && j.neededBy <= soonDay;
      case "overdue": return open && j.neededBy && j.neededBy < today;
      case "cancel": return j.cancelRequested;
      case "delivered": return j.status === "delivered";
      case "cancelled": return j.status === "cancelled";
      default:
        if (f && f.indexOf("s:") === 0) return j.status === f.slice(2);
        return true;
    }
  }

  VIEWS["a-jobs"] = function (box, filter) {
    filter = filter || "all";
    heading(box, "dash.allJobs");
    var bar = el("div", "dash-toolbar");
    var q = el("input"); q.type = "search"; q.placeholder = t("dash.search"); q.setAttribute("aria-label", t("dash.search"));
    var sel = el("select"); sel.setAttribute("aria-label", t("dash.filter"));
    FILTERS.concat(filter.indexOf("s:") === 0 ? [filter] : []).forEach(function (f) {
      var o = el("option", null, f.indexOf("s:") === 0 ? t("status." + f.slice(2)) : t("dash.filter." + f)); o.value = f;
      if (f === filter) o.selected = true;
      sel.appendChild(o);
    });
    bar.appendChild(q); bar.appendChild(sel);
    box.appendChild(bar);
    var listBox = el("div");
    box.appendChild(listBox);
    var all = [];
    function paint() {
      listBox.textContent = "";
      var words = q.value.trim().toLowerCase();
      var jobs = all.filter(function (j) {
        if (!matches(j, sel.value)) return false;
        if (!words) return true;
        return [j.jobNo, j.name, j.email, j.assignee].some(function (v) { return String(v || "").toLowerCase().indexOf(words) > -1; });
      });
      var c = card(listBox);
      c.appendChild(el("p", "note", t("dash.count", { n: jobs.length })));
      if (!jobs.length) { empty(c, "dash.empty.filter"); return; }
      c.appendChild(jobList(jobs, function (j) { show("a-job", j.jobNo); }, function (j, flags) {
        flags.appendChild(el("span", "flag", j.name || j.email));
        flags.appendChild(el("span", "flag" + (j.assignee ? "" : " flag-warn"), j.assignee || t("dash.flag.unassigned")));
        dueFlags(j, flags);
      }));
    }
    q.addEventListener("input", paint);
    sel.addEventListener("change", paint);
    load(listBox, "adminJobs", {}, function (res) { all = res.jobs; paint(); });
  };

  VIEWS["a-job"] = function (box, jobNo) {
    heading(box, { text: t("track.jobNo") + " " + jobNo }, backButton("a-jobs", "all"));
    load(box, "adminJob", { jobNo: jobNo }, function (res) {
      var j = res.job;
      var reopen = function () { show("a-job", j.jobNo); };
      // manage
      var m = card(box, "dash.manage");
      var top = el("div", "job-top");
      top.appendChild(el("span", "job-no", j.jobNo));
      top.appendChild(statusChip(j.status));
      m.appendChild(top);
      var s = steps(j.status);
      if (s) m.appendChild(s);
      if (j.cancelRequest) {
        var cr = el("div", "notice notice-warn");
        cr.appendChild(el("p", null, t("dash.cancelRequested") + " " + j.cancelRequest));
        var cra = el("div", "acct-links");
        var st0 = el("div", "form-status"); st0.hidden = true;
        // no cancelling once the customer has the translation to check
        (j.status === "review" || j.status === "delivered" ? ["reject"] : ["approve", "reject"]).forEach(function (a) {
          var b = button(t("dash.cancel." + a), a === "approve" ? "btn btn-danger btn-sm" : "btn btn-outline btn-sm");
          b.addEventListener("click", function () {
            busy(b, true);
            api("adminUpdateJob", { jobNo: j.jobNo, cancel: a }).then(reopen, function (err) { status(st0, "error", errText(err)); busy(b, false); });
          });
          cra.appendChild(b);
        });
        cr.appendChild(cra); cr.appendChild(st0);
        m.appendChild(cr);
      }
      revisionNotice(m, j);
      var grid = el("div", "grid-2");
      var f1 = el("div", "field"), l1 = el("label", null, t("dash.assignee")), s1 = el("select");
      s1.id = "a-assignee"; l1.htmlFor = "a-assignee";
      var none = el("option", null, t("dash.flag.unassigned")); none.value = ""; s1.appendChild(none);
      res.staff.forEach(function (p) {
        var o = el("option", null, (p.name ? p.name + " — " : "") + p.email + " (" + t("dash.role." + p.role) + ")"); o.value = p.email;
        if (p.email === j.assignee) o.selected = true;
        s1.appendChild(o);
      });
      f1.appendChild(l1); f1.appendChild(s1);
      var f2 = el("div", "field"), l2 = el("label", null, t("dash.status")), s2 = el("select");
      s2.id = "a-status"; l2.htmlFor = "a-status";
      STATUS_CODES.forEach(function (c) { var o = el("option", null, t("status." + c)); o.value = c; if (c === j.status) o.selected = true; s2.appendChild(o); });
      f2.appendChild(l2); f2.appendChild(s2);
      grid.appendChild(f1); grid.appendChild(f2);
      m.appendChild(grid);
      m.appendChild(el("p", "note", t("dash.statusEmailNote")));
      var st = el("div", "form-status"); st.hidden = true;
      var save = button(t("acct.save"), "btn btn-primary");
      save.addEventListener("click", function () {
        var payload = { jobNo: j.jobNo };
        if (s1.value !== j.assignee) payload.assignee = s1.value;
        if (s2.value !== j.status) payload.status = s2.value;
        if (payload.assignee === undefined && !payload.status) return;
        busy(save, true);
        api("adminUpdateJob", payload).then(reopen, function (err) { status(st, "error", errText(err)); busy(save, false); });
      });
      var row = el("div", "actions"); row.appendChild(save);
      if (j.folder) {
        var a = el("a", "btn btn-outline", t("dash.openFolder"));
        a.href = j.folder; a.target = "_blank"; a.rel = "noopener";
        row.appendChild(a);
      }
      m.appendChild(row); m.appendChild(st);
      // customer
      var c = card(box, "dash.customer");
      var mail = el("a", null, j.email); mail.href = "mailto:" + j.email; mail.target = "_blank"; mail.rel = "noopener";
      var tel = j.phone ? el("a", null, j.phone) : ""; if (tel) { tel.href = "tel:" + j.phone.replace(/[^\d+]/g, ""); tel.target = "_blank"; }
      c.appendChild(details([
        ["form.name", j.name], ["form.email", mail], ["form.phone", tel], ["form.line", j.line],
        ["dash.customerType", t("dash.type." + j.customerType)], ["form.address", j.address]
      ]));
      // job details
      var d = card(box, "dash.jobDetails");
      d.appendChild(details([
        ["form.category", catName(j.category)], ["form.langPair", pairName(j.langPair)], ["form.pages", j.pages || ""],
        ["track.submittedAt", day(j.submittedAt)], ["track.neededBy", day(j.neededBy)],
        ["dash.certified", j.certified ? t("form.yes") : t("form.no")], ["dash.shipping", j.shipping ? t("form.yes") : t("form.no")],
        ["form.nameSpelling", j.nameSpelling], ["dash.customerNotes", j.notes],
        ["dash.readyAt", day(j.readyAt)], ["track.deliveredAt", day(j.deliveredAt)], ["dash.confirmedAt", day(j.confirmedAt)]
      ]));
      workCards(box, j, "admin", reopen);
      certCard(box, j, "admin", reopen);
      notesCard(box, j, function (text) { return api("adminUpdateJob", { jobNo: j.jobNo, note: text }).then(reopen); });
    });
  };

  VIEWS["a-users"] = function (box) {
    heading(box, "dash.users");
    // add staff by email
    var add = card(box, "dash.addStaff");
    add.appendChild(el("p", "note", t("dash.addStaffHint")));
    var row = el("div", "dash-toolbar");
    var em = el("input"); em.type = "email"; em.placeholder = "name@example.com"; em.setAttribute("aria-label", t("form.email"));
    var rs = el("select"); rs.setAttribute("aria-label", t("dash.role"));
    ["staff", "admin"].forEach(function (r) { var o = el("option", null, t("dash.role." + r)); o.value = r; rs.appendChild(o); });
    var ab = button(t("dash.add"), "btn btn-primary btn-sm");
    row.appendChild(em); row.appendChild(rs); row.appendChild(ab);
    add.appendChild(row);
    var ast = el("div", "form-status"); ast.hidden = true; add.appendChild(ast);
    var listBox = el("div"); box.appendChild(listBox);
    var users = [];
    var q = el("input"); q.type = "search"; q.placeholder = t("dash.searchUsers"); q.setAttribute("aria-label", t("dash.searchUsers"));
    function paint() {
      listBox.textContent = "";
      var c = card(listBox);
      c.appendChild(q);
      var words = q.value.trim().toLowerCase();
      var list = users.filter(function (u) { return !words || (u.email + " " + u.name).toLowerCase().indexOf(words) > -1; });
      c.appendChild(el("p", "note", t("dash.count", { n: list.length })));
      var ul = el("ul", "dash-users");
      list.forEach(function (u) {
        var li = el("li", "dash-user");
        var who = el("div", "dash-user-who");
        who.appendChild(el("span", "dash-user-name", u.name || u.email));
        who.appendChild(el("span", "dash-user-meta", (u.name ? u.email + " · " : "") + t("dash.jobsN", { n: u.jobs }) + (u.lastLoginAt ? " · " + t("dash.lastLogin", { date: day(u.lastLoginAt) }) : "")));
        var sec = [];
        if (u.hasPassword) sec.push(t("dash.hasPw"));
        if (u.backupEmail) sec.push(t("dash.backupShort", { email: u.backupEmail }));
        if (sec.length) who.appendChild(el("span", "dash-user-meta", sec.join(" · ")));
        // Change the account email (customer lost the inbox) — not for the fixed admins
        if (!u.fixedAdmin) {
          var chg = el("details", "dash-email-change");
          chg.appendChild(el("summary", "btn-link", t("dash.changeEmail")));
          chg.appendChild(el("p", "note", t("dash.changeEmailHint")));
          var crow = el("div", "dash-toolbar");
          var ne = el("input"); ne.type = "email"; ne.inputMode = "email"; ne.placeholder = t("dash.newEmail"); ne.setAttribute("aria-label", t("dash.newEmail") + " " + u.email);
          var cb = button(t("dash.changeEmail"), "btn btn-outline btn-sm");
          crow.appendChild(ne); crow.appendChild(cb);
          chg.appendChild(crow);
          var cst = el("div", "form-status"); cst.hidden = true; chg.appendChild(cst);
          cb.addEventListener("click", function () {
            var to = ne.value.trim().toLowerCase();
            if (!App.rules.email.test(to)) { status(cst, "error", t("err.email")); ne.focus(); return; }
            if (!window.confirm(t("dash.changeEmailConfirm", { from: u.email, to: to }))) return;
            busy(cb, true);
            api("adminChangeEmail", { email: u.email, newEmail: to }).then(function (res) {
              users = res.users; paint();
              App.showStatus(ast, "success", t("dash.emailChanged") + ": " + to);
            }, function (err) { status(cst, "error", errText(err)); busy(cb, false); });
          });
          who.appendChild(chg);
        }
        li.appendChild(who);
        var ctl = el("div", "dash-user-ctl");
        var role = el("select"); role.setAttribute("aria-label", t("dash.role") + " " + u.email);
        ["customer", "staff", "admin"].forEach(function (r) { var o = el("option", null, t("dash.role." + r)); o.value = r; if (r === u.role) o.selected = true; role.appendChild(o); });
        if (u.fixedAdmin) { role.disabled = true; role.title = t("dash.fixedAdmin"); }
        ctl.appendChild(role);
        var type = el("select"); type.setAttribute("aria-label", t("dash.customerType") + " " + u.email);
        TYPES.forEach(function (c2) { var o = el("option", null, t("dash.type." + c2)); o.value = c2; if (c2 === u.customerType) o.selected = true; type.appendChild(o); });
        type.hidden = u.role !== "customer";
        ctl.appendChild(type);
        var st = el("span", "dash-saved"); st.setAttribute("role", "status");
        ctl.appendChild(st);
        function save(payload) {
          role.disabled = type.disabled = true;
          payload.email = u.email;
          api("adminSetUser", payload).then(function (res) {
            users = res.users; st.textContent = t("acct.saved");
            var nu = users.filter(function (x) { return x.email === u.email; })[0] || u;
            u = nu; type.hidden = u.role !== "customer";
          }, function (err) { st.textContent = errText(err); role.value = u.role; type.value = u.customerType; })
            .then(function () { role.disabled = !!u.fixedAdmin; type.disabled = false; });
        }
        role.addEventListener("change", function () { save({ role: role.value }); });
        type.addEventListener("change", function () { save({ customerType: type.value }); });
        li.appendChild(ctl);
        ul.appendChild(li);
      });
      c.appendChild(ul);
    }
    q.addEventListener("input", function () { var pos = q.selectionStart; paint(); q.focus(); try { q.setSelectionRange(pos, pos); } catch (e) { /* ok */ } });
    ab.addEventListener("click", function () {
      var v = em.value.trim().toLowerCase();
      if (!App.rules.email.test(v)) { status(ast, "error", t("err.email")); em.focus(); return; }
      busy(ab, true);
      api("adminSetUser", { email: v, role: rs.value }).then(function (res) {
        users = res.users; em.value = ""; status(ast, "success", t("dash.staffAdded", { email: v })); paint();
      }, function (err) { status(ast, "error", errText(err)); }).then(function () { busy(ab, false); });
    });
    load(listBox, "adminUsers", {}, function (res) { users = res.users; paint(); });
  };

  VIEWS["a-discounts"] = function (box) {
    heading(box, "dash.discounts");
    box.appendChild(el("p", "notice", t("dash.discountsNote")));
    var holder = el("div"); box.appendChild(holder);
    load(holder, "adminDiscounts", {}, function (res) {
      var items = res.items;
      var types = card(holder, "dash.typeDiscounts");
      var tiers = card(holder, "dash.tierDiscounts");
      tiers.appendChild(el("p", "note", t("dash.tierHint")));
      function pctInput(v, label) {
        var i = el("input"); i.type = "number"; i.min = "0"; i.max = "100"; i.step = "0.5"; i.value = v; i.inputMode = "decimal";
        i.setAttribute("aria-label", label); return i;
      }
      var typeRows = TYPES.map(function (code) {
        var it = items.filter(function (x) { return x.kind === "type" && x.code === code; })[0] || { kind: "type", code: code, percent: 0, minSpend: 0, active: true };
        var row = el("div", "dash-disc-row");
        row.appendChild(el("span", "dash-disc-name", t("dash.type." + code)));
        var p = pctInput(it.percent, t("dash.type." + code) + " %");
        var w = el("span", "dash-pct"); w.appendChild(p); w.appendChild(el("span", null, "%"));
        row.appendChild(w);
        types.appendChild(row);
        return { get: function () { return { kind: "type", code: code, nameTh: it.nameTh, nameEn: it.nameEn, percent: Number(p.value) || 0, minSpend: 0, active: true }; } };
      });
      var tierList = el("div"); tiers.appendChild(tierList);
      var tierRows = [];
      function addTier(it) {
        var row = el("div", "dash-disc-row dash-tier");
        var name = el("input"); name.type = "text"; name.maxLength = 60; name.value = it.nameTh || ""; name.placeholder = t("dash.tierName");
        name.setAttribute("aria-label", t("dash.tierName"));
        var min = el("input"); min.type = "number"; min.min = "0"; min.step = "100"; min.value = it.minSpend || 0; min.inputMode = "numeric";
        min.setAttribute("aria-label", t("dash.minSpend"));
        var p = pctInput(it.percent || 0, t("dash.tierName") + " %");
        var mw = el("label", "dash-min"); mw.appendChild(el("span", null, t("dash.minSpend"))); mw.appendChild(min);
        var w = el("span", "dash-pct"); w.appendChild(p); w.appendChild(el("span", null, "%"));
        var obj = { row: row, get: function () {
          var n = name.value.trim();
          return { kind: "tier", code: (it.code || n.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "tier") .slice(0, 30), nameTh: n, nameEn: it.nameEn || n,
                   percent: Number(p.value) || 0, minSpend: Number(min.value) || 0, active: true };
        } };
        var rm = button(t("dash.remove"), "btn-link danger", function () { row.remove(); tierRows.splice(tierRows.indexOf(obj), 1); });
        row.appendChild(name); row.appendChild(mw); row.appendChild(w); row.appendChild(rm);
        tierList.appendChild(row);
        tierRows.push(obj);
      }
      items.filter(function (x) { return x.kind === "tier"; }).forEach(addTier);
      var addB = button("+ " + t("dash.addTier"), "btn-link", function () { addTier({ code: "tier" + (tierRows.length + 1) }); });
      tiers.appendChild(addB);
      var st = el("div", "form-status"); st.hidden = true;
      var save = button(t("acct.save"), "btn btn-primary");
      save.addEventListener("click", function () {
        var all = typeRows.map(function (r) { return r.get(); }).concat(tierRows.map(function (r) { return r.get(); }));
        if (all.some(function (x) { return !(x.percent >= 0 && x.percent <= 100); })) { status(st, "error", t("dash.err.invalid_number")); return; }
        busy(save, true);
        api("adminSaveDiscounts", { items: all }).then(function () { status(st, "success", t("acct.saved")); },
          function (err) { status(st, "error", errText(err)); }).then(function () { busy(save, false); });
      });
      var row = el("div", "actions"); row.appendChild(save);
      holder.appendChild(row); holder.appendChild(st);
    });
  };


  // ----- discount codes -----
  /* ---------- certification check: the code + QR to put on the certified translation ---------- */
  function certCard(box, job, role, reopen) {
    var cert = job.cert;
    if (!cert) return;
    var c = card(box, "cert.cardTitle");
    c.classList.add("dash-cert");
    c.appendChild(el("p", "note", t(role === "customer" ? "cert.customerHint" : "cert.staffHint")));
    var row = el("div", "dash-cert-row");
    var qrBox = el("div", "dash-cert-qr");
    qrBox.setAttribute("role", "img");
    qrBox.setAttribute("aria-label", t("cert.qrAlt", { code: cert.code }));
    row.appendChild(qrBox);
    var info = el("div", "dash-cert-info");
    info.appendChild(el("p", "dash-cert-label", t("cert.code")));
    info.appendChild(el("p", "dash-cert-code", cert.code));
    info.appendChild(el("span", "flag " + (cert.status === "valid" ? "flag-ok" : cert.status === "revoked" ? "flag-bad" : "flag-warn"), t("cert.status." + cert.status)));
    if (cert.certifiedAt) info.appendChild(el("p", "note", t("cert.certifiedOn", { date: day(cert.certifiedAt) })));
    var acts = el("div", "acct-links");
    var dl = button(t("cert.downloadQr"), "btn btn-outline btn-sm");
    dl.disabled = true;
    var cp = button(t("cert.copyLink"), "btn-link");
    var open = el("a", "btn-link", t("cert.openCheck"));
    open.href = cert.url; open.target = "_blank"; open.rel = "noopener";
    acts.appendChild(dl); acts.appendChild(cp); acts.appendChild(open);
    info.appendChild(acts);
    row.appendChild(info);
    c.appendChild(row);
    var st = el("div", "form-status"); st.hidden = true;
    c.appendChild(st);
    // the QR maker is only fetched when a certified job is opened
    App.loadScript("js/qr.js").then(function () {
      qrBox.appendChild(window.QR.toCanvas(cert.url, 5, 4));
      dl.disabled = false;
      dl.addEventListener("click", function () {
        var a = document.createElement("a");
        a.href = window.QR.toCanvas(cert.url, 20, 4).toDataURL("image/png");   // 820 px square, sharp when printed
        a.download = "QR-" + cert.code + ".png";
        document.body.appendChild(a); a.click(); a.parentNode.removeChild(a);
      });
    }, function () { status(st, "error", t("acct.err.network")); });
    cp.addEventListener("click", function () {
      var done = function () { cp.textContent = t("cert.copied"); setTimeout(function () { cp.textContent = t("cert.copyLink"); }, 2000); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(cert.url).then(done, function () { window.prompt(t("cert.copyLink"), cert.url); });
      else window.prompt(t("cert.copyLink"), cert.url);
    });
    if (role === "customer") return;
    // staff: document title · admin: also who certifies and the status
    var f = el("div", "form");
    var title = input("text", cert.docTitle || "", { maxlength: "200", placeholder: t("cert.docTitlePh") });
    f.appendChild(fieldBox("cert.docTitle", title, "cert.docTitleHint"));
    var who = null, sel = null;
    if (role === "admin") {
      who = input("text", cert.certifier || "", { maxlength: "200" });
      f.appendChild(fieldBox("cert.certifier", who, "cert.certifierHint"));
      sel = el("select");
      ["pending", "valid", "revoked"].forEach(function (k) { var o = el("option", null, t("cert.status." + k)); o.value = k; if (k === cert.status) o.selected = true; sel.appendChild(o); });
      f.appendChild(fieldBox("cert.statusLabel", sel, "cert.statusHint"));
    }
    var save = button(t("acct.save"), "btn btn-outline btn-sm");
    var r2 = el("div", "actions"); r2.appendChild(save);
    f.appendChild(r2);
    var st2 = el("div", "form-status"); st2.hidden = true;
    f.appendChild(st2);
    c.appendChild(f);
    save.addEventListener("click", function () {
      var payload = { jobNo: job.jobNo, docTitle: title.value.trim() };
      if (who) payload.certifier = who.value.trim();
      if (sel && sel.value !== cert.status) payload.status = sel.value;
      busy(save, true);
      api("certUpdate", payload).then(function () { if (reopen) reopen(); else status(st2, "success", t("acct.saved")); },
        function (err) { status(st2, "error", errText(err)); busy(save, false); });
    });
  }

  function fieldBox(labelKey, input, hintKey) {
    var f = el("div", "field");
    var id = "fx-" + Math.random().toString(36).slice(2, 8);
    input.id = id;
    var l = el("label", null, t(labelKey)); l.htmlFor = id;
    f.appendChild(l); f.appendChild(input);
    if (hintKey) f.appendChild(el("p", "hint", t(hintKey)));
    return f;
  }
  function input(type, value, attrs) {
    var i = el("input"); i.type = type;
    if (value != null) i.value = value;
    for (var k in (attrs || {})) i.setAttribute(k, attrs[k]);
    return i;
  }
  function checkbox(labelKey, checked) {
    var l = el("label", "choice");
    var i = el("input"); i.type = "checkbox"; i.checked = !!checked;
    l.appendChild(i); l.appendChild(el("span", null, t(labelKey)));
    l.input = i;
    return l;
  }
  function couponSummary(c) {
    var parts = [c.kind === "percent" ? t("dash.cp.percentOff", { n: c.value }) + (c.maxDiscount ? " " + t("dash.cp.capTo", { n: App.formatNumber(c.maxDiscount) }) : "")
                                      : t("dash.cp.bahtOff", { n: App.formatNumber(c.value) })];
    if (c.minSpend) parts.push(t("dash.cp.min", { n: App.formatNumber(c.minSpend) }));
    if (c.start || c.end) parts.push((c.start ? day(c.start) : "…") + " – " + (c.end ? day(c.end) : "…"));
    parts.push(c.maxUses ? t("dash.cp.usedOf", { used: c.used, max: c.maxUses }) : t("dash.cp.usedN", { used: c.used }));
    parts.push(c.perUser ? t("dash.cp.perUser", { n: c.perUser }) : t("dash.cp.perUserAny"));
    if (c.membersOnly) parts.push(t("dash.cp.members"));
    return parts.join(" · ");
  }
  function couponState(c) {
    var today = isoDay(new Date());
    if (!c.active) return ["off", "dash.cp.state.off"];
    if (c.end && today > c.end) return ["bad", "dash.cp.state.expired"];
    if (c.maxUses && c.used >= c.maxUses) return ["bad", "dash.cp.state.usedUp"];
    if (c.start && today < c.start) return ["warn", "dash.cp.state.scheduled"];
    return ["ok", "dash.cp.state.live"];
  }

  VIEWS["a-coupons"] = function (box, editCode) {
    heading(box, "dash.coupons");
    box.appendChild(el("p", "notice", t("dash.cp.note")));
    var holder = el("div"); box.appendChild(holder);
    load(holder, "adminCoupons", {}, function (res) {
      var list = res.coupons;
      // form (new or edit)
      var editing = list.filter(function (c) { return c.code === editCode; })[0];
      var f = card(holder, editing ? "dash.cp.edit" : "dash.cp.new");
      var code = input("text", editing ? editing.code : "", { maxlength: "30", autocapitalize: "characters", placeholder: "NEWYEAR10" });
      if (editing) code.readOnly = true;
      var kind = el("select");
      [["percent", "dash.cp.kind.percent"], ["amount", "dash.cp.kind.amount"]].forEach(function (k) { var o = el("option", null, t(k[1])); o.value = k[0]; kind.appendChild(o); });
      kind.value = editing ? editing.kind : "percent";
      var value = input("number", editing ? editing.value : "", { min: "0", step: "1", inputmode: "decimal" });
      var cap = input("number", editing ? editing.maxDiscount || "" : "", { min: "0", step: "1", inputmode: "numeric" });
      var min = input("number", editing ? editing.minSpend || "" : "", { min: "0", step: "1", inputmode: "numeric" });
      var start = input("date", editing ? editing.start : "");
      var end = input("date", editing ? editing.end : "");
      var maxUses = input("number", editing ? editing.maxUses || "" : "", { min: "0", step: "1", inputmode: "numeric" });
      var perUser = el("select");
      [["1", "dash.cp.perUser1"], ["0", "dash.cp.perUserAny"], ["2", "dash.cp.perUser2"], ["3", "dash.cp.perUser3"]].forEach(function (k) { var o = el("option", null, t(k[1])); o.value = k[0]; perUser.appendChild(o); });
      perUser.value = String(editing ? editing.perUser : 1);
      var members = checkbox("dash.cp.membersOnly", editing ? editing.membersOnly : false);
      var active = checkbox("dash.cp.active", editing ? editing.active : true);
      var note = input("text", editing ? editing.note : "", { maxlength: "200" });
      var g1 = el("div", "grid-2");
      g1.appendChild(fieldBox("dash.cp.code", code, "dash.cp.codeHint"));
      g1.appendChild(fieldBox("dash.cp.kind", kind));
      g1.appendChild(fieldBox("dash.cp.value", value, "dash.cp.valueHint"));
      g1.appendChild(fieldBox("dash.cp.cap", cap, "dash.cp.zeroNone"));
      g1.appendChild(fieldBox("dash.cp.minSpend", min, "dash.cp.zeroNone"));
      g1.appendChild(fieldBox("dash.cp.maxUses", maxUses, "dash.cp.maxUsesHint"));
      g1.appendChild(fieldBox("dash.cp.start", start, "dash.cp.blankAny"));
      g1.appendChild(fieldBox("dash.cp.end", end, "dash.cp.blankAny"));
      g1.appendChild(fieldBox("dash.cp.perUserLabel", perUser));
      g1.appendChild(fieldBox("dash.cp.noteLabel", note));
      f.appendChild(g1);
      var cbs = el("div", "dash-checks"); cbs.appendChild(members); cbs.appendChild(active); f.appendChild(cbs);
      var st = el("div", "form-status"); st.hidden = true;
      var save = button(t("acct.save"), "btn btn-primary");
      save.addEventListener("click", function () {
        var payload = { isNew: !editing, coupon: {
          code: code.value.trim(), kind: kind.value, value: Number(value.value), maxDiscount: Number(cap.value || 0),
          minSpend: Number(min.value || 0), start: start.value, end: end.value, maxUses: Number(maxUses.value || 0),
          perUser: Number(perUser.value), membersOnly: members.input.checked, active: active.input.checked, note: note.value.trim() } };
        busy(save, true);
        api("adminSaveCoupon", payload).then(function () { show("a-coupons"); }, function (err) { status(st, "error", errText(err)); busy(save, false); });
      });
      var row = el("div", "actions"); row.appendChild(save);
      if (editing) row.appendChild(button(t("acct.cancel"), "btn btn-outline", function () { show("a-coupons"); }));
      f.appendChild(row); f.appendChild(st);
      // list
      var lc = card(holder, "dash.cp.list");
      if (!list.length) { empty(lc, "dash.cp.empty"); return; }
      var ul = el("ul", "dash-coupons");
      list.forEach(function (c) {
        var li = el("li", "dash-coupon");
        var head = el("div", "dash-coupon-head");
        head.appendChild(el("span", "dash-coupon-code", c.code));
        var stt = couponState(c);
        head.appendChild(el("span", "flag flag-" + stt[0], t(stt[1])));
        li.appendChild(head);
        li.appendChild(el("p", "dash-coupon-meta", couponSummary(c)));
        if (c.note) li.appendChild(el("p", "note", c.note));
        var acts = el("div", "acct-links");
        acts.appendChild(button(t("dash.edit"), "btn btn-outline btn-sm", function () { show("a-coupons", c.code); }));
        var tog = button(t(c.active ? "dash.cp.turnOff" : "dash.cp.turnOn"), "btn-link");
        tog.addEventListener("click", function () {
          busy(tog, true);
          api("adminSaveCoupon", { coupon: Object.assign({}, c, { active: !c.active }) }).then(function () { show("a-coupons"); }, function (err) { alertBox(tog, errText(err)); busy(tog, false); });
        });
        acts.appendChild(tog);
        var del = button(t("dash.remove"), "btn-link danger");
        del.addEventListener("click", function () {
          if (!window.confirm(t("dash.cp.confirmDelete", { code: c.code }))) return;
          busy(del, true);
          api("adminDeleteCoupon", { code: c.code }).then(function () { show("a-coupons"); }, function (err) { alertBox(del, errText(err)); busy(del, false); });
        });
        acts.appendChild(del);
        li.appendChild(acts);
        ul.appendChild(li);
      });
      lc.appendChild(ul);
    });
  };

  // ----- posts (news + offers) -----
  var CTA_TABS = ["", "services", "pricing", "calculator", "submit", "track", "account", "how", "faq", "contact", "news"];
  function ctaSelect(value) {
    var sel = el("select");
    CTA_TABS.forEach(function (tab) { var o = el("option", null, tab ? t("nav." + tab) : t("dash.pst.noButton")); o.value = tab; sel.appendChild(o); });
    sel.value = value || "";
    return sel;
  }
  function readImage(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(",")[1] || ""); };
      r.onerror = function () { reject({ code: "bad_file" }); };
      r.readAsDataURL(file);
    });
  }

  VIEWS["a-posts"] = function (box, arg) {
    var parts = String(arg || "news").split(":"), kind = parts[0] === "promo" ? "promo" : "news", editId = parts[1] || "";
    heading(box, "dash.posts");
    var tabs = el("div", "dash-tabs");
    [["news", "dash.pst.news"], ["promo", "dash.pst.promo"]].forEach(function (tb) {
      var b = button(t(tb[1]), "dash-tab", function () { show("a-posts", tb[0]); });
      b.setAttribute("role", "tab"); b.setAttribute("aria-selected", String(tb[0] === kind));
      tabs.appendChild(b);
    });
    box.appendChild(tabs);
    var holder = el("div"); box.appendChild(holder);
    load(holder, "adminPosts", { kind: kind }, function (res) {
      var posts = res.posts;
      var editing = posts.filter(function (p) { return p.id === editId; })[0];
      var f = card(holder, editing ? "dash.pst.edit" : (kind === "news" ? "dash.pst.newNews" : "dash.pst.newPromo"));
      var titleTh = input("text", editing ? editing.titleTh : "", { maxlength: "200" });
      var titleEn = input("text", editing ? editing.titleEn : "", { maxlength: "200" });
      var textTh = el("textarea"); textTh.rows = 5; textTh.maxLength = 4000; textTh.value = editing ? editing.textTh : "";
      var textEn = el("textarea"); textEn.rows = 5; textEn.maxLength = 4000; textEn.value = editing ? editing.textEn : "";
      var g = el("div", "grid-2");
      g.appendChild(fieldBox("dash.pst.titleTh", titleTh)); g.appendChild(fieldBox("dash.pst.titleEn", titleEn, "dash.pst.enOptional"));
      g.appendChild(fieldBox("dash.pst.textTh", textTh)); g.appendChild(fieldBox("dash.pst.textEn", textEn));
      f.appendChild(g);
      var g2 = el("div", "grid-2"), date, start, end, tagTh, tagEn, image, preview, imgStatus;
      if (kind === "news") {
        date = input("date", editing ? editing.date : isoDay(new Date()));
        g2.appendChild(fieldBox("dash.pst.date", date, "dash.pst.dateHint"));
      } else {
        tagTh = input("text", editing ? editing.tagTh : "", { maxlength: "40" });
        tagEn = input("text", editing ? editing.tagEn : "", { maxlength: "40" });
        start = input("date", editing ? editing.start : ""); end = input("date", editing ? editing.end : "");
        g2.appendChild(fieldBox("dash.pst.tagTh", tagTh)); g2.appendChild(fieldBox("dash.pst.tagEn", tagEn));
        g2.appendChild(fieldBox("dash.cp.start", start, "dash.cp.blankAny")); g2.appendChild(fieldBox("dash.cp.end", end, "dash.cp.blankAny"));
      }
      var cta = ctaSelect(editing ? editing.cta : "");
      g2.appendChild(fieldBox("dash.pst.cta", cta));
      f.appendChild(g2);
      if (kind === "news") {
        // picture: upload or paste a link
        var pic = el("div", "field dash-pic");
        pic.appendChild(el("span", "label-like", t("dash.pst.image")));
        var row0 = el("div", "dash-pic-row");
        preview = el("div", "dash-pic-preview");
        var img = el("img"); img.alt = ""; preview.appendChild(img);
        function setPreview(url) { img.src = url || ""; preview.hidden = !url; }
        setPreview(editing ? editing.imageUrl : "");
        row0.appendChild(preview);
        var side = el("div", "dash-pic-side");
        var upId = "pic-" + Math.random().toString(36).slice(2, 7);
        var fileIn = input("file", null, { accept: "image/png,image/jpeg,image/webp,image/gif" }); fileIn.id = upId; fileIn.className = "file-input";
        var upl = el("label", "btn btn-outline btn-sm", t("dash.pst.upload")); upl.htmlFor = upId;
        image = input("text", editing ? editing.image : "", { placeholder: "https://…", inputmode: "url" });
        image.setAttribute("aria-label", t("dash.pst.imageLink"));
        imgStatus = el("p", "hint", t("dash.pst.imageHint"));
        side.appendChild(fileIn); side.appendChild(upl); side.appendChild(image); side.appendChild(imgStatus);
        row0.appendChild(side);
        pic.appendChild(row0);
        f.appendChild(pic);
        image.addEventListener("change", function () { setPreview(/^https:\/\//.test(image.value.trim()) && !/drive\.google\.com/.test(image.value) ? image.value.trim() : ""); });
        fileIn.addEventListener("change", function () {
          var file = fileIn.files && fileIn.files[0];
          fileIn.value = "";
          if (!file) return;
          if (file.size > 5 * 1048576) { imgStatus.textContent = t("dash.err.too_large"); return; }
          App.busy.open({ title: t("dash.pst.uploading"), text: t("busy.wait") });
          readImage(file).then(function (data) { return api("adminUploadImage", { name: file.name, data: data }); }).then(function (r) {
            image.value = r.image; setPreview(r.imageUrl); imgStatus.textContent = t("dash.pst.uploaded");
            App.busy.done({ title: t("busy.uploadedTitle"), text: file.name });
          }, function (err) { App.busy.close(); imgStatus.textContent = errText(err); });
        });
      }
      var active = checkbox("dash.pst.show", editing ? editing.active : true);
      var cbs = el("div", "dash-checks"); cbs.appendChild(active); f.appendChild(cbs);
      var st = el("div", "form-status"); st.hidden = true;
      var save = button(t(editing ? "acct.save" : "dash.pst.publish"), "btn btn-primary");
      save.addEventListener("click", function () {
        var post = { id: editing ? editing.id : "", active: active.input.checked, titleTh: titleTh.value.trim(), titleEn: titleEn.value.trim(),
                     textTh: textTh.value, textEn: textEn.value, cta: cta.value };
        if (kind === "news") { post.date = date.value; post.image = image.value.trim(); }
        else { post.tagTh = tagTh.value.trim(); post.tagEn = tagEn.value.trim(); post.start = start.value; post.end = end.value; }
        busy(save, true);
        api("adminSavePost", { kind: kind, post: post }).then(function () { show("a-posts", kind); }, function (err) { status(st, "error", errText(err)); busy(save, false); });
      });
      var row = el("div", "actions"); row.appendChild(save);
      if (editing) row.appendChild(button(t("acct.cancel"), "btn btn-outline", function () { show("a-posts", kind); }));
      f.appendChild(row); f.appendChild(st);
      // list
      var lc = card(holder, "dash.pst.list");
      lc.appendChild(el("p", "note", t("dash.pst.listHint")));
      if (!posts.length) { empty(lc, "dash.pst.empty"); return; }
      var ul = el("ul", "dash-posts");
      posts.forEach(function (p) {
        var li = el("li", "dash-post");
        if (p.imageUrl) { var th = el("img", "dash-post-thumb"); th.src = p.imageUrl; th.alt = ""; th.loading = "lazy"; li.appendChild(th); }
        else li.appendChild(el("span", "dash-post-thumb dash-post-cover", (p.titleTh || p.titleEn).slice(0, 1)));
        var body = el("div", "dash-post-body");
        var head = el("div", "dash-coupon-head");
        head.appendChild(el("span", "dash-post-title", p.titleTh || p.titleEn));
        head.appendChild(el("span", "flag " + (p.active ? "flag-ok" : ""), t(p.active ? "dash.pst.live" : "dash.pst.draft")));
        body.appendChild(head);
        var when = kind === "news" ? day(p.date) : ((p.start ? day(p.start) : "…") + " – " + (p.end ? day(p.end) : "…"));
        body.appendChild(el("p", "dash-coupon-meta", when + (p.tagTh ? " · " + p.tagTh : "")));
        var acts = el("div", "acct-links");
        acts.appendChild(button(t("dash.edit"), "btn btn-outline btn-sm", function () { show("a-posts", kind + ":" + p.id); }));
        var tog = button(t(p.active ? "dash.pst.hide" : "dash.pst.showNow"), "btn-link");
        tog.addEventListener("click", function () {
          busy(tog, true);
          api("adminSavePost", { kind: kind, post: Object.assign({}, p, { active: !p.active }) }).then(function () { show("a-posts", kind); }, function (err) { alertBox(tog, errText(err)); busy(tog, false); });
        });
        acts.appendChild(tog);
        var del = button(t("dash.remove"), "btn-link danger");
        del.addEventListener("click", function () {
          if (!window.confirm(t("dash.pst.confirmDelete"))) return;
          busy(del, true);
          api("adminDeletePost", { kind: kind, id: p.id }).then(function () { show("a-posts", kind); }, function (err) { alertBox(del, errText(err)); busy(del, false); });
        });
        acts.appendChild(del);
        body.appendChild(acts);
        li.appendChild(body);
        ul.appendChild(li);
      });
      lc.appendChild(ul);
    });
  };

  /* ---------- wiring ---------- */
  function onAccount(e) {
    var d = e.detail || {};
    if (!d.signedIn || !d.profile) { state.role = null; state.view = null; return; }
    var role = d.profile.role || "customer";
    var me = $("#dash-avatar");
    if (me) me.textContent = ((d.profile.name || d.profile.email || "?").trim().replace(/^[\u0e40-\u0e44]+/, "").charAt(0) || "?").toUpperCase();   // skip Thai leading vowels เ แ โ ใ ไ
    var r = $("#dash-role");
    if (r) r.textContent = t("dash.role." + role) + (role === "customer" && d.profile.customerType && d.profile.customerType !== "general" ? " · " + t("dash.type." + d.profile.customerType) : "");
    var del = $("#a-delete");
    if (del) del.hidden = role !== "customer";
    if (state.role !== role) {
      state.role = role; state.arg = undefined;
      // a new account without a name starts on the profile form (the welcome notice points there)
      state.view = d.profile.name ? HOME[role] : "settings";
      // emails link to ?job=TR-…#account: open that job once signed in
      var want = linkedJob();
      if (want) {
        state.view = role === "admin" ? "a-job" : role === "staff" ? "s-job" : "c-job";
        state.arg = want;
        clearLinkedJob();
      }
      draw(); return;
    }
    // customer lists come with the account; redraw them in place
    if (/^c-(overview|orders)$/.test(state.view)) draw(); else drawMenu();
  }

  function linkedJob() {
    var m = /[?&]job=([A-Za-z]{1,5}-\d{4}-[0-9A-Za-z]{4,8})/.exec(location.search || "");
    return m ? m[1].toUpperCase() : "";
  }
  function clearLinkedJob() {
    try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) { /* sandboxed */ }
  }

  function init() {
    // a link from an email: show the sign-in on My account straight away
    if (linkedJob() && (location.hash || "#account") === "#account" && App.showTab) App.showTab("account");
    document.addEventListener("accountchange", onAccount);
    // Loaded on demand: the account may already be signed in by now
    if (App.account && App.account.isSignedIn()) {
      onAccount({ detail: { signedIn: true, profile: App.account.profile(), jobs: App.account.jobs() } });
    }
    document.addEventListener("langchange", function () { if (state.role) draw(); });
    document.addEventListener("tabchange", function (e) {
      if (e.detail && e.detail.tab === "account" && state.role && state.view && state.view.indexOf("a-") !== 0 && state.view.indexOf("s-") !== 0) drawMenu();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

/*
 * app.js — Phase 1: tabs, language toggle, content from config.js
 *          Phase 2: price calculator, client-side validation (job + track forms)
 * Phase 3 hooks "jobsubmit", Phase 4 hooks "tracksubmit" (call preventDefault to take over).
 */
(function () {
  "use strict";

  var CFG = window.APP_CONFIG;
  var I18N = window.I18N;
  var LANG_KEY = "tr_lang";
  var TAB_IDS = ["home", "services", "pricing", "calculator", "submit", "track", "how", "faq", "contact", "privacy"];

  var state = { lang: "th", tab: "home" };

  /* ---------- helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* storage blocked — ignore */ }
  }

  function formatNumber(n) {
    return Number(n).toLocaleString("en-US");
  }

  function tokens() {
    var year = new Date().getFullYear();
    return {
      serviceName: CFG.serviceName[state.lang] || CFG.serviceName.th,
      retentionDays: CFG.retentionDays,
      revisionDays: CFG.revisionDays,
      maxFileMB: CFG.maxFileMB,
      normalDays: CFG.turnaround.normal,
      expressDays: CFG.turnaround.express,
      certFee: formatNumber(CFG.certificationFee),
      year: state.lang === "th" ? year + 543 : year   // พ.ศ. for Thai
    };
  }

  function fill(str, vars) {
    return String(str).replace(/\{(\w+)\}/g, function (m, k) {
      return Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m;
    });
  }

  /** Translate a key into the current language, filling {tokens}. */
  function t(key, extra) {
    var dict = I18N[state.lang] || I18N.th;
    var raw = dict[key];
    if (raw === undefined) raw = I18N.th[key];
    if (raw === undefined) return key;
    var vars = tokens();
    if (extra) for (var k in extra) vars[k] = extra[k];
    return fill(raw, vars);
  }

  /* ---------- language ---------- */
  function applyLanguage(lang) {
    state.lang = I18N[lang] ? lang : "th";
    var root = document.documentElement;
    root.lang = state.lang;

    document.title = t("meta.title");
    var desc = $('meta[name="description"]');
    if (desc) desc.setAttribute("content", t("meta.description"));

    $all("[data-i18n]").forEach(function (el) { el.textContent = t(el.getAttribute("data-i18n")); });
    $all("[data-i18n-placeholder]").forEach(function (el) { el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder"))); });
    $all("[data-i18n-aria]").forEach(function (el) { el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria"))); });

    $all("[data-service-name]").forEach(function (el) { el.textContent = tokens().serviceName; });
    $all("[data-turnaround]").forEach(function (el) {
      el.textContent = t("common.workingDays", { days: CFG.turnaround[el.getAttribute("data-turnaround")] });
    });
    $all("[data-privacy-updated]").forEach(function (el) { el.textContent = CFG.privacyUpdated[state.lang]; });
    $all('[data-contact-text="hours"]').forEach(function (el) { el.textContent = CFG.contact.hours[state.lang]; });

    renderPriceRows();
    renderSelectOptions();

    $all(".lang-toggle [data-lang]").forEach(function (btn) {
      btn.setAttribute("aria-pressed", String(btn.getAttribute("data-lang") === state.lang));
    });

    storageSet(LANG_KEY, state.lang);
    document.dispatchEvent(new CustomEvent("langchange", { detail: { lang: state.lang } }));
  }

  /* ---------- content built from config ---------- */
  function categoryLabel(id) { return t("cat." + id); }

  function renderPriceRows() {
    var tbody = $("#price-rows");
    if (!tbody) return;
    tbody.textContent = "";
    CFG.categories.forEach(function (cat) {
      var tr = document.createElement("tr");
      var th = document.createElement("th");
      th.scope = "row";
      th.textContent = categoryLabel(cat.id);
      tr.appendChild(th);
      [cat.normal, cat.express].forEach(function (price) {
        var td = document.createElement("td");
        td.className = "num";
        td.textContent = formatNumber(price);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  function renderSelectOptions() {
    $all("select[data-options]").forEach(function (select) {
      var kind = select.getAttribute("data-options");
      var current = select.value;
      var items = kind === "categories"
        ? CFG.categories.map(function (c) { return { id: c.id, label: categoryLabel(c.id) }; })
        : CFG.languagePairs.map(function (p) { return { id: p.id, label: p[state.lang] || p.th }; });

      select.textContent = "";
      var placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = t("common.select");
      select.appendChild(placeholder);
      items.forEach(function (item) {
        var opt = document.createElement("option");
        opt.value = item.id;
        opt.textContent = item.label;
        select.appendChild(opt);
      });
      select.value = current;
    });
  }

  function renderContactLinks() {
    var c = CFG.contact;
    var hrefs = {
      phone: "tel:" + c.phoneTel,
      email: "mailto:" + c.email,
      line: c.lineUrl
    };
    var texts = { phone: c.phoneDisplay, email: c.email };
    $all("[data-contact]").forEach(function (a) {
      a.setAttribute("href", hrefs[a.getAttribute("data-contact")]);
    });
    $all("[data-contact-text]").forEach(function (el) {
      var key = el.getAttribute("data-contact-text");
      if (texts[key] !== undefined) el.textContent = texts[key];
    });
  }

  /* ---------- tabs (in-page navigation, no page loads) ---------- */
  function showTab(id, opts) {
    opts = opts || {};
    if (TAB_IDS.indexOf(id) === -1) id = "home";
    state.tab = id;

    $all('[role="tab"]').forEach(function (tab) {
      var on = tab.getAttribute("data-tab") === id;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on) keepTabVisible(tab);
    });
    $all('[role="tabpanel"]').forEach(function (panel) {
      panel.hidden = panel.id !== id;
    });

    try { history.replaceState(null, "", "#" + id); } catch (e) { /* sandboxed — ignore */ }

    if (!opts.initial) {
      window.scrollTo(0, 0);
      if (opts.focusHeading) {
        var h = $("#" + id + " h1");
        if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
      }
    }
    document.dispatchEvent(new CustomEvent("tabchange", { detail: { tab: id } }));
  }

  // Scroll only the tab strip (scrollIntoView could also scroll the Google Sites page)
  function keepTabVisible(tab) {
    var strip = tab.parentElement;
    if (!strip || strip.scrollWidth <= strip.clientWidth) return;
    var left = tab.offsetLeft - strip.offsetLeft;
    var right = left + tab.offsetWidth;
    if (left < strip.scrollLeft + 16) strip.scrollLeft = Math.max(0, left - 16);
    else if (right > strip.scrollLeft + strip.clientWidth - 48) strip.scrollLeft = right - strip.clientWidth + 48;
  }

  function initTabs() {
    var tabs = $all('[role="tab"]');
    tabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () { showTab(tab.getAttribute("data-tab")); });
      tab.addEventListener("keydown", function (e) {
        var next = null;
        // Left/Right on phone & tablet, Up/Down when the menu is a sidebar (PC)
        if (e.key === "ArrowRight" || e.key === "ArrowDown") next = tabs[(i + 1) % tabs.length];
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = tabs[(i - 1 + tabs.length) % tabs.length];
        else if (e.key === "Home") next = tabs[0];
        else if (e.key === "End") next = tabs[tabs.length - 1];
        if (next) {
          e.preventDefault();
          next.focus();
          showTab(next.getAttribute("data-tab"));
        }
      });
    });

    document.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-goto]");
      if (!btn) return;
      e.preventDefault();
      showTab(btn.getAttribute("data-goto"), { focusHeading: true });
    });

    window.addEventListener("hashchange", function () {
      var id = location.hash.replace("#", "");
      if (id && id !== state.tab && TAB_IDS.indexOf(id) !== -1) showTab(id);
    });

    // Sidebar on PC is a vertical tab list
    var list = $('[role="tablist"]');
    var wide = window.matchMedia ? window.matchMedia("(min-width: 1024px)") : null;
    function setOrientation() {
      if (list) list.setAttribute("aria-orientation", wide && wide.matches ? "vertical" : "horizontal");
    }
    setOrientation();
    if (wide) {
      if (wide.addEventListener) wide.addEventListener("change", setOrientation);
      else if (wide.addListener) wide.addListener(setOrientation);
    }

    showTab(location.hash.replace("#", "") || "home", { initial: true });
  }

  /* ---------- small UI bits ---------- */
  function initLanguageToggle() {
    $all(".lang-toggle [data-lang]").forEach(function (btn) {
      btn.addEventListener("click", function () { applyLanguage(btn.getAttribute("data-lang")); });
    });
  }

  /* ---------- Phase 2: price calculator ---------- */
  function findCategory(id) {
    for (var i = 0; i < CFG.categories.length; i++) if (CFG.categories[i].id === id) return CFG.categories[i];
    return null;
  }

  // Whole number 1–999, or null. Empty string → null.
  function parsePages(raw) {
    var v = String(raw == null ? "" : raw).trim();
    if (!/^\d{1,3}$/.test(v)) return null;
    var n = parseInt(v, 10);
    return n >= 1 && n <= 999 ? n : null;
  }

  function calcValues() {
    var urgencyEl = $('#calc-form input[name="urgency"]:checked');
    return {
      category: $("#c-category").value,
      pagesRaw: $("#c-pages").value,
      pages: parsePages($("#c-pages").value),
      urgency: urgencyEl ? urgencyEl.value : "normal",
      certified: $("#c-cert").checked
    };
  }

  function updateCalculator() {
    var form = $("#calc-form");
    if (!form) return;
    var v = calcValues();
    var cat = findCategory(v.category);
    var result = $("#calc-result");
    var breakdown = $("#calc-breakdown");
    var turnaround = $("#calc-turnaround");
    var pagesBad = v.pagesRaw !== "" && v.pages === null;

    setFieldError($("#c-pages"), pagesBad ? [t("err.pages")] : null);

    if (!cat || v.pages === null) {
      result.textContent = t("calc.resultEmpty");
      result.classList.add("is-empty");
      breakdown.textContent = "";
      turnaround.textContent = "";
      return null;
    }
    var perPage = cat[v.urgency];
    var total = perPage * v.pages + (v.certified ? CFG.certificationFee : 0);
    result.classList.remove("is-empty");
    result.textContent = formatNumber(total) + " " + t("common.baht");
    breakdown.textContent = t(v.certified ? "calc.breakdownCert" : "calc.breakdown", {
      perPage: formatNumber(perPage), pages: v.pages
    });
    turnaround.textContent = t("calc.turnaround", { days: CFG.turnaround[v.urgency] });
    return total;
  }

  function initCalculator() {
    var form = $("#calc-form");
    if (!form) return;
    form.addEventListener("input", updateCalculator);
    form.addEventListener("change", updateCalculator);
    document.addEventListener("langchange", updateCalculator);

    // Carry the estimate over to the job form (the button's data-goto then opens the tab)
    var cta = $("#calc-to-submit");
    if (cta) cta.addEventListener("click", function () {
      var v = calcValues();
      var used = false;
      if (findCategory(v.category)) { $("#f-category").value = v.category; clearFieldError($("#f-category")); used = true; }
      if (v.pages !== null) { $("#f-pages").value = v.pages; clearFieldError($("#f-pages")); used = true; }
      var cert = $('#job-form input[name="certified"][value="' + (v.certified ? "yes" : "no") + '"]');
      if (cert && used) cert.checked = true;
      var note = $("#form-prefilled");
      if (note) note.hidden = !used;
    });
    updateCalculator();
  }

  /* ---------- Phase 2: field errors ---------- */
  function errorSlot(input) { return input ? $("#" + input.id + "-err") : null; }

  // messages: array of strings (shown one per line) or null to clear
  function setFieldError(input, messages) {
    var slot = errorSlot(input);
    var bad = !!(messages && messages.length);
    if (input) {
      if (bad) input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
      var field = input.closest(".field");
      if (field) field.classList.toggle("has-error", bad);
    }
    if (!slot) return;
    slot.textContent = "";
    if (bad) messages.forEach(function (m) {
      var span = document.createElement("span");
      span.className = "err-line";
      span.textContent = m;
      slot.appendChild(span);
    });
    slot.hidden = !bad;
  }
  function clearFieldError(input) { setFieldError(input, null); }

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/;
  var LINE_RE = /^[A-Za-z0-9._\-@]{1,60}$/;
  var JOBNO_RE = /^TR-\d{4}-\d{4,}$/;

  // Local date as YYYY-MM-DD (toISOString would use UTC and be a day off in Thailand)
  function todayISO() {
    var d = new Date();
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  function fileExt(name) {
    var m = /\.([^.]+)$/.exec(name || "");
    return m ? m[1].toLowerCase() : "";
  }

  function fileProblems(f) {
    var out = [];
    if (CFG.allowedExtensions.indexOf(fileExt(f.name)) === -1) out.push(t("err.fileType", { name: f.name }));
    else if (f.size === 0) out.push(t("err.fileEmpty", { name: f.name }));
    if (f.size > CFG.maxFileMB * 1048576) out.push(t("err.fileSize", { name: f.name }));
    return out;
  }

  function formatSize(bytes) {
    if (bytes < 1048576) return Math.max(1, Math.round(bytes / 1024)) + "\u00a0KB";
    return (bytes / 1048576).toFixed(1) + "\u00a0MB";
  }

  /* ---------- Phase 2: job form ---------- */
  var selectedFiles = [];

  // Each validator returns an array of messages ([] = valid)
  var jobRules = {
    "f-name": function (el) { return el.value.trim() ? [] : [t("err.required")]; },
    "f-email": function (el) {
      var v = el.value.trim();
      if (!v) return [t("err.required")];
      return EMAIL_RE.test(v) ? [] : [t("err.email")];
    },
    "f-line": function (el) {
      var v = el.value.trim();
      return !v || LINE_RE.test(v) ? [] : [t("err.line")];
    },
    "f-phone": function (el) {
      var v = el.value.trim();
      if (!v) return [];
      var digits = v.replace(/\D/g, "");
      return /^[+\d][\d\s\-()]*$/.test(v) && digits.length >= 9 && digits.length <= 15 ? [] : [t("err.phone")];
    },
    "f-langPair": function (el) { return el.value ? [] : [t("err.select")]; },
    "f-category": function (el) { return el.value ? [] : [t("err.select")]; },
    "f-pages": function (el) {
      return el.value === "" && !(el.validity && el.validity.badInput) ? []
        : parsePages(el.value) !== null ? [] : [t("err.pages")];
    },
    "f-neededBy": function (el) {
      var v = el.value;
      if (!v) return [t("err.date")];
      return v < todayISO() ? [t("err.datePast")] : [];
    },
    "f-files": function () {
      if (!selectedFiles.length) return [t("err.filesRequired")];
      var out = [];
      selectedFiles.forEach(function (f) { out = out.concat(fileProblems(f)); });
      return out;
    },
    "f-consent": function (el) { return el.checked ? [] : [t("err.consent")]; }
  };

  var touched = {};

  function validateField(id) {
    var el = document.getElementById(id);
    if (!el || !jobRules[id]) return true;
    var errs = jobRules[id](el);
    setFieldError(el, errs);
    refreshErrorSummary();
    return !errs.length;
  }

  // Keep the "please correct N fields" line in step with the fields as they are fixed
  function refreshErrorSummary() {
    var status = $("#form-status");
    if (!status || status.hidden || !status.classList.contains("error")) return;
    var bad = $all('#job-form [aria-invalid="true"]').length;
    if (bad) showStatus(status, "error", t("form.errSummary", { count: bad }));
    else showStatus(status, "", "");
  }

  function validateJobForm() {
    var firstBad = null, count = 0;
    Object.keys(jobRules).forEach(function (id) {
      touched[id] = true;
      if (!validateField(id)) {
        count++;
        if (!firstBad) firstBad = document.getElementById(id);
      }
    });
    return { ok: count === 0, count: count, firstBad: firstBad };
  }

  function showStatus(el, kind, text) {
    if (!el) return;
    el.className = "form-status" + (kind ? " " + kind : "");
    el.textContent = text;
    el.hidden = !text;
  }

  function renderFileList() {
    var list = $("#file-list");
    var total = $("#file-total");
    if (!list) return;
    list.textContent = "";
    if (!selectedFiles.length) {
      var empty = document.createElement("li");
      empty.className = "muted";
      empty.textContent = t("form.filesNone");
      list.appendChild(empty);
      if (total) total.hidden = true;
      return;
    }
    var bytes = 0;
    selectedFiles.forEach(function (f, i) {
      bytes += f.size;
      var li = document.createElement("li");
      li.className = "file-item" + (fileProblems(f).length ? " is-bad" : "");
      var name = document.createElement("span");
      name.className = "file-name";
      name.textContent = f.name;
      var size = document.createElement("span");
      size.className = "file-size";
      size.textContent = formatSize(f.size);
      var rm = document.createElement("button");
      rm.type = "button";
      rm.className = "file-remove";
      rm.textContent = t("form.remove");
      rm.setAttribute("aria-label", t("form.removeFile", { name: f.name }));
      rm.addEventListener("click", function () {
        selectedFiles.splice(i, 1);
        renderFileList();
        if (touched["f-files"]) validateField("f-files");
        var next = $("#file-list .file-remove") || $("#f-files");
        if (next) next.focus();
      });
      li.appendChild(name);
      li.appendChild(size);
      li.appendChild(rm);
      list.appendChild(li);
    });
    if (total) {
      total.textContent = t("form.filesCount", { count: selectedFiles.length, size: formatSize(bytes) });
      total.hidden = false;
    }
  }

  // New picks are added to the list (phones often pick one photo at a time)
  function addFiles(fileList) {
    Array.prototype.slice.call(fileList || []).forEach(function (f) {
      var dup = selectedFiles.some(function (g) { return g.name === f.name && g.size === f.size && g.lastModified === f.lastModified; });
      if (!dup) selectedFiles.push(f);
    });
    touched["f-files"] = true;
    renderFileList();
    validateField("f-files");
  }

  function initFiles() {
    var input = $("#f-files");
    var drop = $(".file-drop");
    if (!input) return;
    input.addEventListener("change", function () {
      addFiles(input.files);
      try { input.value = ""; } catch (e) { /* old browsers — ignore */ }
    });
    if (drop) {
      ["dragenter", "dragover"].forEach(function (type) {
        drop.addEventListener(type, function (e) { e.preventDefault(); drop.classList.add("dragover"); });
      });
      ["dragleave", "drop"].forEach(function (type) {
        drop.addEventListener(type, function () { drop.classList.remove("dragover"); });
      });
      drop.addEventListener("drop", function (e) {
        e.preventDefault();
        if (e.dataTransfer) addFiles(e.dataTransfer.files);
      });
    }
    renderFileList();
  }

  function initJobForm() {
    var form = $("#job-form");
    if (!form) return;
    var date = $("#f-neededBy");
    var status = $("#form-status");

    function refreshMinDate() { if (date) date.min = todayISO(); }
    refreshMinDate();

    Object.keys(jobRules).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || id === "f-files") return;
      // Show an error once the person leaves a field; then update it live as they fix it
      el.addEventListener("blur", function () {
        if (el.value !== "" || el.type === "checkbox") { touched[id] = true; validateField(id); }
      });
      el.addEventListener(el.tagName === "SELECT" || el.type === "checkbox" || el.type === "date" ? "change" : "input", function () {
        if (el.tagName === "SELECT" || el.type === "checkbox" || el.type === "date") touched[id] = true;
        if (touched[id]) validateField(id);
      });
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      refreshMinDate();
      var r = validateJobForm();
      if (!r.ok) {
        showStatus(status, "error", t("form.errSummary", { count: r.count }));
        var target = r.firstBad && r.firstBad.id === "f-files" ? $(".file-drop") : r.firstBad;
        if (r.firstBad) {
          if (target && target.scrollIntoView) target.scrollIntoView({ block: "center" });
          r.firstBad.focus({ preventScroll: true });
        }
        return;
      }
      var data = getJobData();
      // Phase 3 listens for this event and sends the job to Apps Script
      var ev = new CustomEvent("jobsubmit", { detail: data, cancelable: true });
      var handled = !document.dispatchEvent(ev);
      if (!handled) showStatus(status, "", t("form.notReady"));
    });

    // Re-translate visible messages when the language changes
    document.addEventListener("langchange", function () {
      Object.keys(touched).forEach(function (id) { if (touched[id] && jobRules[id]) validateField(id); });
      renderFileList();
      if (status && !status.hidden && !status.classList.contains("success")) {
        var bad = $all('#job-form [aria-invalid="true"]').length;
        if (bad) showStatus(status, "error", t("form.errSummary", { count: bad }));
        else showStatus(status, "", t("form.notReady"));
      }
    });
  }

  function getJobData() {
    var cert = $('#job-form input[name="certified"]:checked');
    function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; }
    return {
      name: val("f-name"),
      email: val("f-email"),
      line: val("f-line"),
      phone: val("f-phone"),
      langPair: val("f-langPair"),
      category: val("f-category"),
      pages: parsePages(val("f-pages")),
      neededBy: val("f-neededBy"),
      certified: cert ? cert.value === "yes" : false,
      nameSpelling: val("f-nameSpelling"),
      notes: val("f-notes"),
      consent: $("#f-consent").checked,
      lang: state.lang,
      files: selectedFiles.slice()
    };
  }

  /* ---------- Phase 2: track form (lookup itself: Phase 4) ---------- */
  function initTrackForm() {
    var form = $("#track-form");
    if (!form) return;
    var jobNo = $("#t-jobNo"), email = $("#t-email"), out = $("#track-result");
    var rules = {
      "t-jobNo": function () {
        var v = jobNo.value.trim().toUpperCase();
        if (!v) return [t("err.required")];
        return JOBNO_RE.test(v) ? [] : [t("err.jobNo")];
      },
      "t-email": function () {
        var v = email.value.trim();
        if (!v) return [t("err.required")];
        return EMAIL_RE.test(v) ? [] : [t("err.email")];
      }
    };
    var checked = false;
    function run() {
      var first = null;
      [jobNo, email].forEach(function (el) {
        var errs = rules[el.id]();
        setFieldError(el, errs);
        if (errs.length && !first) first = el;
      });
      return first;
    }
    [jobNo, email].forEach(function (el) {
      el.addEventListener("input", function () { if (checked) run(); });
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      checked = true;
      jobNo.value = jobNo.value.trim().toUpperCase();
      var first = run();
      if (first) { showStatus(out, "", ""); first.focus(); return; }
      var ev = new CustomEvent("tracksubmit", { detail: { jobNo: jobNo.value, email: email.value.trim() }, cancelable: true });
      if (document.dispatchEvent(ev)) showStatus(out, "", t("track.notReady"));
    });
    document.addEventListener("langchange", function () {
      if (checked) run();
      if (out && !out.hidden && !out.classList.contains("success")) showStatus(out, "", t("track.notReady"));
    });
  }

  // Forms must never reload the page inside the Google Sites iframe.
  function guardForms() {
    $all("form").forEach(function (form) {
      form.addEventListener("submit", function (e) { e.preventDefault(); });
    });
  }

  /* ---------- start ---------- */
  function init() {
    var saved = storageGet(LANG_KEY);
    renderContactLinks();
    applyLanguage(saved === "en" ? "en" : "th");
    initLanguageToggle();
    initTabs();
    initCalculator();
    initFiles();
    initJobForm();
    initTrackForm();
    guardForms();
  }

  // Shared with later phases
  window.App = {
    t: t,
    config: CFG,
    getLang: function () { return state.lang; },
    showTab: showTab,
    formatNumber: formatNumber,
    // Phase 2 → used by Phase 3/4
    getJobData: getJobData,
    validateJobForm: validateJobForm,
    showStatus: showStatus,
    todayISO: todayISO
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

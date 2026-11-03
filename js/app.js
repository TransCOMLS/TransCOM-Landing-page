/*
 * app.js — Phase 1: tabs, language toggle, content from config.js
 * (Phase 2 adds: price calculator, form validation. Phase 3–4: backend.)
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

  function initFileList() {
    var input = $("#f-files");
    var list = $("#file-list");
    if (!input || !list) return;
    function render() {
      list.textContent = "";
      var files = Array.prototype.slice.call(input.files || []);
      if (!files.length) {
        var li = document.createElement("li");
        li.className = "muted";
        li.setAttribute("data-i18n", "form.filesNone");
        li.textContent = t("form.filesNone");
        list.appendChild(li);
        return;
      }
      files.forEach(function (f) {
        var li = document.createElement("li");
        li.textContent = f.name + " (" + (f.size / 1048576).toFixed(1) + " MB)";
        list.appendChild(li);
      });
    }
    input.addEventListener("change", render);
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
    initFileList();
    guardForms();
  }

  // Shared with later phases
  window.App = {
    t: t,
    config: CFG,
    getLang: function () { return state.lang; },
    showTab: showTab,
    formatNumber: formatNumber
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

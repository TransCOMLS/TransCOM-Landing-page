/*
 * app.js — Phase 1: pages + menu, language toggle, content from config.js
 *          Phase 2: price calculator, client-side validation (job + track forms)
 * Phase 3 hooks "jobsubmit", Phase 4 hooks "tracksubmit" (call preventDefault to take over).
 */
(function () {
  "use strict";

  var CFG = window.APP_CONFIG;
  var I18N = window.I18N;
  var LANG_KEY = "tr_lang";
  var TAB_IDS = ["home", "services", "pricing", "calculator", "submit", "track", "how", "faq", "contact", "privacy", "terms", "account", "news"];

  var state = { lang: "th", tab: "home" };

  /* ---------- helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageRemove(key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* storage blocked — ignore */ }
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
      idRetentionDays: CFG.idRetentionDays,
      civilFrom: formatNumber(minPrice(function (c) { return c.requiresId; })),
      minPrice: formatNumber(minPrice()),
      revisionDays: CFG.revisionDays,
      maxFileMB: CFG.maxFileMB,
      normalDays: CFG.turnaround.normal,
      expressDays: CFG.turnaround.express,
      certFee: formatNumber(CFG.certificationFee),
      shipFee: formatNumber(CFG.shippingFee || 0),
      year: state.lang === "th" ? year + 543 : year   // พ.ศ. for Thai
    };
  }

  // Per-page price of a category as { min, max } — config holds [min, max] or one number
  function priceRange(cat, urgency) {
    var v = cat ? cat[urgency || "normal"] : 0;
    if (Array.isArray(v)) return { min: +v[0], max: +(v.length > 1 ? v[1] : v[0]) };
    return { min: +v || 0, max: +v || 0 };
  }

  // "150–250" or "300" when both ends are the same
  function formatRange(min, max) {
    return min === max ? formatNumber(min) : t("calc.range", { min: formatNumber(min), max: formatNumber(max) });
  }

  // Lowest normal per-page price, optionally among categories matching a test
  function minPrice(test) {
    var prices = CFG.categories.filter(function (c) { return !test || test(c); }).map(function (c) { return priceRange(c, "normal").min; });
    return prices.length ? Math.min.apply(null, prices) : 0;
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
    renderCivilDocs();
    renderTerms();
    buildTocs();

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
      if (cat.requiresId) {
        var badge = document.createElement("span");
        badge.className = "badge badge-inline";
        badge.textContent = t("services.civilBadge");
        th.appendChild(document.createTextNode(" "));
        th.appendChild(badge);
      }
      tr.appendChild(th);
      ["normal", "express"].forEach(function (urgency) {
        var r = priceRange(cat, urgency);
        var td = document.createElement("td");
        td.className = "num";
        td.textContent = formatRange(r.min, r.max);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  /* Terms and conditions: legal text lives in js/terms.js (window.TERMS) */
  function richText(el, str) {
    // "**bold**" → <strong>; everything else stays plain text
    String(str).split("**").forEach(function (part, i) {
      if (!part) return;
      if (i % 2) {
        var b = document.createElement("strong");
        b.textContent = part;
        el.appendChild(b);
      } else {
        el.appendChild(document.createTextNode(part));
      }
    });
    return el;
  }

  function renderTerms() {
    var box = $("#terms-body");
    var all = window.TERMS;
    if (!box || !all) return;
    var d = all[state.lang] || all.th;
    box.textContent = "";
    function para(text) { box.appendChild(richText(document.createElement("p"), text)); }
    (d.intro || []).forEach(para);
    (d.sections || []).forEach(function (sec, i) {
      var h = document.createElement("h2");
      h.className = "h3";
      h.textContent = sec.title;
      box.appendChild(h);
      (sec.blocks || []).forEach(function (block) {
        if (typeof block === "string") { para(block); return; }
        var ul = document.createElement("ul");
        ul.className = "terms-list";
        (block.list || []).forEach(function (item) {
          ul.appendChild(richText(document.createElement("li"), item));
        });
        box.appendChild(ul);
      });
    });
    if (d.closing) {
      var c = richText(document.createElement("p"), d.closing);
      c.className = "terms-closing";
      box.appendChild(c);
    }
  }

  /* Contents list beside long pages (terms, privacy): <details class="doc-toc" data-toc-for="<body id>">.
     Open in the left column on PC, folded at the top on phone/tablet; jumps within the page. */
  function buildTocs() {
    $all(".doc-toc").forEach(function (details) {
      var bodyId = details.getAttribute("data-toc-for");
      var body = document.getElementById(bodyId);
      var list = $("ol", details);
      if (!body || !list) return;
      list.textContent = "";
      $all("h2", body).forEach(function (h, i) {
        h.id = bodyId + "-s" + (i + 1);
        var li = document.createElement("li");
        var b = document.createElement("button");
        b.type = "button";
        b.setAttribute("data-toc-target", h.id);
        b.textContent = h.textContent;
        li.appendChild(b);
        list.appendChild(li);
      });
    });
  }

  function initTocs() {
    var tocs = $all(".doc-toc");
    if (!tocs.length) return;
    var wide = window.matchMedia ? window.matchMedia("(min-width: 1024px)") : null;
    function isWide() { return !!(wide && wide.matches); }
    function sync() { tocs.forEach(function (d) { d.open = isWide(); }); }
    sync();
    if (wide) {
      if (wide.addEventListener) wide.addEventListener("change", sync);
      else if (wide.addListener) wide.addListener(sync);
    }
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function headerH() { var hd = $(".site-header"); return hd ? hd.offsetHeight : 0; }
    tocs.forEach(function (details) {
      details.addEventListener("click", function (e) {
        var b = e.target.closest("[data-toc-target]");
        if (!b) return;
        var h = document.getElementById(b.getAttribute("data-toc-target"));
        if (!h) return;
        // Fold the list first (phone/tablet), so the measured position does not shift afterwards
        if (!isWide()) details.open = false;
        var top = h.getBoundingClientRect().top + window.scrollY - headerH() - 16;
        // scrollTo, not scrollIntoView: inside Google Sites the latter can scroll the outer page too
        window.scrollTo({ top: Math.max(0, top), behavior: reduce ? "auto" : "smooth" });
        h.tabIndex = -1;
        h.focus({ preventScroll: true });
      });
    });
    // Highlight the section being read on the page that is showing
    var ticking = false;
    function spy() {
      ticking = false;
      var details = $("#" + state.tab + " .doc-toc");
      if (!details) return;
      var body = document.getElementById(details.getAttribute("data-toc-for"));
      if (!body) return;
      var line = headerH() + 40;
      var current = null;
      $all("h2", body).forEach(function (h) { if (h.getBoundingClientRect().top <= line) current = h.id; });
      $all("[data-toc-target]", details).forEach(function (b) {
        if (b.getAttribute("data-toc-target") === current) b.setAttribute("aria-current", "true");
        else b.removeAttribute("aria-current");
      });
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(spy); }
    }, { passive: true });
    document.addEventListener("langchange", spy);
    document.addEventListener("tabchange", spy);
  }

  function renderCivilDocs() {
    var docs = CFG.civilDocuments || [];
    var list = $("#civil-docs");
    if (list) {
      list.textContent = "";
      docs.forEach(function (d) {
        var li = document.createElement("li");
        li.textContent = d[state.lang] || d.th;
        list.appendChild(li);
      });
    }
    $all("[data-civil-count]").forEach(function (el) { el.textContent = t("services.civilList", { count: docs.length }); });
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
    var texts = { phone: c.phoneDisplay, email: c.email, line: c.lineId };
    $all("[data-contact]").forEach(function (a) {
      a.setAttribute("href", hrefs[a.getAttribute("data-contact")]);
    });
    // LINE can be switched off in config.js (contact.showLine)
    if (c.showLine === false) {
      $all('[data-contact="line"]').forEach(function (a) {
        var li = a.parentElement && a.parentElement.tagName === "LI" ? a.parentElement : null;
        (li || a).hidden = true;
      });
      // Drop a button row left empty (e.g. the Contact page)
      $all(".actions").forEach(function (row) {
        var visible = Array.prototype.some.call(row.children, function (ch) { return !ch.hidden; });
        if (!visible) row.hidden = true;
      });
    }
    $all("[data-contact-text]").forEach(function (el) {
      var key = el.getAttribute("data-contact-text");
      if (texts[key] === undefined) return;
      el.textContent = texts[key];
      // Long email addresses wrap after "@", not in the middle of a word
      if (key === "email" && texts[key].indexOf("@") > 0) {
        var at = texts[key].indexOf("@") + 1;
        el.textContent = texts[key].slice(0, at);
        el.appendChild(document.createElement("wbr"));
        el.appendChild(document.createTextNode(texts[key].slice(at)));
      }
    });
  }

  /* ---------- pages (in-page navigation, no page loads) ---------- */
  function showTab(id, opts) {
    opts = opts || {};
    if (TAB_IDS.indexOf(id) === -1) id = "home";
    state.tab = id;

    // Highlight the current page in the menu, and the dropdown that holds it
    $all(".main-nav [data-tab]").forEach(function (btn) {
      if (btn.getAttribute("data-tab") === id) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    });
    $all(".nav-group").forEach(function (g) {
      g.classList.toggle("is-current", !!$('[data-tab="' + id + '"]', g));
    });
    $all("main > .panel").forEach(function (panel) {
      panel.hidden = panel.id !== id;
    });
    closeMenus();

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

  /* ---------- menu: dropdowns (PC) and the menu-button panel (phone/tablet) ---------- */
  var wideMQ = window.matchMedia ? window.matchMedia("(min-width: 1024px)") : null;
  function isWide() { return !!(wideMQ && wideMQ.matches); }

  function setGroup(toggle, open) { toggle.setAttribute("aria-expanded", String(open)); }

  function setMobileMenu(open) {
    var header = $(".site-header");
    var btn = $(".menu-btn");
    if (!header || !btn) return;
    header.classList.toggle("menu-open", open);
    btn.setAttribute("aria-expanded", String(open));
    // In the panel only the group holding the current page starts open (one group at a time)
    if (open) $all(".nav-group").forEach(function (g) {
      setGroup($(".nav-toggle", g), g.classList.contains("is-current"));
    });
  }

  function closeMenus() {
    $all(".nav-toggle").forEach(function (t) { setGroup(t, false); });
    setMobileMenu(false);
  }

  function initTabs() {
    $all(".main-nav [data-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () { showTab(btn.getAttribute("data-tab"), { focusHeading: true }); });
    });

    $all(".nav-toggle").forEach(function (toggle) {
      toggle.addEventListener("click", function () {
        var open = toggle.getAttribute("aria-expanded") !== "true";
        // One group open at a time (dropdowns on PC, accordion in the phone/tablet panel)
        $all(".nav-toggle").forEach(function (t) { if (t !== toggle) setGroup(t, false); });
        setGroup(toggle, open);
      });
      // PC: Down arrow opens the dropdown and moves into it
      toggle.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowDown" || !isWide()) return;
        e.preventDefault();
        setGroup(toggle, true);
        var first = $(".nav-sublink", toggle.parentElement);
        if (first) first.focus();
      });
    });

    // Up/Down move between items inside an open dropdown
    $all(".nav-sub").forEach(function (sub) {
      sub.addEventListener("keydown", function (e) {
        if (!isWide() || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
        var items = $all(".nav-sublink", sub);
        var i = items.indexOf(document.activeElement);
        if (i === -1) return;
        e.preventDefault();
        items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length].focus();
      });
    });

    var menuBtn = $(".menu-btn");
    if (menuBtn) menuBtn.addEventListener("click", function () {
      setMobileMenu(menuBtn.getAttribute("aria-expanded") !== "true");
    });

    // Escape closes whatever is open and puts focus back on its button
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var openToggle = $('.nav-toggle[aria-expanded="true"]');
      var panelOpen = menuBtn && menuBtn.getAttribute("aria-expanded") === "true";
      if (!openToggle && !panelOpen) return;
      var back = panelOpen ? menuBtn : openToggle;
      closeMenus();
      back.focus();
    });

    // Click or tap outside the header closes menus
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".site-header")) closeMenus();
    });
    // PC: a dropdown closes when focus leaves it
    $all(".nav-group").forEach(function (g) {
      g.addEventListener("focusout", function (e) {
        if (isWide() && !g.contains(e.relatedTarget)) setGroup($(".nav-toggle", g), false);
      });
    });

    document.addEventListener("click", function (e) {
      var opener = e.target.closest("[data-modal]");
      if (opener) { e.preventDefault(); openPolicy(opener.getAttribute("data-modal"), opener); return; }
      var btn = e.target.closest("[data-goto]");
      if (!btn) return;
      e.preventDefault();
      // While filling in the job form, show the policy or terms as a pop-up instead of leaving the form
      var dest = btn.getAttribute("data-goto");
      if ((dest === "privacy" || dest === "terms") && state.tab === "submit") { openPolicy(dest, btn); return; }
      showTab(btn.getAttribute("data-goto"), { focusHeading: true });
    });

    window.addEventListener("hashchange", function () {
      var id = location.hash.replace("#", "");
      if (id && id !== state.tab && TAB_IDS.indexOf(id) !== -1) showTab(id);
    });

    // Switching between phone and PC layout resets the menu
    if (wideMQ) {
      if (wideMQ.addEventListener) wideMQ.addEventListener("change", closeMenus);
      else if (wideMQ.addListener) wideMQ.addListener(closeMenus);
    }

    showTab(location.hash.replace("#", "") || "home", { initial: true });
    undoLoadJump();
  }

  // Tab ids double as #hash routes, so on load the browser jumps to the <section> and
  // hides the header (inside Google Sites this can scroll the outer page too).
  // Put the page back at the top unless the person has already started scrolling.
  function undoLoadJump() {
    var touched = false;
    function mark() { touched = true; }
    ["wheel", "touchstart", "keydown", "mousedown"].forEach(function (type) {
      window.addEventListener(type, mark, { once: true, passive: true });
    });
    function reset() { if (!touched && window.scrollY) window.scrollTo(0, 0); }
    if (document.readyState === "complete") setTimeout(reset, 0);
    else window.addEventListener("load", function () { setTimeout(reset, 0); });
  }

  /* ---------- privacy policy / terms pop-up ---------- */
  var lastOpener = null;
  var lastPage = null;

  // page = "privacy" or "terms": the pop-up shows a copy of that page
  function openPolicy(page, opener) {
    var dlg = $("#policy-dialog");
    var body = $("#policy-dialog-body");
    var title = $("#policy-dialog-title");
    var src = $("#" + page);
    // No <dialog> support (very old browsers): fall back to the page
    if (!dlg || !body || !src || typeof dlg.showModal !== "function") { showTab(page, { focusHeading: true }); return; }
    // Copy the page in the current language; its <h1> becomes the pop-up title
    body.textContent = "";
    Array.prototype.forEach.call(src.querySelectorAll(":scope > *"), function (node) {
      if (node.tagName === "H1") { if (title) title.textContent = node.textContent; }
      else body.appendChild(node.cloneNode(true));
    });
    // The contents list is only for the full page; copied ids would clash with the page
    $all(".doc-toc", body).forEach(function (el) { el.parentNode.removeChild(el); });
    $all("[id]", body).forEach(function (el) { el.removeAttribute("id"); });
    lastOpener = opener || null;
    lastPage = page;
    document.documentElement.classList.add("modal-open");
    if (!dlg.open) dlg.showModal();
    body.scrollTop = 0;
    var close = $(".modal-close", dlg);
    if (close) close.focus();
  }

  function initPolicyDialog() {
    var dlg = $("#policy-dialog");
    if (!dlg) return;
    $all("[data-close-modal]", dlg).forEach(function (b) {
      b.addEventListener("click", function () { dlg.close(); });
    });
    // Click on the dimmed background closes it
    dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener("close", function () {
      document.documentElement.classList.remove("modal-open");
      if (lastOpener && document.contains(lastOpener)) lastOpener.focus({ preventScroll: true });
      lastOpener = null;
      lastPage = null;
    });
    // Re-copy in the new language if the language changes while it is open
    document.addEventListener("langchange", function () { if (dlg.open && lastPage) openPolicy(lastPage, lastOpener); });
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
      certified: $("#c-cert").checked,
      shipping: !!($("#c-ship") && $("#c-ship").checked)
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
    var civilNote = $("#calc-civil-note");
    if (civilNote) civilNote.hidden = !(cat && cat.requiresId);

    if (!cat || v.pages === null) {
      result.textContent = t("calc.resultEmpty");
      result.classList.add("is-empty");
      breakdown.textContent = "";
      turnaround.textContent = "";
      return null;
    }
    var per = priceRange(cat, v.urgency);
    var extra = (v.certified ? CFG.certificationFee : 0) + (v.shipping ? (CFG.shippingFee || 0) : 0);
    var min = per.min * v.pages + extra, max = per.max * v.pages + extra;
    result.classList.remove("is-empty");
    result.textContent = formatRange(min, max) + " " + t("common.baht");
    var parts = [t("calc.breakdown", { perPage: formatRange(per.min, per.max), pages: v.pages })];
    if (v.certified) parts.push(t("calc.plusCert"));
    if (v.shipping) parts.push(t("calc.plusShip"));
    breakdown.textContent = parts.join(" ");
    turnaround.textContent = t("calc.turnaround", { days: CFG.turnaround[v.urgency] });
    return { min: min, max: max };
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
      if (findCategory(v.category)) { $("#f-category").value = v.category; clearFieldError($("#f-category")); updateIdSection(); used = true; }
      if (v.pages !== null) { $("#f-pages").value = v.pages; clearFieldError($("#f-pages")); used = true; }
      var cert = $('#job-form input[name="certified"][value="' + (v.certified ? "yes" : "no") + '"]');
      if (cert && used) cert.checked = true;
      var ship = $('#job-form input[name="shipping"][value="' + (v.shipping ? "yes" : "no") + '"]');
      if (ship && used) { ship.checked = true; updateAddressField(); }
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
  // File pickers: documents to translate, and (civil registration documents only) ID files
  var pickers = {
    "f-files":   { files: [], list: "#file-list",    total: "#file-total",    required: "err.filesRequired" },
    "f-idFiles": { files: [], list: "#id-file-list", total: "#id-file-total", required: "err.idRequired", onlyIf: needsId }
  };
  var selectedFiles = pickers["f-files"].files;

  // Categories with requiresId (civil registration documents) need an ID attached
  function needsId() {
    var el = document.getElementById("f-category");
    var cat = el ? findCategory(el.value) : null;
    return !!(cat && cat.requiresId);
  }

  function filesRule(id) {
    return function () {
      var pk = pickers[id];
      if (pk.onlyIf && !pk.onlyIf()) return [];
      if (!pk.files.length) return [t(pk.required)];
      var out = [];
      pk.files.forEach(function (f) { out = out.concat(fileProblems(f)); });
      return out;
    };
  }

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
    "f-files": filesRule("f-files"),
    "f-idFiles": filesRule("f-idFiles"),
    "f-address": function (el) {
      if (!wantsShipping()) return [];
      return el.value.trim().length >= 15 ? [] : [t("err.address")];
    },
    "f-idConsent": function (el) { return !needsId() || el.checked ? [] : [t("err.idConsent")]; },
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

  function renderFileList(id) {
    if (!id) { Object.keys(pickers).forEach(renderFileList); return; }
    var pk = pickers[id];
    var list = $(pk.list);
    var total = $(pk.total);
    if (!list) return;
    list.textContent = "";
    if (!pk.files.length) {
      var empty = document.createElement("li");
      empty.className = "muted";
      empty.textContent = t("form.filesNone");
      list.appendChild(empty);
      if (total) total.hidden = true;
      return;
    }
    var bytes = 0;
    pk.files.forEach(function (f, i) {
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
        pk.files.splice(i, 1);
        renderFileList(id);
        if (touched[id]) validateField(id);
        var next = $(pk.list + " .file-remove") || document.getElementById(id);
        if (next) next.focus();
      });
      li.appendChild(name);
      li.appendChild(size);
      li.appendChild(rm);
      list.appendChild(li);
    });
    if (total) {
      total.textContent = t("form.filesCount", { count: pk.files.length, size: formatSize(bytes) });
      total.hidden = false;
    }
  }

  // New picks are added to the list (phones often pick one photo at a time)
  function addFiles(id, fileList) {
    var pk = pickers[id];
    Array.prototype.slice.call(fileList || []).forEach(function (f) {
      var dup = pk.files.some(function (g) { return g.name === f.name && g.size === f.size && g.lastModified === f.lastModified; });
      if (!dup) pk.files.push(f);
    });
    touched[id] = true;
    renderFileList(id);
    validateField(id);
  }

  function initFiles() {
    Object.keys(pickers).forEach(function (id) {
      var input = document.getElementById(id);
      if (!input) return;
      var drop = input.parentElement.querySelector(".file-drop");
      input.addEventListener("change", function () {
        addFiles(id, input.files);
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
          if (e.dataTransfer) addFiles(id, e.dataTransfer.files);
        });
      }
    });
    renderFileList();
  }

  function wantsShipping() {
    var r = $('#job-form input[name="shipping"]:checked');
    return !!(r && r.value === "yes");
  }

  // Delivery address only when the paper copy is posted
  function updateAddressField() {
    var box = $("#address-field");
    if (!box) return;
    var on = wantsShipping();
    box.hidden = !on;
    var el = $("#f-address");
    if (el) el.required = on;
    if (!on) { setFieldError(el, null); refreshErrorSummary(); }
    else if (touched["f-address"]) validateField("f-address");
  }

  // Show the ID section only for civil registration documents
  function updateIdSection() {
    var section = $("#id-section");
    if (!section) return;
    var on = needsId();
    section.hidden = !on;
    var consent = $("#f-idConsent");
    if (consent) consent.required = on;
    if (!on) ["f-idFiles", "f-idConsent"].forEach(function (id) { setFieldError(document.getElementById(id), null); refreshErrorSummary(); });
    else ["f-idFiles", "f-idConsent"].forEach(function (id) { if (touched[id]) validateField(id); });
  }

  function initJobForm() {
    var form = $("#job-form");
    if (!form) return;
    var date = $("#f-neededBy");
    var status = $("#form-status");
    var category = $("#f-category");
    if (category) category.addEventListener("change", updateIdSection);
    updateIdSection();
    $all('#job-form input[name="shipping"]').forEach(function (r) { r.addEventListener("change", updateAddressField); });
    updateAddressField();

    function refreshMinDate() { if (date) date.min = todayISO(); }
    refreshMinDate();

    Object.keys(jobRules).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || pickers[id]) return;
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
        var target = r.firstBad && pickers[r.firstBad.id] ? r.firstBad.parentElement.querySelector(".file-drop") : r.firstBad;
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
      shipping: wantsShipping(),
      address: wantsShipping() ? val("f-address") : "",
      consent: $("#f-consent").checked,
      lang: state.lang,
      files: selectedFiles.slice(),
      requiresId: needsId(),
      idFiles: needsId() ? pickers["f-idFiles"].files.slice() : [],
      idConsent: needsId() ? $("#f-idConsent").checked : false
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
    initPolicyDialog();
    initTocs();
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
    fill: function (str, extra) { var v = tokens(); if (extra) for (var k in extra) v[k] = extra[k]; return fill(str, v); },
    findCategory: findCategory,
    priceRange: priceRange,
    formatRange: formatRange,
    // Phase 2 → used by Phase 3/4
    getJobData: getJobData,
    validateJobForm: validateJobForm,
    showStatus: showStatus,
    setFieldError: setFieldError,
    storage: { get: storageGet, set: storageSet, remove: storageRemove },
    rules: { email: EMAIL_RE, line: LINE_RE },
    todayISO: todayISO
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

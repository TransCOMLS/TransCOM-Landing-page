/*
 * home.js — home page (instant estimate, offers & highlights, popular documents) and the
 * News page (square posts; each opens in a pop-up).
 * Offers and news come from config.js, or from the "Promotions" / "News" sheets when
 * Apps Script is connected (action "getContent"; used only if it has active items).
 */
(function () {
  "use strict";

  var App = window.App;
  var CFG = App.config;
  var t = App.t;
  var CTA_TABS = ["services", "pricing", "calculator", "submit", "track", "account", "how", "faq", "contact", "news", "privacy", "terms"];

  var content = {
    promotions: CFG.promotions || [],
    news: CFG.news || []
  };

  function $(sel) { return document.querySelector(sel); }
  function lang() { return App.getLang(); }
  function pick(obj) {
    if (!obj) return "";
    if (typeof obj === "string") return obj;
    return obj[lang()] || obj.th || obj.en || "";
  }
  function text(obj) { return App.fill(pick(obj)); }

  // Local date as YYYY-MM-DD
  function today() {
    var d = new Date();
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  function fmtDate(iso) {
    if (!iso) return "";
    var parts = String(iso).slice(0, 10).split("-");
    var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    if (isNaN(d)) return String(iso);
    try {
      return d.toLocaleDateString(lang() === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
    } catch (e) { return d.toDateString(); }
  }

  /* ---------- instant estimate ---------- */
  function quickValues() {
    var cat = App.findCategory($("#q-category").value);
    var raw = String($("#q-pages").value || "").trim();
    var pages = /^\d{1,3}$/.test(raw) && +raw >= 1 ? +raw : null;
    return { cat: cat, pages: pages };
  }

  function updateQuick() {
    if (!$("#quick-quote")) return;
    var v = quickValues();
    var ready = !!(v.cat && v.pages);
    $("#qq-empty").hidden = ready;
    $("#qq-prices").hidden = !ready;
    $("#qq-civil").hidden = !(v.cat && v.cat.requiresId);
    $("#q-pages").setAttribute("aria-invalid", String(String($("#q-pages").value).trim() !== "" && !v.pages));
    if (!ready) return;
    $("#qq-normal-label").textContent = t("home.quick.normal", { days: CFG.turnaround.normal });
    $("#qq-express-label").textContent = t("home.quick.express", { days: CFG.turnaround.express });
    ["normal", "express"].forEach(function (u) {
      var r = App.priceRange(v.cat, u);
      $("#qq-" + u).textContent = App.formatRange(r.min * v.pages, r.max * v.pages) + " " + t("common.baht");
    });
  }

  // Put a choice into the calculator and open it
  function openCalculator(catId, pages) {
    var cat = $("#c-category"), pg = $("#c-pages"), form = $("#calc-form");
    if (cat && catId) cat.value = catId;
    if (pg && pages) pg.value = pages;
    if (form) form.dispatchEvent(new Event("input", { bubbles: true }));
    App.showTab("calculator", { focusHeading: true });
  }

  function initQuick() {
    var form = $("#quick-quote");
    if (!form) return;
    form.addEventListener("input", updateQuick);
    form.addEventListener("change", updateQuick);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var v = quickValues();
      openCalculator(v.cat ? v.cat.id : "", v.pages || 1);
    });
    updateQuick();
  }

  /* ---------- offers & highlights ---------- */
  function activePromos() {
    var now = today();
    return content.promotions.filter(function (p) {
      if (p.active === false) return false;
      if (p.start && String(p.start).slice(0, 10) > now) return false;
      if (p.end && String(p.end).slice(0, 10) < now) return false;
      // Account offer only once accounts are switched on
      if (p.cta === "account" && !CFG.appsScriptUrl) return false;
      return !!pick(p.title);
    });
  }

  function renderPromos() {
    var list = $("#promo-list");
    if (!list) return;
    var items = activePromos();
    $("#home-promos").hidden = !items.length;
    list.textContent = "";
    items.forEach(function (p, idx) {
      var li = document.createElement("li");
      li.className = "promo-card";
      if (pick(p.tag)) {
        var tag = document.createElement("p");
        tag.className = "badge";
        tag.textContent = text(p.tag);
        li.appendChild(tag);
      }
      var h = document.createElement("h3");
      h.className = "h4";
      h.textContent = text(p.title);
      li.appendChild(h);
      if (pick(p.text)) {
        var body = document.createElement("p");
        body.className = "promo-text";
        body.textContent = text(p.text).trim();
        li.appendChild(body);
        // Shown only when the text is cut off (see fitPromos)
        var read = document.createElement("button");
        read.type = "button";
        read.className = "btn-link promo-read";
        read.hidden = true;
        read.setAttribute("aria-haspopup", "dialog");
        read.textContent = t("home.promo.read");
        read.setAttribute("aria-label", t("news.open", { title: text(p.title) }));
        read.addEventListener("click", function () { openPost(p, idx, read, "promo"); });
        li.appendChild(read);
      }
      var foot = document.createElement("div");
      foot.className = "promo-foot";
      if (p.end) {
        var until = document.createElement("span");
        until.className = "promo-until";
        until.textContent = t("home.promo.until", { date: fmtDate(p.end) });
        foot.appendChild(until);
      }
      if (CTA_TABS.indexOf(p.cta) !== -1) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn-link";
        btn.setAttribute("data-goto", p.cta);
        btn.textContent = t("home.promo.more");
        btn.setAttribute("aria-label", t("home.promo.more") + ": " + text(p.title));
        foot.appendChild(btn);
      }
      if (foot.childNodes.length) li.appendChild(foot);
      list.appendChild(li);
    });
    fitPromos();
  }

  // "Read more" only on cards whose text is cut off at 6 lines (depends on the card width)
  function fitPromos() {
    Array.prototype.forEach.call(document.querySelectorAll("#promo-list .promo-card"), function (card) {
      var body = card.querySelector(".promo-text"), read = card.querySelector(".promo-read");
      if (body && read) read.hidden = body.scrollHeight <= body.clientHeight + 2;
    });
  }

  /* ---------- popular documents ---------- */
  function renderPopular() {
    var list = $("#popular-docs");
    if (!list) return;
    list.textContent = "";
    (CFG.popularDocs || []).forEach(function (d) {
      var cat = App.findCategory(d.cat);
      if (!cat) return;
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "doc-chip" + (cat.requiresId ? " is-special" : "");
      var name = document.createElement("span");
      name.className = "doc-chip-name";
      name.textContent = d[lang()] || d.th;
      var price = document.createElement("span");
      price.className = "doc-chip-price";
      price.textContent = t("home.popular.from", { price: App.formatNumber(App.priceRange(cat, "normal").min) });
      btn.appendChild(name);
      btn.appendChild(price);
      btn.addEventListener("click", function () { openCalculator(cat.id, 1); });
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  /* ---------- news & announcements: square posts + pop-up ---------- */
  function newsItems() {
    return content.news
      .filter(function (n) { return n.active !== false && pick(n.title) && (!n.date || String(n.date).slice(0, 10) <= today()); })
      .sort(function (a, b) { return String(b.date || "").localeCompare(String(a.date || "")); });
  }

  function safeImage(url) {
    url = String(url || "").trim();
    return /^https:\/\/[^\s"'<>]+$/.test(url) ? url : "";
  }

  // Square picture for a post: the owner's image, or a branded cover with the title
  function postMedia(n, i) {
    var box = document.createElement("div");
    var img = safeImage(n.image);
    if (img) {
      box.className = "post-media";
      var el = document.createElement("img");
      el.src = img;
      el.alt = pick(n.imageAlt) ? text(n.imageAlt) : "";
      el.loading = "lazy";
      el.decoding = "async";
      // A broken link falls back to the cover
      el.addEventListener("error", function () {
        box.replaceWith(postCover(n, i));
      });
      box.appendChild(el);
      return box;
    }
    return postCover(n, i);
  }

  function postCover(n, i) {
    var box = document.createElement("div");
    box.className = "post-media post-cover tone-" + (i % 3);
    box.setAttribute("aria-hidden", "true");
    var icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("class", "post-cover-icon");
    icon.innerHTML = '<path d="M4 10v4h3l6 4V6L7 10H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>';
    var title = document.createElement("span");
    title.className = "post-cover-title";
    title.textContent = text(n.title);
    var brand = document.createElement("span");
    brand.className = "post-cover-brand";
    brand.textContent = App.fill("{serviceName}");
    box.appendChild(icon);
    box.appendChild(title);
    box.appendChild(brand);
    return box;
  }

  function renderNews() {
    var grid = $("#post-grid");
    if (!grid) return;
    var items = newsItems();
    grid.textContent = "";
    $("#post-empty").hidden = items.length > 0;
    items.forEach(function (n, i) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "post-card";
      btn.setAttribute("aria-haspopup", "dialog");
      btn.setAttribute("aria-label", t("news.open", { title: text(n.title) }));
      btn.appendChild(postMedia(n, i));
      var body = document.createElement("span");
      body.className = "post-card-body";
      if (n.date) {
        var d = document.createElement("span");
        d.className = "post-date";
        d.textContent = fmtDate(n.date);
        body.appendChild(d);
      }
      var h = document.createElement("span");
      h.className = "post-title";
      h.textContent = text(n.title);
      body.appendChild(h);
      btn.appendChild(body);
      btn.addEventListener("click", function () { openPost(n, i, btn); });
      li.appendChild(btn);
      grid.appendChild(li);
    });
  }

  var postOpener = null, openIndex = -1, openSource = "news";

  function openPost(n, i, opener, source) {
    var dlg = $("#post-dialog");
    if (!dlg || typeof dlg.showModal !== "function") return;
    postOpener = opener || postOpener;
    openIndex = i;
    openSource = source || openSource;
    $("#post-dialog-date").textContent = n.date ? fmtDate(n.date) : "";
    $("#post-dialog-title").textContent = text(n.title);
    // Always show the post's picture (the owner's image, or the generated cover)
    var media = $("#post-dialog-media");
    media.textContent = "";
    media.hidden = false;
    dlg.classList.add("has-media");
    media.appendChild(postMedia(n, i));
    var body = $("#post-dialog-text");
    body.textContent = "";
    String(text(n.text) || "").replace(/\r/g, "").split(/\n[ \t]*\n/).forEach(function (para) {
      if (!para.trim()) return;
      var p = document.createElement("p");
      p.textContent = para.replace(/^\s*\n|\s+$/g, "");
      body.appendChild(p);
    });
    var foot = $("#post-dialog-foot");
    foot.textContent = "";
    foot.hidden = CTA_TABS.indexOf(n.cta) === -1;
    if (!foot.hidden) {
      var go = document.createElement("button");
      go.type = "button";
      go.className = "btn btn-primary btn-block";
      go.textContent = t("news.more");
      go.addEventListener("click", function () { dlg.close(); App.showTab(n.cta, { focusHeading: true }); });
      foot.appendChild(go);
    }
    if (!dlg.open) {
      document.documentElement.classList.add("modal-open");
      dlg.showModal();
    }
    $(".modal-body", dlg).scrollTop = 0;
    $(".modal-close", dlg).focus();
  }

  function initPostDialog() {
    var dlg = $("#post-dialog");
    if (!dlg) return;
    Array.prototype.forEach.call(dlg.querySelectorAll("[data-close-modal]"), function (b) {
      b.addEventListener("click", function () { dlg.close(); });
    });
    dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener("close", function () {
      document.documentElement.classList.remove("modal-open");
      // The grid is rebuilt on a language switch, so fall back to the card at the same place
      var back = postOpener && document.contains(postOpener) ? postOpener
        : document.querySelectorAll(openSource === "promo" ? "#promo-list .promo-read" : "#post-grid .post-card")[openIndex];
      if (back) back.focus({ preventScroll: true });
      openIndex = -1;
      postOpener = null;
      openSource = "news";
    });
    // Language switch while open: show the same post in the new language
    document.addEventListener("langchange", function () {
      if (!dlg.open || openIndex < 0) return;
      var items = openSource === "promo" ? activePromos() : newsItems();
      if (items[openIndex]) openPost(items[openIndex], openIndex, null, openSource);
    });
  }

  function renderAll() {
    renderPromos();
    renderPopular();
    renderNews();
    updateQuick();
  }

  // Owner-managed content from the Google Sheet, when connected
  // Offers/news from the sheet. The last copy is kept on this device and shown at once;
  // the fresh copy replaces it when Apps Script answers (it takes a second or two).
  var CONTENT_KEY = "tr_content";
  function applySheetContent(res) {
    var next = {
      promotions: res && res.promotions && res.promotions.length ? res.promotions : (CFG.promotions || []),
      news: res && res.news && res.news.length ? res.news : (CFG.news || [])
    };
    var changed = JSON.stringify(next.promotions) !== JSON.stringify(content.promotions) ||
                  JSON.stringify(next.news) !== JSON.stringify(content.news);
    content.promotions = next.promotions;
    content.news = next.news;
    return changed;
  }
  function loadSheetContent() {
    if (!CFG.appsScriptUrl || !App.api) return;
    var cached = null;
    try { cached = JSON.parse(App.storage.get(CONTENT_KEY) || "null"); } catch (e) { cached = null; }
    if (cached && applySheetContent(cached)) renderAll();
    App.api("getContent", {}).then(function (res) {
      App.storage.set(CONTENT_KEY, JSON.stringify({ promotions: res.promotions || [], news: res.news || [] }));
      if (applySheetContent(res)) renderAll();
    }, function () { /* keep what is shown */ });
  }

  /* ---------- visitor counter (footer) ---------- */
  function loadVisits() {
    var box = $("#visit-count");
    if (!box || !CFG.appsScriptUrl || CFG.showVisitorCount === false || !App.api) return;
    var today = App.todayISO(), isNew = App.storage.get("tr_visit") !== today;
    function show(total) {
      $("#visit-n").textContent = App.formatNumber(total || 0);
      box.hidden = !(total > 0);
    }
    var last = parseInt(App.storage.get("tr_visits") || "0", 10);
    if (last > 0) show(last);           // last known number at once, the fresh one replaces it
    App.api("visit", { isNew: isNew }).then(function (res) {
      App.storage.set("tr_visit", today);
      App.storage.set("tr_visits", String(res.total || 0));
      show(res.total);
    }, function () { /* no counter without the backend */ });
  }

  function init() {
    loadVisits();
    initQuick();
    initPostDialog();
    renderAll();
    loadSheetContent();
    document.addEventListener("langchange", renderAll);
    // Re-measure the offer cards once they are visible / resized / the font has loaded
    var fitQueued = false;
    function queueFit() {
      if (fitQueued) return;
      fitQueued = true;
      requestAnimationFrame(function () { fitQueued = false; fitPromos(); });
    }
    document.addEventListener("tabchange", queueFit);
    window.addEventListener("resize", queueFit);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(queueFit);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

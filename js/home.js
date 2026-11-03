/*
 * home.js — home page: instant estimate, offers & highlights, popular documents, news.
 * Offers and news come from config.js, or from the "Promotions" / "News" sheets when
 * Apps Script is connected (action "getContent"; used only if it has active items).
 */
(function () {
  "use strict";

  var App = window.App;
  var CFG = App.config;
  var t = App.t;
  var CTA_TABS = ["services", "pricing", "calculator", "submit", "track", "account", "how", "faq", "contact"];

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
    $("#qq-normal").textContent = t("home.quick.price", { price: App.formatNumber(v.cat.normal * v.pages) });
    $("#qq-express").textContent = t("home.quick.price", { price: App.formatNumber(v.cat.express * v.pages) });
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
    items.forEach(function (p) {
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
        body.textContent = text(p.text);
        li.appendChild(body);
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
      price.textContent = t("home.popular.from", { price: App.formatNumber(cat.normal) });
      btn.appendChild(name);
      btn.appendChild(price);
      btn.addEventListener("click", function () { openCalculator(cat.id, 1); });
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  /* ---------- news ---------- */
  function renderNews() {
    var list = $("#news-list");
    if (!list) return;
    var items = content.news
      .filter(function (n) { return n.active !== false && pick(n.title) && (!n.date || String(n.date).slice(0, 10) <= today()); })
      .sort(function (a, b) { return String(b.date || "").localeCompare(String(a.date || "")); })
      .slice(0, 4);
    $("#home-news").hidden = !items.length;
    list.textContent = "";
    items.forEach(function (n) {
      var li = document.createElement("li");
      li.className = "news-item";
      if (n.date) {
        var time = document.createElement("time");
        time.className = "news-date";
        time.setAttribute("datetime", String(n.date).slice(0, 10));
        time.textContent = fmtDate(n.date);
        li.appendChild(time);
      }
      var h = document.createElement("h3");
      h.className = "h4";
      h.textContent = text(n.title);
      li.appendChild(h);
      if (pick(n.text)) {
        var p = document.createElement("p");
        p.textContent = text(n.text);
        li.appendChild(p);
      }
      list.appendChild(li);
    });
  }

  function renderAll() {
    renderPromos();
    renderPopular();
    renderNews();
    updateQuick();
  }

  // Owner-managed content from the Google Sheet, when connected
  function loadSheetContent() {
    if (!CFG.appsScriptUrl || !App.api) return;
    App.api("getContent", {}).then(function (res) {
      var changed = false;
      if (res.promotions && res.promotions.length) { content.promotions = res.promotions; changed = true; }
      if (res.news && res.news.length) { content.news = res.news; changed = true; }
      if (changed) renderAll();
    }, function () { /* keep the built-in content */ });
  }

  function init() {
    initQuick();
    renderAll();
    loadSheetContent();
    document.addEventListener("langchange", renderAll);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

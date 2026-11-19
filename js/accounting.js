/*
 * accounting.js — Phase 8 (owner 2026-11-19): the accounting pages of the dashboard, loaded on demand by portal.js.
 * accountant records; auditor (an outside accounting office) reads and exports; admin both. The server checks every call.
 *   acc-overview · acc-ledger (entries + evidence) · acc-reports · acc-receipts · acc-wht (ภ.ง.ด.3 list + 50 ทวิ)
 *   acc-tax (yearly summary for the owner's income tax) · acc-cats · acc-log
 * CSV downloads are UTF-8 with a BOM, so Excel and Google Sheets read Thai correctly.
 * App.accounting.whtDoc({ source, key }) draws the printable 50 ทวิ (also used on the translator's pay page).
 */
(function () {
  "use strict";

  var App = window.App;
  var t = App.t;
  var P = App.portal, V = P.views, H = P.h;
  var el = H.el, button = H.button, card = H.card, heading = H.heading, load = H.load, api = H.api, show = H.show, baht = H.baht;
  var filters = null;   // ledger filters, kept while moving around the dashboard

  /* ---------- helpers ---------- */
  function money(n) { return Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function signed(n) { return (n < 0 ? "−" : "") + money(Math.abs(n)); }
  function lang() { return App.getLang() === "en" ? "en" : "th"; }
  function catName(list, code) {
    for (var i = 0; i < list.length; i++) if (list[i].code === code) return lang() === "en" ? list[i].nameEn : list[i].nameTh;
    return code;
  }
  function today() { return H.isoDay(new Date()); }
  function monthStart(d) { return d.slice(0, 8) + "01"; }
  function addMonths(month, n) {
    var y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7)) - 1 + n;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return y + "-" + (m < 9 ? "0" : "") + (m + 1);
  }
  function monthEnd(month) { var d = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0); return H.isoDay(d); }
  function longDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
    if (!m) return "";
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    try { return d.toLocaleDateString(lang() === "en" ? "en-GB" : "th-TH", { day: "numeric", month: "long", year: "numeric" }); } catch (e) { return iso; }
  }
  function yearLabel(y) { return lang() === "en" ? String(y) : String(y + 543); }
  function taxIdText(v) {
    var s = String(v || "").replace(/\D/g, "");
    return s.length === 13 ? s[0] + "-" + s.slice(1, 5) + "-" + s.slice(5, 10) + "-" + s.slice(10, 12) + "-" + s[12] : s;
  }
  function select(options, value, label) {
    var s = el("select");
    if (label) s.setAttribute("aria-label", label);
    options.forEach(function (o) { var op = el("option", null, o[1]); op.value = o[0]; if (String(o[0]) === String(value)) op.selected = true; s.appendChild(op); });
    return s;
  }
  function yearPicker(year, view) {
    var now = new Date().getFullYear(), list = [];
    for (var y = now; y >= Math.min(2026, year); y--) list.push([y, yearLabel(y)]);
    var s = select(list, year, t("acc.year"));
    s.addEventListener("change", function () { show(view, Number(s.value)); });
    return H.fieldBox("acc.year", s);
  }
  function statBox(grid, value, key, tone) {
    var d = el("div", "dash-stat" + (tone ? " tone-" + tone : ""));
    d.appendChild(el("span", "dash-stat-n dash-stat-money", value));
    d.appendChild(el("span", "dash-stat-label", t(key)));
    grid.appendChild(d);
  }
  function moneyStats(box, s) {
    var g = el("div", "dash-stats");
    statBox(g, baht(s.income), "acc.income");
    statBox(g, baht(s.expense), "acc.expense", "warn");
    statBox(g, baht(s.net), "acc.net", s.net < 0 ? "bad" : "ok");
    box.appendChild(g);
  }
  function table(head, rows, foot, cls) {
    var wrap = el("div", "table-wrap acc-table-wrap");
    var tb = el("table", "price-table acc-table" + (cls ? " " + cls : ""));
    var th = el("thead"), tr = el("tr");
    head.forEach(function (h, i) { var c = el("th", i && h.num !== false ? "num" : null, h.text || h); c.scope = "col"; tr.appendChild(c); });
    th.appendChild(tr); tb.appendChild(th);
    var body = el("tbody");
    rows.forEach(function (r) {
      var row = el("tr");
      r.forEach(function (v, i) {
        var c = el("td", i && typeof v !== "object" && head[i] && head[i].num !== false ? "num" : null);
        if (v instanceof Node) c.appendChild(v); else c.textContent = v;
        row.appendChild(c);
      });
      body.appendChild(row);
    });
    tb.appendChild(body);
    if (foot) {
      var tf = el("tfoot"), fr = el("tr");
      foot.forEach(function (v, i) { var c = el("td", i ? "num" : null, v); fr.appendChild(c); });
      tf.appendChild(fr); tb.appendChild(tf);
    }
    wrap.appendChild(tb);
    return wrap;
  }
  // CSV for Excel / Google Sheets (UTF-8 + BOM). Text that a spreadsheet would run as a formula gets a leading '
  function csv(name, head, rows) {
    function esc(v) {
      if (typeof v === "number") return String(v);
      v = v == null ? "" : String(v);
      if (/^[=+\-@]/.test(v)) v = "'" + v;
      return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }
    var text = "﻿" + [head].concat(rows).map(function (r) { return r.map(esc).join(","); }).join("\r\n");
    saveBlob(new Blob([text], { type: "text/csv;charset=utf-8" }), name);
  }
  function saveBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = el("a"); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  function csvButton(fn) { return button(t("acc.csv"), "btn btn-outline btn-sm", fn); }
  function actions() { var r = el("div", "actions"); for (var i = 0; i < arguments.length; i++) if (arguments[i]) r.appendChild(arguments[i]); return r; }
  function methodName(m) { var k = "acc.m." + m, v = t(k); return v === k ? H.payMethod(m) : v; }
  function readOnlyNote(box, caps) { if (caps && !caps.canEdit) box.appendChild(el("p", "notice", t("acc.readOnly"))); }

  /* ---------- overview ---------- */
  V["acc-overview"] = function (box) {
    heading(box, "acc.overview", button(t("acct.refresh"), "btn-link", function () { H.draw(); }));
    load(box, "accOverview", {}, function (o) {
      readOnlyNote(box, o.caps);
      var m = card(box); m.appendChild(el("h3", "h4 dash-card-title", t("acc.thisMonth") + " · " + H.monthName(o.month))); moneyStats(m, o.thisMonth);
      var y = card(box); y.appendChild(el("h3", "h4 dash-card-title", t("acc.ytd", { year: yearLabel(o.vat.year) }))); moneyStats(y, o.ytd);

      // VAT watch
      var v = card(box, "acc.vatTitle"), pct = Math.min(100, o.vat.percent);
      var bar = el("div", "mem-progress acc-meter is-" + o.vat.level); bar.setAttribute("role", "img");
      bar.setAttribute("aria-label", t("acc.vatAria", { pct: o.vat.percent }));
      var fill = el("span", "mem-progress-fill"); fill.style.width = pct + "%"; bar.appendChild(fill);
      v.appendChild(bar);
      v.appendChild(el("p", null, t("acc.vatLine", { income: baht(o.vat.income), limit: baht(o.vat.threshold), pct: o.vat.percent })));
      v.appendChild(el("p", "notice" + (o.vat.level === "ok" ? "" : " notice-warn"), t("acc.vat." + o.vat.level, { warn: o.vat.warnPercent })));

      // to do
      var d = card(box, "acc.todo"), ul = el("ul", "acc-todo");
      function todo(text, label, go) { var li = el("li"); li.appendChild(el("span", null, text)); li.appendChild(button(label, "btn btn-outline btn-sm", go)); ul.appendChild(li); }
      if (o.missingEvidence) todo(t("acc.todo.evidence", { n: o.missingEvidence }), t("acc.open"), function () {
        filters = defaultFilters(); filters.from = o.month.slice(0, 4) + "-01-01"; filters.noEvidence = true; show("acc-ledger");
      });
      if (o.payouts.count) todo(t("acc.todo.payouts", { n: o.payouts.count, month: H.monthName(o.payouts.month), amount: baht(o.payouts.net) }), t("acc.open"), function () { show("a-payouts", o.payouts.month); });
      if (o.wht.count) todo(t("acc.todo.wht", { n: o.wht.count, month: H.monthName(o.wht.month), tax: baht(o.wht.tax), due: H.day(o.wht.due), online: H.day(o.wht.dueOnline) }), t("acc.open"), function () { show("acc-wht", o.wht.month); });
      if (!ul.childNodes.length) d.appendChild(el("p", "muted", t("acc.todo.none"))); else d.appendChild(ul);

      closingCard(box, o);
    });
  };
  function closingCard(box, o) {
    var c = card(box, "acc.closeTitle");
    c.appendChild(el("p", "note", t("acc.closeNote")));
    var chips = el("div", "job-flags");
    o.closed.slice(-12).forEach(function (m) {
      var f = el("span", "flag flag-ok", "🔒 " + H.monthName(m));
      chips.appendChild(f);
      if (o.caps.canReopen) {
        var b = button(t("acc.reopen"), "btn-link", function () {
          if (!window.confirm(t("acc.reopenConfirm", { month: H.monthName(m) }))) return;
          H.busy(b, true);
          api("accClose", { month: m, close: false }).then(function () { H.draw(); }, function (err) { H.alertBox(b, H.errText(err)); H.busy(b, false); });
        });
        chips.appendChild(b);
      }
    });
    if (!o.closed.length) chips.appendChild(el("span", "muted", t("acc.noneClosed")));
    c.appendChild(chips);
    if (!o.caps.canEdit) return;
    var list = [];
    for (var i = 1; i <= 12; i++) { var mm = addMonths(o.month, -i); if (o.closed.indexOf(mm) === -1) list.push([mm, H.monthName(mm)]); }
    if (!list.length) return;
    var s = select(list, list[list.length - 1][0], t("acc.closeMonth"));
    var go = button(t("acc.close"), "btn btn-primary btn-sm", function () {
      if (!window.confirm(t("acc.closeConfirm", { month: H.monthName(s.value) }))) return;
      H.busy(go, true);
      api("accClose", { month: s.value, close: true }).then(function () { H.draw(); }, function (err) { H.alertBox(go, H.errText(err)); H.busy(go, false); });
    });
    var row = el("div", "acc-inline"); row.appendChild(H.fieldBox("acc.closeMonth", s)); row.appendChild(go);
    c.appendChild(row);
  }

  /* ---------- ledger ---------- */
  function defaultFilters() { var d = today(); return { from: monthStart(d), to: d, kind: "", category: "", source: "", q: "", noEvidence: false }; }

  V["acc-ledger"] = function (box) {
    if (!filters) filters = defaultFilters();
    heading(box, "acc.ledger");
    load(box, "accLedger", filters, function (res) {
      readOnlyNote(box, res.caps);
      var all = res.cats.concat(res.auto);
      // filters
      var f = card(box);
      var quick = el("div", "dash-tabs");
      var d = today(), m = d.slice(0, 7), lm = addMonths(m, -1);
      [["acc.r.thisMonth", monthStart(d), d], ["acc.r.lastMonth", lm + "-01", monthEnd(lm)], ["acc.r.thisYear", d.slice(0, 4) + "-01-01", d]].forEach(function (r) {
        var b = button(t(r[0]), "dash-tab", function () { filters.from = r[1]; filters.to = r[2]; show("acc-ledger"); });
        if (filters.from === r[1] && filters.to === r[2]) b.setAttribute("aria-selected", "true");
        quick.appendChild(b);
      });
      f.appendChild(quick);
      var from = H.input("date", filters.from), to = H.input("date", filters.to);
      var kind = select([["", t("acc.all")], ["income", t("acc.income")], ["expense", t("acc.expense")]], filters.kind);
      var cat = select([["", t("acc.allCats")]].concat(all.map(function (c) { return [c.code, (lang() === "en" ? c.nameEn : c.nameTh) + (c.auto ? " · " + t("acc.autoShort") : "")]; })), filters.category);
      var src = select([["", t("acc.all")], ["ledger", t("acc.src.ledger")], ["auto", t("acc.src.auto")]], filters.source);
      var q = H.input("search", filters.q, { maxlength: "80", placeholder: t("acc.searchPh") });
      var g = el("div", "grid-2 acc-filters");
      [["acc.from", from], ["acc.to", to], ["acc.kind", kind], ["acc.category", cat], ["acc.source", src], ["acc.search", q]].forEach(function (x) { g.appendChild(H.fieldBox(x[0], x[1])); });
      f.appendChild(g);
      var ne = H.checkbox("acc.noEvidenceOnly", filters.noEvidence);
      var cbs = el("div", "dash-checks"); cbs.appendChild(ne); f.appendChild(cbs);
      function apply() {
        filters = { from: from.value, to: to.value, kind: kind.value, category: cat.value, source: src.value, q: q.value.trim(), noEvidence: ne.input.checked };
        show("acc-ledger");
      }
      q.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); apply(); } });
      f.appendChild(actions(button(t("acc.apply"), "btn btn-primary btn-sm", apply),
        button(t("acc.clear"), "btn btn-outline btn-sm", function () { filters = defaultFilters(); show("acc-ledger"); }),
        csvButton(function () { ledgerCsv(res, all); })));

      if (res.caps.canEdit) {
        var add = button("+ " + t("acc.newEntry"), "btn btn-primary", function () { entryForm(box, null, res, add); });
        box.appendChild(actions(add));
      }
      // totals
      var tc = card(box);
      tc.appendChild(el("p", "note", t("acc.period", { from: H.day(res.from), to: H.day(res.to) })));
      moneyStats(tc, res.totals);
      if (res.totals.whtWithheld || res.totals.whtCredit) {
        tc.appendChild(H.details([["acc.whtWithheld", baht(res.totals.whtWithheld)], ["acc.whtCredit", baht(res.totals.whtCredit)]]));
      }
      // rows
      var lc = card(box, "acc.entries");
      if (!res.rows.length) { H.empty(lc, "acc.noRows"); return; }
      var ul = el("ul", "pay-list acc-list");
      res.rows.slice().reverse().forEach(function (r) { ul.appendChild(entryItem(r, res, all, box)); });
      lc.appendChild(ul);
    });
  };

  function entryItem(r, res, all, box) {
    var li = el("li", "pay-item acc-item" + (r.status === "void" ? " is-void" : ""));
    var top = el("div", "pay-item-top");
    top.appendChild(el("span", "job-no", H.day(r.date) + " · " + catName(all, r.category)));
    var neg = r.kind === "expense" || r.amount < 0;
    top.appendChild(el("span", "pay-amount acc-amt " + (r.kind === "income" ? (r.amount < 0 ? "is-neg" : "is-in") : "is-out"), (neg ? "−" : "+") + money(Math.abs(r.amount))));
    li.appendChild(top);
    li.appendChild(el("p", "acc-desc", r.description));
    var meta = [];
    if (r.party) meta.push(r.party);
    if (r.docNo) meta.push(t("acc.docNo") + " " + r.docNo);
    if (r.method) meta.push(methodName(r.method));
    if (meta.length) li.appendChild(el("p", "job-meta", meta.join(" · ")));
    var flags = el("div", "job-flags");
    if (r.auto) flags.appendChild(el("span", "flag", t("acc.src." + r.source)));
    if (r.status === "void") flags.appendChild(el("span", "flag flag-bad", t("acc.voided") + (r.voidReason ? ": " + r.voidReason : "")));
    if (r.wht) flags.appendChild(el("span", "flag flag-warn", t(r.kind === "income" ? "acc.whtCreditN" : "acc.whtN", { n: money(r.wht) }) + (r.whtCertNo ? " · 50 ทวิ " + r.whtCertNo : "")));
    if (!r.auto && r.kind === "expense" && r.status !== "void") flags.appendChild(el("span", "flag " + (r.evidence.length ? "flag-ok" : "flag-warn"), r.evidence.length ? t("acc.evidenceN", { n: r.evidence.length }) : t("acc.noEvidence")));
    if (!r.auto && r.kind === "income" && r.evidence.length) flags.appendChild(el("span", "flag flag-ok", t("acc.evidenceN", { n: r.evidence.length })));
    if (res.closed.indexOf(r.date.slice(0, 7)) > -1) flags.appendChild(el("span", "flag", "🔒 " + t("acc.closedFlag")));
    if (flags.childNodes.length) li.appendChild(flags);
    if (r.note) li.appendChild(el("p", "hint", r.note));

    var acts = el("div", "acct-links");
    if (r.source === "payment" || r.source === "refund" || r.source === "fee") {
      acts.appendChild(button(t("pay.viewReceipt"), "btn btn-outline btn-sm", function () { receiptOf(r.ref); }));
    }
    if (r.wht && (r.source === "payout" || (r.source === "ledger" && r.kind === "expense"))) {
      var wb = button(t("acc.whtCert"), "btn btn-outline btn-sm", function () { H.busy(wb, true); whtDoc({ source: r.source === "payout" ? "payout" : "ledger", key: r.ref }).catch(function (err) { H.alertBox(wb, H.errText(err)); }).then(function () { H.busy(wb, false); }); });
      acts.appendChild(wb);
    }
    var open = r.status !== "void" && res.closed.indexOf(r.date.slice(0, 7)) === -1;
    if (r.source === "ledger" && res.caps.canEdit && open) {
      acts.appendChild(button(t("acc.edit"), "btn-link", function () { entryForm(box, r, res); }));
      acts.appendChild(button(t("acc.void"), "btn-link danger", function () { voidForm(li, r); }));
    }
    if (acts.childNodes.length) li.appendChild(acts);
    if (r.source === "ledger" && (r.evidence.length || (res.caps.canEdit && r.status !== "void"))) li.appendChild(evidenceBox(r, res.caps.canEdit && r.status !== "void", open));
    return li;
  }
  function receiptOf(no) {
    api("adminPayments", {}).then(function (res) {
      var p = (res.payments || []).filter(function (x) { return x.receiptNo === no; })[0];
      if (p) H.openReceipt(p);
    });
  }

  function evidenceBox(r, canAdd, canRemove) {
    var d = el("details", "acc-evidence");
    d.appendChild(el("summary", null, t("acc.evidence") + " (" + r.evidence.length + ")"));
    var ul = el("ul", "dash-files");
    r.evidence.forEach(function (f) {
      var li = el("li");
      li.appendChild(el("span", "dash-file-name", f.name));
      var dl = button(t("dash.download"), "btn btn-outline btn-sm", function () {
        H.busy(dl, true);
        api("accFile", { id: r.id, fileId: f.id }).then(function (res) {
          var bin = atob(res.data), bytes = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          saveBlob(new Blob([bytes], { type: res.mime || "application/octet-stream" }), res.name || f.name);
        }, function (err) { H.alertBox(dl, H.errText(err)); }).then(function () { H.busy(dl, false); });
      });
      li.appendChild(dl);
      if (canAdd && canRemove) {
        var rm = button(t("dash.remove"), "btn-link danger", function () {
          if (!window.confirm(t("acc.removeEvidenceConfirm", { name: f.name }))) return;
          H.busy(rm, true);
          api("accRemoveEvidence", { id: r.id, fileId: f.id }).then(function () { show("acc-ledger"); }, function (err) { H.alertBox(rm, H.errText(err)); H.busy(rm, false); });
        });
        li.appendChild(rm);
      }
      ul.appendChild(li);
    });
    if (r.evidence.length) d.appendChild(ul);
    if (canAdd) {
      var inp = H.input("file", null, { accept: ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png", multiple: "multiple" });
      var st = el("div", "form-status"); st.hidden = true;
      inp.addEventListener("change", function () {
        var files = Array.prototype.slice.call(inp.files || []);
        if (!files.length) return;
        inp.disabled = true;
        uploadAll(r.id, files, st).then(function () { show("acc-ledger"); }, function () { inp.disabled = false; });
      });
      d.appendChild(H.fieldBox("acc.addEvidence", inp, "acc.evidenceHint"));
      d.appendChild(st);
      if (!r.evidence.length) d.open = true;
    }
    return d;
  }
  function uploadAll(id, files, st) {
    var chain = Promise.resolve();
    files.forEach(function (file, i) {
      chain = chain.then(function () {
        if (file.size > 10 * 1048576) throw { code: "too_large" };
        H.status(st, "", t("acc.uploading", { n: i + 1, total: files.length }));
        return H.readBase64(file).then(function (data) { return api("accUploadEvidence", { id: id, name: file.name, data: data }); });
      });
    });
    return chain.then(function () { H.status(st, "success", t("acct.saved")); }, function (err) { H.status(st, "error", H.errText(err)); throw err; });
  }

  function voidForm(li, r) {
    if (li.querySelector(".refund-form")) return;
    var f = el("div", "refund-form");
    var why = H.input("text", "", { maxlength: "300" });
    f.appendChild(H.fieldBox("acc.voidReason", why, "acc.voidHint"));
    var st = el("div", "form-status"); st.hidden = true;
    var go = button(t("acc.void"), "btn btn-danger btn-sm", function () {
      H.busy(go, true);
      api("accVoidEntry", { id: r.id, reason: why.value.trim() }).then(function () { show("acc-ledger"); }, function (err) { H.status(st, "error", H.errText(err)); H.busy(go, false); });
    });
    f.appendChild(actions(go, button(t("acct.cancel"), "btn btn-outline btn-sm", function () { f.remove(); })));
    f.appendChild(st);
    li.appendChild(f);
    why.focus();
  }

  // New / edit entry
  function entryForm(box, r, res, after) {
    var old = H.$(".acc-form", box);
    if (old) old.remove();
    var c = el("section", "dash-card acc-form");
    c.appendChild(el("h3", "h4 dash-card-title", t(r ? "acc.editEntry" : "acc.newEntry")));
    var kindNow = r ? r.kind : "expense";
    var kinds = el("div", "choice-row");
    var radios = {};
    ["expense", "income"].forEach(function (k) {
      var l = el("label", "choice"), i = el("input"); i.type = "radio"; i.name = "acc-kind"; i.value = k; i.checked = k === kindNow;
      i.addEventListener("change", function () { kindNow = k; fillCats(); toggleWht(); });
      l.appendChild(i); l.appendChild(el("span", null, t("acc." + k))); kinds.appendChild(l); radios[k] = i;
    });
    var kf = el("fieldset", "field-group"); kf.appendChild(el("legend", null, t("acc.kind"))); kf.appendChild(kinds); c.appendChild(kf);
    var date = H.input("date", r ? r.date : today(), { max: today() });
    var cat = el("select");
    function fillCats() {
      cat.textContent = "";
      res.cats.filter(function (x) { return x.kind === kindNow && (x.active || (r && x.code === r.category)); }).forEach(function (x) {
        var o = el("option", null, lang() === "en" ? x.nameEn : x.nameTh); o.value = x.code; if (r && r.category === x.code) o.selected = true; cat.appendChild(o);
      });
    }
    fillCats();
    var desc = H.input("text", r ? r.description : "", { maxlength: "300" });
    var amount = H.input("number", r ? r.amount : "", { min: "0.01", step: "0.01", inputmode: "decimal" });
    var wht = H.input("number", r && r.wht ? r.wht : "", { min: "0", step: "0.01", inputmode: "decimal" });
    var party = H.input("text", r ? r.party : "", { maxlength: "200" });
    var taxId = H.input("text", r ? r.partyTaxId : "", { maxlength: "17", inputmode: "numeric" });
    var addr = H.input("text", r ? r.partyAddress : "", { maxlength: "300" });
    var docNo = H.input("text", r ? r.docNo : "", { maxlength: "60" });
    var method = select(res.methods.map(function (m) { return [m, methodName(m)]; }), r ? r.method : "transfer");
    var note = H.input("text", r ? r.note : "", { maxlength: "600" });
    var g = el("div", "grid-2");
    g.appendChild(H.fieldBox("acc.date", date)); g.appendChild(H.fieldBox("acc.category", cat));
    var dw = H.fieldBox("acc.description", desc); dw.classList.add("span-2"); g.appendChild(dw);
    g.appendChild(H.fieldBox("acc.amount", amount, "acc.amountHint"));
    var whtBox = H.fieldBox("acc.whtAmount", wht, "acc.whtHintExpense"); g.appendChild(whtBox);
    g.appendChild(H.fieldBox("acc.party", party)); g.appendChild(H.fieldBox("acc.partyTaxId", taxId));
    var ab = H.fieldBox("acc.partyAddress", addr); ab.classList.add("span-2"); g.appendChild(ab);
    g.appendChild(H.fieldBox("acc.docNo", docNo)); g.appendChild(H.fieldBox("acc.method", method));
    var nb = H.fieldBox("acc.note", note); nb.classList.add("span-2"); g.appendChild(nb);
    c.appendChild(g);
    function toggleWht() { var h = whtBox.querySelector(".hint"); if (h) h.textContent = t(kindNow === "income" ? "acc.whtHintIncome" : "acc.whtHintExpense"); }
    toggleWht();
    var files = null;
    if (!r) {
      files = H.input("file", null, { accept: ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png", multiple: "multiple" });
      c.appendChild(H.fieldBox("acc.addEvidence", files, "acc.evidenceHint"));
    }
    var st = el("div", "form-status"); st.hidden = true;
    var save = button(t("acct.save"), "btn btn-primary", function () {
      var e = { id: r ? r.id : "", date: date.value, kind: kindNow, category: cat.value, description: desc.value.trim(), amount: Number(amount.value),
                wht: Number(wht.value) || 0, party: party.value.trim(), partyTaxId: taxId.value.trim(), partyAddress: addr.value.trim(),
                docNo: docNo.value.trim(), method: method.value, note: note.value.trim() };
      H.busy(save, true);
      api("accSaveEntry", { entry: e }).then(function (res2) {
        var list = files ? Array.prototype.slice.call(files.files || []) : [];
        return list.length ? uploadAll(res2.entry.id, list, st) : null;
      }).then(function () { show("acc-ledger"); }, function (err) { if (err && err.code) H.status(st, "error", H.errText(err)); H.busy(save, false); });
    });
    c.appendChild(actions(save, button(t("acct.cancel"), "btn btn-outline", function () { c.remove(); })));
    c.appendChild(st);
    c.appendChild(el("p", "note", t("acc.formNote")));
    var anchor = after ? after.parentNode : H.$(".dash-head", box);
    anchor.parentNode.insertBefore(c, anchor.nextSibling);
    c.scrollIntoView({ block: "start", behavior: "smooth" });
    desc.focus({ preventScroll: true });
  }

  function ledgerCsv(res, all) {
    csv("ledger-" + res.from + "_" + res.to + ".csv",
      [t("acc.date"), t("acc.kind"), t("acc.category"), t("acc.description"), t("acc.party"), t("acc.partyTaxId"), t("acc.docNo"),
       t("acc.amount"), t("acc.whtAmount"), "50 ทวิ", t("acc.method"), t("acc.source"), t("acc.ref"), t("acc.status"), t("acc.evidence"), t("acc.note")],
      res.rows.map(function (r) {
        return [r.date, t("acc." + r.kind), catName(all, r.category), r.description, r.party, r.partyTaxId || "", r.docNo || "", r.amount, r.wht || 0, r.whtCertNo || "",
                r.method ? methodName(r.method) : "", t("acc.src." + r.source), r.ref || "", r.status === "void" ? t("acc.voided") : "",
                r.evidence ? r.evidence.length : "", r.note || ""];
      }));
  }

  /* ---------- reports ---------- */
  V["acc-reports"] = function (box, year) {
    heading(box, "acc.reports");
    load(box, "accReport", year ? { year: year } : {}, function (res) {
      var top = card(box);
      top.appendChild(yearPicker(res.year, "acc-reports"));
      moneyStats(top, res.totals);
      var cols = ["sales", "refunds", "otherIncome", "income", "fees", "payouts", "otherExpense", "expense", "net"];
      var mc = card(box, "acc.byMonth");
      mc.appendChild(el("p", "note", t("acc.cashBasis")));
      var max = Math.max.apply(null, res.months.map(function (m) { return Math.max(m.income, m.expense); }).concat([1]));
      var bars = el("ul", "acc-bars");
      res.months.forEach(function (m) {
        var li = el("li");
        li.appendChild(el("span", "acc-bar-label", H.monthName(m.month)));
        var b = el("span", "acc-bar-pair");
        [["income", "is-in"], ["expense", "is-out"]].forEach(function (x) {
          var bar = el("span", "dash-bar"); var f = el("span", "dash-bar-fill acc-" + x[1]); f.style.width = (m[x[0]] / max * 100) + "%"; bar.appendChild(f); b.appendChild(bar);
        });
        li.appendChild(b);
        li.appendChild(el("span", "acc-bar-n" + (m.net < 0 ? " is-neg" : ""), signed(m.net)));
        bars.appendChild(li);
      });
      mc.appendChild(bars);
      var legend = el("p", "hint acc-legend");
      legend.appendChild(el("span", "acc-dot is-in")); legend.appendChild(document.createTextNode(" " + t("acc.income") + "  "));
      legend.appendChild(el("span", "acc-dot is-out")); legend.appendChild(document.createTextNode(" " + t("acc.expense") + " · " + t("acc.netRight")));
      mc.appendChild(legend);
      mc.appendChild(table([t("acc.month")].concat(cols.map(function (k) { return t("acc.col." + k); })),
        res.months.map(function (m) { return [H.monthName(m.month)].concat(cols.map(function (k) { return k === "net" ? signed(m[k]) : money(m[k]); })); }),
        [t("acc.total")].concat(cols.map(function (k) { return k === "net" ? signed(res.totals[k]) : money(res.totals[k]); }))));
      mc.appendChild(actions(csvButton(function () {
        csv("report-" + res.year + ".csv", [t("acc.month")].concat(cols.map(function (k) { return t("acc.col." + k); })),
          res.months.map(function (m) { return [m.month].concat(cols.map(function (k) { return m[k]; })); }).concat([[t("acc.total")].concat(cols.map(function (k) { return res.totals[k]; }))]));
      })));
      var cc = card(box, "acc.byCategory");
      ["income", "expense"].forEach(function (k) {
        var list = res.byCategory.filter(function (c) { return c.kind === k; });
        if (!list.length) return;
        cc.appendChild(el("h4", "dash-sub", t("acc." + k)));
        var ul = el("ul", "pay-lines");
        list.forEach(function (c) { var li = el("li"); li.appendChild(el("span", null, (lang() === "en" ? c.nameEn : c.nameTh) + " (" + c.count + ")")); li.appendChild(el("span", "num", signed(c.amount))); ul.appendChild(li); });
        cc.appendChild(ul);
      });
      cc.appendChild(actions(csvButton(function () {
        csv("categories-" + res.year + ".csv", [t("acc.kind"), t("acc.category"), t("acc.count"), t("acc.amount")],
          res.byCategory.map(function (c) { return [t("acc." + c.kind), lang() === "en" ? c.nameEn : c.nameTh, c.count, c.amount]; }));
      })));
    });
  };

  /* ---------- receipt register ---------- */
  V["acc-receipts"] = function (box, year) {
    heading(box, "acc.receipts");
    load(box, "accReceipts", year ? { year: year } : {}, function (res) {
      var top = card(box);
      top.appendChild(yearPicker(res.year, "acc-receipts"));
      top.appendChild(el("p", "note", t("acc.receiptsNote")));
      var g = el("div", "dash-stats");
      statBox(g, App.formatNumber(res.receipts.length), "acc.receiptCount");
      statBox(g, baht(res.total), "acc.receiptTotal");
      statBox(g, baht(res.refunded), "acc.refunded", res.refunded ? "warn" : "");
      top.appendChild(g);
      res.series.forEach(function (s) {
        var p = el("p", "notice" + (s.gaps.length ? " notice-warn" : ""));
        p.textContent = t("acc.series", { first: s.first, last: s.last, n: s.count }) + " · " + (s.gaps.length ? t("acc.gaps", { list: s.gaps.join(", ") }) : t("acc.noGaps"));
        top.appendChild(p);
      });
      var lc = card(box, "acc.receiptList");
      if (!res.receipts.length) { H.empty(lc, "pay.emptyHistory"); return; }
      lc.appendChild(table([t("rc.no"), { text: t("acc.date"), num: false }, { text: t("track.jobNo"), num: false }, { text: t("acc.customer"), num: false }, t("acc.amount"), t("acc.refundCol"), { text: "", num: false }],
        res.receipts.map(function (r) {
          var b = button(t("acc.view"), "btn-link", function () { H.openReceipt({ receiptNo: r.no, receiptUrl: r.receiptUrl }); });
          return [r.no, H.day(r.date), r.jobNo, r.name + (r.taxId ? " (" + taxIdText(r.taxId) + ")" : ""), money(r.amount), r.refundAmount ? money(r.refundAmount) : "", b];
        }), null, "acc-receipt-table"));
      lc.appendChild(actions(csvButton(function () {
        csv("receipts-" + res.year + ".csv", [t("rc.no"), t("acc.date"), t("track.jobNo"), t("acc.customer"), t("acc.partyTaxId"), t("acc.method"), t("acc.amount"), t("acc.refundCol"), t("acc.refundDate")],
          res.receipts.map(function (r) { return [r.no, r.date, r.jobNo, r.name, r.taxId || "", H.payMethod(r.method), r.amount, r.refundAmount || 0, r.refundDay || ""]; }));
      })));
    });
  };

  /* ---------- withholding tax (ภ.ง.ด.3 list + 50 ทวิ) ---------- */
  V["acc-wht"] = function (box, month) {
    heading(box, "acc.wht");
    load(box, "accWht", month ? { month: month } : {}, function (res) {
      var top = card(box);
      var s = select(res.months.map(function (m) { return [m, H.monthName(m)]; }), res.month, t("acc.month"));
      s.addEventListener("change", function () { show("acc-wht", s.value); });
      top.appendChild(H.fieldBox("acc.payMonth", s));
      top.appendChild(el("p", "notice", t("acc.whtDue", { month: H.monthName(res.month), due: longDate(res.due), online: longDate(res.dueOnline) })));
      if (!res.payerIsCompany) top.appendChild(el("p", "notice notice-warn", t("acc.soleTrader")));
      if (!res.payer.taxId) top.appendChild(el("p", "notice notice-warn", t("acc.noPayerTaxId")));
      var g = el("div", "dash-stats");
      statBox(g, App.formatNumber(res.totals.count), "acc.whtCount");
      statBox(g, baht(res.totals.amount), "acc.whtPaid");
      statBox(g, baht(res.totals.wht), "acc.whtTax", "warn");
      top.appendChild(g);
      var lc = card(box, "acc.whtList");
      if (!res.rows.length) { H.empty(lc, "acc.whtNone"); return; }
      lc.appendChild(table([{ text: "50 ทวิ", num: false }, { text: t("acc.date"), num: false }, { text: t("acc.payee"), num: false }, { text: t("acc.partyTaxId"), num: false }, t("acc.amount"), t("acc.whtTax"), { text: "", num: false }],
        res.rows.map(function (r) {
          var b = button(t("acc.whtCertShort"), "btn-link", function () { H.busy(b, true); whtDoc({ source: r.source, key: r.key }).catch(function (err) { H.alertBox(b, H.errText(err)); }).then(function () { H.busy(b, false); }); });
          return [r.certNo || "-", H.day(r.payDate), r.name, taxIdText(r.taxId), money(r.amount), money(r.wht), b];
        }), [t("acc.total"), "", "", "", money(res.totals.amount), money(res.totals.wht), ""]));
      lc.appendChild(el("p", "note", t("acc.whtCsvNote")));
      lc.appendChild(actions(csvButton(function () {
        // the columns of ใบแนบ ภ.ง.ด.3 (Revenue Department form, Mar 2017 print): one line per payee
        csv("pnd3-" + res.month + ".csv", ["ลำดับที่", "เลขประจำตัวผู้เสียภาษีอากร (ของผู้มีเงินได้)", "สาขาที่", "ชื่อ", "ชื่อสกุล", "ที่อยู่ของผู้มีเงินได้",
          "วัน เดือน ปี ที่จ่าย", "ประเภทเงินได้", "อัตราภาษีร้อยละ", "จำนวนเงินที่จ่าย", "จำนวนเงินภาษีที่หักและนำส่ง", "เงื่อนไข", "เลขที่ 50 ทวิ"],
          res.rows.map(function (r, i) {
            var n = String(r.name || "").trim().split(/\s+/), last = n.length > 1 ? n.pop() : "";
            var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(r.payDate);
            return [i + 1, r.taxId, "", n.join(" "), last, r.address, d ? d[3] + "/" + d[2] + "/" + (Number(d[1]) + 543) : r.payDate, r.text,
                    Math.round(r.wht / r.amount * 10000) / 100, r.amount, r.wht, 1, r.certNo];
          }));
      })));
    });
  };

  // The certificate itself — Thai legal form wording, printable on A4
  function whtDoc(q) {
    return Promise.all([api("whtCert", q), H.payJs()]).then(function (r) { drawWht(r[0].cert); });
  }
  // The official layout of the certificate (หนังสือรับรองการหักภาษี ณ ที่จ่าย ตามมาตรา 50 ทวิ): every box and income line of
  // the Revenue Department form, ours ticked and filled. Two copies with the same text (ฉบับที่ 1 / ฉบับที่ 2), one per A4 page.
  // The wording is the form's own (Thai), whatever the page language.
  function drawWht(c) {
    var old = document.querySelector(".print-sheet");
    if (old) old.remove();
    var sheet = el("div", "print-sheet");
    sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true"); sheet.setAttribute("aria-label", t("wht.title"));
    var prev = document.activeElement;
    function close() {
      sheet.remove(); document.body.classList.remove("print-sheet-open");
      document.removeEventListener("keydown", onKey);
      if (prev && prev.focus) prev.focus();
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    var bar = el("div", "actions receipt-actions no-print");
    var back = button("← " + t("dash.back"), "btn btn-outline", close);
    bar.appendChild(back);
    bar.appendChild(button(t("rc.print"), "btn btn-primary", function () { window.print(); }));
    bar.appendChild(el("p", "note", t("wht.printHint")));
    sheet.appendChild(bar);
    if (!c.payer.taxId) sheet.appendChild(el("p", "notice notice-warn no-print", t("acc.noPayerTaxId")));
    [1, 2].forEach(function (copy) { sheet.appendChild(whtCopy(c, copy)); });
    document.body.appendChild(sheet);
    document.body.classList.add("print-sheet-open");
    document.addEventListener("keydown", onKey);
    back.focus();
  }
  function wbox(on) { return el("span", "wht-box" + (on ? " is-on" : ""), on ? "✓" : ""); }
  function tick(on, text) { var s = el("span", "wht-tick"); s.appendChild(wbox(on)); s.appendChild(document.createTextNode(" " + text)); return s; }
  function whtCopy(c, copy) {
    var doc = el("article", "receipt wht-doc");
    var top = el("div", "wht-copy");
    top.appendChild(el("span", null, copy === 1 ? "ฉบับที่ 1 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)" : "ฉบับที่ 2 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)"));
    doc.appendChild(top);
    var head = el("header", "wht-head");
    var ttl = el("div");
    ttl.appendChild(el("h2", null, "หนังสือรับรองการหักภาษี ณ ที่จ่าย"));
    ttl.appendChild(el("p", "receipt-sub", "ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร"));
    head.appendChild(ttl);
    var no = el("dl", "receipt-meta");
    [["เล่มที่", c.book], ["เลขที่", c.no]].forEach(function (x) { var d = el("div"); d.appendChild(el("dt", null, x[0])); d.appendChild(el("dd", null, x[1])); no.appendChild(d); });
    head.appendChild(no);
    doc.appendChild(head);
    function party(title, p, kind) {
      var s = el("section", "wht-party");
      s.appendChild(el("h3", null, title + " : -"));
      var g = el("dl", "wht-dl");
      [["เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)*", taxIdText(p.taxId) || "-"], ["ชื่อ", p.name + " (" + kind + ")"], ["ที่อยู่", p.address || "-"]].forEach(function (x) {
        var d = el("div"); d.appendChild(el("dt", null, x[0])); d.appendChild(el("dd", null, x[1])); g.appendChild(d);
      });
      s.appendChild(g);
      return s;
    }
    // the form asks to state whether the name is a person, a juristic person, a company, an association or a group
    doc.appendChild(party("ผู้มีหน้าที่หักภาษี ณ ที่จ่าย", { name: c.payer.name + (c.payer.shop ? " — " + c.payer.shop : ""), taxId: c.payer.taxId, address: c.payer.address }, c.payerKind || "บุคคล"));
    var payee = party("ผู้ถูกหักภาษี ณ ที่จ่าย", c.payee, c.payee.kind || "บุคคล");
    var forms = el("div", "wht-forms");
    var seq = el("p", "wht-seq");
    seq.appendChild(document.createTextNode("ลำดับที่ "));
    seq.appendChild(el("b", null, String(c.seq || "")));
    seq.appendChild(document.createTextNode(" ในแบบ"));
    forms.appendChild(seq);
    forms.appendChild(el("p", "wht-small", "(ให้สามารถอ้างอิงหรือสอบยันกันได้ระหว่างลำดับที่ตามหนังสือรับรองฯ กับแบบยื่นรายการภาษีหักที่จ่าย)"));
    var boxes = el("div", "wht-ticks");
    [["pnd1a", "(1) ภ.ง.ด.1ก"], ["pnd1as", "(2) ภ.ง.ด.1ก พิเศษ"], ["pnd2", "(3) ภ.ง.ด.2"], ["pnd3", "(4) ภ.ง.ด.3"],
     ["pnd2a", "(5) ภ.ง.ด.2ก"], ["pnd3a", "(6) ภ.ง.ด.3ก"], ["pnd53", "(7) ภ.ง.ด.53"]].forEach(function (f) { boxes.appendChild(tick(c.form === f[0], f[1])); });
    forms.appendChild(boxes);
    payee.appendChild(forms);
    doc.appendChild(payee);

    // income lines of the form; only ours carries figures
    var lines = [
      ["1", "เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)"],
      ["2", "ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40 (2)"],
      ["3", "ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40 (3)"],
      ["4", "(ก) ดอกเบี้ย ฯลฯ ตามมาตรา 40 (4) (ก)"],
      ["", "(ข) เงินปันผล เงินส่วนแบ่งกำไร ฯลฯ ตามมาตรา 40 (4) (ข)"],
      ["", "(1) กรณีผู้ได้รับเงินปันผลได้รับเครดิตภาษี โดยจ่ายจากกำไรสุทธิของกิจการที่ต้องเสียภาษีเงินได้นิติบุคคลในอัตราดังนี้", 1],
      ["", "(1.1) อัตราร้อยละ 30 ของกำไรสุทธิ", 2], ["", "(1.2) อัตราร้อยละ 25 ของกำไรสุทธิ", 2], ["", "(1.3) อัตราร้อยละ 20 ของกำไรสุทธิ", 2],
      ["", "(1.4) อัตราอื่น ๆ (ระบุ) ........ ของกำไรสุทธิ", 2],
      ["", "(2) กรณีผู้ได้รับเงินปันผลไม่ได้รับเครดิตภาษี เนื่องจากจ่ายจาก", 1],
      ["", "(2.1) กำไรสุทธิของกิจการที่ได้รับยกเว้นภาษีเงินได้นิติบุคคล", 2],
      ["", "(2.2) เงินปันผลหรือเงินส่วนแบ่งของกำไรที่ได้รับยกเว้นไม่ต้องนำมารวมคำนวณเป็นรายได้เพื่อเสียภาษีเงินได้นิติบุคคล", 2],
      ["", "(2.3) กำไรสุทธิส่วนที่ได้หักผลขาดทุนสุทธิยกมาไม่เกิน 5 ปี ก่อนรอบระยะเวลาบัญชีปีปัจจุบัน", 2],
      ["", "(2.4) กำไรที่รับรู้ทางบัญชีโดยวิธีส่วนได้เสีย (equity method)", 2],
      ["", "(2.5) อื่น ๆ (ระบุ)", 2],
      ["5", "การจ่ายเงินได้ที่ต้องหักภาษี ณ ที่จ่าย ตามคำสั่งกรมสรรพากรที่ออกตามมาตรา 3 เตรส เช่น รางวัล ส่วนลดหรือประโยชน์ใด ๆ เนื่องจากการส่งเสริมการขาย รางวัลในการประกวด การแข่งขัน การชิงโชค ค่าแสดงของนักแสดงสาธารณะ ค่าจ้างทำของ ค่าโฆษณา ค่าเช่า ค่าขนส่ง ค่าบริการ ค่าเบี้ยประกันวินาศภัย ฯลฯ"],
      ["6", "อื่น ๆ (ระบุ)"]
    ];
    var tb = el("table", "wht-table");
    var th = el("thead"), hr = el("tr");
    ["ประเภทเงินได้พึงประเมินที่จ่าย", "วัน เดือน หรือปีภาษี ที่จ่าย", "จำนวนเงินที่จ่าย", "ภาษีที่หักและนำส่งไว้"].forEach(function (h, i) { hr.appendChild(el("th", i > 1 ? "num" : null, h)); });
    th.appendChild(hr); tb.appendChild(th);
    var body = el("tbody");
    lines.forEach(function (l) {
      var ours = l[0] === String(c.row), tr = el("tr", ours ? "is-ours" : null);
      var td = el("td", l[2] ? "wht-sub wht-sub-" + l[2] : null, (l[0] ? l[0] + ". " : "") + l[1]);
      if (ours && c.text) { td.appendChild(el("br")); td.appendChild(el("b", null, "— " + c.text)); }
      tr.appendChild(td);
      tr.appendChild(el("td", null, ours ? longThai(c.payDate) : ""));
      tr.appendChild(el("td", "num", ours ? money(c.amount) : ""));
      tr.appendChild(el("td", "num", ours ? money(c.wht) : ""));
      body.appendChild(tr);
    });
    tb.appendChild(body);
    var tf = el("tfoot"), fr = el("tr");
    var lab = el("td", null, "รวมเงินที่จ่ายและภาษีที่หักนำส่ง"); lab.colSpan = 2; fr.appendChild(lab);
    fr.appendChild(el("td", "num", money(c.amount))); fr.appendChild(el("td", "num", money(c.wht)));
    tf.appendChild(fr); tb.appendChild(tf);
    var wrap = el("div", "wht-table-wrap"); wrap.appendChild(tb); doc.appendChild(wrap);
    var words = el("p", "wht-words");
    words.appendChild(document.createTextNode("รวมเงินภาษีที่หักนำส่ง (ตัวอักษร) "));
    words.appendChild(el("b", null, window.Pay && window.Pay.bahtText ? window.Pay.bahtText(c.wht) : money(c.wht) + " บาท"));
    doc.appendChild(words);
    doc.appendChild(el("p", "wht-funds", "เงินที่จ่ายเข้า กบข./กสจ./กองทุนสงเคราะห์ครูโรงเรียนเอกชน ......-...... บาท   กองทุนประกันสังคม ......-...... บาท   กองทุนสำรองเลี้ยงชีพ ......-...... บาท"));
    var payer = el("div", "wht-ticks wht-payer");
    payer.appendChild(el("span", "wht-label", "ผู้จ่ายเงิน"));
    [["(1) หัก ณ ที่จ่าย", true], ["(2) ออกให้ตลอดไป", false], ["(3) ออกให้ครั้งเดียว", false], ["(4) อื่น ๆ (ระบุ)", false]].forEach(function (x) { payer.appendChild(tick(x[1], x[0])); });
    doc.appendChild(payer);
    var foot = el("div", "wht-foot");
    var warn = el("p", "wht-warn", "คำเตือน ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร ต้องรับโทษทางอาญาตามมาตรา 35 แห่งประมวลรัษฎากร");
    foot.appendChild(warn);
    var sign = el("div", "wht-sign");
    sign.appendChild(el("p", null, "ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ"));
    sign.appendChild(el("p", "wht-sign-line", "ลงชื่อ ................................................ ผู้จ่ายเงิน"));
    sign.appendChild(el("p", null, "( " + c.payer.name + " )"));
    sign.appendChild(el("p", null, longThai(c.payDate)));
    sign.appendChild(el("p", "wht-small", "(วัน เดือน ปี ที่ออกหนังสือรับรองฯ)"));
    sign.appendChild(el("span", "wht-stamp", "ประทับตรา นิติบุคคล (ถ้ามี)"));
    foot.appendChild(sign);
    doc.appendChild(foot);
    doc.appendChild(el("p", "wht-note", "หมายเหตุ เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)* หมายถึง 1. กรณีบุคคลธรรมดาไทย ให้ใช้เลขประจำตัวประชาชนของกรมการปกครอง " +
      "2. กรณีนิติบุคคล ให้ใช้เลขทะเบียนนิติบุคคลของกรมพัฒนาธุรกิจการค้า 3. กรณีอื่น ๆ นอกเหนือจาก 1. และ 2. ให้ใช้เลขประจำตัวผู้เสียภาษีอากร (13 หลัก) ของกรมสรรพากร"));
    return doc;
  }
  function longThai(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
    if (!m) return "";
    try { return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" }); } catch (e) { return iso; }
  }

  /* ---------- yearly tax summary ---------- */
  V["acc-tax"] = function (box, year) {
    heading(box, "acc.tax");
    load(box, "accTaxYear", year ? { year: year } : {}, function (res) {
      var top = card(box);
      top.appendChild(yearPicker(res.year, "acc-tax"));
      top.appendChild(el("p", "notice notice-warn", t("acc.taxNote")));
      [["half", "acc.taxHalf"], ["full", "acc.taxFull"]].forEach(function (x) {
        var s = res[x[0]], c = card(box);
        c.appendChild(el("h3", "h4 dash-card-title", t(x[1], { year: yearLabel(res.year) })));
        c.appendChild(H.details([["acc.taxIncome", baht(s.income)], ["acc.taxActual", baht(s.expense)], ["acc.taxFlat", res.flatPercent ? baht(s.flat) + " (" + res.flatPercent + "%)" : ""],
                                 ["acc.whtCredit", baht(s.whtCredit)], ["acc.net", baht(s.net)]]));
      });
      var cc = card(box, "acc.taxExpenses");
      if (!res.byCategory.length) H.empty(cc, "acc.noRows");
      else {
        var ul = el("ul", "pay-lines");
        res.byCategory.forEach(function (c) { var li = el("li"); li.appendChild(el("span", null, lang() === "en" ? c.nameEn : c.nameTh)); li.appendChild(el("span", "num", money(c.amount))); ul.appendChild(li); });
        cc.appendChild(ul);
      }
      cc.appendChild(actions(csvButton(function () {
        csv("tax-" + res.year + ".csv", [t("acc.item"), t("acc.taxHalf", { year: res.year }), t("acc.taxFull", { year: res.year })],
          [["acc.taxIncome", "income"], ["acc.taxActual", "expense"]].concat(res.flatPercent ? [["acc.taxFlat", "flat"]] : []).concat([["acc.whtCredit", "whtCredit"], ["acc.net", "net"]]).map(function (r) { return [t(r[0]), res.half[r[1]], res.full[r[1]]]; })
            .concat(res.byCategory.map(function (c) { return [(lang() === "en" ? c.nameEn : c.nameTh), "", c.amount]; })));
      })));
    });
  };

  /* ---------- categories ---------- */
  V["acc-cats"] = function (box) {
    heading(box, "acc.cats");
    load(box, "accCategories", {}, function (res) {
      readOnlyNote(box, res.caps);
      ["income", "expense"].forEach(function (k) {
        var c = card(box, "acc.catsOf." + k);
        var ul = el("ul", "dash-users");
        res.cats.filter(function (x) { return x.kind === k; }).forEach(function (x) {
          var li = el("li", "dash-user");
          if (!res.caps.canEdit) {
            li.appendChild(el("span", "dash-user-name", x.nameTh + " · " + x.nameEn + (x.active ? "" : " (" + t("acc.off") + ")")));
          } else {
            var th = H.input("text", x.nameTh, { maxlength: "80", "aria-label": t("acc.nameTh") });
            var en = H.input("text", x.nameEn, { maxlength: "80", "aria-label": t("acc.nameEn") });
            var on = H.checkbox("acc.on", x.active);
            var st = el("span", "dash-saved");
            var sv = button(t("acct.save"), "btn btn-outline btn-sm", function () {
              H.busy(sv, true);
              api("accSaveCategory", { cat: { code: x.code, nameTh: th.value.trim(), nameEn: en.value.trim(), active: on.input.checked } })
                .then(function () { st.textContent = t("acct.saved"); }, function (err) { H.alertBox(sv, H.errText(err)); }).then(function () { H.busy(sv, false); });
            });
            var w = el("div", "grid-2"); w.appendChild(th); w.appendChild(en); li.appendChild(w);
            var ctl = el("div", "dash-user-ctl"); ctl.appendChild(on); ctl.appendChild(sv); ctl.appendChild(st); li.appendChild(ctl);
          }
          ul.appendChild(li);
        });
        c.appendChild(ul);
      });
      var ac = card(box, "acc.autoCats");
      ac.appendChild(el("p", "note", t("acc.autoNote")));
      var al = el("ul", "pay-lines");
      res.auto.forEach(function (x) { var li = el("li"); li.appendChild(el("span", null, (lang() === "en" ? x.nameEn : x.nameTh))); li.appendChild(el("span", "flag", t("acc." + x.kind))); al.appendChild(li); });
      ac.appendChild(al);
      if (!res.caps.canEdit) return;
      var nc = card(box, "acc.newCat");
      var kind = select([["expense", t("acc.expense")], ["income", t("acc.income")]], "expense");
      var th = H.input("text", "", { maxlength: "80" }), en = H.input("text", "", { maxlength: "80" });
      var g = el("div", "grid-2");
      g.appendChild(H.fieldBox("acc.kind", kind)); g.appendChild(el("div"));
      g.appendChild(H.fieldBox("acc.nameTh", th)); g.appendChild(H.fieldBox("acc.nameEn", en));
      nc.appendChild(g);
      var st = el("div", "form-status"); st.hidden = true;
      var add = button(t("acc.addCat"), "btn btn-primary", function () {
        H.busy(add, true);
        api("accSaveCategory", { cat: { kind: kind.value, nameTh: th.value.trim(), nameEn: en.value.trim() } }).then(function () { show("acc-cats"); }, function (err) { H.status(st, "error", H.errText(err)); H.busy(add, false); });
      });
      nc.appendChild(actions(add)); nc.appendChild(st);
    });
  };

  /* ---------- change log ---------- */
  V["acc-log"] = function (box) {
    heading(box, "acc.log", button(t("acct.refresh"), "btn-link", function () { H.draw(); }));
    load(box, "accLog", {}, function (res) {
      var c = card(box);
      c.appendChild(el("p", "note", t("acc.logNote")));
      if (!res.log.length) { H.empty(c, "acc.noRows"); return; }
      var ul = el("ul", "pay-list");
      res.log.forEach(function (l) {
        var li = el("li", "pay-item");
        var top = el("div", "pay-item-top");
        top.appendChild(el("span", "job-no", t("acc.act." + l.action) + (l.ref ? " · " + l.ref : "")));
        top.appendChild(el("span", "muted", H.day(l.day) + " " + (l.at.slice(11, 16) ? new Date(l.at).toLocaleTimeString(lang() === "en" ? "en-GB" : "th-TH", { hour: "2-digit", minute: "2-digit" }) : "")));
        li.appendChild(top);
        li.appendChild(el("p", "job-meta", l.by));
        if (l.detail) li.appendChild(el("p", "acc-desc", l.detail));
        ul.appendChild(li);
      });
      c.appendChild(ul);
      c.appendChild(actions(csvButton(function () {
        csv("account-log.csv", [t("acc.when"), t("acc.who"), t("acc.action"), t("acc.ref"), t("acc.detail")], res.log.map(function (l) { return [l.at, l.by, t("acc.act." + l.action), l.ref, l.detail]; }));
      })));
    });
  };

  App.accounting = { whtDoc: whtDoc };
})();

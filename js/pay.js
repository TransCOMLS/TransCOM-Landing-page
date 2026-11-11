/*
 * pay.js — Phase 6: the quote & payment page and the electronic receipt (panel #pay).
 *   /?pay=TR-2569-K7F3QD&t=<token>            quote → "Pay" → Beam's hosted checkout (Payment Link)
 *   …&back=1 / &cancelled=1                   the customer is back from Beam: check the payment
 *   /?receipt=RC-6926-00001&t=<token>         printable receipt (Print / Save as PDF)
 * The token comes from the quote email or the signed-in account page, so guests can pay too.
 * The Beam API key never reaches the browser: Apps Script creates the link (payStart) and checks it.
 *   …&doc=quote                               printable quotation (companies need a document; owner 2026-11-10)
 * Exposes window.Pay = { open(jobNo, t, note), receipt(no, t) } — note "doc" opens the quotation document.
 */
(function () {
  "use strict";

  var App = window.App, t = App.t, CFG = App.config;
  var state = { kind: "", jobNo: "", t: "", no: "", data: null, price: null, coupon: "", note: "" };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function baht(n) {
    var s = Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return App.getLang() === "th" ? s + " บาท" : "THB " + s;
  }
  function longDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
    if (!m) return "";
    try { return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(App.getLang() === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "long", year: "numeric" }); }
    catch (e) { return iso; }
  }
  function catName(c) { var k = "cat." + c, v = t(k); return v === k ? (c || "") : v; }
  function pairName(id) {
    var p = (CFG.languagePairs || []).filter(function (x) { return x.id === id; })[0];
    return p ? (p[App.getLang()] || p.th) : id;
  }
  function method(code) { var k = "pay.m." + code, v = t(k); return v === k ? (code || "") : v; }
  function errText(err) {
    var code = err && err.code || "server";
    var k = "pay.err." + code, v = t(k);
    if (v !== k) return v;
    k = "dash.err." + code; v = t(k);
    if (v !== k) return v;
    return t(code === "network" ? "acct.err.network" : "acct.err.server");
  }
  function api(action, payload) {
    if (!CFG.appsScriptUrl || !App.api) return Promise.reject({ code: "not_ready" });
    return App.api(action, payload);
  }

  // Thai baht in words for the receipt ("หนึ่งพันห้าร้อยบาทถ้วน")
  function bahtText(n) {
    var D = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"], P = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];
    function part(s) {
      var out = "", len = s.length;
      for (var i = 0; i < len; i++) {
        var d = +s[i], pos = len - i - 1;
        if (!d) continue;
        if (pos === 0 && d === 1 && len > 1) out += "เอ็ด";
        else if (pos === 1 && d === 2) out += "ยี่สิบ";
        else if (pos === 1 && d === 1) out += "สิบ";
        else out += D[d] + P[pos];
      }
      return out;
    }
    function num(s) {
      s = s.replace(/^0+/, "");
      if (!s) return "";
      if (s.length > 6) return num(s.slice(0, -6)) + "ล้าน" + part(s.slice(-6));
      return part(s);
    }
    var v = Math.round(Number(n || 0) * 100), b = Math.floor(v / 100), st = v % 100;
    var words = (b ? num(String(b)) + "บาท" : (st ? "" : "ศูนย์บาท"));
    return words + (st ? num(String(st)) + "สตางค์" : "ถ้วน");
  }

  /* ---------- URL ---------- */
  function setQuery(q) {
    try { history.replaceState(null, "", location.pathname + (q ? "?" + q : "") + "#pay"); } catch (e) { /* sandboxed */ }
  }
  function clearQuery() {
    if (!/[?&](pay|receipt)=/.test(location.search)) return;
    try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) { /* sandboxed */ }
  }

  /* ---------- quote & payment ---------- */
  function open(jobNo, token, note) {
    state.kind = "pay"; state.jobNo = String(jobNo || "").toUpperCase(); state.t = String(token || "");
    state.data = null; state.price = null; state.coupon = ""; state.wantDoc = note === "doc"; state.doc = false;
    state.note = note === "doc" ? "" : (note || "");
    document.body.classList.remove("receipt-open");
    if (App.showTab) App.showTab("pay");
    setQuery("pay=" + encodeURIComponent(state.jobNo) + "&t=" + encodeURIComponent(state.t));
    load(note === "back" ? "payCheck" : "payInfo", note === "back" ? 0 : -1);
  }

  // Short reason for a failed payment attempt (Beam failureCode)
  function failText(code) {
    var k = "pay.fail." + code, v = t(k);
    return v === k ? t("pay.fail.CH_PROCESSING_FAILED") : v;
  }

  // round -1 = just open the page; 0…4 = back from Beam, confirming (pop-up stays until it is settled)
  var CHECKS = 5;
  function load(action, round) {
    var box = $("#pay-view"), st = $("#pay-status");
    $("#receipt-view").hidden = true;
    box.hidden = false;
    $("#pay-title").textContent = t("pay.title");
    if (!state.data) box.textContent = "";
    var confirming = round >= 0;
    var slow = null;
    if (confirming) {
      if (round === 0) App.busy.open({ title: t("pay.busy.confirmTitle"), text: t("pay.busy.confirmText") });
      App.busy.step(t("pay.busy.checkN", { n: round + 1, max: CHECKS }), round, CHECKS);
    } else {
      App.showStatus(st, "", t("acct.loading"));
      slow = setTimeout(function () { slow = "open"; App.busy.open({ title: t("busy.loadingTitle"), text: t("busy.loadingText"), guard: false }); }, 700);
    }
    api(action, { jobNo: state.jobNo, t: state.t }).then(function (res) {
      if (slow === "open") App.busy.close(); else clearTimeout(slow);
      state.data = res.pay;
      App.showStatus(st, "", "");
      var d = res.pay;
      if (confirming && d.payments.length) {
        state.note = "paid";
        draw();
        App.busy.done({ title: t("pay.thanks"), text: t("pay.busy.receipt", { no: d.payments[0].receiptNo }) });
        return;
      }
      if (confirming && d.failure) {
        state.note = "";
        draw();
        App.busy.fail({ title: t("pay.busy.failTitle"), text: failText(d.failure) });
        return;
      }
      // back from Beam but not confirmed yet: ask again a few times (2, 4, 8, 16 s)
      if (confirming && d.canPay && round < CHECKS - 1) {
        if (round === 0) draw();
        setTimeout(function () { if (state.kind === "pay") load("payCheck", round + 1); }, 2000 * Math.pow(2, round));
        return;
      }
      if (confirming) {
        state.note = "pending";
        draw();
        App.busy.fail({ title: t("pay.busy.pendingTitle"), text: t("pay.pendingNote") });
        return;
      }
      draw();
      if (state.wantDoc) { state.wantDoc = false; showQuoteDoc(); return; }
      if (state.note === "cancelled" && d.canPay) App.busy.fail({ title: t("pay.busy.cancelTitle"), text: t("pay.cancelledNote") });
    }, function (err) {
      if (slow === "open" || confirming) App.busy.fail({ title: t("pay.busy.errorTitle"), text: err.code === "not_found" ? t("pay.err.link") : errText(err) });
      else clearTimeout(slow);
      App.showStatus(st, "error", err.code === "not_found" ? t("pay.err.link") : errText(err));
    });
  }

  function row(dl, label, value, cls) {
    if (value === "" || value == null) return;
    var d = el("div", cls);
    d.appendChild(el("dt", null, label));
    var dd = el("dd");
    if (typeof value === "string") dd.textContent = value; else dd.appendChild(value);
    d.appendChild(dd);
    dl.appendChild(d);
  }

  function quoteTable(q, price) {
    var tb = el("table", "quote-table");
    var head = el("thead"), hr = el("tr");
    hr.appendChild(el("th", null, t("pay.item"))); hr.appendChild(el("th", "num", t("pay.amount")));
    head.appendChild(hr); tb.appendChild(head);
    var body = el("tbody");
    function line(a, b, cls) { var tr = el("tr", cls); tr.appendChild(el("td", null, a)); tr.appendChild(el("td", "num", b)); body.appendChild(tr); }
    q.items.forEach(function (it) { line(it.text, baht(it.amount)); });
    tb.appendChild(body);
    var foot = el("tfoot");
    body = foot;
    line(t("pay.subtotal"), baht(q.subtotal), "sub");
    var discount = price ? price.discount : q.discount;
    if (discount) line(t("pay.discount") + (q.discountName ? " — " + q.discountName + " " + q.discountPercent + "%" : ""), "−" + baht(discount), "disc");
    if (price && price.couponDiscount) line(t("pay.coupon") + " " + price.couponCode, "−" + baht(price.couponDiscount), "disc");
    line(t("pay.total"), baht(price ? price.amount : q.total), "total");
    tb.appendChild(foot);
    return tb;
  }

  function draw() {
    var box = $("#pay-view"), d = state.data;
    box.textContent = "";
    if (!d) return;
    if (d.mode === "test") box.appendChild(el("p", "notice notice-warn pay-test", t("pay.testMode")));
    var c = el("section", "dash-card pay-card");
    var top = el("div", "job-top");
    top.appendChild(el("span", "job-no", d.jobNo));
    var paid = d.payments.filter(function (p) { return p.status !== "refunded"; }).length > 0;
    var chip = el("span", "status-chip status-" + (paid ? "paid" : d.canPay ? "quoted" : d.status), t("status." + (paid ? "paid" : d.status)));
    top.appendChild(chip);
    c.appendChild(top);
    var dl = el("dl", "dash-dl");
    row(dl, t("form.category"), catName(d.category));
    row(dl, t("form.langPair"), pairName(d.langPair));
    row(dl, t("form.pages"), d.pages ? String(d.pages) : "");
    c.appendChild(dl);
    box.appendChild(c);

    if (state.note === "cancelled" && d.canPay) box.appendChild(el("p", "notice", t("pay.cancelledNote")));
    if (state.note === "pending") {
      var pn = el("div", "notice notice-warn");
      pn.appendChild(el("p", null, t("pay.pendingNote")));
      var again = el("button", "btn btn-outline btn-sm", t("pay.checkAgain")); again.type = "button";
      again.addEventListener("click", function () { state.note = ""; load("payCheck", 4); });
      pn.appendChild(again);
      box.appendChild(pn);
    }

    // paid → receipts
    if (d.payments.length) {
      var pc = el("section", "dash-card pay-done");
      pc.appendChild(el("h2", "h4 dash-card-title", t(state.note === "paid" ? "pay.thanks" : "pay.paidTitle")));
      pc.appendChild(el("p", null, t("pay.paidText")));
      d.payments.forEach(function (p) {
        var r = el("div", "pay-receipt-row");
        r.appendChild(el("span", "pay-receipt-no", p.receiptNo));
        r.appendChild(el("span", null, longDate(p.paidDay) + " · " + baht(p.amount) + " · " + method(p.method)));
        if (p.status !== "paid") r.appendChild(el("span", "flag flag-warn", t("pay.st." + p.status)));
        var b = el("button", "btn btn-outline btn-sm", t("pay.viewReceipt")); b.type = "button";
        b.addEventListener("click", function () { receipt(p.receiptNo, (/[?&]t=([0-9a-f]+)/.exec(p.receiptUrl) || [])[1]); });
        r.appendChild(b);
        pc.appendChild(r);
      });
      box.appendChild(pc);
    }

    var q = d.quote;
    if (!q) {
      if (!d.payments.length) box.appendChild(el("p", "notice", t("pay.noQuote")));
      return;
    }
    var qc = el("section", "dash-card");
    qc.appendChild(el("h2", "h4 dash-card-title", t("pay.quoteTitle", { n: q.version })));
    qc.appendChild(quoteTable(q, d.canPay ? state.price : null));
    var meta = el("p", "note");
    meta.textContent = t("pay.validUntil", { date: longDate(q.validUntil) });
    qc.appendChild(meta);
    if (q.note) qc.appendChild(el("p", "pay-note", q.note));
    var dl0 = el("div", "acct-links");
    dl0.hidden = !d.seller;
    var docBtn = el("button", "btn btn-outline btn-sm", t("qd.open")); docBtn.type = "button";
    docBtn.addEventListener("click", showQuoteDoc);
    dl0.appendChild(docBtn);
    qc.appendChild(dl0);
    box.appendChild(qc);

    if (d.payments.length) return;
    if (!d.canPay) {
      box.appendChild(el("p", "notice notice-warn", t(d.expired ? "pay.expired" : "pay.closed")));
      return;
    }
    if (!d.ready) { box.appendChild(el("p", "notice", t("pay.notReady"))); return; }

    // discount code + pay
    var pay = el("section", "dash-card pay-box");
    var f = el("div", "field coupon-field");
    var lab = el("label", null, t("pay.couponLabel")); lab.htmlFor = "pay-coupon";
    var wrap = el("div", "coupon-row");
    var inp = el("input"); inp.id = "pay-coupon"; inp.type = "text"; inp.maxLength = 30; inp.autocomplete = "off";
    inp.setAttribute("autocapitalize", "characters"); inp.spellcheck = false; inp.value = state.coupon;
    inp.setAttribute("aria-describedby", "pay-coupon-err");
    var apply = el("button", "btn btn-outline", t(state.price && state.price.couponCode ? "pay.couponRemove" : "pay.couponApply")); apply.type = "button";
    wrap.appendChild(inp); wrap.appendChild(apply);
    var ferr = el("p", "field-error"); ferr.id = "pay-coupon-err"; ferr.hidden = true;
    f.appendChild(lab); f.appendChild(wrap); f.appendChild(ferr);
    f.appendChild(el("p", "hint", t(d.member ? "pay.couponHint" : "pay.couponHintGuest")));
    pay.appendChild(f);
    apply.addEventListener("click", function () {
      if (state.price && state.price.couponCode) { state.price = null; state.coupon = ""; draw(); return; }
      var code = inp.value.trim().toUpperCase();
      if (!code) { inp.focus(); return; }
      apply.disabled = true;
      api("payPrice", { jobNo: state.jobNo, t: state.t, coupon: code }).then(function (res) {
        state.price = res.price; state.coupon = code; draw();
        var again = $("#pay-go"); if (again) again.focus();
      }, function (err) {
        apply.disabled = false;
        ferr.textContent = errText(err); ferr.hidden = false; inp.setAttribute("aria-invalid", "true");
      });
    });
    inp.addEventListener("input", function () { ferr.hidden = true; inp.removeAttribute("aria-invalid"); });
    var total = state.price ? state.price.amount : q.total;
    var go = el("button", "btn btn-primary btn-block btn-lg", t("pay.payBtn", { amount: baht(total) })); go.type = "button"; go.id = "pay-go";
    var st = el("div", "form-status"); st.hidden = true; st.setAttribute("role", "status");
    go.addEventListener("click", function () {
      go.disabled = true;
      App.showStatus(st, "", "");
      App.busy.open({ title: t("pay.busy.goTitle"), text: t("pay.busy.goText") });
      App.busy.step(t("pay.redirecting"));
      api("payStart", { jobNo: state.jobNo, t: state.t, coupon: state.price ? state.price.couponCode : "" }).then(function (res) {
        if (res.paid) { App.busy.close(); state.data = res.pay; draw(); return; }
        App.busy.release();   // keep the pop-up on screen while the browser opens Beam's page
        try { (window.top || window).location.href = res.url; } catch (e) { App.busy.close(); window.open(res.url, "_blank", "noopener"); }
      }, function (err) {
        go.disabled = false;
        App.busy.fail({ title: t("pay.busy.failTitle"), text: errText(err) });
        App.showStatus(st, "error", errText(err));
      });
    });
    var ac = el("div", "actions"); ac.appendChild(go);
    pay.appendChild(ac); pay.appendChild(st);
    pay.appendChild(el("p", "note pay-secure", t("pay.secure")));
    var terms = el("p", "note");
    terms.appendChild(document.createTextNode(t("pay.termsBefore") + " "));
    var tl = el("button", "btn-link inline", t("nav.terms")); tl.type = "button"; tl.setAttribute("data-modal", "terms");
    terms.appendChild(tl);
    pay.appendChild(terms);
    box.appendChild(pay);
  }

  /* ---------- receipt ---------- */
  function receipt(no, token) {
    state.kind = "receipt"; state.no = String(no || "").toUpperCase(); state.t = String(token || "");
    if (App.showTab) App.showTab("pay");
    setQuery("receipt=" + encodeURIComponent(state.no) + "&t=" + encodeURIComponent(state.t));
    var box = $("#receipt-view"), st = $("#pay-status");
    $("#pay-view").hidden = true;
    $("#pay-title").textContent = t("rc.title");
    box.hidden = false; box.textContent = "";
    App.showStatus(st, "", t("acct.loading"));
    api("receipt", { no: state.no, t: state.t }).then(function (res) {
      App.showStatus(st, "", "");
      state.data = res.receipt;
      drawReceipt();
    }, function (err) { App.showStatus(st, "error", err.code === "not_found" ? t("pay.err.link") : errText(err)); });
  }

  // Header of a printable document: shop details left, document name + numbers right
  function docHead(doc, sellerData, name, nameAlt, metaRows) {
    var head = el("header", "receipt-head");
    var seller = el("div", "receipt-seller");
    var logo = el("img"); logo.src = "img/logo.svg"; logo.alt = sellerData.name; logo.className = "receipt-logo";
    seller.appendChild(logo);
    seller.appendChild(el("p", "receipt-seller-name", sellerData.name));
    if (sellerData.owner) seller.appendChild(el("p", null, t("rc.by") + " " + sellerData.owner));
    var addr = App.getLang() === "en" && sellerData.addressEn ? sellerData.addressEn : sellerData.address;
    if (addr) seller.appendChild(el("p", null, addr));
    if (sellerData.taxId) seller.appendChild(el("p", null, t("rc.taxId") + " " + sellerData.taxId));
    seller.appendChild(el("p", null, t("rc.contact", { phone: sellerData.phone, email: sellerData.email, web: sellerData.web })));
    head.appendChild(seller);
    var title = el("div", "receipt-title");
    title.appendChild(el("h2", null, name));
    title.appendChild(el("p", "receipt-sub", nameAlt));
    var meta = el("dl", "receipt-meta");
    metaRows.forEach(function (r) { row(meta, r[0], r[1]); });
    title.appendChild(meta);
    head.appendChild(title);
    doc.appendChild(head);
  }
  function docBar(box, onBack) {
    var bar = el("div", "actions receipt-actions no-print");
    if (onBack) {
      var back = el("button", "btn btn-outline", "← " + t("qd.back")); back.type = "button";
      back.addEventListener("click", onBack);
      bar.appendChild(back);
    }
    var pr = el("button", "btn btn-primary", t("rc.print")); pr.type = "button";
    pr.addEventListener("click", function () { window.print(); });
    bar.appendChild(pr);
    bar.appendChild(el("p", "note", t("rc.printHint")));
    box.appendChild(bar);
  }
  // Buyer block: the company (name, tax ID, branch, address) + contact person, or just the person
  function buyerBlock(doc, heading, bill, name, email, extra) {
    var buyer = el("section", "receipt-buyer");
    buyer.appendChild(el("h3", null, heading));
    if (bill && bill.name) {
      buyer.appendChild(el("p", "receipt-buyer-name", bill.name));
      buyer.appendChild(el("p", null, t("rc.taxId") + " " + bill.taxId + " · " + (bill.branch || t("doc.headOffice"))));
      if (bill.address) buyer.appendChild(el("p", null, bill.address));
      if (name) buyer.appendChild(el("p", "muted", t("doc.contact") + " " + name + (email ? " · " + email : "")));
    } else {
      buyer.appendChild(el("p", "receipt-buyer-name", name || "-"));
      if (email) buyer.appendChild(el("p", "muted", email));
    }
    if (extra) buyer.appendChild(el("p", "muted", extra));
    doc.appendChild(buyer);
  }
  function quoteNo(d) { return "QT-" + d.jobNo.replace(/^[A-Z]+-/, "") + "-" + d.quote.version; }

  // ---------- quotation document (print / save as PDF) ----------
  function showQuoteDoc() {
    var d = state.data;
    if (!d || !d.quote || !d.seller) return;     // seller details come with the Phase 6.1 Code.gs
    state.doc = true;
    setQuery("pay=" + encodeURIComponent(state.jobNo) + "&t=" + encodeURIComponent(state.t) + "&doc=quote");
    $("#pay-view").hidden = true;
    $("#pay-title").textContent = t("qd.title");
    var box = $("#receipt-view");
    box.hidden = false;
    box.textContent = "";
    document.body.classList.add("receipt-open");
    docBar(box, function () {
      state.doc = false;
      document.body.classList.remove("receipt-open");
      box.hidden = true;
      setQuery("pay=" + encodeURIComponent(state.jobNo) + "&t=" + encodeURIComponent(state.t));
      $("#pay-title").textContent = t("pay.title");
      $("#pay-view").hidden = false;
      draw();
    });
    var q = d.quote;
    var doc = el("article", "receipt quotation");
    if (d.mode === "test") doc.appendChild(el("p", "receipt-test", t("qd.test")));
    docHead(doc, d.seller, t("qd.docName"), t("qd.docNameAlt"), [
      [t("rc.no"), quoteNo(d)], [t("rc.date"), longDate(q.createdAt)], [t("qd.validUntil"), longDate(q.validUntil)], [t("track.jobNo"), d.jobNo]
    ]);
    var job = [catName(d.category), pairName(d.langPair)];
    if (d.pages) job.push(t("acct.pagesN", { pages: d.pages }));
    buyerBlock(doc, t("qd.buyer"), d.bill, d.name, d.email, job.join(" · "));
    var tb = el("table", "quote-table receipt-table");
    var th = el("thead"), hr = el("tr");
    hr.appendChild(el("th", "num", "#")); hr.appendChild(el("th", null, t("pay.item"))); hr.appendChild(el("th", "num", t("pay.amount")));
    th.appendChild(hr); tb.appendChild(th);
    var body = el("tbody");
    q.items.forEach(function (it, i) {
      var tr = el("tr"); tr.appendChild(el("td", "num", String(i + 1))); tr.appendChild(el("td", null, it.text)); tr.appendChild(el("td", "num", baht(it.amount)));
      body.appendChild(tr);
    });
    tb.appendChild(body);
    var foot = el("tfoot");
    function line(a, b, cls) { var tr = el("tr", cls); var td = el("td", null, a); td.colSpan = 2; tr.appendChild(td); tr.appendChild(el("td", "num", b)); foot.appendChild(tr); }
    line(t("pay.subtotal"), baht(q.subtotal), "sub");
    if (q.discount) line(t("pay.discount") + (q.discountName ? " — " + q.discountName + " " + q.discountPercent + "%" : ""), "−" + baht(q.discount), "disc");
    line(t("qd.total"), baht(q.total), "total");
    tb.appendChild(foot);
    doc.appendChild(tb);
    if (App.getLang() === "th") doc.appendChild(el("p", "receipt-words", "(" + bahtText(q.total) + ")"));
    if (q.note) doc.appendChild(el("p", "pay-note", q.note));
    // how to pay: QR to the online payment page (or "paid")
    var paid = d.payments.filter(function (p) { return p.status !== "refunded"; })[0];
    var payBox = el("section", "qd-pay");
    if (paid) payBox.appendChild(el("p", "qd-paid", t("qd.paid", { no: paid.receiptNo, date: longDate(paid.paidDay) })));
    else if (d.canPay) {
      var qrBox = el("div", "qd-qr");
      qrBox.setAttribute("role", "img");
      qrBox.setAttribute("aria-label", t("qd.qrAlt"));
      payBox.appendChild(qrBox);
      var txt = el("div", "qd-pay-text");
      txt.appendChild(el("h3", null, t("qd.howTitle")));
      txt.appendChild(el("p", null, t("qd.how")));
      txt.appendChild(el("p", "qd-url", d.payUrl));
      payBox.appendChild(txt);
      App.loadScript("js/qr.js").then(function () { qrBox.appendChild(window.QR.toCanvas(d.payUrl, 4, 2)); }, function () { qrBox.remove(); });
    } else payBox.appendChild(el("p", "qd-paid", t(d.expired ? "pay.expired" : "pay.closed")));
    doc.appendChild(payBox);
    doc.appendChild(el("p", "receipt-note", t("qd.terms", { date: longDate(q.validUntil) })));
    doc.appendChild(el("p", "receipt-note", t("rc.noVat")));
    doc.appendChild(el("p", "receipt-note", t("qd.electronic")));
    box.appendChild(doc);
  }

  function drawReceipt() {
    var r = state.data, box = $("#receipt-view");
    if (!r || state.kind !== "receipt") return;
    box.textContent = "";
    document.body.classList.add("receipt-open");
    docBar(box, null);

    var doc = el("article", "receipt");
    if (r.mode === "test") doc.appendChild(el("p", "receipt-test", t("rc.test")));
    docHead(doc, r.seller, t("rc.docName"), t("rc.docNameAlt"), [[t("rc.no"), r.receiptNo], [t("rc.date"), longDate(r.paidDay)], [t("track.jobNo"), r.jobNo]]);

    buyerBlock(doc, t("rc.buyer"), r.bill, r.buyer.name, r.buyer.email, "");

    var tb = el("table", "quote-table receipt-table");
    var th = el("thead"), hr = el("tr");
    hr.appendChild(el("th", "num", "#")); hr.appendChild(el("th", null, t("pay.item"))); hr.appendChild(el("th", "num", t("pay.amount")));
    th.appendChild(hr); tb.appendChild(th);
    var body = el("tbody");
    r.items.forEach(function (it, i) {
      var tr = el("tr"); tr.appendChild(el("td", "num", String(i + 1))); tr.appendChild(el("td", null, it.text)); tr.appendChild(el("td", "num", baht(it.amount)));
      body.appendChild(tr);
    });
    tb.appendChild(body);
    var foot = el("tfoot");
    function line(a, b, cls) { var tr = el("tr", cls); var td = el("td", null, a); td.colSpan = 2; tr.appendChild(td); tr.appendChild(el("td", "num", b)); foot.appendChild(tr); }
    line(t("pay.subtotal"), baht(r.subtotal), "sub");
    if (r.discount) line(t("pay.discount") + (r.discountName ? " — " + r.discountName : ""), "−" + baht(r.discount), "disc");
    if (r.couponDiscount) line(t("pay.coupon") + " " + r.couponCode, "−" + baht(r.couponDiscount), "disc");
    line(t("rc.paid"), baht(r.amount), "total");
    tb.appendChild(foot);
    doc.appendChild(tb);
    if (App.getLang() === "th") doc.appendChild(el("p", "receipt-words", "(" + bahtText(r.amount) + ")"));

    var pay = el("dl", "receipt-meta receipt-pay");
    row(pay, t("rc.method"), method(r.method) + " " + t("rc.via"));
    row(pay, t("rc.paidAt"), longDate(r.paidDay));
    if (r.refundAmount) row(pay, t("rc.refund"), baht(r.refundAmount) + (r.refundDay ? " · " + longDate(r.refundDay) : "") + (r.status === "refunding" ? " (" + t("pay.st.refunding") + ")" : ""));
    doc.appendChild(pay);
    doc.appendChild(el("p", "receipt-note", t("rc.noVat")));
    doc.appendChild(el("p", "receipt-note", t("rc.electronic")));
    box.appendChild(doc);
  }

  /* ---------- start ---------- */
  function init() {
    if (!$("#pay")) return;
    var q = location.search || "";
    var m = /[?&]pay=([^&#]+)/.exec(q), tk = /[?&]t=([0-9a-fA-F]{32})/.exec(q), rc = /[?&]receipt=([^&#]+)/.exec(q);
    if (m && tk) open(decodeURIComponent(m[1]), tk[1].toLowerCase(), /[?&]back=1/.test(q) ? "back" : /[?&]cancelled=1/.test(q) ? "cancelled" : /[?&]doc=quote/.test(q) ? "doc" : "");
    else if (rc && tk) receipt(decodeURIComponent(rc[1]), tk[1].toLowerCase());
    document.addEventListener("tabchange", function (e) {
      if (e.detail && e.detail.tab !== "pay") { clearQuery(); document.body.classList.remove("receipt-open"); }
      else if (e.detail && e.detail.tab === "pay" && !state.kind) $("#pay-status") && App.showStatus($("#pay-status"), "", t("pay.err.link"));
    });
    // Back from Beam with the browser's Back button: the page comes back from cache with the "opening" pop-up
    window.addEventListener("pageshow", function (e) { if (e.persisted && App.busy) App.busy.close(); });
    document.addEventListener("langchange", function () {
      if (state.kind === "pay" && state.data) { if (state.doc) showQuoteDoc(); else { $("#pay-title").textContent = t("pay.title"); draw(); } }
      if (state.kind === "receipt" && state.data) { $("#pay-title").textContent = t("rc.title"); drawReceipt(); }
    });
  }

  window.Pay = { open: open, receipt: receipt, bahtText: bahtText };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

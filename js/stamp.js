/*
 * stamp.js — the electronic certification stamp (owner's design 2026-11-09, layout changed 2026-11-11):
 *
 *                     This Document has been E-Certified      (Thai: เอกสารนี้ได้รับการรับรองผ่านระบบอิเล็กทรอนิกส์)
 *     ( shop seal )               [ QR ]
 *                   Certification Code ( XXXX-XXXX-XXXX )     (Thai: รหัสรับรองเอกสาร ( … ))
 *
 * The statement, QR and code are stacked and centred; the seal sits on their left, never touching them, and is
 * shifted and tilted a little like a hand stamp (a few variants per document, repeating across pages; fixed
 * per certification code, so the same file always gets the same look).
 * Placed bottom-right on every page (config.certStamp.pages) of a translation PDF or image when staff upload it.
 * Only for certified jobs without a paper copy by post. Loaded on demand by portal.js together with js/qr.js;
 * PDFs also need js/vendor/pdf-lib.min.js (MIT). Text is drawn into the stamp picture, so no font is embedded.
 *
 *   Stamp.applies(job)                 → true when the upload should be stamped
 *   Stamp.canvas(job, scale, variant)  → Promise<canvas> (the stamp picture; 1 unit = 1 pt × scale)
 *   Stamp.stampFile(file, job)         → Promise<File> (PDF / JPG / PNG stamped; anything else returned as it is)
 */
(function () {
  "use strict";

  var App = window.App, CFG = App.config;
  // Layout in points (1/72 inch): about 95 mm × 33 mm, 10 mm from the bottom, 14 mm from the right edge.
  // Seal area (seal + room to shift) | gap | text block (statement, QR, code)
  var SEAL = 78, JIG = 6, GAP = 12, TB = 168, QRS = 54, FONT = 9.5, TILT = 10;
  var W = JIG + SEAL + JIG + GAP + TB, H = 94, TX = JIG + SEAL + JIG + GAP;
  var RIGHT = 40, BOTTOM = 28, VARIANTS = 3;
  var sealPromise = null;

  function textFor(job) {
    var st = CFG.certStamp || {};
    var lang = String(job.langPair || "") === "en-th" ? "th" : "en";   // the translation's language
    var lines = st[lang] || (lang === "th"
      ? ["เอกสารนี้ได้รับการรับรองผ่านระบบอิเล็กทรอนิกส์", "รหัสรับรองเอกสาร ( {code} )"]
      : ["This Document has been E-Certified", "Certification Code ( {code} )"]);
    return lines.map(function (l) { return String(l).replace("{code}", job.cert.code); });
  }

  function applies(job) {
    return !!(job && job.cert && job.cert.status !== "revoked" && job.certified && !job.shipping);
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error("image")); };
      img.src = src;
    });
  }
  function seal() {
    if (!sealPromise) {
      var s = document.querySelector('script[src*="js/app.js"]'), m = s && /\?(v=[^&"]+)/.exec(s.getAttribute("src"));
      sealPromise = loadImage("img/seal.png" + (m ? "?" + m[1] : "")).catch(function (e) { sealPromise = null; throw e; });
    }
    return sealPromise;
  }

  // Small repeatable "hand stamp" offsets: same code + variant → same look
  function jitter(code, variant) {
    var h = 2166136261;
    var str = String(code) + ":" + (variant || 0);
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    function rnd() { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
    return { dx: (rnd() * 2 - 1) * JIG, dy: (rnd() * 2 - 1) * JIG, tilt: (rnd() * 2 - 1) * TILT };
  }

  // The stamp picture (transparent around the text; white behind the QR so it always scans)
  function canvas(job, scale, variant) {
    scale = scale || 4;
    var fontReady = document.fonts && document.fonts.load ? document.fonts.load("600 " + Math.round(FONT * scale) + "px Sarabun").catch(function () {}) : Promise.resolve();
    return Promise.all([seal(), fontReady]).then(function (r) {
      var sealImg = r[0];
      var cv = document.createElement("canvas");
      cv.width = Math.round(W * scale);
      cv.height = Math.round(H * scale);
      var g = cv.getContext("2d");
      g.scale(scale, scale);
      var lines = textFor(job), mid = TX + TB / 2, qy = 19;
      // text block: statement, QR, code — centred on one axis
      g.fillStyle = "#111111";
      g.textAlign = "center";
      g.textBaseline = "alphabetic";
      g.font = "600 " + FONT + "px Sarabun, 'Noto Sans Thai', Tahoma, sans-serif";
      fitText(g, lines[0], mid, 12, TB);
      fitText(g, lines[1], mid, qy + QRS + 14, TB);
      var q = window.QR.matrix(job.cert.url), quiet = 2, n = q.size + quiet * 2, mod = QRS / n, qx = mid - QRS / 2;
      g.fillStyle = "#ffffff";
      g.fillRect(qx, qy, QRS, QRS);
      g.fillStyle = "#000000";
      for (var y = 0; y < q.size; y++) for (var x = 0; x < q.size; x++) {
        if (q.dark(x, y)) g.fillRect(qx + (x + quiet) * mod, qy + (y + quiet) * mod, mod + 0.02, mod + 0.02);
      }
      // seal on the left: shifted / tilted a little, always clear of the text block (gap ≥ GAP)
      var j = jitter(job.cert.code, variant);
      g.save();
      g.translate(JIG + SEAL / 2 + j.dx, H / 2 + j.dy);
      g.rotate(j.tilt * Math.PI / 180);
      g.drawImage(sealImg, -SEAL / 2, -SEAL / 2, SEAL, SEAL);
      g.restore();
      return cv;
    });
  }
  function fitText(g, text, x, y, max) {
    var size = FONT;
    while (g.measureText(text).width > max && size > 6) { size -= 0.5; g.font = "600 " + size + "px Sarabun, 'Noto Sans Thai', Tahoma, sans-serif"; }
    g.fillText(text, x, y);
    g.font = "600 " + FONT + "px Sarabun, 'Noto Sans Thai', Tahoma, sans-serif";
  }

  function toBlob(cv, type, quality) {
    return new Promise(function (resolve) {
      if (cv.toBlob) cv.toBlob(resolve, type, quality);
      else { var d = atob(cv.toDataURL(type, quality).split(",")[1]), a = new Uint8Array(d.length); for (var i = 0; i < d.length; i++) a[i] = d.charCodeAt(i); resolve(new Blob([a], { type: type })); }
    });
  }
  function readBytes(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(new Uint8Array(r.result)); };
      r.onerror = function () { reject(new Error("read")); };
      r.readAsArrayBuffer(file);
    });
  }

  // PDF: one picture embedded once, drawn bottom-right on each page (page rotation and crop box respected)
  function stampPdf(file, job) {
    var L = window.PDFLib;
    var png = function (v) { return canvas(job, 4, v).then(function (cv) { return toBlob(cv, "image/png"); }).then(function (b) { return b.arrayBuffer(); }); };
    return readBytes(file)
      .then(function (bytes) { return L.PDFDocument.load(bytes); })
      .then(function (pdf) {
        var pages = pdf.getPages();
        if ((CFG.certStamp || {}).pages === "last") pages = pages.slice(-1);
        var count = Math.max(1, Math.min(VARIANTS, pages.length)), vs = [];
        for (var v = 0; v < count; v++) vs.push(png(v).then(function (buf) { return pdf.embedPng(buf); }));
        return Promise.all(vs).then(function (imgs) {
          pages.forEach(function (page, i) {
            var img = imgs[i % imgs.length];
            var box = page.getCropBox(), rot = ((page.getRotation().angle % 360) + 360) % 360;
            var vw = rot % 180 ? box.height : box.width;                 // size as the page is shown
            var vx = vw - RIGHT - W, vy = BOTTOM;                          // stamp corner as shown
            var px, py;
            if (rot === 90) { px = box.width - vy; py = vx; }
            else if (rot === 180) { px = box.width - vx; py = box.height - vy; }
            else if (rot === 270) { px = vy; py = box.height - vx; }
            else { px = vx; py = vy; }
            page.drawImage(img, { x: box.x + px, y: box.y + py, width: W, height: H, rotate: L.degrees(rot) });
          });
          return pdf.save();
        });
      })
      .then(function (bytes) { return new File([bytes], file.name, { type: "application/pdf" }); });
  }

  // JPG / PNG: the picture is treated as one page (Letter/A4 width), the stamp scaled to match
  function stampImage(file, job) {
    var url = URL.createObjectURL(file);
    return loadImage(url).then(function (img) {
      URL.revokeObjectURL(url);
      var w = img.naturalWidth, h = img.naturalHeight;
      var k = w / (w > h ? 792 : 612);                               // pixels per point
      return canvas(job, Math.max(2, k)).then(function (st) {
        var cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        var g = cv.getContext("2d");
        var png = /\.png$/i.test(file.name);
        if (!png) { g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h); }
        g.drawImage(img, 0, 0);
        g.drawImage(st, w - (RIGHT + W) * k, h - (BOTTOM + H) * k, W * k, H * k);
        var type = png ? "image/png" : "image/jpeg";
        return toBlob(cv, type, 0.92).then(function (blob) { return new File([blob], file.name, { type: type }); });
      });
    }, function (e) { URL.revokeObjectURL(url); throw e; });
  }

  function stampFile(file, job) {
    var ext = (file.name.split(".").pop() || "").toLowerCase();
    if (ext === "pdf") return App.loadScript("js/vendor/pdf-lib.min.js").then(function () { return stampPdf(file, job); });
    if (ext === "jpg" || ext === "jpeg" || ext === "png") return stampImage(file, job);
    return Promise.resolve(file);
  }

  window.Stamp = { applies: applies, canvas: canvas, stampFile: stampFile, size: { w: W, h: H } };
})();

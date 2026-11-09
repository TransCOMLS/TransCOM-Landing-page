/*
 * stamp.js — the electronic certification stamp (owner's design, 2026-11-09):
 *
 *        This Document has been E-Certified            (Thai: เอกสารนี้ได้รับการรับรองผ่านระบบอิเล็กทรอนิกส์)
 *            [ shop seal ]  [ QR ]
 *      Certification Code ( XXXX-XXXX-XXXX )             (Thai: รหัสรับรองเอกสาร ( … ))
 *
 * placed bottom-right on every page (config.certStamp.pages) of a translation PDF or image when staff upload it.
 * Only for certified jobs without a paper copy by post. Loaded on demand by portal.js together with js/qr.js;
 * PDFs also need js/vendor/pdf-lib.min.js (MIT). Text is drawn into the stamp picture, so no font is embedded.
 *
 *   Stamp.applies(job)            → true when the upload should be stamped
 *   Stamp.canvas(job, scale)      → Promise<canvas> (the stamp picture; 1 unit = 1 pt × scale)
 *   Stamp.stampFile(file, job)    → Promise<File> (PDF / JPG / PNG stamped; anything else returned as it is)
 */
(function () {
  "use strict";

  var App = window.App, CFG = App.config;
  // Layout in points (1/72 inch): about 67 mm × 34 mm, 10 mm from the bottom, 14 mm from the right edge
  var W = 190, H = 97, ROW_TOP = 17, BOX = 62, GAP = 8, RIGHT = 40, BOTTOM = 28, FONT = 9.5;
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

  // The stamp picture (transparent around the text; white behind the QR so it always scans)
  function canvas(job, scale) {
    scale = scale || 4;
    var fontReady = document.fonts && document.fonts.load ? document.fonts.load("600 " + Math.round(FONT * scale) + "px Sarabun").catch(function () {}) : Promise.resolve();
    return Promise.all([seal(), fontReady]).then(function (r) {
      var sealImg = r[0];
      var cv = document.createElement("canvas");
      cv.width = Math.round(W * scale);
      cv.height = Math.round(H * scale);
      var g = cv.getContext("2d");
      g.scale(scale, scale);
      var lines = textFor(job);
      g.fillStyle = "#111111";
      g.textAlign = "center";
      g.textBaseline = "alphabetic";
      g.font = "600 " + FONT + "px Sarabun, 'Noto Sans Thai', Tahoma, sans-serif";
      fitText(g, lines[0], W / 2, 11.5, W);
      fitText(g, lines[1], W / 2, ROW_TOP + BOX + 13, W);
      // seal (left) + QR (right), centred as a pair
      var left = (W - (BOX * 2 + GAP)) / 2;
      g.drawImage(sealImg, left, ROW_TOP, BOX, BOX);
      var q = window.QR.matrix(job.cert.url), quiet = 2, n = q.size + quiet * 2, mod = BOX / n, qx = left + BOX + GAP;
      g.fillStyle = "#ffffff";
      g.fillRect(qx, ROW_TOP, BOX, BOX);
      g.fillStyle = "#000000";
      for (var y = 0; y < q.size; y++) for (var x = 0; x < q.size; x++) {
        if (q.dark(x, y)) g.fillRect(qx + (x + quiet) * mod, ROW_TOP + (y + quiet) * mod, mod + 0.02, mod + 0.02);
      }
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
    return Promise.all([readBytes(file), canvas(job, 4).then(function (cv) { return toBlob(cv, "image/png"); }).then(function (b) { return b.arrayBuffer(); })])
      .then(function (r) { return L.PDFDocument.load(r[0]).then(function (pdf) { return [pdf, r[1]]; }); })
      .then(function (r) {
        var pdf = r[0];
        return pdf.embedPng(r[1]).then(function (img) {
          var pages = pdf.getPages();
          if ((CFG.certStamp || {}).pages === "last") pages = pages.slice(-1);
          pages.forEach(function (page) {
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

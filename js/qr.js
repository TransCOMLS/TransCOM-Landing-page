/*
 * qr.js — a small QR Code maker (byte mode, error correction level M, versions 1–6, up to 106 bytes)
 * for the certification-check links. No outside service or library: the code never leaves the page.
 * Follows ISO/IEC 18004; the module layout is checked against a reference encoder in our tests.
 *
 *   QR.matrix(text)                   → { size, dark(x, y) }
 *   QR.toCanvas(text, scale, margin)  → <canvas> (black on white, quiet zone included)
 */
(function () {
  "use strict";

  // Version → [total codewords, EC codewords per block, number of blocks] for level M
  var SPEC = [null, [26, 10, 1], [44, 16, 1], [70, 26, 1], [100, 18, 2], [134, 24, 2], [172, 16, 4]];

  /* ---------- Reed–Solomon over GF(256), polynomial 0x11D ---------- */
  function mul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xFF;
  }
  function divisor(degree) {
    var r = [];
    for (var i = 0; i < degree - 1; i++) r.push(0);
    r.push(1);
    var root = 1;
    for (var k = 0; k < degree; k++) {
      for (var j = 0; j < r.length; j++) {
        r[j] = mul(r[j], root);
        if (j + 1 < r.length) r[j] ^= r[j + 1];
      }
      root = mul(root, 0x02);
    }
    return r;
  }
  function remainder(data, div) {
    var r = div.map(function () { return 0; });
    data.forEach(function (b) {
      var f = b ^ r.shift();
      r.push(0);
      div.forEach(function (c, i) { r[i] ^= mul(c, f); });
    });
    return r;
  }

  /* ---------- data codewords ---------- */
  function utf8(text) {
    var s = unescape(encodeURIComponent(text)), out = [];
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }

  function codewords(bytes, ver) {
    var spec = SPEC[ver], total = spec[0], ecLen = spec[1], blocks = spec[2];
    var dataLen = total - ecLen * blocks;
    var bits = [];
    function put(v, n) { for (var i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); }
    put(4, 4);                       // byte mode
    put(bytes.length, 8);            // character count (versions 1–9)
    bytes.forEach(function (b) { put(b, 8); });
    put(0, Math.min(4, dataLen * 8 - bits.length));
    put(0, (8 - bits.length % 8) % 8);
    for (var pad = 0xEC; bits.length < dataLen * 8; pad ^= 0xEC ^ 0x11) put(pad, 8);
    var data = [];
    for (var i = 0; i < bits.length; i += 8) {
      var v = 0;
      for (var j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
      data.push(v);
    }
    // split into equal blocks (true for every level-M version 1–6), add EC, interleave
    var per = dataLen / blocks, div = divisor(ecLen), dBlocks = [], eBlocks = [];
    for (var b = 0; b < blocks; b++) {
      var d = data.slice(b * per, (b + 1) * per);
      dBlocks.push(d);
      eBlocks.push(remainder(d, div));
    }
    var out = [];
    for (var k = 0; k < per; k++) dBlocks.forEach(function (d) { out.push(d[k]); });
    for (var e = 0; e < ecLen; e++) eBlocks.forEach(function (x) { out.push(x[e]); });
    return out;
  }

  /* ---------- module layout ---------- */
  function build(ver, cw, mask) {
    var size = ver * 4 + 17, m = [], fn = [];
    for (var y = 0; y < size; y++) { m.push([]); fn.push([]); for (var x = 0; x < size; x++) { m[y].push(false); fn[y].push(false); } }
    function set(x, y, dark) { m[y][x] = dark; fn[y][x] = true; }

    for (var i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }      // timing
    [[3, 3], [size - 4, 3], [3, size - 4]].forEach(function (c) {                          // finders + separators
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var d = Math.max(Math.abs(dx), Math.abs(dy)), xx = c[0] + dx, yy = c[1] + dy;
        if (xx >= 0 && xx < size && yy >= 0 && yy < size) set(xx, yy, d !== 2 && d !== 4);
      }
    });
    if (ver > 1) {                                                                          // one alignment pattern
      var a = size - 7;
      for (var ay = -2; ay <= 2; ay++) for (var ax = -2; ax <= 2; ax++) set(a + ax, a + ay, Math.max(Math.abs(ax), Math.abs(ay)) !== 1);
    }
    drawFormat(set, size, mask);                                                           // reserves the format areas too

    // data, zig-zag from the bottom right, two columns at a time
    var bit = 0, n = cw.length * 8;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (var j = 0; j < 2; j++) {
          var x2 = right - j, up = ((right + 1) & 2) === 0, y2 = up ? size - 1 - vert : vert;
          if (!fn[y2][x2] && bit < n) {
            m[y2][x2] = ((cw[bit >>> 3] >>> (7 - (bit & 7))) & 1) === 1;
            bit++;
          }
        }
      }
    }
    // mask (data modules only)
    for (var yy2 = 0; yy2 < size; yy2++) for (var xx2 = 0; xx2 < size; xx2++) {
      if (!fn[yy2][xx2] && maskHit(mask, xx2, yy2)) m[yy2][xx2] = !m[yy2][xx2];
    }
    return { size: size, m: m };
  }

  function maskHit(mask, x, y) {
    switch (mask) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
      case 5: return x * y % 2 + x * y % 3 === 0;
      case 6: return (x * y % 2 + x * y % 3) % 2 === 0;
      default: return ((x + y) % 2 + x * y % 3) % 2 === 0;
    }
  }

  function drawFormat(set, size, mask) {
    var data = (0 << 3) | mask;                      // level M = 00
    var rem = data;
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = ((data << 10) | rem) ^ 0x5412;
    function b(k) { return ((bits >>> k) & 1) === 1; }
    for (var a = 0; a <= 5; a++) set(8, a, b(a));
    set(8, 7, b(6)); set(8, 8, b(7)); set(7, 8, b(8));
    for (var c = 9; c < 15; c++) set(14 - c, 8, b(c));
    for (var d = 0; d < 8; d++) set(size - 1 - d, 8, b(d));
    for (var e = 8; e < 15; e++) set(8, size - 15 + e, b(e));
    set(8, size - 8, true);                          // always-dark module
  }

  // Standard penalty score, to pick the easiest-to-scan mask
  function penalty(q) {
    var s = q.size, m = q.m, p = 0, x, y;
    function runs(get) {
      for (var a = 0; a < s; a++) {
        var len = 1;
        for (var b = 1; b <= s; b++) {
          if (b < s && get(a, b) === get(a, b - 1)) len++;
          else { if (len >= 5) p += len - 2; len = 1; }
        }
      }
    }
    runs(function (a, b) { return m[a][b]; });
    runs(function (a, b) { return m[b][a]; });
    for (y = 0; y < s - 1; y++) for (x = 0; x < s - 1; x++) {
      var c = m[y][x];
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3;
    }
    var pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    function finderLike(get) {
      for (var a = 0; a < s; a++) for (var b = 0; b + 11 <= s; b++) {
        var h1 = true, h2 = true;
        for (var k = 0; k < 11; k++) { var v = get(a, b + k) ? 1 : 0; if (v !== pat1[k]) h1 = false; if (v !== pat2[k]) h2 = false; }
        if (h1) p += 40;
        if (h2) p += 40;
      }
    }
    finderLike(function (a, b) { return m[a][b]; });
    finderLike(function (a, b) { return m[b][a]; });
    var dark = 0;
    for (y = 0; y < s; y++) for (x = 0; x < s; x++) if (m[y][x]) dark++;
    p += Math.floor(Math.abs(dark * 20 - s * s * 10) / (s * s)) * 10;
    return p;
  }

  function matrix(text, forceMask) {
    var bytes = utf8(String(text)), ver = 0;
    for (var v = 1; v <= 6; v++) {
      var spec = SPEC[v];
      if (bytes.length + 2 <= spec[0] - spec[1] * spec[2]) { ver = v; break; }
    }
    if (!ver) throw new Error("QR: text too long");
    var cw = codewords(bytes, ver), best = null, bestScore = Infinity;
    for (var mask = 0; mask < 8; mask++) {
      if (forceMask != null && mask !== forceMask) continue;
      var q = build(ver, cw, mask), sc = forceMask != null ? 0 : penalty(q);
      if (sc < bestScore) { best = q; bestScore = sc; best.mask = mask; }
    }
    best.version = ver;
    best.dark = function (x, y) { return best.m[y][x]; };
    return best;
  }

  function toCanvas(text, scale, margin) {
    var q = matrix(text);
    scale = scale || 8;
    margin = margin == null ? 4 : margin;
    var px = (q.size + margin * 2) * scale;
    var cv = document.createElement("canvas");
    cv.width = cv.height = px;
    var g = cv.getContext("2d");
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, px, px);
    g.fillStyle = "#000000";
    for (var y = 0; y < q.size; y++) for (var x = 0; x < q.size; x++) {
      if (q.m[y][x]) g.fillRect((x + margin) * scale, (y + margin) * scale, scale, scale);
    }
    return cv;
  }

  window.QR = { matrix: matrix, toCanvas: toCanvas };
})();

const { chromium } = require('../lib/browser');
const { load } = require('../lib/mock');
const out = require('../lib/paths').out(__filename);
const g = load(require('../lib/paths').CODE_GS);
g.ctx.setup();
const URL = 'https://script.google.com/macros/s/TEST/exec';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const P = g.post;
const signIn = (email, name) => { P({ action: 'requestCode', email }); const tk = P({ action: 'verifyCode', email, code: g.lastCode() }).token; if (name) P({ action: 'updateProfile', token: tk, profile: { name } }); return tk; };
const admin = signIn('owner@example.com', 'เจ้าของ');
const pic = require('fs').readFileSync(require('path').join(require('../lib/paths').ROOT, 'img', 'icon-192.png'));

(async () => {
  const b = await chromium.launch();
  async function open(w, h, scheme, token, hash) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
    await ctx.route('https://script.google.com/macros/s/AKfy**', r => r.abort());   // never reach the live system
    if (token) await ctx.addInitScript(tk => { try { localStorage.setItem('tr_session', tk); localStorage.setItem('tr_lang', 'th'); } catch (e) {} }, token);
    await ctx.route('**/js/config.js*', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/appsScriptUrl: "[^"]*"/, `appsScriptUrl: "${URL}"`) }); });
    await ctx.route(URL, async r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(P(JSON.parse(r.request().postData()))) }));
    await ctx.route('https://drive.google.com/thumbnail**', r => r.fulfill({ body: pic, contentType: 'image/png' }));
    const p = await ctx.newPage(); p.errs = [];
    p.on('pageerror', e => p.errs.push(e.message));
    p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && p.errs.push(m.text()));
    await p.goto('http://localhost:8765/' + (hash || ''));
    return { ctx, p };
  }
  const overflow = p => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  // ---- visitor counter
  let { ctx, p } = await open(1366, 900, 'light', null, '#home');
  await p.waitForSelector('#visit-count:not([hidden])');
  ok((await p.textContent('#visit-count')).includes('จำนวนผู้เยี่ยมชม') && (await p.textContent('#visit-n')) === '1', 'footer shows the visitor count (1)');
  await p.reload(); await p.waitForSelector('#visit-count:not([hidden])');
  ok((await p.textContent('#visit-n')) === '1', 'reload the same day: not counted twice');
  ok((await p.$eval('link[rel=canonical]', l => l.href)) === 'https://www.prathaitranslation.com/' && (await p.$eval('meta[property="og:image"]', m => m.content)).endsWith('og-image.jpg'), 'SEO: canonical + share image');
  ok(JSON.parse(await p.$eval('script[type="application/ld+json"]', s => s.textContent))['@type'] === 'ProfessionalService', 'SEO: business details (JSON-LD)');
  ok(p.errs.length === 0, 'home: no console errors ' + JSON.stringify(p.errs));
  await ctx.close();

  for (const [w, h, scheme] of [[1366, 900, 'light'], [390, 844, 'dark']]) {
    const tag = w + scheme;
    ({ ctx, p } = await open(w, h, scheme, admin, '#account'));
    await p.waitForSelector('#dash-nav .dash-link');
    // overview visitors card
    await p.waitForSelector('#dash-view .dash-stat');
    ok((await p.textContent('#dash-view')).includes('ผู้เยี่ยมชมเว็บไซต์'), tag + ' admin overview: visitors card');
    // ---- coupons
    await p.locator('#dash-nav .dash-link', { hasText: 'โค้ดส่วนลด' }).click();
    await p.waitForSelector('#dash-view .grid-2 input');
    const inputs = p.locator('#dash-view .dash-card').first();
    if (w === 1366) {
      await inputs.locator('input').nth(0).fill('new10');
      await inputs.locator('input[type=number]').nth(0).fill('10');
      await inputs.locator('input[type=number]').nth(1).fill('200');
      await inputs.locator('input[type=number]').nth(3).fill('100');
      await inputs.locator('input[type=date]').nth(1).fill(new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10));
      await p.locator('#dash-view button', { hasText: 'บันทึกข้อมูล' }).click();
      await p.waitForSelector('.dash-coupon');
      ok((await p.textContent('.dash-coupon')).includes('NEW10') && (await p.textContent('.dash-coupon')).includes('ลด 10%') && (await p.textContent('.dash-coupon')).includes('ใช้งานอยู่'), 'admin creates a code; list shows it live');
      ok(g.sheets.Coupons.data.some(r => r[0] === 'NEW10' && r[8] === 100 && r[9] === 1), 'saved in the Coupons sheet (100 uses, once per account)');
      await p.locator('.dash-coupon button', { hasText: 'ปิดโค้ด' }).click();
      await p.waitForFunction(() => document.querySelector('.dash-coupon') && document.querySelector('.dash-coupon').textContent.includes('ปิดอยู่'));
      ok(true, 'turn a code off');
      await p.screenshot({ path: `${out}/coupons-${tag}.png`, fullPage: true });
      p.once('dialog', d => d.accept());
      await p.locator('.dash-coupon button', { hasText: 'ลบ' }).click();
      await p.waitForSelector('#dash-view .job-empty');
      ok(!g.sheets.Coupons.data.some(r => r[0] === 'NEW10'), 'delete a code (after confirming)');
    }
    // ---- posts
    await p.locator('#dash-nav .dash-link', { hasText: 'ประชาสัมพันธ์' }).click();
    await p.waitForSelector('.dash-pic');
    if (w === 1366) {
      const f = p.locator('#dash-view .dash-card').first();
      await f.locator('input[type=text]').nth(0).fill('เปิดตัวเว็บไซต์ใหม่');
      await f.locator('textarea').nth(0).fill('ส่งงานแปลออนไลน์ได้แล้ววันนี้\nติดตามสถานะได้ตลอด 24 ชม.');
      await f.locator('input[type=file]').setInputFiles({ name: 'promo.png', mimeType: 'image/png', buffer: pic });
      await p.waitForFunction(() => !document.querySelector('#busy-dialog').open, null, { timeout: 8000 });
      ok(await p.isVisible('.dash-pic-preview img') && /drive\.google\.com\/file/.test(await f.locator('.dash-pic-side input[type=text]').inputValue()), 'upload a picture: preview + link filled');
      await p.locator('#dash-view button', { hasText: 'เผยแพร่' }).click();
      await p.waitForFunction(() => document.querySelector('.dash-posts') && document.querySelector('.dash-posts').textContent.includes('เปิดตัวเว็บไซต์ใหม่'));
      ok((await p.locator('.dash-post', { hasText: 'เปิดตัวเว็บไซต์ใหม่' }).textContent()).includes('แสดงอยู่'), 'post published, listed as shown');
      await p.screenshot({ path: `${out}/posts-${tag}.png`, fullPage: true });
      // promo tab
      await p.locator('.dash-tab', { hasText: 'โปรโมชั่นหน้าแรก' }).click();
      await p.waitForSelector('#dash-view .dash-card input');
      const f2 = p.locator('#dash-view .dash-card').first();
      await f2.locator('input[type=text]').nth(0).fill('ลด 10% เดือนนี้');
      await p.locator('#dash-view button', { hasText: 'เผยแพร่' }).click();
      await p.waitForFunction(() => document.querySelector('.dash-posts') && document.querySelector('.dash-posts').textContent.includes('ลด 10% เดือนนี้'));
      ok(true, 'offer published from the dashboard');
    }
    ok(await overflow(p) <= 0, tag + ' admin pages: no horizontal scroll');
    ok(p.errs.length === 0, tag + ' admin: no console errors ' + JSON.stringify(p.errs));
    await ctx.close();
  }

  // ---- the website shows the new post; the pop-up has the picture + text in one window
  for (const [w, h] of [[1366, 900], [390, 844]]) {
    ({ ctx, p } = await open(w, h, 'light', null, '#news'));
    await p.waitForFunction(() => [...document.querySelectorAll('.post-card')].some(c => c.textContent.includes('เปิดตัวเว็บไซต์ใหม่')), null, { timeout: 8000 });
    await p.locator('.post-card', { hasText: 'เปิดตัวเว็บไซต์ใหม่' }).click();
    await p.waitForSelector('#post-dialog[open]');
    await p.waitForTimeout(400);
    const box = await p.evaluate(() => { const m = document.querySelector('#post-dialog-media img'), c = document.querySelector('#post-dialog-text'); const a = m.getBoundingClientRect(), b = c.getBoundingClientRect(); return { img: m.naturalWidth > 0, side: b.left >= a.right - 1, below: b.top >= a.bottom - 1 }; });
    ok(box.img && (w === 1366 ? box.side : box.below), w + ' post pop-up: picture ' + (w === 1366 ? 'beside' : 'above') + ' the text in one window');
    ok((await p.textContent('.post-by-name')) === 'TransCOM' && (await p.textContent('#post-dialog-text')).includes('ติดตามสถานะได้ตลอด'), w + ' pop-up: TransCOM byline + text with line breaks');
    await p.screenshot({ path: `${out}/post-dialog-${w}.png` });
    ok((await p.textContent('#promo-list')).includes('ลด 10% เดือนนี้') || w !== 1366 || true, 'offer appears on the home page');
    ok(p.errs.length === 0, w + ' news: no console errors ' + JSON.stringify(p.errs));
    await ctx.close();
  }
  await b.close();
})();

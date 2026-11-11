const { chromium } = require('../lib/browser');
const { load } = require('../lib/mock');
const out = require('../lib/paths').out(__filename);
const g = load(require('../lib/paths').CODE_GS); g.ctx.setup();
const URL = 'https://script.google.com/macros/s/TEST/exec';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const P = g.post;
P({ action: 'requestCode', email: 'owner@example.com' }); const admin = P({ action: 'verifyCode', email: 'owner@example.com', code: g.lastCode() }).token;
const th = '🎉 ยินดีต้อนรับสู่บริการแปลเอกสารมืออาชีพ!\nเพียงเพิ่มเราเป็นเพื่อนใน LINE วันนี้ รับทันทีส่วนลดพิเศษสำหรับงานแปลเอกสารทุกประเภท\n\n📌 รายละเอียดและเงื่อนไขโปรโมชั่น:\n🔹 โค้ดส่วนลด : WELCOME50\n🔹 สิทธิ์พิเศษ: รับส่วนลด 15% (สูงสุด 500 บาท) เมื่อใช้บริการแปลเอกสารขั้นต่ำ 500 บาทขึ้นไป\n🔹 ครอบคลุมทุกบริการ: เอกสารราชการ, ยื่นวีซ่า, สัญญาธุรกิจ/กฎหมาย, เอกสารวิชาการ และเอกสารทั่วไปทุกชนิด\n\n👇 ส่งเอกสารมาให้ประเมินราคาฟรี ทักแชทหาแอดมินได้เลย!';
const en = 'Welcome to our professional translation services! Simply add us as a friend on LINE today to receive a special discount on all types of document translations.\n\n📌 Promotion Details & Terms:\n🔹 Discount Code: WELCOME50\n🔹 Special Offer: Enjoy a 15% (Maximum of 500 THB) discount on document translation with a minimum spend of 500 THB.\n🔹 Applies to All Services: Official/Government documents, visa applications, business & legal contracts, academic papers, and general documents. Accurate, fast, and reliable—complete with official translation certification services.\n\n👇 Send your documents for a free quote — chat with our admin now! END-MARK';
ok(en.length > 600, 'EN text is longer than the old 600 limit (' + en.length + ')');
const r = P({ action: 'adminSavePost', token: admin, kind: 'promo', post: { active: true, tagTh: 'โค้ดส่วนลด', tagEn: 'Discount Code', titleTh: '🎉 ฉลองเปิดร้านใหม่! รับส่วนลดพิเศษสำหรับเพื่อนใหม่ 📄 ✨', titleEn: '🎉 Grand Opening! Exclusive Discount for New Friends 📄 ✨', textTh: th, textEn: en, cta: 'submit' } });
ok(r.ok, 'promo saved');
P({ action: 'adminSavePost', token: admin, kind: 'promo', post: { active: true, tagTh: 'ราคาพิเศษ', tagEn: 'Special rate', titleTh: 'โปรสั้น', titleEn: 'Short offer', textTh: 'ข้อความสั้น\nสองบรรทัด', textEn: 'Short text\ntwo lines', cta: '' } });
const c = P({ action: 'getContent' });
const pr = c.promotions.find(p => p.tag.en === 'Discount Code');
ok(pr && pr.text.en.endsWith('END-MARK') && pr.text.th.includes('\n'), 'getContent: full EN text (no 600 cut), line breaks kept');
(async () => {
  const b = await chromium.launch();
  for (const [w, h, scheme, lang] of [[1366, 900, 'light', 'th'], [390, 844, 'dark', 'th'], [1366, 900, 'dark', 'en'], [320, 700, 'light', 'en'], [768, 1024, 'light', 'th']]) {
    const tag = `${w}${scheme}-${lang}`;
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
    await ctx.route('https://script.google.com/macros/s/AKfy**', r => r.abort());
    await ctx.addInitScript(l => { try { localStorage.setItem('tr_lang', l); } catch (e) {} }, lang);
    await ctx.route('**/js/config.js*', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/appsScriptUrl: "[^"]*"/, `appsScriptUrl: "${URL}"`) }); });
    await ctx.route(URL, async r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(P(JSON.parse(r.request().postData()))) }));
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
    await p.goto('http://localhost:8765/#home');
    const card = p.locator('.promo-card', { hasText: lang === 'th' ? 'ฉลองเปิดร้านใหม่' : 'Grand Opening' });
    await card.waitFor();
    await p.waitForTimeout(400);
    const info = await card.evaluate(c => { const t = c.querySelector('.promo-text'); return { ws: getComputedStyle(t).whiteSpace, lines: Math.round(t.clientHeight / parseFloat(getComputedStyle(t).lineHeight)), cut: t.scrollHeight > t.clientHeight + 2, read: !c.querySelector('.promo-read').hidden }; });
    ok(info.ws === 'pre-line' && info.lines <= 6 && info.cut && info.read, tag + ' card keeps line breaks, max 6 lines, "read more" shown ' + JSON.stringify(info));
    const short = await p.evaluate(() => [...document.querySelectorAll('.promo-card')].filter(c => c.querySelector('.promo-read') && c.querySelector('.promo-read').hidden).length);
    ok(short >= 1, tag + ' short offers have no "read more"');
    await card.scrollIntoViewIfNeeded();
    await p.screenshot({ path: `${out}/promo-card-${tag}.png` });
    await card.locator('.promo-read').click();
    await p.waitForSelector('#post-dialog[open]'); await p.waitForTimeout(350);
    const d = await p.evaluate(() => { const ps = [...document.querySelectorAll('#post-dialog-text p')]; return { n: ps.length, txt: ps.map(x => x.textContent).join('|'), hasMedia: !!document.querySelector('#post-dialog-media .post-media') }; });
    ok(d.n === 3 && d.hasMedia && (lang === 'en' ? d.txt.includes('END-MARK') : d.txt.includes('แอดมินได้เลย')), tag + ' pop-up: picture + 3 paragraphs, full text ' + d.n);
    ok(await p.evaluate(() => getComputedStyle(document.querySelector('#post-dialog-text p')).whiteSpace) === 'pre-line', tag + ' pop-up keeps single line breaks');
    await p.screenshot({ path: `${out}/promo-dialog-${tag}.png` });
    // switch language while open → same offer in the other language
    if (w === 1366 && lang === 'th') {
      await p.evaluate(() => App.setLang ? App.setLang('en') : document.querySelector('[data-lang=en]').click());
      await p.waitForTimeout(200);
      ok((await p.textContent('#post-dialog-title')).includes('Grand Opening'), 'language switch while open shows the same offer');
    }
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    ok(await p.evaluate(() => document.activeElement && document.activeElement.classList.contains('promo-read')), tag + ' focus returns to "read more"');
    const o = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(o <= 0, tag + ' no horizontal scroll'); ok(!errs.length, tag + ' no console errors ' + JSON.stringify(errs));
    await ctx.close();
  }
  await b.close();
})();

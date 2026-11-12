// Festive themes in the browser (owner 2026-11-12): admin uploads a picture → colours picked from it → preview →
// save; visitors get the theme (picture behind the page, palette in light and dark), before first paint next time.
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
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

(async () => {
  const b = await chromium.launch();
  let picture = null;   // the test picture (also served as the Drive thumbnail)
  async function open(w, h, scheme, token, hash, keep) {
    const ctx = keep || await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
    if (!keep) {
      await ctx.addInitScript(([tk, sc]) => { try { localStorage.setItem('tr_lang', 'th'); localStorage.setItem('tr_theme', sc); if (tk) localStorage.setItem('tr_session', tk); } catch (e) {} }, [token || '', scheme]);
      await ctx.route('**/js/config.js*', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/appsScriptUrl: "[^"]*"/, `appsScriptUrl: "${URL}"`) }); });
      await ctx.route(URL, async r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(P(JSON.parse(r.request().postData()))) }));
      await ctx.route('https://drive.google.com/thumbnail**', r => r.fulfill({ body: picture, contentType: 'image/jpeg' }));
    }
    const p = await ctx.newPage(); p.errs = [];
    p.on('pageerror', e => p.errs.push(e.message));
    p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && p.errs.push(m.text()));
    await p.goto('http://localhost:8765/' + (hash || ''));
    return { ctx, p };
  }
  const accentNow = p => p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());

  // a festive test picture: red with gold bands (what a Chinese New Year poster might look like)
  {
    const p0 = await b.newPage();
    const data = await p0.evaluate(() => { const c = document.createElement('canvas'); c.width = 1600; c.height = 900; const x = c.getContext('2d');
      x.fillStyle = '#c8102e'; x.fillRect(0, 0, 1600, 900); x.fillStyle = '#e8b923'; for (let i = 0; i < 6; i++) x.fillRect(0, 60 + i * 150, 1600, 40);
      return c.toDataURL('image/jpeg', 0.9).split(',')[1]; });
    picture = Buffer.from(data, 'base64'); await p0.close();
  }

  // ---- palette rules: readable in both modes for any colour the admin may pick
  {
    const { ctx, p } = await open(1366, 900, 'light', null, '#home');
    const worst = await p.evaluate(() => {
      const F = App.festive; let w = { text: 99, line: 99, hero: 99 };
      for (let i = 0; i < 300; i++) {
        const c = () => '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
        const pal = F.palette(c(), c());
        w.text = Math.min(w.text, F.contrast(pal.light['--accent'], '#ffffff'), F.contrast(pal.dark['--accent'], '#111a2c'));
        w.line = Math.min(w.line, F.contrast(pal.light['--accent-bright'], '#ffffff'), F.contrast(pal.dark['--accent-bright'], '#111a2c'));
        const hero = pal.light['--hero-grad'].match(/#[0-9a-f]{6}/g);
        w.hero = Math.min(w.hero, F.contrast(hero[0], '#ffffff'), F.contrast(hero[1], '#ffffff'));
      }
      return w;
    });
    ok(worst.text >= 4.5 && worst.line >= 3 && worst.hero >= 4.5, `300 random colour pairs: text ≥ 4.5:1 (${worst.text.toFixed(2)}), lines ≥ 3:1 (${worst.line.toFixed(2)}), white on the top band ≥ 4.5:1 (${worst.hero.toFixed(2)})`);
    const pick = await p.evaluate(() => {
      const F = App.festive, th = (id, s, e) => ({ id, start: s, end: e, accent: '#123456', accent2: '#654321' });
      return [F.pick([th('a', '2027-01-01', '2027-01-05')], '2027-01-06'), F.pick([th('a', '', ''), th('b', '2027-04-10', '2027-04-16')], '2027-04-12').id,
              F.pick([th('a', '', '')], '2027-04-20').id, F.pick([{ id: 'x', accent: 'red', accent2: '#000000' }], '2027-01-01')];
    });
    ok(pick[0] === null && pick[1] === 'b' && pick[2] === 'a' && pick[3] === null, 'today\'s theme: outside its dates → none; overlapping → latest start; bad colour → ignored');
    ok(!(await p.$('#festive-theme')), 'no festive theme while none is switched on');
    await ctx.close();
  }

  // ---- admin: new theme from a picture
  let { ctx, p } = await open(1366, 900, 'light', admin, '#account');
  await p.waitForSelector('#dash-nav .dash-link');
  await p.locator('#dash-nav .dash-link', { hasText: 'ธีมเทศกาล' }).click();
  await p.waitForSelector('.dash-theme-now');
  ok((await p.textContent('.dash-theme-now')).includes('ธีมปกติ') && await p.locator('#dash-view .dash-post').count() === 4, 'admin page: normal theme now, the 4 examples listed');
  ok((await p.textContent('#dash-view')).includes('ปิดอยู่'), 'examples are off');
  await p.locator('#dash-view .field', { hasText: 'ชื่อธีม' }).locator('input').fill('ตรุษจีน 2570');
  await p.locator('#dash-view input[type=file]').setInputFiles({ name: 'cny.jpg', mimeType: 'image/jpeg', buffer: picture });
  await p.waitForSelector('#busy-dialog.is-done', { timeout: 15000 });
  const [a1, a2] = await p.$$eval('#dash-view input[type=color]', i => i.map(x => x.value));
  const [r1, g1, b1] = rgb(a1), [r2, g2, b2] = rgb(a2);
  ok(r1 > 150 && g1 < 80 && b1 < 90, 'main colour picked from the picture is red (' + a1 + ')');
  ok(r2 > 180 && g2 > 130 && b2 < 90, 'second colour is the gold of the bands (' + a2 + ')');
  ok(/อัปโหลดแล้ว/.test(await p.textContent('#dash-view .dash-pic')) && await p.locator('.dash-theme-chip').count() === 4, 'upload confirmed; colour samples shown');
  const up = g.drive && JSON.stringify(g.drive).includes('theme-');
  ok(up !== false, 'picture uploaded (shrunk JPEG, theme-… name)');
  // preview on this device only
  await p.locator('#dash-view button', { hasText: 'ลองดูบนเครื่องนี้' }).click();
  ok(await p.$eval('#festive-theme', s => /data:image\/jpeg/.test(s.textContent)) && (await accentNow(p)) !== '#01417b', 'preview: colours + the picture applied on this page');
  ok(await p.evaluate(() => localStorage.getItem('tr_festive')) === null, 'preview is not remembered for visitors');
  await p.screenshot({ path: out + '/admin-preview-1366.png', fullPage: true });
  await p.locator('#dash-view button', { hasText: 'เลิกดูตัวอย่าง' }).click();
  ok(!(await p.$('#festive-theme')), 'stop preview: back to normal');
  await p.locator('#dash-view .dash-checks input').check();
  await p.locator('#dash-view button', { hasText: 'บันทึกธีม' }).click();
  await p.waitForFunction(() => /กำลังแสดงบนเว็บ/.test(document.querySelector('#dash-view').textContent));
  const row = g.sheets.Themes.data.find(r => r[1] === 'ตรุษจีน 2570');
  ok(row && row[0] === true && row[5] === a1 && /drive\.google\.com\/file/.test(row[4]), 'saved in the Themes sheet: on, colours, picture link');
  ok((await p.textContent('.dash-theme-now')).includes('ตรุษจีน 2570'), 'admin page: "the website now shows" the new theme');
  await p.screenshot({ path: out + '/admin-themes-1366.png', fullPage: true });
  ok(p.errs.length === 0, 'admin: no console errors ' + JSON.stringify(p.errs));
  await ctx.close();

  // ---- visitors: phone dark + PC light
  for (const [w, h, scheme] of [[390, 844, 'dark'], [1366, 900, 'light']]) {
    ({ ctx, p } = await open(w, h, scheme, null, '#home'));
    await p.waitForSelector('#festive-theme', { state: 'attached', timeout: 10000 });
    await p.waitForTimeout(400);
    const acc = await accentNow(p);
    const want = await p.evaluate(([x, y, sc]) => App.festive.palette(x, y)[sc]['--accent'], [a1, a2, scheme]);
    ok(acc === want, `${w}${scheme}: accent from the theme (${acc})`);
    const bg = await p.evaluate(() => getComputedStyle(document.body, '::before').backgroundImage);
    ok(/thumbnail\?id=.*sz=w1920/.test(bg), `${w}${scheme}: the picture is behind the page`);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(overflow <= 0, `${w}${scheme}: no horizontal scroll`);
    await p.screenshot({ path: `${out}/visitor-${w}${scheme}.png`, fullPage: false });
    // next visit: painted by the <head> script before app.js runs (no colour flash)
    const seen = await p.evaluate(() => new Promise(res => {
      const f = document.createElement('iframe'); f.src = '/#home'; f.style.cssText = 'position:fixed;width:10px;height:10px;opacity:0';
      f.onload = () => res(true); document.body.appendChild(f);
    }));
    await p.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { window.__early = !!document.getElementById('festive-theme'); }, { capture: true }));
    await p.reload(); await p.waitForTimeout(300);
    ok(seen && await p.evaluate(() => window.__early === true), `${w}${scheme}: next visit — theme there before the page scripts run`);
    ok(p.errs.length === 0, `${w}${scheme}: no console errors ` + JSON.stringify(p.errs));
    if (w === 1366) {
      // admin switches it off; the visitor's copy is old → back to normal, nothing remembered
      const id = P({ action: 'adminThemes', token: admin }).themes.find(x => x.name === 'ตรุษจีน 2570').id;
      P({ action: 'adminSaveTheme', token: admin, theme: Object.assign({}, P({ action: 'adminThemes', token: admin }).themes.find(x => x.id === id), { active: false }) });
      await p.evaluate(() => { const c = JSON.parse(localStorage.getItem('tr_content')); c.at = 0; localStorage.setItem('tr_content', JSON.stringify(c)); });
      await p.reload();
      await p.waitForFunction(() => !document.getElementById('festive-theme'), null, { timeout: 10000 }).catch(() => {});
      ok(!(await p.$('#festive-theme')) && await p.evaluate(() => localStorage.getItem('tr_festive')) === null && (await accentNow(p)) === '#01417b', 'switched off → visitors back to the normal colours');
    }
    await ctx.close();
  }
  await b.close();
})();

const { chromium } = require('../lib/browser');
const { load } = require('../lib/mock');
const out = require('../lib/paths').out(__filename);
const g = load(require('../lib/paths').CODE_GS);
g.ctx.setup();
const URL = 'https://script.google.com/macros/s/TEST/exec';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };

// one finished job, "quoted"
const future = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
const c = g.post({ action: 'createJob', job: { name: 'นิดา', email: 'nida@example.com', langPair: 'th-en', category: 'civil', pages: 2, neededBy: future, consent: true, idConsent: true, files: [{ name: 'a.pdf', size: 5 }], idFiles: [{ name: 'id.jpg', size: 5 }] } });
g.post({ action: 'uploadFile', jobNo: c.jobNo, uploadToken: c.uploadToken, kind: 'doc', name: 'a.pdf', data: 'AAAA' });
g.post({ action: 'uploadFile', jobNo: c.jobNo, uploadToken: c.uploadToken, kind: 'id', name: 'id.jpg', data: 'AAAA' });
g.post({ action: 'finishJob', jobNo: c.jobNo, uploadToken: c.uploadToken });
const J = g.sheets.Jobs, col = h => J.data[0].indexOf(h);
J.data[1][col('สถานะ')] = 'ส่งใบเสนอราคาแล้ว';

(async () => {
  const b = await chromium.launch();
  for (const [w, h, scheme] of [[1366, 900, 'light'], [390, 844, 'light'], [768, 1024, 'dark'], [320, 640, 'dark']]) {
    const errors = [];
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
    await ctx.route('https://script.google.com/macros/s/AKfy**', r => r.abort());   // never reach the live system
    await ctx.route('**/js/config.js*', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()) + `\nwindow.APP_CONFIG.appsScriptUrl = "${URL}";` }); });
    let down = false;
    await ctx.route(URL, async r => {
      if (down) return r.abort('connectionreset');
      const body = JSON.parse(r.request().postData());
      await new Promise(res => setTimeout(res, 150));
      r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(g.post(body)) });
    });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => m.type() === 'error' && !/Failed to load resource|ERR_CONNECTION_RESET/.test(m.text()) && errors.push(m.text()));
    await p.goto('http://localhost:8765/#track');
    await p.click('.lang-toggle [data-lang=th]').catch(() => {});
    await p.evaluate(() => window.App && App.showTab && App.showTab('track'));
    const tag = w + '-' + scheme;

    // wrong email
    await p.fill('#t-jobNo', 'tr-2569-0001'); await p.fill('#t-email', 'wrong@example.com');
    await p.press('#t-email', 'Enter');
    await p.waitForSelector('#track-result.error');
    ok((await p.textContent('#track-result')).includes('ไม่พบงาน'), tag + ' wrong email: not found message');
    await p.evaluate(() => document.querySelector('.lang-toggle [data-lang=en]').click());
    await p.waitForFunction(() => document.documentElement.lang === 'en');
    ok((await p.textContent('#track-result')).includes('No job found'), tag + ' error re-worded in English');
    await p.evaluate(() => document.querySelector('.lang-toggle [data-lang=th]').click());

    // right pair
    await p.fill('#t-email', 'nida@example.com');
    await p.click('#track-form button[type=submit]');
    await p.waitForSelector('#track-card:not([hidden])');
    ok(await p.isHidden('#track-result'), tag + ' message cleared on success');
    ok((await p.textContent('.track-no')) === 'TR-2569-0001' && (await p.textContent('#track-card .status-chip')) === 'ส่งใบเสนอราคาแล้ว', tag + ' card: number + status');
    const cls = await p.$$eval('.track-steps li', l => l.map(x => x.className));
    ok(JSON.stringify(cls) === JSON.stringify(['done', 'current', 'todo', 'todo', 'todo', 'todo']), tag + ' timeline ' + cls.join());
    ok((await p.textContent('.track-next')).includes('ใบเสนอราคา') && (await p.textContent('#track-card .job-meta')).includes('ทะเบียนราษฎร'), tag + ' next step + category text');
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(overflow <= 0, tag + ' no horizontal scroll (' + overflow + ')');
    await p.screenshot({ path: `${out}/track-${tag}.png`, fullPage: false });
    await p.locator('#track-card').screenshot({ path: `${out}/track-card-${tag}.png` });

    // English redraw
    await p.evaluate(() => document.querySelector('.lang-toggle [data-lang=en]').click());
    await p.waitForFunction(() => document.documentElement.lang === 'en');
    ok((await p.textContent('#track-card .status-chip')) === 'Quote sent' && (await p.textContent('.track-help')).includes('Contact us'), tag + ' card redrawn in English');
    await p.evaluate(() => document.querySelector('.lang-toggle [data-lang=th]').click());

    // editing the input hides the old card
    await p.fill('#t-jobNo', 'TR-2569-0002');
    ok(await p.isHidden('#track-card'), tag + ' editing hides the old result');

    if (w === 1366) {
      // delivered + confirmed
      J.data[1][col('สถานะ')] = 'ส่งมอบแล้ว'; J.data[1][col('ส่งมอบเมื่อ')] = new Date(); J.data[1][col('ลูกค้ายืนยันความถูกต้องเมื่อ')] = new Date();
      await p.fill('#t-jobNo', 'TR-2569-0001');
      await p.click('#track-form button[type=submit]');
      await p.waitForSelector('#track-card:not([hidden])');
      const cls2 = await p.$$eval('.track-steps li', l => l.map(x => x.className));
      ok(cls2.every(x => x.startsWith('done')) && (await p.textContent('.track-confirmed')).includes('ยืนยัน'), 'delivered: all steps done + confirmed line');
      await p.locator('#track-card').screenshot({ path: `${out}/track-card-delivered.png` });
      // cancelled
      J.data[1][col('สถานะ')] = 'ยกเลิก';
      await p.click('#track-form button[type=submit]');
      await p.waitForFunction(() => document.querySelector('#track-card .status-chip') && document.querySelector('#track-card .status-chip').textContent === 'ยกเลิก');
      ok(!(await p.$('.track-steps')) && (await p.textContent('.track-next')).includes('ยกเลิก'), 'cancelled: no timeline, note shown');
      // contact link
      await p.click('.track-help .btn-link');
      ok(await p.isVisible('#contact'), 'contact link opens the contact page');
      await p.evaluate(() => App.showTab('track'));
      // network down
      down = true;
      await p.click('#track-form button[type=submit]');
      await p.waitForSelector('#track-result.error');
      ok((await p.textContent('#track-result')).includes('เชื่อมต่อไม่ได้') && await p.isEnabled('#track-form button[type=submit]'), 'network error message, button usable');
      J.data[1][col('สถานะ')] = 'ส่งใบเสนอราคาแล้ว'; J.data[1][col('ส่งมอบเมื่อ')] = ''; J.data[1][col('ลูกค้ายืนยันความถูกต้องเมื่อ')] = '';
    }
    ok(errors.length === 0, tag + ' no console errors ' + JSON.stringify(errors));
    await ctx.close();
  }

  // not connected: still the "coming soon" notice, and it survives a language switch
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.route('**/js/config.js*', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()) + '\nwindow.APP_CONFIG.appsScriptUrl = "";' }); });
  const p = await ctx.newPage();
  await p.goto('http://localhost:8765/#track');
  await p.fill('#t-jobNo', 'TR-2569-0001'); await p.fill('#t-email', 'a@example.com');
  await p.click('#track-form button[type=submit]');
  ok((await p.textContent('#track-result')).includes(await p.evaluate(() => App.t('track.notReady'))), 'not connected: coming-soon notice');
  await b.close();
})();

const { chromium } = require('../lib/browser');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('https://script.google.com/**', r => r.abort());
  const p = await ctx.newPage(); await p.goto('http://localhost:8765/#track');
  for (const [v, good] of [['tr-2569-k7f3qd', true], ['TR-2569-0001', true], ['TR-2569-K7F3QD-X', false], ['TR-25-K7F3QD', false]]) {
    await p.fill('#t-jobNo', v); await p.fill('#t-email', 'a@example.com'); await p.click('#track-form button[type=submit]');
    const err = await p.isVisible('#t-jobNo-err');
    ok(err === !good, `track form ${good ? 'accepts' : 'rejects'} ${v}`);
  }
  ok((await p.getAttribute('#t-jobNo', 'placeholder')) === 'TR-2569-K7F3QD', 'placeholder shows the new format');
  await b.close(); })();

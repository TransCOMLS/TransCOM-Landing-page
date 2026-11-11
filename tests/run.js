#!/usr/bin/env node
// Runs every test suite and prints a summary.   node tests/run.js [name-filter ...]
//   tests/unit/*.js — Code.gs logic against a mocked Google Apps Script (tests/lib/mock.js), no browser
//   tests/e2e/*.js  — the real website in Chromium (Playwright), served locally, Apps Script mocked
// No test reaches the live system: the browser wrapper (tests/lib/browser.js) blocks it, and any attempt
// counts as a failure. Exit code 1 when anything fails.
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const { start } = require('./lib/server');

const filters = process.argv.slice(2);
const port = +(process.env.TEST_PORT || 8765);
const suites = ['unit', 'e2e'].flatMap(dir =>
  fs.readdirSync(path.join(__dirname, dir)).filter(f => f.endsWith('.js')).sort().map(f => dir + '/' + f))
  .filter(s => !filters.length || filters.some(f => s.includes(f)));

(async () => {
  let server = null;
  if (suites.some(s => s.startsWith('e2e/'))) {
    try { server = await start(port); } catch (e) { console.error(`Port ${port} is busy (set TEST_PORT or stop the other server).`); process.exit(2); }
  }
  const rows = []; let failed = 0;
  for (const s of suites) {
    const t0 = Date.now();
    // async child: the test web server lives in this process and must keep answering while the suite runs
    const r = await new Promise(resolve => {
      const c = spawn(process.execPath, [path.join(__dirname, s)], { env: Object.assign({}, process.env, { TEST_PORT: String(port) }) });
      let buf = ''; c.stdout.on('data', d => { buf += d; }); c.stderr.on('data', d => { buf += d; });
      const kill = setTimeout(() => { buf += '\nError: suite timed out after 10 min'; c.kill(); }, 10 * 60 * 1000);
      c.on('close', code => { clearTimeout(kill); resolve({ status: code, out: buf }); });
    });
    const outText = r.out;
    const pass = (outText.match(/^PASS /gm) || []).length, fail = (outText.match(/^FAIL /gm) || []).length;
    const live = (outText.match(/^LIVE-BLOCKED /gm) || []).length;
    const crashed = r.status !== 0 && fail === 0;
    const bad = fail > 0 || live > 0 || crashed || pass === 0;
    if (bad) failed++;
    rows.push([s, pass, fail, live, ((Date.now() - t0) / 1000).toFixed(0) + 's', bad ? (crashed ? 'CRASH' : 'FAIL') : 'ok']);
    console.log(`${bad ? '✗' : '✓'} ${s.padEnd(22)} ${String(pass).padStart(3)} pass  ${String(fail).padStart(2)} fail${live ? `  ${live} live call(s) blocked` : ''}${crashed ? '  (crashed)' : ''}`);
    if (bad) outText.split('\n').filter(l => /^(FAIL|LIVE-BLOCKED)|Error|at .*\.js:\d+/.test(l)).slice(0, 12).forEach(l => console.log('    ' + l));
  }
  if (server) server.close();
  const total = rows.reduce((a, r) => [a[0] + r[1], a[1] + r[2]], [0, 0]);
  console.log(`\n${suites.length} suites, ${total[0]} checks passed, ${total[1]} failed, ${failed} suite(s) not ok.`);
  console.log('Screenshots: tests/out/');
  process.exit(failed ? 1 : 0);
})();

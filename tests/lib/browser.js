// Playwright's chromium, with a safety net: no test may ever reach the live system.
// Every new context/page aborts requests to the live Apps Script web app, Beam's production API and
// the live website. A test's own routes (registered later) still run first, so the mocked TEST URL works.
// Blocked requests are printed as "LIVE-BLOCKED <url>"; tests/run.js reports them as failures.
const pw = require('playwright');

const LIVE = /^https:\/\/(script\.google\.com\/macros\/s\/AKfy|script\.googleusercontent\.com\/|api\.beamcheckout\.com\/|(www\.)?prathaitranslation\.com\/)/;

async function guard(target) {
  await target.route(LIVE, r => { console.log('LIVE-BLOCKED ' + r.request().url().slice(0, 120)); return r.abort(); });
}

const chromium = {
  async launch(opts) {
    const b = await pw.chromium.launch(opts);
    const newContext = b.newContext.bind(b), newPage = b.newPage.bind(b);
    b.newContext = async o => { const c = await newContext(o); await guard(c); return c; };
    b.newPage = async o => { const p = await newPage(o); await guard(p); return p; };
    return b;
  }
};

module.exports = { chromium, devices: pw.devices, LIVE };

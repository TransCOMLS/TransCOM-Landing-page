# Tests

Automated checks for the website and the Apps Script backend. Run them before every release.

```bash
node tests/run.js
```

Run only some suites by giving part of their name, e.g. `node tests/run.js money track`.

## What they cover
- `unit/` — `apps-script/Code.gs` logic run in Node against a mocked Google Apps Script
  (`lib/mock.js`: Sheets, Drive, Mail, Cache, Properties, triggers, Beam API). No browser.
  Sign-in, passwords, jobs, quotes, Beam payments, receipts, refunds, points, coupons, certificates,
  posts, status lookup, `setup()` idempotency.
- `e2e/` — the real website in Chromium (Playwright), served from this folder by `lib/server.js`
  on port 8765, with Apps Script answered by the same mock. Every page at 7 widths in both
  languages, both themes, job form, accounts, dashboards, payment pages, receipts, quotations,
  certification stamp, pop-ups, language switching.

## Safety
No test can reach the live system. `lib/browser.js` aborts every request to the live Apps Script
web app, Beam's production API and www.prathaitranslation.com; the runner reports any such
attempt as a failure ("live call blocked").

## Needs
- Node.js 18+
- Playwright with Chromium (`npm i -D playwright && npx playwright install chromium` on a new
  machine; Claude Code cloud sessions already have it). The website itself still has no npm
  dependencies; Playwright is only for testing.

Screenshots and files the suites write go to `tests/out/` (git-ignored).

## Writing a test
Print one line per check, starting with `PASS ` or `FAIL ` (the runner counts them), set
`process.exitCode = 1` on a failure, use `require('../lib/browser')` instead of `playwright`, and
`require('../lib/paths')` for file paths, so the suite works from any checkout. When a feature
changes on purpose, update the test in the same commit.

---

**ภาษาไทย:** ชุดทดสอบอัตโนมัติของเว็บไซต์และ Apps Script รันด้วยคำสั่ง `node tests/run.js` ก่อนอัปเดตเว็บทุกครั้ง
ผลจะสรุปเป็นรายชุด (✓ ผ่าน / ✗ ไม่ผ่าน) ชุดทดสอบไม่เชื่อมต่อระบบจริงเลย (ใช้ระบบจำลอง) จึงไม่กระทบข้อมูลลูกค้า
อีเมล หรือการชำระเงิน

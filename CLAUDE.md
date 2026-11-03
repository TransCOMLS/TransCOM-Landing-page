# TransCOM — document translation service website

Bilingual (Thai/English) site for a document translation service. Customers learn
about the service, estimate a price and submit a job in one flow on a phone. The
provider manages all jobs from one Google Sheet, with no paid server.

## Tech stack (strict)
- Plain HTML + CSS + vanilla JavaScript. No frameworks, no build step, no npm deps.
- Hosted on GitHub Pages, embedded in Google Sites via "Embed → By URL" (runs in an iframe).
- Backend: Google Apps Script Web App (doPost/doGet) + Google Sheet + Google Drive.
- Font: Google Fonts "Sarabun" — the web version of TH Sarabun New, the owner's chosen Thai
  font — with a sans-serif fallback stack. Do not switch to other display fonts.

## Files
- `index.html` — single page; 12 `.panel` sections in `<main>`: home, services, pricing,
  calculator, submit, track, account, how, faq, contact, privacy, terms. Ids double as `#hash` routes.
  Menu (`.main-nav` in the header): Home · Services & pricing ▾ (services, pricing,
  calculator) · Orders ▾ (how, submit, track) · Help ▾ (faq, privacy, terms) · Contact.
  Items carry `data-tab`; other in-page links use `data-goto`. "My account" is the
  `.account-btn` in the header (≥640px) and a menu item below 1024px.
- `css/style.css` — mobile-first. Breakpoints: phone/tablet (<1024px, menu button opens
  a panel under the header with the groups expanded), header submit button (≥640px),
  calculator 2-column (≥900px), PC (≥1024px, menu in the header bar with dropdowns).
- `js/config.js` — `window.APP_CONFIG`: service name, Apps Script URL, contact,
  language pairs, categories + per-page prices, turnaround, certification fee
  (per job), revision/retention days, upload limits. All editable values live here.
  Category `civil` (civil registration documents, `requiresId: true`) has a lower
  "special rate"; `civilDocuments` lists the 18 documents (TH/EN); `idRetentionDays: 15`.
  Prices are per-page ranges `[min, max]` (a single number also works); use
  `App.priceRange(cat, urgency)` / `App.formatRange(min, max)`, never `cat.normal` directly.
  `shippingFee` (paper copy by post, per job) adds a calculator option and, in the job form,
  a shipping choice with a required delivery address (`f-address`). `contact.showLine:
  false` hides every LINE link (`[data-contact="line"]`) until the owner switches it on.
- `js/i18n.js` — `window.I18N.th` / `.en`, flat keys. Every key must exist in both.
  `{tokens}` are filled from config (`{serviceName}`, `{retentionDays}`, …).
- `js/app.js` — IIFE; exposes `window.App` (`t`, `config`, `getLang`, `showTab`,
  `formatNumber`) and fires `langchange` / `tabchange` events on `document` for
  later phases to hook into. Menu is a disclosure pattern (`aria-expanded`, current page
  `aria-current="page"`); Escape and outside clicks close it. After load it scrolls back
  to the top, since the browser jumps to the `#hash` section.
  Policy pop-up (`<dialog id="policy-dialog">`, content copied from `#privacy` or `#terms`):
  opened by `[data-modal="privacy"|"terms"]` (consent links in the job form) and by
  `data-goto` to those pages while on the submit page, so customers never leave the form.
  Privacy and terms pages have a contents list (`.doc-toc`, built by `buildTocs()`).
- `js/terms.js` — `window.TERMS.th` / `.en`: terms and conditions text (legal; edited by
  the owner — do not reword without being asked). `**bold**` is rendered as <strong>.
- `js/home.js` — home page: instant estimate in the hero (carries into the calculator),
  offers & highlights (`config.promotions`), popular documents (`config.popularDocs`,
  open the calculator), compact steps, news (`config.news`), FAQ teaser, closing CTA.
  When Apps Script is connected, offers/news come from the "Promotions" / "News" sheets
  (action `getContent`, 5-min cache) if they have ticked rows. Only real offers — no
  invented reviews, statistics or discounts. Account offer shows only once connected.
- `js/account.js` — customer accounts (optional; guests can still submit): sign in with a
  6-digit code emailed by Apps Script (no passwords), job history, profile that fills in
  the job form, sign out, delete account (PDPA). Exposes `App.api(action, payload)` and
  `App.account` (`token()`, `profile()`, `isSignedIn()`). Session token in localStorage
  key `tr_session`; if storage is blocked (e.g. some iframes) the sign-in lasts until reload.
- `apps-script/Code.gs` — Web App bound to the Sheet. `doPost` actions: requestCode,
  verifyCode, getAccount, updateProfile, logout, deleteAccount, getContent. Sheets: "Users", "Jobs",
  "Promotions", "News"
  (columns defined in `JOB_COLS`, written by Phase 3), hidden "_sessions". Codes live in
  CacheService (10 min, 5 tries, 1/min, 5/hour); codes and tokens are stored only as
  salted SHA-256; customer text is escaped against Sheets formulas. Run `setup()` once.
- `img/logo.svg` (header, on white) and `img/logo-white.svg` (footer, on `--footer-bg`):
  the owner's logo, cropped to its content. Colours `#01417b` / `#006192` set `--accent`
  and `--accent-bright`.
- `README.md` in Thai (Phase 4).

## Conventions
- Text goes in `i18n.js` and is bound with `data-i18n`, `data-i18n-placeholder`,
  `data-i18n-aria`. No hard-coded UI text in HTML or JS.
- Inside the Google Sites iframe: external links (incl. `tel:`, `mailto:`, LINE)
  use `target="_blank"`; navigation is in-page only; forms always `preventDefault`.
- Device priority (owner's choice): 1. PC  2. phone  3. tablet. Design and review PC
  first, then phone, then tablet. CSS stays mobile-first in code (base = phone, PC in
  `min-width` queries); that is a coding technique, not the design priority.
- Must work from 320px wide with no horizontal scroll, on tablet and on PC.
  Tap targets ≥44px. One primary button per section. White background, navy accent
  (`--accent` in `style.css`).
- `localStorage` only via the try/catch helpers in `app.js` (`App.storage`; keys `tr_lang`,
  `tr_session`).
- Thai copy: formal but concise; years in Thai text use พ.ศ. (job no. `TR-2569-0001`).
- Placeholders in `[brackets]` in config.js are filled in by the owner — keep them.

## Status / phases
- [x] Phase 1 — static content, tabs, TH/EN toggle, pricing from config (merged, PR #1)
- [x] Responsive tablet + PC layout
- [x] Phase 2 — price calculator logic + client-side form validation (TH/EN errors;
      file types PDF/JPG/PNG/DOCX, ≤10 MB each, multiple; PDPA consent required;
      needed-by date not in the past). Field ids: `f-*` with `f-*-err` error slots.
      Submit fires a cancelable `jobsubmit` event (detail = `App.getJobData()`, incl.
      `files` as File objects); track form fires `tracksubmit`. Phase 3/4 hook these and
      call `preventDefault()`; otherwise a "not open yet" notice is shown.
- [x] Accounts (owner's request between phases) — see `js/account.js` / `Code.gs` above.
- [x] Civil registration documents (owner's request): special-rate category `civil`;
      the job form then requires ID files (`f-idFiles`, separate picker) and an
      acknowledgement (`f-idConsent`); notice that all data for the job, incl. the ID copy,
      is deleted within 15 days of the customer confirming the translation is correct.
      `jobsubmit` detail has `requiresId`, `idFiles`, `idConsent`.
- [ ] Phase 3 — `apps-script/Code.gs`: doPost action "submitJob" (base64 files → Drive folder per job,
      row in "Jobs" sheet, running job no. `TR-<พ.ศ.>-0001`), setup(), status dropdown
      with colours, emails via MailApp (provider, customer receipt, status change via
      installable onEdit trigger); connect the form. Civil jobs: store ID files in the job
      folder, fill "แนบบัตร (ทะเบียนราษฎร)"; add a customer "translation is correct" step
      that sets "ลูกค้ายืนยันความถูกต้องเมื่อ" + "กำหนดลบข้อมูล" (+15 days), and a daily
      time-driven trigger that deletes the Drive folder and personal data when due.
- [ ] Phase 4 — doGet status lookup (job no. + email, status only), "Dashboard" and
      "Glossary" sheets, Thai README with deployment steps (GitHub Pages, Apps Script
      Web App "Anyone", Google Sites embed).

The owner asked to stop after each phase and show the result before continuing.

## Testing
No build or test runner. Serve the folder (`python3 -m http.server`) and check every
page in priority order — PC 1366, 1920, 1280, 1024; phone 390, 320; tablet 768 — in both languages: no horizontal scroll, no
console errors, `node --check js/*.js` passes, and i18n keys match between th/en.

## Artifacts copy
The owner keeps a matching preview copy on claude.ai: https://claude.ai/artifact/WrtJLSJG77T717XyWkqMrF
After each phase, republish it with the Artifact tool, passing that URL as `url` (read it first).
Publish `index.html` with its `<!DOCTYPE>`, `<html>`, `<head>`/`<body>` tags and the charset/viewport
metas removed (title, font links and the stylesheet link stay), plus `css/style.css`, the six
`js/*.js` files (config, i18n, terms, app, account, home) and the two `img/*.svg` logos under the same paths via `files`. Add `.site-header { top: env(safe-area-inset-top, 0px); }`
inline for that copy only.

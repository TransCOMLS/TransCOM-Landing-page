# TransCOM — document translation service website

Bilingual (Thai/English) site for a document translation service. Customers learn
about the service, estimate a price and submit a job in one flow on a phone. The
provider manages all jobs from one Google Sheet, with no paid server.

## Tech stack (strict)
- Plain HTML + CSS + vanilla JavaScript. No frameworks, no build step, no npm deps.
- Hosted on GitHub Pages, embedded in Google Sites via "Embed → By URL" (runs in an iframe).
- Backend: Google Apps Script Web App (doPost/doGet) + Google Sheet + Google Drive.
- Font: Google Fonts "Sarabun" with a sans-serif fallback stack.

## Files
- `index.html` — single page; 10 tab panels: home, services, pricing, calculator,
  submit, track, how, faq, contact, privacy. Tab ids double as `#hash` routes.
- `css/style.css` — mobile-first. Breakpoints: phone (<640px, sticky scrolling tab
  strip), tablet (≥640px, wrapped tab rows), calculator 2-column (≥900px),
  PC (≥1024px, left sidebar menu, `.layout` grid).
- `js/config.js` — `window.APP_CONFIG`: service name, Apps Script URL, contact,
  language pairs, categories + per-page prices, turnaround, certification fee
  (per job), revision/retention days, upload limits. All editable values live here.
- `js/i18n.js` — `window.I18N.th` / `.en`, flat keys. Every key must exist in both.
  `{tokens}` are filled from config (`{serviceName}`, `{retentionDays}`, …).
- `js/app.js` — IIFE; exposes `window.App` (`t`, `config`, `getLang`, `showTab`,
  `formatNumber`) and fires `langchange` / `tabchange` events on `document` for
  later phases to hook into.
- `apps-script/Code.gs` (Phase 3), `README.md` in Thai (Phase 4).

## Conventions
- Text goes in `i18n.js` and is bound with `data-i18n`, `data-i18n-placeholder`,
  `data-i18n-aria`. No hard-coded UI text in HTML or JS.
- Inside the Google Sites iframe: external links (incl. `tel:`, `mailto:`, LINE)
  use `target="_blank"`; navigation is in-page only; forms always `preventDefault`.
- Must work from 320px wide with no horizontal scroll, on tablet and on PC.
  Tap targets ≥44px. One primary button per section. White background, navy accent
  (`--accent` in `style.css`).
- `localStorage` only via the try/catch helpers in `app.js` (key `tr_lang`).
- Thai copy: formal but concise; years in Thai text use พ.ศ. (job no. `TR-2569-0001`).
- Placeholders in `[brackets]` in config.js are filled in by the owner — keep them.

## Status / phases
- [x] Phase 1 — static content, tabs, TH/EN toggle, pricing from config (merged, PR #1)
- [x] Responsive tablet + PC layout
- [ ] Phase 2 — price calculator logic + client-side form validation (TH/EN errors;
      file types PDF/JPG/PNG/DOCX, ≤10 MB each, multiple; PDPA consent required;
      needed-by date not in the past). Field ids: `f-*` with `f-*-err` error slots.
- [ ] Phase 3 — `apps-script/Code.gs`: doPost (base64 files → Drive folder per job,
      row in "Jobs" sheet, running job no. `TR-<พ.ศ.>-0001`), setup(), status dropdown
      with colours, emails via MailApp (provider, customer receipt, status change via
      installable onEdit trigger); connect the form.
- [ ] Phase 4 — doGet status lookup (job no. + email, status only), "Dashboard" and
      "Glossary" sheets, Thai README with deployment steps (GitHub Pages, Apps Script
      Web App "Anyone", Google Sites embed).

The owner asked to stop after each phase and show the result before continuing.

## Testing
No build or test runner. Serve the folder (`python3 -m http.server`) and check every
tab at 320, 390, 768, 1024 and 1280px in both languages: no horizontal scroll, no
console errors, `node --check js/*.js` passes, and i18n keys match between th/en.

## Artifacts copy
The owner keeps a matching preview copy on claude.ai: https://claude.ai/artifact/WrtJLSJG77T717XyWkqMrF
After each phase, republish it with the Artifact tool, passing that URL as `url` (read it first).
Publish `index.html` with its `<!DOCTYPE>`, `<html>`, `<head>`/`<body>` tags and the charset/viewport
metas removed (title, font links and the stylesheet link stay), plus `css/style.css` and the three
`js/*.js` files under the same paths via `files`. Add `.site-header { top: env(safe-area-inset-top, 0px); }`
inline for that copy only.

# TransCOM — document translation service website

Bilingual (Thai/English) site for a document translation service. Customers learn
about the service, estimate a price and submit a job in one flow on a phone. The
provider manages all jobs from one Google Sheet, with no paid server.

## Tech stack (strict)
- Plain HTML + CSS + vanilla JavaScript. No frameworks, no build step, no npm deps.
- Hosted on GitHub Pages (public repo, `main` / root) at https://www.prathaitranslation.com
  (DNS at Cloudflare, "DNS only"). Google Sites embedding was dropped on 2026-11-06 so the
  address bar follows the `#hash` page; the code still works inside an iframe.
- Backend: Google Apps Script Web App (doPost/doGet) + Google Sheet + Google Drive.
- Font: Google Fonts "Sarabun" — the web version of TH Sarabun New, the owner's chosen Thai
  font — with a sans-serif fallback stack. Do not switch to other display fonts.

## Files
- `index.html` — CSS/JS links carry `?v=<date+letter>` (cache-busting: GitHub Pages lets browsers keep
  files ~10 min) — **bump it on every release** or customers keep running old JS.
  Single page; 13 `.panel` sections in `<main>`: home, services, pricing,
  calculator, news, submit, track, account, how, faq, contact, privacy, terms. Ids double as `#hash` routes.
  Menu (`.main-nav` in the header): Home · Services & pricing ▾ (services, pricing,
  calculator, news) · Orders ▾ (how, submit, track) · Help ▾ (faq, privacy, terms) · Contact.
  Items carry `data-tab`; other in-page links use `data-goto`. "My account" is the
  `.account-btn` in the header (≥640px) and a menu item below 1024px.
- `css/style.css` — mobile-first. All colours are tokens on `:root` (light) and
  `:root[data-theme="dark"]` (+ a `prefers-color-scheme` fallback when JS is off); never
  hard-code colours in components — only white text on the always-dark hero, footer, CTA
  band and post covers. Page background = `--page-grad` (logo-blue washes) + `--waves`
  (faint wave lines like the logo); cards/fields/menus use `--surface`. Breakpoints: phone/tablet (<1024px, menu button opens
  a panel under the header; groups are an accordion — one open at a time, starting with the
  current page's group), header submit button (≥640px),
  calculator 2-column (≥900px), PC (≥1024px, menu in the header bar with dropdowns).
- `js/config.js` — `window.APP_CONFIG`: service name, Apps Script URL, contact,
  language pairs, categories + per-page prices, turnaround, certification fee
  (per job), revision/retention days, upload limits. All editable values live here.
  Category `civil` (civil registration documents, `requiresId: true`) has a lower
  "special rate"; `civilDocuments` lists the 18 documents (TH/EN); `idRetentionDays: 15`.
  Prices are per-page ranges `[min, max]` (a single number also works); use
  `App.priceRange(cat, urgency)` / `App.formatRange(min, max)`, never `cat.normal` directly.
  `shippingFee` (paper copy by post, per job) adds a calculator option and, in the job form,
  a shipping choice with a required delivery address (`f-address`). LINE OA `@transcomls`
  is on (`contact.showLine: true`); `false` hides every LINE link (`[data-contact="line"]`).
- `js/i18n.js` — `window.I18N.th` / `.en`, flat keys. Every key must exist in both.
  `{tokens}` are filled from config (`{serviceName}`, `{retentionDays}`, …).
- `js/app.js` — IIFE; exposes `window.App` (`t`, `config`, `getLang`, `showTab`,
  `formatNumber`) and fires `langchange` / `tabchange` events on `document` for
  later phases to hook into. Menu is a disclosure pattern (`aria-expanded`, current page
  `aria-current="page"`); Escape and outside clicks close it. After load it scrolls back
  to the top, since the browser jumps to the `#hash` section.
  Theme: Auto (follows the device, live) · Light · Dark. Header `.theme-btn` (≥640px) cycles
  them; the phone/tablet menu has `.theme-seg`. Choice saved in `tr_theme` (removed for Auto).
  A small inline script in `<head>` sets `data-theme` before first paint (no white flash).
  Dark mode shows `img/logo-white.svg` in the header.
  Switching by hand plays a circle reveal from the pressed button (View Transitions,
  550ms; skipped when the colours would not change); the device switching on Auto, or a
  browser without View Transitions, gets a 0.45s colour fade (`.theme-anim`). Reduced
  motion: instant.
  Page switches play a short fade-and-rise (`.panel-enter`, 0.28s; not on first load,
  off under prefers-reduced-motion; fill-mode `backwards` so no transform is left behind).
  Policy pop-up (`<dialog id="policy-dialog">`, content copied from `#privacy` or `#terms`):
  opened by `[data-modal="privacy"|"terms"]` (consent links in the job form) and by
  `data-goto` to those pages while on the submit page, so customers never leave the form.
  Privacy and terms pages have a contents list (`.doc-toc`, built by `buildTocs()`).
  `App.busy` (`<dialog id="busy-dialog">`): pop-up while sending the job form or uploading
  translations — spinner + step + progress + "don't close, large files take a moment"; Escape is
  ignored and leaving the page asks first; `done()` shows a tick, then it closes by itself
  (owner's choice, ~1.8 s); `close()` on errors (the form keeps its data).
- `js/terms.js` — `window.TERMS.th` / `.en`: terms and conditions text (legal; edited by
  the owner — do not reword without being asked). `**bold**` is rendered as <strong>.
  Source: the owner's Claude doc "ข้อกำหนดและเงื่อนไขการรับบริการ TransCOM",
  https://claude.ai/artifact/WPowapbhHQNouryR3mHDZB (since 2026-11-05 terms.js has LINE removed,
  at the owner's request; the doc may still mention it). Numbers are written out ("เจ็ด (7)") and
  do NOT follow config.js — if a policy number changes (retention, revision days, refunds),
  change the doc, terms.js and the privacy text in i18n.js together. Thai version prevails (9.6).
- `js/home.js` — home page: instant estimate in the hero (carries into the calculator),
  offers & highlights (`config.promotions`), popular documents (`config.popularDocs`,
  open the calculator), compact steps, FAQ teaser, closing CTA. Also the News page
  (`config.news`): square posts (owner's https image, or a generated navy cover with the
  title) that open `#post-dialog`, which always shows the post picture (beside the text on ≥768px).
  Each post has `active` (true = shown, false = draft); the owner picks what goes live.
  The News menu item is always shown; with no active posts the page shows an empty message.
  When Apps Script is connected, offers/news come from the "Promotions" / "News" sheets
  (action `getContent`, 5-min cache) if they have ticked rows. Only real offers — no
  invented reviews, statistics or discounts. Account offer shows only once connected.
- `js/submit.js` — Phase 3: sends the job form (`jobsubmit`) to Apps Script as createJob →
  uploadFile (one request per file, base64) → finishJob, with a progress bar. A dropped
  connection keeps the form; pressing Submit again resumes the same job and only sends the
  missing files. Duplicate file names get " (2)". Success panel shows the job number (copy
  button), fills the track form, fires `jobsubmitted` (account history reloads). Honeypot
  field `#f-website`. Inactive while `appsScriptUrl` is empty (app.js "not open yet" notice).
- `js/track.js` — Phase 4: hooks `tracksubmit`, calls action `trackJob`, shows `#track-card`
  (job no., status chip, 6-step timeline received → quoted → paid → inProgress → review → delivered —
  vertical on phone, a row ≥640px; cancelled = note only; unknown status = `other`), next-step
  note, dates, contact link. Redraws on `langchange`; editing an input hides the old card;
  signed-in customers get their email filled in.
- `js/portal.js` — Phase 5: the signed-in dashboard in `#account` (`.dash`: sidebar `#dash-nav` +
  `#dash-view`; `#dash-settings` holds account.js's profile/manage cards). Menu and views per
  `profile.role`: customer (overview, orders open/closed/cancel, job detail + translated-file
  download + cancel request, quotes/payment = "coming soon" until Phase 6, settings), staff
  (assigned jobs, job detail without customer contacts, source download, translation upload,
  start / ready, internal notes), admin (overview stats + bars, all jobs search/filter, job
  detail: assign, status, cancel approve/reject, notes, files; users & roles; discounts). Listens
  to `accountchange` from account.js. New accounts without a name open on the profile view.
  Customers are never told who translated. Sidebar on ≥1024px; a scrollable chip row below.
- `js/account.js` — customer accounts (optional; guests can still submit): sign in with a
  6-digit code emailed by Apps Script; after that an optional password (`login`; form remembers
  password mode in `tr_login`) and a verified backup email (security card `#acct-security` in
  settings; overview nudges until one is set). No SMS (owner: only if free — it isn't). Job history, profile that fills in
  the job form, sign out, delete account (PDPA). Exposes `App.api(action, payload)` and
  `App.account` (`token()`, `profile()`, `isSignedIn()`). Session token in localStorage
  key `tr_session`; if storage is blocked (e.g. some iframes) the sign-in lasts until reload.
- `apps-script/Code.gs` — Web App bound to the Sheet. `doPost` actions: requestCode,
  verifyCode, getAccount, updateProfile, logout, deleteAccount, getContent, createJob,
  uploadFile, finishJob, trackJob (job no. + email → status and dates only; one generic
  `not_found` for wrong pair / unfinished / purged; 30 lookups/email/hour + 300 failed/hour overall);
  Phase 5: myJob, jobFile (base64 download, checked per role), requestCancel, staffJobs, staffJob,
  uploadTranslation, deleteTranslation, staffUpdate (start / ready / note), adminOverview,
  adminJobs, adminJob, adminUpdateJob (assignee, status via setStatus_ → afterStatus_ = same
  emails as onJobEdit, cancel approve/reject, note), adminUsers, adminSetUser, adminDiscounts,
  adminSaveDiscounts; visit (counter: Script Properties `VISITS_TOTAL` + `VISITS_<yyyy-MM-dd>`, shown in
  adminOverview `visits`), checkCoupon (for Phase 6 quotes), adminCoupons / adminSaveCoupon / adminDeleteCoupon
  ("Coupons" sheet: code, % or THB, max discount, min spend, start/end, maxUses, perUser, membersOnly;
  "CouponUses" log counts uses), adminPosts / adminSavePost / adminDeletePost (News/Promotions rows get a
  "รหัสโพสต์" id; clear the content cache), adminUploadImage (≤5 MB image into the public Drive folder
  `IMAGES_FOLDER_ID`, shared anyone-with-link; `sharing_blocked` if Workspace forbids it); login, setPassword,
  removePassword, requestBackupCode, verifyBackupCode, removeBackupEmail, adminChangeEmail (owner's request
  2026-11-06). Passwords: Users "รหัสผ่าน (เข้ารหัส — ห้ามแก้)" = `v1$rounds$salt$hex` iterated HMAC-SHA256 with
  the PEPPER; one generic `login_invalid`; 5 misses/email/15 min → `password_locked`. Changing needs the
  current password unless the session came from an emailed code in the last 15 min (`fresh`, cache) —
  Forgot password is its own flow: requestCode `purpose: 'reset'` (own email wording) →
  verifyResetCode (no session; a 15-min reset token) → resetPassword (new password required, ends every
  session, then signs in). Reset and sign-in codes can't be swapped. Setting a password signs out other sessions. A verified
  `backupEmail` can receive sign-in codes and log in (`userByLogin_`). adminChangeEmail moves Users,
  Jobs (+ note) and CouponUses to the new email, ends sessions, emails both. Security notices:
  `securityMail_`. Roles: Users "บทบาท" (ROLES), bootstrap admins = provider email, script
  owner, Script Property ADMIN_EMAILS (`need_(req, roles)` checks every call). Customer types in
  "ประเภทลูกค้า" (CUSTOMER_TYPES); "Discounts" sheet (type % + tiers by spend) for Phase 6 quotes.
  Jobs gain assignee, readyAt, cancelRequest, internalNotes (log). Translations go to subfolder
  `งานแปล (ส่งลูกค้า)`. setup() adds missing columns to existing sheets (`addMissingColumns_`).
  `CATEGORY_NAMES` maps category codes to TH/EN names (emails, Dashboard) — keep in step with config. `doGet?confirm=<jobNo>&t=<token>` = "translation is correct" page.
  Jobs: number `TR-<BE year>-<6 random chars>` (e.g. `TR-2569-K7F3QD`; no 0/O/1/I/L; checked unique against
  Jobs; owner 2026-11-09: running numbers were guessable; old `TR-2569-0001` still valid); files in a Drive folder
  per job under `JOBS_FOLDER_ID` (ID files in a subfolder); server re-checks every field,
  file type/size, max 10 files, 5 jobs/email/hour; upload state in CacheService (6 h).
  Emails: all use `mailLayout_()` — table-based, inline styles, header picture
  `img/email/header.jpg` served from the live site (`CONFIG.siteUrl`; must be on `main`), status
  badge, 6-step progress (`mailSteps_`), details table, one button, navy footer with contacts
  (`CONFIG.contactPhone/lineId/contactEmail` — keep in step with js/config.js). Language pairs and
  categories show as names (`LANG_PAIR_NAMES`, `CATEGORY_NAMES`). Customer receipt + provider notice (`PROVIDER_EMAIL` or the script owner);
  installable `onJobEdit` emails the customer on each status change (delivered → sets
  deliveredAt, deleteBy +90 d). Status `review` "รอลูกค้าตรวจ" (owner's request 2026-11-06): the
  email links to the job page (`jobUrl_` = `/?job=TR-…#account`; portal.js opens it after sign-in,
  then clears the query); the customer downloads the files and either confirms
  (`confirmTranslation` → confirm_ → delivered + confirmedAt) or asks for corrections
  (`requestRevision` → back to inProgress, `revisionRequest` column, admin + assignee emailed).
  Emails never carry a one-click confirm any more; old `?confirm=` links still work.
  No cancelling once paid: customers may request it only at received/quoted; reaching paid or later
  closes a pending request (afterStatus_), and approving is refused at review/delivered (owner: anti-fraud). Confirming a civil job moves
  deleteBy to +15 d; daily `purgeDueJobs` trashes the folder and clears personal columns.
  `setup()` creates sheets, the jobs folder and both triggers (idempotent), rebuilds the
  formula-only "Dashboard" (columns found by header with MATCH) and seeds "Glossary" once. Sheets: "Users", "Jobs",
  "Promotions", "News" (incl. picture link — Drive share links are turned into image links)
  (columns defined in `JOB_COLS`, written by Phase 3), hidden "_sessions". Codes live in
  CacheService (10 min, 5 tries, 1/min, 5/hour); codes and tokens are stored only as
  salted SHA-256; customer text is escaped against Sheets formulas. Run `setup()` once.
- SEO: `<head>` has title/description, canonical, icons (`img/favicon-32.png`, `icon-192.png`, `icon-512.png`,
  `apple-touch-icon.png`), Open Graph/Twitter (`img/og-image.jpg` 1200×630) and JSON-LD `ProfessionalService`
  (keep it in step with contact details in config.js); `robots.txt` + `sitemap.xml` at the root.
  Footer visitor pill `#visit-count` (home.js `loadVisits`, once per device per day via `tr_visit`;
  `config.showVisitorCount`). Admin dashboard also has "โค้ดส่วนลด" (`a-coupons`) and "ประชาสัมพันธ์"
  (`a-posts`, news/promo tabs, picture upload) views in portal.js.
- `img/logo.svg` (header, on white) and `img/logo-white.svg` (footer, on `--footer-bg`):
  the owner's logo, cropped to its content. Colours `#01417b` / `#006192` set `--accent`
  and `--accent-bright`.
- `README.md` — Thai setup guide for the owner: Drive folders, Sheet + Apps Script setup, Web App
  deployment, daily use of the News/Promotions sheets, updating, GitHub Pages + Cloudflare domain, leaving Google Sites. Keep
  it in step when sheets, columns or config keys change (Phase 4 adds the status-lookup parts).

## Conventions
- Text goes in `i18n.js` and is bound with `data-i18n`, `data-i18n-placeholder`,
  `data-i18n-aria`. No hard-coded UI text in HTML or JS.
- External links (the site may still be framed): (incl. `tel:`, `mailto:`, LINE)
  use `target="_blank"`; navigation is in-page only; forms always `preventDefault`.
- Device priority (owner's choice): 1. PC  2. phone  3. tablet. Design and review PC
  first, then phone, then tablet. CSS stays mobile-first in code (base = phone, PC in
  `min-width` queries); that is a coding technique, not the design priority.
- Must work from 320px wide with no horizontal scroll, on tablet and on PC.
  Tap targets ≥44px. One primary button per section. Light page = soft logo-blue gradient
  with white cards; navy accent (`--accent`). Check both themes when changing styles.
- `localStorage` only via the try/catch helpers in `app.js` (`App.storage`; keys `tr_lang`,
  `tr_session`, `tr_theme`, `tr_visit`, `tr_login`; speed caches `tr_content` (last getContent),
  `tr_visits` (last count), `tr_account` (last profile + jobs, tagged with the token, removed on sign-out)) — plus the try/catch theme read in the `<head>` script.
- Thai copy: formal but concise; years in Thai text use พ.ศ. (job no. `TR-2569-K7F3QD`).
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
- [x] Phase 3 — job submission end to end (see `js/submit.js` and `Code.gs` above).
- [x] Phase 4 — status lookup (POST action `trackJob`, so the email stays out of URLs;
      job no. + email, status only) with the `js/track.js` card, "Dashboard" and "Glossary"
      sheets, README sections 5.1.1, 5.5, 5.6. Built before the owner deployed Phase 3.
- [x] Phase 5 — role dashboards (owner's request 2026-11-06): customer · staff (incl. translators)
      · admin, managed on the website; discount settings stored for Phase 6. Owner's choices:
      no wallet / top-up, translators never named to customers, "pay" + "payment history" in one
      Payment group, admin manages nearly everything on the web.
- [ ] Phase 6 — finance (owner's decisions, 2026-11-04). Build after Phase 5, all switchable
      in config and managed from the Sheet:
      - Not VAT-registered: issue **electronic receipts** (ใบเสร็จรับเงิน). Tax invoices
        (full + abbreviated) are built but **off** until VAT registration (illegal to issue
        before; e-Tax Invoice by Email needs Revenue Department sign-up). Owner to confirm
        details with their accountant.
      - Payment: PromptPay QR (amount filled in) and bank transfer — domestic and
        international (SWIFT details) — with the customer uploading the transfer slip;
        provider confirms in the Sheet. No payment gateway for now.
      - Quotes per job (Quotes sheet), payment records, receipts with running numbers.
      - Members only: discount codes (Coupons sheet: code, % or THB, min spend, dates,
        uses) and loyalty points by amount spent (e.g. 1 point per 100 THB, redeem as a
        discount; rates in config). Guests can still get quotes, pay and get receipts.
      - Apply the Discounts sheet (customer type % / spend tiers, higher one wins) on quotes;
        fill the dashboard's Quotes, Pay and Payment history views.

The owner asked to stop after each phase and show the result before continuing.

## Speed (rough pass 2026-11-07; a fuller pass is planned)
- `terms.js` and `portal.js` are not in `index.html`: `App.loadScript()` fetches terms for the terms page / pop-up or
  1.5 s after load, and the dashboard for signed-in people or the account page (portal.js catches up via
  `App.account` if `accountchange` already fired). Logos are rounded to 1 decimal (same look, ~45% smaller).
- Offers/news, the visitor count and the signed-in account show the last copy at once, then the fresh one.
- Code.gs caches checked sign-ins (`sess:<hash>`, 10 min; `dropSessions_` forgets them) and roles (`role:<email>`,
  5 min; `forgetRole_` on admin changes). A role typed straight into the sheet takes up to 5 min.

## Testing
No build or test runner. Serve the folder (`python3 -m http.server`) and check every
page in priority order — PC 1366, 1920, 1280, 1024; phone 390, 320; tablet 768 — in both languages: no horizontal scroll, no
console errors, `node --check js/*.js` passes, and i18n keys match between th/en.

## Artifacts copy
The owner keeps a matching preview copy on claude.ai: https://claude.ai/artifact/WrtJLSJG77T717XyWkqMrF
After each phase, republish it with the Artifact tool, passing that URL as `url` (read it first).
Publish `index.html` with its `<!DOCTYPE>`, `<html>`, `<head>`/`<body>` tags and the charset/viewport
metas removed (title, font links, the stylesheet link and the theme script stay), plus `css/style.css`, the nine
`js/*.js` files (config, i18n, terms, app, account, submit, track, portal, home) and the two `img/*.svg` logos under the same paths via `files`. Add `.site-header { top: env(safe-area-inset-top, 0px); }`
inline for that copy only.

# Lekto — Status & Handoff

Last updated: 2026-11-24
Build / checks: Pending CI/Node run after Clean Proof design system overhaul (Node.js not installed in local Windows workspace; mechanical i18n/JSON/HTML/JS/CSS checks verified).

Read `CLAUDE.md`, `DESIGN.md`, and `docs/design.md` alongside this file for product scope, stack rules, and UI conventions.

---

## 1. What Was Built Recently

### 1.1 Spaced Repetition & Exam Countdown Daily Plan
- **Files**: `src/app/plan.js`, `src/app/app.js`, `src/i18n/sk.json`, `src/i18n/cs.json`, `test/plan.test.mjs`
- **How it works**:
  - `memoryStates(log)` replays the existing append-only answer log (`k: "b"` base, `k: "a"` answer, `k: "r"` reset) in time order with no DB schema changes.
  - `questionStats(qs, log)` classifies questions into `ok`, `bad`, `overdue`, `fresh`, `reviewDue` (`bad + overdue`), and `pct`.
  - `dueRound(qs, log, { limit, topicOrder })` orders a round as: wrong -> overdue (oldest due first) -> unseen -> upcoming known. When past exam rankings exist (`examTopicOrder(sj)`), higher-yield exam topics lead within each bucket.
  - `dailyPlan(qs, log, examIso, { roundSize })` paces unseen questions across calendar days left until `sj.exam` (`daysTo`) and drives the `#today` hero card copy + round size.
- **Known shortcut**: `memoryStates` uses a geometric interval schedule (`1d -> 3d -> *2.2`, max `90d`) from binary right/wrong timestamps instead of full FSRS ratings; upgrade only if graded recall buttons are added.

### 1.2 Empty-State Upload Button on Today
- **Files**: `src/app/app.js` (`emptyState(clickableArt = false)`), `src/styles/app.css`
- **How it works**: On `#today` when there are no subjects, the upload icon circle (`.empty-art`) renders as `<button class="btn empty-art" aria-label="...">` wired to `openUpload()`, while `#home` keeps the non-interactive icon.

### 1.3 8-Digit Email OTP Input
- **Files**: `index.html` (`#upCode`), `src/i18n/sk.json`, `src/i18n/cs.json`
- **How it works**: Updated `#upCode` `placeholder="12345678"` and `upload.codeHint` copy in SK/CS to match Supabase's 8-digit verification code.

### 1.4 Per-File "Kontext" Upload Marking + Click/Hover Tooltip
- **Files**: `ai/tasks.js`, `server/generate.js`, `src/upload/pipeline.js`, `src/upload/exams.js`, `src/upload/ui.js`, `src/app/app.js`, `src/styles/app.css`, `index.html`, `src/i18n/sk.json`, `src/i18n/cs.json`, `test/server.test.mjs`
- **How it works**:
  - In `src/upload/ui.js`, `picked` stores `{ file: File, context: boolean }`. Each row in `#upList` gets a `Kontext` toggle button (`.tiny.up-ctx[aria-pressed]`, with `data-tip` hover tooltip) and a shared `#upCtxWrap` / `#upCtxTip` / `#upCtxPop` click/hover explainer below the file list.
  - In `src/upload/pipeline.js`, `buildSubject()` processes `context: true` files first: runs `vision` only on text-less image pages, skips `summary`, `quiz`, `check`, and `topics` AI work, saves `{ context: true, text, summary: "", keyTerms: [], pagesAfter: 0 }`, and feeds `contextOf([...existing.files, ...files])` (capped at `CONTEXT_MAX = 24_000` chars) into `summary`, `quiz`, and `check` calls for non-context files—and into `readExams` (`src/upload/exams.js`) for past exams.
  - If all picked files are marked `context`, `#upMakeBox` hides and the submit button allows saving context-only files into a subject.
  - `server/generate.js` validates optional `input.context` (`MAX_CONTEXT = 30_000` chars) and passes it to `debloatPrompt`, `quizPrompt`, `checkPrompt`, and `pastExamPrompt` (`<context>...</context>` block in `ai/tasks.js`). Since `cacheKey()` hashes `req.prompt`, context changes bust `ai_cache` automatically.
  - In `src/app/app.js`, `route()`, `summaries()`, `renderFiles()`, and `showReader()` allow opening context files directly (`file.context && file.text`) so students can view their raw extracted reference text.
- **Deployment note**: Because `ai/tasks.js` and `server/generate.js` changed, run `npm run fn:prepare` and redeploy the Supabase `generate` Edge Function before using `context` against production Supabase (see `.github/workflows/server.yml`).

### 1.5 Highlight & Scroll to Source Passage from Quiz ("Pozrieť v zhrnutí")
- **Files**: `src/app/md.js`, `src/app/app.js`, `src/styles/app.css`, `test/md.test.mjs`
- **How it works**:
  - Clicking `#openSrc` on the wrong/unsure quiz feedback bar strips trailing ` (File.pdf, s. 2)` from `x.s`, stores transient module state `readerHint = { fi, quote, extras: [x.e, x.q, ...correctOptions] }`, and navigates to `#<subject>/read/<fi>`.
  - Opening a summary directly from `#files` resets `readerHint = null` so normal reading stays unhighlighted.
  - `matchSummaryBlock(blocks, { quote, extras })` (`src/app/md.js`) first tries a case- and diacritic-insensitive exact substring match against `quote` (min 6 chars); if paraphrased, it falls back to weighted word-stem overlap (`3x` quote stems, `1x` extras stems; threshold `>= 3`).
  - `highlightMatch(el, phrase)` adds `.hl-block` to the matched `<p>`/`<li>` and walks all `Text` nodes via `TreeWalker` with a normalized-char-to-code-unit map so exact phrases wrap in `<mark class="hl">` even across inline `<strong>` tags—without using `innerHTML`.
  - In `route()` (`src/app/app.js`), scrolling to `readerFocus` runs in `requestAnimationFrame` *after* `window.scrollTo(0, y)` so route scroll restoration never overwrites it.
  - Styled with `--warn` / `--warn-soft` tokens so it adapts across all 6 looks and light/dark themes.

### 1.6 Reduced "AI" Copy, Site Polish & Zero-AI Ephemeral Wrong-Question Summary
- **Files**: `src/app/md.js`, `src/app/app.js`, `src/app/icons.js`, `src/styles/app.css`, `index.html`, `src/i18n/{sk,cs}.json`, `test/md.test.mjs`
- **How it works**:
  - Removed casual "AI" mentions from `study.contextPages`, `study.pictures`, `upload.contextHint`, `upload.consentLabel`, and `upload.err.{bad_reply,ai_busy,refused}` in both `sk.json` and `cs.json` (preserving the required provider disclosure on the one-time upload consent screen).
  - Fixed Slovak/Czech question pluralization in `#sMeta` and topic rows (`plural("exams.q", n)` replacing `today.count`), hid the stray 12-o'clock stroke dot on `0%` progress rings (`icons.js`), added tabular figures, subtle hero sheen, desktop nav/card hover polish, and a grounded topbar + balanced action bar on `#end`.
  - Added pure `buildWrongStudyPack(wrong, files, topics)` (`src/app/md.js`) that builds an ephemeral (unpersisted, zero-AI) study summary on `#<subject>/review` (rendered via `#reader`): groups missed questions by source summary file (or topic), pulls each question's matching excerpt from the existing summary with inline `<mark class="hl">` highlight, filters relevant `keyTerms` using stem matching for Slovak/Czech inflection, links to the full unhighlighted summary (`Celé zhrnutie`) or straight to each question's highlighted passage (`Pozrieť v zhrnutí`), and offers `"Zopakovať tieto chyby"` in the dock.
  - On `#end` ("Výsledok kola"), `#studyWrong` opens `#<subject>/review` when there are mistakes, or switches to `"Otvoriť zhrnutia"` (opening `#tabFiles`) when the round had 0 mistakes; each missed item in `#miss` also links directly to its highlighted summary passage.

### 1.7 Subject-Adaptive Summary & Quiz Prompt Upgrade (Option 1)
- **Files**: `ai/tasks.js`
- **How it works**:
  - Upgraded `debloatSystem` and `quizSystem` with concise subject-adaptive guidance (~60 tokens each, zero extra API calls, preserves `ai_cache` sharing across students): notes variable meanings & validity assumptions for formulas/stats, causal direction/exceptions/thresholds/contrasts for econ/law/sciences, trade-offs/complexity for technical/CS material, realistic student-mistake distractors in quizzes, and plain Unicode math symbols instead of raw LaTeX.
  - Because `server/generate.js` hashes `req.system` into `cacheKey`, `summary` and `quiz` automatically get fresh cache keys without invalidating other tasks. Requires `npm run fn:prepare` + Supabase Edge Function redeploy to take effect on live uploads.

### 1.8 Global Home Button, Redesigned Monthly Limit Meter & Landing / Sign-In / Sign-Up Screen
- **Files**: `index.html`, `src/app/limit.js`, `src/app/welcome.js`, `src/app/app.js`, `src/upload/ui.js`, `src/styles/app.css`, `src/i18n/{sk,cs}.json`, `test/limit.test.mjs`, `test/smoke.mjs`
- **How it works**:
  - **Global Home button**: Added `<button class="iconbtn homebtn" type="button" data-home>` (house icon) to `#home`, `#subject`, `#reader`, `#quiz`, `#end`, `#upload`, and `#profile`, and made the desktop rail `.brand` a clickable button to `#today`. A single delegated `[data-home]` click listener clears transient `list`, `stage`, and `readerHint`, marks the app entered, and routes to `""` (`#today`).
  - **Redesigned upload limit bar (credits, no USD)**: Extracted pure `limitInfo(u)` and DOM updater `renderLimit(box, u, t)` into `src/app/limit.js` (shared by `#upLimit` and `#pLimit`). Maps the server's USD monthly cap at `100 credits / $1` (`100 kreditov` on the free tier) with zero `$` signs in UI copy, showing label + explicit text status (`ok` / `warn` at >=80% / `full` at >=100%) + tabular percentage, segmented track with quarter markers and animated fill, and footer showing `{used} / {limit} kreditov` + `"Obnoví sa 1. v mesiaci"`.
  - **Landing + Sign-In / Sign-Up screen (`#welcome`) & clean sign-out**: Opens on first visit at `/` when no local subjects, entered flag, or active session token exist (bypassable with `?autostart=1`), and reachable anytime via `#welcome`, `#signin`, `#signup`, or the prominent `#pLanding` button row on Profile. Signing out from Profile, Upload, or Welcome runs shared `signOutAccount()`: flushes unsent sync changes best-effort, hardens `cloud.signOut()` with local-scope fallback and `sb-*-auth-token` cleanup, wipes synced account data (`clearLocal()` + `studyapp-entered`), and routes to `#welcome`. On boot, if `studyapp-sync-v1` holds a cloud `user` with no active session token, orphaned local account data is cleared automatically so already-signed-out browsers land cleanly on `#welcome`.

### 1.9 Full-Project Impeccable Critique Remediation (Accessibility, Contrast, Layout & Hardening)
- **Files**: `src/styles/app.css`, `index.html`, `src/app/app.js`, `src/app/welcome.js`, `src/app/subjects.js`, `src/upload/ui.js`, `src/i18n/{sk,cs}.json`, `test/polish.test.mjs`
- **How it works**:
  - **WCAG AA contrast & browser surfaces**: Darkened `kocky` light `--warn` (`#945800`) and `riso` light `--ledger` (`#c8165a` with `#ffffff` `--on-ledger`) and `--warn` (`#8c5500`) so all 10 look/theme pairings meet >= 4.5:1 AA contrast; boosted `#today` hero `0%` ring track to 36% opacity and added themed `::selection` and `caret-color`.
  - **44px touch targets & keyboard focus**: Raised `.seg.fill button`, `.seg button`, `.chips button`, `.w-brand`, `.w-cta`, `.w-links a`, `.w-foot-links .link`, `.w-langs .tiny`, `.w-code-actions .link`, `.rev-open`, `.rev-jump`, `.miss-src`, and `.tip-trigger` to >= 44px; added `a:focus-visible`, `summary:focus-visible`, and `[tabindex]:focus-visible` outlines.
  - **`#welcome` CTA hierarchy & offline state**: Made `#wNavCta` and `#wGuest` ghost buttons, neutralized `#wModeTabs` active indicator in `kocky`, and replaced the dead-end offline form with `#wOffBox` + `#wOffEnter` when `!cloud.configured`.
  - **Form & offline sign-out hardening**: Bound `aria-invalid="true"` + `aria-describedby` on `#wEmail`/`#wCode`/`#wAgree`/`#upEmail`/`#upCode` errors (cleared on input/change), and added `#signOutSheet` confirmation via `hasUnsynced()` so offline sign-out warns before discarding unsynced local changes.
  - **Core app clarity & keyboard polish**: Kept `"Vlastné kolo"` text visible on mobile `#subject` (`#sActions`), separated `zhrnutia` and `kontext` counts in `#sMeta` (`subjectFileCounts()`), aligned mobile `#fb` buttons full-width, refined desktop `#today` hero chevron optical alignment + single-card spanning, added inline 100-credit explainer note inside `#upLimit`/`#pLimit`, and added `S` (open summary), `Esc` (quit round), and a desktop-only `#qKeys` shortcut hint on `#quiz`.

### 1.10 Rebrand to Lekto
- **Files**: `index.html`, `src/i18n/{sk,cs}.json`, `package.json`, `capacitor.config.json`, `android/app/{build.gradle,src/main/res/values/strings.xml,src/main/java/sk/lekto/app/MainActivity.java}`, `ios/App/{App/Info.plist,App.xcodeproj/project.pbxproj}`, `supabase/{config.toml,templates/sign-in.html}`, `ai/providers/anthropic.js`, `.env.example`, `README.md`, `CLAUDE.md`, `docs/live-setup.md`
- **How it works**:
  - Updated all user-facing brand strings (`<title>`, meta/OG/iOS web-app tags, rail/landing/footer brand marks, `home.eyebrow`, SK/CS copy & legal terms, Supabase OTP email template/subject) and native Capacitor/Android/iOS app names (`Lekto`) and bundle IDs (`sk.lekto.app`).
  - Intentionally kept `localStorage` keys (`studyapp-*`), existing GitHub repo URLs (`novlys2012-art/study-app`), and the legacy `STUDY_APP_ANTHROPIC_KEY` fallback (after `LEKTO_ANTHROPIC_KEY`) so existing browsers and configs suffer zero data loss.

### 1.11 Smart Sonnet/Haiku Routing & Cited-Page Recovery (Token Savings)
- **Files**: `server/generate.js`, `src/upload/pipeline.js`, `test/server.test.mjs`, `test/exams.test.mjs`
- **How it works**:
  - Kept Sonnet (`tier: "strong"`) for `vision` (lowered `effort` from `"medium"` to `"low"` for transcription) and `exam` (`effort: "medium"`).
  - Moved `group` (past-exam topic clustering) from Sonnet to Haiku (`tier: "fast"`, no `effort`).
  - Added `needsStrongCheck({ text, questions, fromVision })` in `server/generate.js`: `check` runs on Haiku (`tier: "fast"`) for plain conceptual prose and automatically escalates to Sonnet (`tier: "strong"`, `effort: "medium"`) when any checked page came from `vision` (`fromVision: true`) or when questions/source contain math symbols, equations, calculations, or numeric MCQ options. Fixed `handle()` to log `ai.models[req.tier]` instead of `def.tier` so cached rows record the routed model.
  - Replaced `citedText()` with `citedForCheck(sec, pages, qs, visionPages)` in `src/upload/pipeline.js`: recovers missing/out-of-range `page` numbers via normalized quote match before falling back to `sec.text`, and passes `fromVision: true` only when a checked page came from `vision`.
- **Deployment note**: Push to `main` (runs `Deploy server`) or run `npm run fn:prepare` and redeploy `generate` so production picks up the routing changes.

### 1.12 Ship-Ready Mobile, Tablet & Store Release Package (iOS, iPadOS, Android & PWA)
- **Files**: `src/styles/app.css`, `src/app/{app.js,native.js,reminders.js,gestures.js,autosync.js}`, `src/cloud/supabase.js`, `src/upload/{extract.js,ui.js}`, `index.html`, `src/i18n/{sk,cs}.json`, `server/generate.js`, `supabase/functions/generate/index.ts`, `public/{manifest.webmanifest,sw.js,icons/*}`, `capacitor.config.json`, `android/app/{build.gradle,proguard-rules.pro,src/main/AndroidManifest.xml,src/main/java/sk/lekto/app/*,src/main/res/*}`, `ios/App/{App/AppDelegate.swift,App/SceneDelegate.swift,App/Info.plist,App/PrivacyInfo.xcprivacy,App/Base.lproj/Main.storyboard,App/Assets.xcassets/*,App.xcodeproj/project.pbxproj}`, `codemagic.yaml`, `.github/workflows/{build.yml,mobile-release.yml}`, `docs/mobile-release.md`, `test/{reminders.test.mjs,server.test.mjs}`
- **How it works**:
  - **Adaptive phone & tablet layouts (`src/styles/app.css`)**: Added dedicated breakpoints for phone landscape (`max-height: 500px`), tablet portrait (`640px–899px`: 2-column Today/Subjects/Summaries/Quiz grids, split hero card, 2-column Profile at `>=760px`), and tablet landscape (`900px–1099px`: safe-area-aware side rail + split Subject & Reader workspaces). Fixed double safe-area insets, `.fb-in` 4-value safe-area padding, `#welcome` safe-area top/bottom padding, 44px touch targets (`.iconbtn.small`, `.tiny`, `.up-ctx`, `.custom input`), and mobile `.up-file` wrapping.
  - **Touch gestures & keyboard viewport (`src/app/gestures.js`)**: Added swipe-to-dismiss touch physics for mobile bottom sheets (respecting internal scroll and `prefers-reduced-motion`) and `visualViewport` `--kb` tracking so inputs inside sheets/forms stay clear of soft keyboards.
  - **First-party native bridge (`LektoNative` on Android & iOS + `src/app/native.js`)**: Zero extra npm dependencies (`package.json` & `package-lock.json` remain intact for `npm ci`). Handles Android hardware/predictive Back (`OnBackPressedCallback`), live status/navigation bar & WebView background sync across all 6 looks & light/dark modes, native iOS/Android haptics, foreground resume cloud sync (`lekto:resume`), and local study reminder notifications with subject deep-link tap handling.
  - **Local exam-countdown reminders (`src/app/reminders.js`, `test/reminders.test.mjs`)**: Schedules up to 14 days of daily device-local notifications prioritizing nearest upcoming exams and due review plans (excluding sample subjects), managed in `Profil` and auto-resynced on exam/subject/quiz/sync updates.
  - **In-app account deletion (`server/generate.js`, `supabase/functions/generate/index.ts`, `src/cloud/supabase.js`, `src/app/app.js`, `test/server.test.mjs`)**: Added `task: "delete_account"` (runs even over caps / off allowlist, requires `{ confirm: true }`, cascades all user tables via `admin.auth.admin.deleteUser`) wired to `Profil -> Odstrániť účet` + `#deleteAccountSheet`.
  - **Installable PWA & branded native assets**: Added `public/manifest.webmanifest`, offline app-shell `public/sw.js`, and generated branded Lekto icons & light/dark splash screens across Web/PWA, iOS/iPadOS, and Android (including adaptive vector + Material You monochrome icons).
  - **Store compliance & release CI**: Added `ios/App/App/PrivacyInfo.xcprivacy`, `Info.plist` camera/photo usage descriptions, `ITSAppUsesNonExemptEncryption = false`, `UIRequiresFullScreen = false` (iPad multitasking), Android R8/ProGuard + env-driven release keystore signing in `build.gradle`, `codemagic.yaml` (iOS/iPadOS), `.github/workflows/mobile-release.yml` (Android Play Store `.aab`), and `docs/mobile-release.md`.
  - **Android/iOS file picker & native OTP auth**: Added MIME types alongside extensions in `src/upload/extract.js` (`ACCEPT_FILES`, `ACCEPT_EXAMS`) and omitted `emailRedirectTo` inside Capacitor native shells so OTP sign-in works cleanly without broken localhost links.
- **Deployment note**: Push to `main` (runs `Deploy server` + `Build` + `Deploy web preview`) so `generate` picks up `delete_account` and GitHub Actions verifies `npm test`, `npm run smoke`, `npm run e2e`, and Android `./gradlew assembleDebug`. See `docs/mobile-release.md` for Play Store & Codemagic signing secrets.

### 1.13 "Clean Proof" Minimalistic Design Language & Root `DESIGN.md`
- **Files**: `DESIGN.md`, `src/styles/app.css`, `index.html`, `src/app/{app.js,icons.js,welcome.js,native.js}`, `src/i18n/{sk,cs}.json`, `public/fonts/fonts.css`, `public/{manifest.webmanifest,sw.js,terms.html,privacy.html,cs/terms.html,cs/privacy.html}`, `capacitor.config.json`, `android/app/src/main/res/{values,values-night}/colors.xml`, `ios/App/App/SceneDelegate.swift`, `test/{smoke.mjs,welcome.test.mjs}`, `docs/design.md`, `CLAUDE.md` (removed `src/app/fonts.js`, `src/app/rewrite.js`, `test/rewrite.test.mjs`, and 18 legacy look font files + 5 look CSS files).
- **How it works**:
  - Replaced the 6 legacy `kviz-final` looks with one unified minimalistic design system (**Clean Proof**, documented normatively in root `DESIGN.md`) in Light, Dark, and Auto: flat mineral paper (`#f7f7f5` / `#121312`), clean sheet (`#ffffff` / `#191b19`), 1 px hairline rules, one **Spruce Ink** primary action accent (`#14524c` / `#68cbbf`), and one **Marker Citron** proof highlight (`#f5e28a` / `rgba(245,226,138,.22)`) directly inside calm `65ch` prose with no nested amber border box.
  - Consolidated typography to self-hosted variable `Source Sans 3` (`400 700` `latin` + `latin-ext`) with `tabular-nums` for counts/percentages and `JetBrains Mono` strictly for OTP codes, `<kbd>`, and inline code/formulas—shrinking `public/fonts/` from 27 files (~620 KB) to 5 files (~118 KB).
  - Cut visual chrome and motion bloat: replaced SVG progress rings (`icons.js:ring()`) with tabular `%` + `3 px` hairline progress tracks, moved the mobile floating `.fab` to inline `+ Nahrať` header buttons (`#todayAdd` / `#homeAdd`), unified repeated lists (`#todayBody .list`, `#subjects`, `#tbars`, `#files`, `.ranks`, `#tabExams .list`, `.up-list`) into flat hairline-ruled lists, switched `#sTabs` to flat underline tabs (`.utabs`), removed `backdrop-filter: blur()`, spring bounces, quiz shake/stagger animations, and the `#welcome` typewriter rewrite script (`src/app/rewrite.js`).
  - Synced `public/manifest.webmanifest`, `public/sw.js` (`lekto-shell-v2`), static SK/CS legal pages, `capacitor.config.json`, Android `colors.xml`, iOS `SceneDelegate.swift`, and `test/smoke.mjs` / `test/welcome.test.mjs`.

### 1.14 Worked Practice Problems ("Príklady") Next to Quiz
- **Files**: `ai/tasks.js`, `server/generate.js`, `src/upload/{pipeline.js,ui.js}`, `src/app/{problems.js,app.js,md.js}`, `index.html`, `src/styles/app.css`, `src/i18n/{sk,cs}.json`, `test/{problems.test.mjs,server.test.mjs,md.test.mjs}`
- **How it works**:
  - **Upload toggle next to Quiz**: Added `problems: false` to `DEFAULT_MAKE` and a **`Príklady`** chip beside **`Kvíz`** in `#upMake` (`index.html`), so students can generate worked exercises (with or without MCQs) for quantitative/procedural subjects (math, statistics, physics, accounting, economics, CS). Existing `Kontext` formula sheets flow into both problem generation and verification.
  - **Two-tier AI generation & independent Sonnet check**: `problems` (`ai/tasks.js:problemSystem/parseProblems`, `server/generate.js`) runs on Haiku (`tier: "fast"`, 2–6 problems/section with fresh numbers, progressive `hints`, numbered `steps`, concise `ans`, optional numeric `check: { num, tol, unit }`, trap note `e`, and source quote + `page`). `check_problems` runs on Sonnet (`tier: "strong"`, `effort: "medium"`) over `citedForCheck` pages to independently re-solve each problem, repairing small calculation slips via `fix` and dropping ill-posed/unsupported problems into `checkedOut`.
  - **Unified storage (`sj.questions` with `kind: "problem"`)**: Zero DB migration—problems reuse `questionId()`, `studyapp-log:<subject>`, Supabase `reviews`, spaced repetition (`plan.js`), past-exam topic ranking (`exams.js`), topic sorting, and `"Zhrnutie chýb"` (`buildWrongStudyPack`). MCQs keep their exact legacy key shape.
  - **Paper-first solving UX in `#quiz` + mode filters**: Problems show progressive hints (`Nápoveda`), optional numeric answer checking (`src/app/problems.js:parseNumericInput/checkNumericAnswer`, accepting `,`/`.`, fractions `3/4`, Unicode minus, spaces, units, `%`), scrollable numbered steps (`#pSol`), and 1-tap binary self-grading (`Vyriešil som` / `Zopakovať`) with `"Pozrieť v zhrnutí"` source jump and keyboard shortcuts (`H`/`Enter`/`R`/`S`/`Esc`). Mixed subjects show a `Všetko | Kvíz | Príklady` selector on `#sCard` and `#roundSheet`; problem-only rounds default to 6 items.
- **Deployment note**: Run `npm run fn:prepare` and redeploy the Supabase `generate` Edge Function so production exposes `problems` and `check_problems`.

### 1.15 Worked-Example Templates ("Vzory")
- **Files**: `ai/tasks.js`, `server/generate.js`, `src/upload/{extract.js,templates.js,ui.js}`, `src/app/app.js`, `index.html`, `src/styles/app.css`, `src/i18n/{sk,cs}.json`, `test/{i18n.test.mjs,templates.test.mjs}`
- **How it works**: Adds a `Vzory` tab on subjects (`sj.templates`) to upload workbooks or handwritten workings (short PDFs <= 6 pages render as images via `preferImages`), extract up to 12 reusable problem templates (`template` on Sonnet), and generate up to 2 fresh similar problem variants per template (`template_problem`, smart fast/strong routing, cached in `ai_cache`) practised on `#template` with step-by-step reveal, progressive hints, and optional numeric checking.
- **Deployment note**: Requires `npm run fn:prepare` and Supabase `generate` Edge Function redeploy alongside `problems` / `check_problems`.

### 1.16 Pricing Plan, Lekto Plus Paywall & Security Hardening
- **Files**: `server/generate.js`, `supabase/functions/generate/index.ts`, `supabase/migrations/20261123140000_usage_hardening.sql`, `src/app/{limit.js,app.js,welcome.js}`, `src/upload/{extract.js,pipeline.js,ui.js}`, `scripts/lib/extract.mjs`, `index.html`, `src/styles/app.css`, `src/i18n/{sk,cs}.json`, `test/{limit.test.mjs,server.test.mjs,exams.test.mjs,templates.test.mjs,e2e.mjs,db/rls.sql}`, `CLAUDE.md`, `docs/live-setup.md`, `.env.example`
- **How it works**:
  - **Two-tier credit & feature model**: Free tier gets **15 credits/month (`$0.15`)**, core summaries (`Zhrnutia`), MCQ `Kvíz`, `Témy`, reference `Kontext`, daily exam plan, mistake summary, reminders, sync, and up to **6 picture pages/file** (`MAX_FREE_PICTURES = 6`). **Lekto Plus** (`€5.99/mo` / `149 Kč/měs.` or `€34.99/yr` / `890 Kč/rok`, `€2.92/mo`, `-51%`) gets **150 credits/month (`$1.50`)**, **Past Exam Mode (`Skúšky`)**, **Worked Practice Problems (`Príklady`)**, **Worked-Example Templates (`Vzory`)**, and up to **40 picture pages/file** (`MAX_PICTURES = 40`).
  - **Server enforcement (`server/generate.js`, `supabase/functions/generate/index.ts`)**: Resolves `plan: "free" | "plus"` from Supabase Auth `app_metadata.plan === "plus"` or `PLUS_EMAILS` env secret (`*` unlocks all), enforces `FREE_MONTHLY_LIMIT_USD` (`0.15`) vs `PLUS_MONTHLY_LIMIT_USD` (`1.5`), returns `plan` in `usage`, and rejects Free calls to `PLUS_TASKS` (`exam`, `group`, `problems`, `check_problems`, `template`, `template_problem`) with `HttpError(402, "plus_required")` (added to `STOP` in `pipeline.js`).
  - **Security hardening**:
    - **Delete-account quota-reset protection (`20261123140000_usage_hardening.sql`)**: Dropped `ON DELETE CASCADE` on `ai_usage.user_id`, added non-PII SHA-256 `account_key` (`accountKey(user)` in `server/generate.js`), and updated `ai_spend(uid, acct_key)` so deleting and recreating an account cannot reset monthly user spend or the global daily cap (`all_today`), while storing zero PII in `ai_usage`.
    - **Cache-hit flooding pruning (`20261123140000_usage_hardening.sql`)**: Added `ai_usage_prune_cached` trigger that prunes a user's `cached = true` rows older than 15 minutes on new cached inserts.
    - **Parallel TOCTOU race & concurrency protection (`server/generate.js`, `supabase/functions/generate/index.ts`)**: Pre-reserves estimated task cost (`RESERVE_USD: { fast: 0.005, strong: 0.04 }`) and enforces `MAX_CONCURRENT` (`6` Free, `10` Plus) both in-memory (`inFlight`) and in Postgres (`reserve` / `record` / `release`) before calling `ai.complete`, releasing the reservation if the provider call fails.
    - **Document parser & checkout URL hardening (`src/upload/extract.js`, `scripts/lib/extract.mjs`, `src/app/app.js`)**: Disabled PDF.js `Function()` evaluation (`isEvalSupported: false`), added per-entry (`2 MB`) and total (`20 MB`) uncompressed XML caps in `pptx()` against ZIP decompression bombs, and restricted checkout redirects to `https://` URLs.
  - **Landing `#wPricing`, `#plusSheet` dialog & limit meters**: Added `#wPricing` comparison ledger on `#welcome` (localized EUR in SK, CZK in CS), reusable `#plusSheet` modal dialog with annual/monthly toggle (`#plusCycle`), contextual feature-gate banner (`#plusReason`), and `VITE_PLUS_URL_ANNUAL` / `VITE_PLUS_URL_MONTHLY` checkout hook (with pre-launch fallback notice), plus plan badge and upgrade CTA inside `#upLimit` and `#pLimit` and `Príklady · Plus` gating in `#upMake`.

### 1.16 Email + Password Login, Email-Verified Sign-Up & Password Reset
- **Files**: `src/cloud/supabase.js`, `src/app/{auth-state.js,welcome.js,app.js,icons.js}`, `src/upload/ui.js`, `index.html`, `src/styles/app.css`, `src/i18n/{sk,cs}.json`, `supabase/{config.toml,templates/sign-in.html,templates/reset-password.html}`, `test/{welcome.test.mjs,e2e.mjs}`, `docs/{live-setup.md,mobile-release.md}`, `CLAUDE.md`
- **How it works**:
  - **Shared auth controller (`#wAuthForms` in `src/app/welcome.js`)**: Mounted into `#authSheet` on `#welcome`/`#signin`/`#signup` and into `#upAuthMount` inside `#upload` (`src/upload/ui.js`), removing the duplicate upload login form.
  - **Sign-up with email verification**: `cloud.signUp(email, password)` requires >= 8-char password + 16+ terms consent, detects already-confirmed accounts (`identities.length === 0` -> `exists`), and routes to the 8-digit email verification code step (`cloud.verifyCode(email, code, "signup")`, with 60s resend cooldown via `cloud.resendVerification`).
  - **Password login + unconfirmed recovery**: `cloud.signInWithPassword(email, password)` signs in directly with no email sent. If an account is unconfirmed (`email_not_confirmed`), the UI automatically resends a verification code and opens the verify step.
  - **Code-based password reset**: `"Zabudnuté heslo?"` sends a recovery code (`cloud.requestPasswordReset`), verifies it (`verifyCode(..., "recovery")`), and sets a new password (`cloud.updatePassword`) in-app — also letting earlier passwordless OTP accounts set a password without losing data.
  - **Deliverability cleanup**: Updated `supabase/templates/sign-in.html` (Confirm signup) and added `supabase/templates/reset-password.html` (Reset password) as clean HTML code-only templates without cross-domain `{{ .ConfirmationURL }}` links.
- **Dashboard note**: Ensure Supabase Auth has **Confirm email** enabled, minimum password length set to `8`, and paste the updated `Confirm signup` and `Reset password` templates (`docs/live-setup.md` step 3).

### 1.17 Create Subjects Without Uploading Files
- **Files**: `src/app/{subjects.js,app.js}`, `src/upload/{pipeline.js,ui.js}`, `index.html`, `src/styles/app.css`, `src/i18n/{sk,cs}.json`, `test/{polish.test.mjs,server.test.mjs}`
- **How it works**:
  - Added shared `createSubject(name)` in `src/app/subjects.js` (also reused by `buildSubject()` in `src/upload/pipeline.js`) so empty subjects have the exact schema and sync cleanly without requiring sign-in or AI calls.
  - Added `#newSubjectSheet` (`dialog.bsheet`), reachable from the secondary ghost button `"Vytvoriť predmet bez súborov"` in `emptyState()` (`#today`/`#home`) and `+ Nový predmet` (`#homeNew`) on `#home`.
  - Enabled creating a new subject without picking files on `#upload` Step 1 (`#upFilesLabel` shows `"Súbory (voliteľné)"` and `#upNext` creates the empty subject when 0 files are picked, switching back to `"Ďalej"` once any file is picked).
  - Kept `#sCard` (exam date) visible on empty subjects, aligned `#sEmpty` into desktop column 2 with direct buttons to upload course files, past exams, or worked-example templates later, and showed honest `"Zatiaľ bez materiálov"` subtitles on `#today` and `#home`.

### 1.18 Security Hardening (Atomic Spend Reservation, Row Limits, Input Validation, CSP & CI)
- **Files**: `supabase/migrations/20261124120000_security_hardening.sql`, `server/generate.js`, `supabase/functions/generate/index.ts`, `src/app/app.js`, `index.html`, `public/{privacy.html,cs/privacy.html}`, `vite.config.js`, `package.json`, `.github/workflows/mobile-release.yml`, `.env.example`, `test/{server.test.mjs,templates.test.mjs,smoke.mjs,db/rls.sql}`, `docs/{security-todo.md,live-setup.md,mobile-release.md}`, `CLAUDE.md`
- **How it works**:
  - **Atomic pre-call reservation (`ai_reserve`)**: Added Postgres RPC `public.ai_reserve(...)` taking `pg_advisory_xact_lock(hashtext('lekto:ai_reserve'))` across all Edge Function instances, checking `per_minute`, Free monthly `vision_pages`, monthly user cap, Free daily pool, and global daily ceiling before inserting a worst-case reservation row (`estimateMaxUsd(ai, req)` using `ai/prices.js` + `1600` tokens/image + `maxTokens`), then settling to actual cost on success or deleting on provider error.
  - **Isolated Free daily pool & Free server-side vision cap**: Split `FREE_DAILY_LIMIT_USD` (default `$3`) from the global emergency ceiling `DAILY_LIMIT_USD` (default `$25`, warning log at 80%) via `ai_usage.plan` so Free bursts cannot lock out Lekto Plus users; tracked `ai_usage.vision_pages` and capped Free accounts at `FREE_VISION_PAGES_MONTHLY` (default `18` → `402 plus_required`).
  - **Per-user DB row limits & `ai_cache` 90-day TTL**: Added `AFTER INSERT FOR EACH STATEMENT` triggers limiting each user to `200` `subjects`, `200` `progress`, and `200,000` `reviews` rows (allowing upserts on existing rows at cap), pruned `ai_cache` rows older than 90 days on read & insert, updated SK/CS `privacy.html` with the 90-day anonymous cache retention note, and omitted `cached` from HTTP responses.
  - **Input, hash, CSP, dev-server & CI hardening**: Validated `body`, `input`, and item shapes in `topics`, `group`, `check`, and `check_problems` (`400 bad_input`); wrapped `decodeURIComponent` in `here()` (`src/app/app.js`) in `try/catch`; added a CSP `<meta>` tag to `index.html`; bound Vite dev server to `127.0.0.1` outside container environments; and passed `mobile-release.yml` workflow inputs via `env:` with validation.

### 1.19 Performance & Load-Time Optimizations
- **Files**: `src/app/{subjects.js,plan.js,app.js,welcome.js,autosync.js}`, `src/i18n/index.js`, `src/upload/{extract.js,ui.js}`, `index.html`, `src/styles/app.css`, `public/sw.js`, `test/{plan.test.mjs,polish.test.mjs,smoke.mjs}`
- **How it works**:
  - **Zero-reparse local storage cache (`src/app/subjects.js`)**: Raw-string-keyed caches for `studyapp-subjects-v1`, per-subject serialized JSON diffs in `saveSubjects()`, and `studyapp-log:<id>` eliminate repeated synchronous `JSON.parse`/`JSON.stringify` stalls on screen navigation and quiz answers while auto-invalidating on direct `localStorage` writes; `logAnswer()` returns the appended entry so `app.js` updates `LOG` in memory.
  - **Single-pass `memoryStates` & lazy file search (`src/app/plan.js`, `src/app/app.js`)**: `questionStats`, `dueRound`, and `dailyPlan` now accept a precomputed `memoryStates(log)` `Map` (plus fast-path skips sorting already-ordered logs), so opening `#subject` or `#today` computes states once instead of once per topic; `renderFiles()` caches normalized search text lazily in a `WeakMap` instead of eager DOM `data-text` attributes.
  - **Faster cold boot & smaller initial bundle**: Lazy-loaded `cs.json` (31 KB) and `sample.js` (23 KB), skipped importing `@supabase/supabase-js` (~150 KB) on logged-out `#welcome` and `#profile`, removed the duplicate `applyI18n()` pass at boot (and skipped no-op text writes), inlined `@font-face` rules + `<link rel="preload">` for `Source Sans 3` in `index.html`, precached both primary `.woff2` fonts in `public/sw.js` (`lekto-shell-v3`), and dropped `text-rendering: optimizeLegibility`.
  - **Snappier UI, Profile/Upload & sync**: Instant top-level tab switches without forced `offsetWidth` reflow, zero `getComputedStyle()` at boot in `paintChrome()`, `rAF` + GPU `transform: scaleX()` reader scroll bar, immediate stale-while-revalidate quota display on `#profile` and `#upload`, `visibilitychange` sync guarded by `!document.hidden` + 15s focus cooldown, and background `preloadPdf()` when picking a PDF on Upload Step 1.

---

## 2. Load-Bearing Invariants (Do Not Break)

1. **Hash format**: Keep reader URLs at `#<subject>/read/<fi>` (no query/fragment suffix); `test/smoke.mjs` asserts `page.url().endsWith("#test/read/1")`.
2. **Route scroll ordering**: `showReader()` runs before `window.scrollTo(0, y)` in `route()`. Any scroll-to-element behavior in the reader must run after `window.scrollTo(0, y)` (currently via `readerFocus` + `requestAnimationFrame`).
3. **Strict i18n test (`test/i18n.test.mjs`)**: Every `t("...")` / `data-i18n="..."` key must exist in `src/i18n/sk.json`, every key in `sk.json` must be used (no dead keys), and `cs.json` must have exact key & placeholder parity with `sk.json`.
4. **No `innerHTML` on user/AI text**: `renderMarkdown` and `highlightMatch` strictly build DOM nodes with `textContent` / `Text` nodes.
5. **Storage & sync**: Only read/write subjects via `src/app/subjects.js` (`studyapp-subjects-v1`, `studyapp-log:<id>`). Never mutate existing answer log entries or regenerate existing question `id`s.
6. **Edge Function sync**: `supabase/functions/_shared` is generated from `ai/` and `server/` via `npm run fn:prepare`. Always keep `ai/` and `server/` as the source of truth.

---

## 3. Known Limits, Shortcuts & Decisions

- **Spaced repetition**: Geometric intervals in `src/app/plan.js` (not full `ts-fsrs` yet).
- **Context budget**: Concatenated context files are silently sliced at `24,000` chars client-side (`CONTEXT_MAX`) and rejected over `30,000` chars server-side (`MAX_CONTEXT`). Very large formula sheets will be truncated.
- **Highlight fallback**: Short AI-paraphrased answers sharing fewer than 3 stemmed words (`>= 4` chars) with any `<p>`/`<li>` in the summary open the summary without a highlight. Context files' raw text blocks have not been explicitly browser-tested for quiz highlighting (and `sourceFile(x)` currently only links files with `f.summary`).
- **Legal / Copyright (product decision)**: Discussed with owner—private personal study use by an individual student uploading their own course notes/past exams carries low practical risk *if* materials stay strictly private per user (never shared in a public library or across accounts, and original files are deleted after text extraction). Note that `ai_cache` hashes prompts globally across users (no raw files stored, only derived AI JSON); review ToS/privacy copy and age gate (16+) before public launch.
- **No `.git` in AI Studio workspace**: This container workspace has no `.git` directory; track changes cleanly before exporting/syncing back to GitHub.

---

## 4. Verification & Local Container Notes

- **Unit tests**: `npm test` (65 tests across `ai`, `exams`, `i18n`, `limit`, `md`, `plan`, `polish`, `server`, `sync`).
- **Lint & build**: `npm run lint` (`node --check` on all JS/MJS) and `npm run build` (`vite build`).
- **Browser tests in this container**: `npm run smoke` and `npm run e2e` import the `playwright` npm package, whose bundled revision may not match the preinstalled container Chromium; use global `playwright-cli` (`http://localhost:3000`, seed `localStorage.setItem("studyapp-subjects-v1", ...)` then reload) for live headless Chromium verification here, and run `npm run smoke` / `npm run e2e` / `npm run test:db` in CI or local dev.
- **HMR is disabled** in the AI Studio preview environment: restart the dev server after code edits before testing `http://localhost:3000`.

---

## 5. Open / Next Tasks

- [ ] Watch GitHub Actions `Build`, `Deploy server`, and `Deploy web preview` after pushing `main` (runs `npm test`, `npm run build`, `npm run smoke`, `npm run e2e`, `npm run test:db`, Android `assembleDebug`, applies `20261123140000` + `20261124120000` migrations, and redeploys `generate`), and test on physical iPhone, iPad, and Android devices (`docs/mobile-release.md`).
- [ ] Supabase Auth dashboard checks (`docs/live-setup.md` §3, `docs/security-todo.md`): verify **Confirm email** is ON, min password length `8`, paste updated email templates + custom SMTP (Resend), enable **Leaked password protection** (if available), and turn on **CAPTCHA** (Cloudflare Turnstile) before public sign-ups.
- [ ] Configure Android upload keystore secrets and Codemagic iOS App Store Connect integration (`docs/mobile-release.md`).
- [ ] Remaining roadmap items from `CLAUDE.md`: payments (Stripe / RevenueCat) once paid tier launches.
- [ ] **Later idea — iPad stylus scratchpad in `Príklady` & `Vzory`**: Add an ephemeral `<canvas>` scratch area (`Náčrt`) inside `#probBox` (`#quiz`) and `#tpProb` (`#template`) using standard Pointer Events (`pointerdown`/`pointermove`/`pointerup`, `e.pointerType === "pen"` palm rejection once a stylus is detected, `e.pressure`, `getCoalescedEvents?.()`, `touch-action: none`) with Pen / Eraser / Undo / Clear controls that reset per problem (zero `localStorage` or Supabase sync bloat).

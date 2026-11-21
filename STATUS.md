# Study App — Status & Handoff

Last updated: 2026-11-21
Build / checks: `npm run build` passes, `npm run lint` passes, `npm test` passes (**62/62**).

Read `CLAUDE.md` and `docs/design.md` alongside this file for product scope, stack rules, and UI conventions.

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
  - Added pure `buildWrongStudyPack(wrong, files, topics)` (`src/app/md.js`) that builds an ephemeral (unpersisted, zero-AI) study summary on `#<subject>/review` (rendered via `#reader`): groups missed questions by source summary file (or topic), pulls each question's matching excerpt from the existing summary with inline `<mark class="hl">` highlight, filters relevant `keyTerms` using stem matching for Slovak/Czech inflection, links straight to the highlighted passage in the full summary (`Celé zhrnutie` / `Pozrieť v zhrnutí`), and offers `"Zopakovať tieto chyby"` in the dock.
  - On `#end` ("Výsledok kola"), `#studyWrong` opens `#<subject>/review` when there are mistakes, or switches to `"Otvoriť zhrnutia"` (opening `#tabFiles`) when the round had 0 mistakes; each missed item in `#miss` also links directly to its highlighted summary passage.

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

- **Unit tests**: `npm test` (61 tests across `ai`, `exams`, `i18n`, `md`, `plan`, `server`, `sync`).
- **Lint & build**: `npm run lint` (`node --check` on all JS/MJS) and `npm run build` (`vite build`).
- **Browser tests in this container**: `npm run smoke` and `npm run e2e` import the `playwright` npm package, whose bundled revision may not match the preinstalled container Chromium; use global `playwright-cli` (`http://localhost:3000`, seed `localStorage.setItem("studyapp-subjects-v1", ...)` then reload) for live headless Chromium verification here, and run `npm run smoke` / `npm run e2e` / `npm run test:db` in CI or local dev.
- **HMR is disabled** in the AI Studio preview environment: restart the dev server after code edits before testing `http://localhost:3000`.

---

## 5. Open / Next Tasks

- [ ] Run `npm run fn:prepare` and deploy the updated Supabase `generate` Edge Function so production accepts `context`.
- [ ] Optional: Verify `sourceFile(x)` / reader highlight if quiz questions ever cite a context file directly.
- [ ] Remaining roadmap items from `CLAUDE.md`: full Czech review/polish, payments (Stripe / RevenueCat), age-gate / ToS wording for user-uploaded materials, native Capacitor builds (`npm run cap:sync`).

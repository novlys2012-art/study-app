# Study App

A study app for Slovak and Czech university students. A student uploads their own course files and past exams and gets clean summaries, quizzes, topics and a day-by-day plan up to the exam date. It is a new app that reuses only the design and the quiz mechanics of the quiz site in `novlys2012-art/kviz-final`. **None of that site's content (subjects, questions, notes, accounts, Spanish or math material) belongs in this app**; every subject and question comes from the student's own uploads.

- Product and engineering blueprint (audit, roadmap by exam period, beta scorecard): https://claude.ai/artifact/PayfjA6MMx5pez1LMcW421. Its roadmap replaces the older one below where they differ.
- Development roadmap (phases, tasks, "done when" checks): https://claude.ai/artifact/Vh6sBwyMTvcZtmDTckrzoQ
- Business case (pricing, costs, competitors, large-file costs, store rules): https://claude.ai/code/artifact/c7447c49-2241-49f3-bc99-49509500556d

## Version 1 scope

The five core features, in build order (roadmap phases 3 to 6):

1. **Clean summary ("debloater")**: a messy deck or PDF becomes a short summary, with the page count before and after.
2. **Topic organiser**: a subject's files are sorted into topics, each with its summary, questions and weak spots.
3. **Past exam mode**: old exams are linked to topics, ranked by how often each topic comes up, and practised in that order. This is the main paid feature and the most unique one; no big competitor has it.
4. **Exam countdown plan**: exam dates in, a daily plan and local reminders out (spaced repetition with ts-fsrs).
5. **Slovak and Czech first**: the whole UI and every AI answer in the student's language.

From the quiz site only the multiple-choice quiz engine carries over: topics, round size, unseen questions, mistake review, explanations and the six looks. Its subject-specific modes (booking exercises, account list, math and Spanish practice) are not part of this app.

**Not in version 1** (see the roadmap's "After version 1" list): streaks, XP, daily goals and leagues (Duolingo-style features), class sharing and the teacher plan, push notifications, a public library, a chat tutor, school licences, and all marketing.

## Stack

| Part | Choice |
|---|---|
| App | Plain JavaScript modules, built with Vite, wrapped for Android and iOS with Capacitor |
| Text extraction | pdf.js, mammoth.js, JSZip, on the device; AI vision only for pages with no text |
| Accounts, database, storage, server function | Supabase, Frankfurt region: email-code sign-in, tables `ai_usage`, `ai_cache`, `subjects` and `reviews` (plus the old `progress`, read-only), Edge Function `generate`. Deployed by `.github/workflows/server.yml`; the site gets `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` at build time |
| AI | **Claude** (decided 28 Oct, no multi-provider test). Claude Haiku 5.5 (`claude-haiku-5-5`) for summaries, quizzes and topics; Claude Sonnet 5.5 (`claude-sonnet-5-5`) for checking questions and reading scanned past exams. Calls go through `ai/index.js`, which keeps a provider switch (a Gemini adapter exists but is unused). |
| Payments | RevenueCat (stores) and Stripe (web), phase 7 |
| iPhone builds | Codemagic free tier |

## Rules

- **AI keys never ship in the app.** Only `scripts/` and the Supabase server function call `ai/`. The function (`supabase/functions/generate`, logic in `server/generate.js`) checks the signed-in user, the optional `ALLOWED_EMAILS` test list, the per-minute limit (`USER_RATE_PER_MINUTE`, default 60) and the spending caps (`USER_MONTHLY_LIMIT_USD`, default 1; `DAILY_LIMIT_USD`, default 5) before every AI call, and records each call's cost in `ai_usage`. A model with no price in `ai/prices.js` is never run, so no call can be logged at $0. Every answer is stored in `ai_cache` by a SHA-256 of the whole request, so a repeated request (a failed upload run again, the same file from another student) is free and is served even over the cap. Errors reach the app as codes only (`ai_busy`, `rate_limit`, `server_error`, ...), never raw messages. The page quota comes with paid plans. Setup steps: `docs/live-setup.md`.
- **Subjects live on the device and in the account.** The app reads and writes localStorage only through `src/app/subjects.js`, which marks each change; `src/cloud/sync.js` copies changes to and from the `subjects` and `reviews` tables (row level security: own rows only). When both sides changed, the newer subject wins. A signed-out student stays device-only.
- **Answers are an append-only log.** Every answer is its own entry (`logAnswer`), stored on the device (`studyapp-log:<subject>`) and as a row in `reviews`; the counts the quiz uses are worked out from the log (`progressFrom`). Rows are only added (a known id is skipped) or deleted with their subject, never changed, so answers from two devices all count. A progress reset is a "reset" entry; counts from before the log are "base" entries with the id `b:<subject>:<question>`. The database sets `created_at`, and devices pull by it. Spaced repetition (phase 2) reads this log.
- **Question ids are made once.** A new question gets a random id (`questionId()`) and keeps it; sorting topics again never changes it. Never derive an id from the topic or the text.
- **Uploads survive failures.** `src/upload/pipeline.js` retries a failed call with growing waits (`ai_busy`, network, `server_error`, `rate_limit`; an unreadable reply once), stops on a spending limit or sign-in error, and keeps the files that finished; the failed ones stay picked so the student can add them again, and the cache makes the parts that already ran free.
- **Files stay on the device.** The browser extracts text (`src/upload/extract.js`) and renders text-less PDF pages to JPEG; only text and those pictures are sent.
- **Keep the provider switch.** All AI calls go through `getProvider().complete({ tier, system, prompt, images })`. Prompts live in `ai/tasks.js` and must stay provider-neutral (plain text in, JSON out). A new provider is one file in `ai/providers/` plus its prices in `ai/prices.js`.
- **Cost targets.** A 200-page PDF should cost under €0.10 to process; a heavy paying user under about €0.75 a month in AI. Extract text locally, strip repeated headers and footers, split into sections of about 8–10k tokens, cache answers by a hash of the request (`ai_cache`) so a shared file is processed once, and use Batch (half price) for anything not needed right away. Limits are counted in pages, not uploads.
- **Generated questions use the quiz site's format** (`q`, `o`, `a`, `e`, `x`, `s`), so the existing quiz mode can show them unchanged. Every question keeps a source quote.
- **UI strings go through `src/i18n/`.** Static markup uses `data-i18n="section.key"`; code uses `t("key")`. `sk.json` is the source, `cs.json` is filled in phase 7, missing keys fall back to Slovak.
- **Keep the look.** The styles in `src/styles/app.css` and the six looks (Kocky is the default; Riso, Účtovná kniha, Zošit, Tabuľa, Čistý) come from the quiz site. The app layout (bottom tab bar, `rowcard`, `hero`, `bsheet` bottom sheets, the quiz's slide-up `fb` panel) is the app's own and sits at the end of the file. New screens reuse the classes (`sheet`, `btn`, `seg`, `chips`, `opt`, `bar`, `label`, `hint`, `rowcard`, `pill`, `iconbtn`) and colour tokens (`--paper`, `--sheet`, `--ink`, `--ledger`, ...), in light and dark.
- **Privacy.** 16+ only unless parental consent is added. Original uploads are deleted once text extraction succeeds. An AI consent screen naming the provider is shown before the first upload (an App Store requirement).

## Pricing (planned)

Free tier with a small monthly page limit. Plus at €3.99 a month or €29.99 a year (about 1,500 pages a month). A teacher plan at €59 a year comes after version 1. Break-even is about 30 to 35 paying users with fixed costs around €45 a month.

## Layout

```
index.html            page shell, markup tagged with data-i18n
src/main.js           entry: styles, i18n, then the app
src/app/app.js        screens: Today, Subjects, one subject (tabs), summary reader, quiz, Profile, and the bottom tab bar
src/app/subjects.js   subjects, questions and the answer log on the device (localStorage), with marks of what changed
src/app/autosync.js   when to sync with the account (start, after a change, back in front, after sign-in)
src/app/md.js         safe renderer for the summaries' Markdown
src/upload/           upload screen (ui.js), extraction on the device (extract.js, text.js), pipeline (pipeline.js)
src/cloud/            Supabase sign-in, calls to the server function, and sync of subjects and answers (sync.js)
src/i18n/             sk.json, cs.json, t() and applyI18n()
src/styles/           app.css (all looks)
ai/                   provider layer (index.js, providers/, prices.js) and prompts (tasks.js)
server/generate.js    server task runner: auth, caps, one AI task, cost record (runs in the Edge Function and in tests)
supabase/             config, migrations (ai_usage, subjects, ai_cache, reviews), functions/generate (Deno entry; shared code copied in by fn:prepare)
docs/live-setup.md    connecting the live site: Supabase, keys, GitHub settings
scripts/ai-trial.mjs  phase 0 trial: run generation on real files and log tokens and cost
android/, ios/        Capacitor native projects
test/                 unit tests (npm test), browser smoke test (npm run smoke), upload end-to-end test (npm run e2e),
                      database access test (npm run test:db: migrations on a plain Postgres, test/db/rls.sql)
```

## Commands

```
npm install
npm run dev            # local dev server
npm test               # unit tests
DATABASE_URL=postgres://... npm run test:db   # applies the migrations to a fresh database and checks row level security (CI runs it)
npm run build && npm run smoke   # opens the app in Chromium, plays a round on a made-up subject, fails on any page error
npm run e2e            # builds against a fake Supabase and fake AI, signs in, uploads PDF/DOCX/PPTX, studies the result
npm run fn:prepare     # copy ai/ and server/ into supabase/functions/_shared before `supabase functions serve` or deploy
npm run cap:sync       # build and copy into android/ and ios/
npm run trial -- --dry-run files...   # phase 0: extract and count tokens without AI calls
npm run trial -- files...             # phase 0: needs ANTHROPIC_API_KEY (or STUDY_APP_ANTHROPIC_KEY in a cloud environment) in .env
npm run trial -- --mode exam exams... # phase 0: tag old exam questions with topics and rank them (Sonnet, reads scans)
```

## Open decisions

- When to register a živnosť (before phase 7), or sell through Paddle instead.
- Age limit: 16+ only (recommended), or parental consent for younger students.
- Whether the repo stays public once it holds paid features.

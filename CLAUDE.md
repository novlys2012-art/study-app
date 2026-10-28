# Study App

A study app for Slovak and Czech university students. A student uploads their own course files and past exams and gets clean summaries, quizzes, topics and a day-by-day plan up to the exam date. It is a new app that reuses only the design and the quiz mechanics of the quiz site in `novlys2012-art/kviz-final`. **None of that site's content (subjects, questions, notes, accounts, Spanish or math material) belongs in this app**; every subject and question comes from the student's own uploads.

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
| Accounts, database, storage, server function | Supabase, Frankfurt region: email-link sign-in, `ai_usage` table, Edge Function `generate`. Deployed by `.github/workflows/server.yml`; the site gets `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` at build time |
| AI | **Claude** (decided 28 Oct, no multi-provider test). Claude Haiku 5.5 (`claude-haiku-5-5`) for summaries, quizzes and topics; Claude Sonnet 5.5 (`claude-sonnet-5-5`) for checking questions and reading scanned past exams. Calls go through `ai/index.js`, which keeps a provider switch (a Gemini adapter exists but is unused). |
| Payments | RevenueCat (stores) and Stripe (web), phase 7 |
| iPhone builds | Codemagic free tier |

## Rules

- **AI keys never ship in the app.** Only `scripts/` and the Supabase server function call `ai/`. The function (`supabase/functions/generate`, logic in `server/generate.js`) checks the signed-in user, the optional `ALLOWED_EMAILS` test list and the spending caps (`USER_MONTHLY_LIMIT_USD`, default 1; `DAILY_LIMIT_USD`, default 5) before every AI call, and records each call's cost in `ai_usage`. The page quota and `file_cache` come with paid plans. Setup steps: `docs/live-setup.md`.
- **Files stay on the device.** The browser extracts text (`src/upload/extract.js`) and renders text-less PDF pages to JPEG; only text and those pictures are sent.
- **Keep the provider switch.** All AI calls go through `getProvider().complete({ tier, system, prompt, images })`. Prompts live in `ai/tasks.js` and must stay provider-neutral (plain text in, JSON out). A new provider is one file in `ai/providers/` plus its prices in `ai/prices.js`.
- **Cost targets.** A 200-page PDF should cost under €0.10 to process; a heavy paying user under about €0.75 a month in AI. Extract text locally, strip repeated headers and footers, split into sections of about 8–10k tokens, hash files and sections so a shared file is processed once, and use Batch (half price) for anything not needed right away. Limits are counted in pages, not uploads.
- **Generated questions use the quiz site's format** (`q`, `o`, `a`, `e`, `x`, `s`), so the existing quiz mode can show them unchanged. Every question keeps a source quote.
- **UI strings go through `src/i18n/`.** Static markup uses `data-i18n="section.key"`; code uses `t("key")`. `sk.json` is the source, `cs.json` is filled in phase 7, missing keys fall back to Slovak.
- **Keep the look.** The styles in `src/styles/app.css` and the six looks (Kocky is the default; Riso, Účtovná kniha, Zošit, Tabuľa, Čistý) come from the quiz site. New screens reuse its classes (`sheet`, `btn`, `seg`, `chips`, `opt`, `bar`, `label`, `hint`) and colour tokens (`--paper`, `--sheet`, `--ink`, `--ledger`, ...), in light and dark.
- **Privacy.** 16+ only unless parental consent is added. Original uploads are deleted once text extraction succeeds. An AI consent screen naming the provider is shown before the first upload (an App Store requirement).

## Pricing (planned)

Free tier with a small monthly page limit. Plus at €3.99 a month or €29.99 a year (about 1,500 pages a month). A teacher plan at €59 a year comes after version 1. Break-even is about 30 to 35 paying users with fixed costs around €45 a month.

## Layout

```
index.html            page shell, markup tagged with data-i18n
src/main.js           entry: styles, i18n, then the app
src/app/app.js        home screen and the multiple-choice quiz
src/app/subjects.js   subjects and questions on the device (localStorage until sync arrives)
src/app/md.js         safe renderer for the summaries' Markdown
src/upload/           upload screen (ui.js), extraction on the device (extract.js, text.js), pipeline (pipeline.js)
src/cloud/            Supabase sign-in and calls to the server function
src/i18n/             sk.json, cs.json, t() and applyI18n()
src/styles/           app.css (all looks)
ai/                   provider layer (index.js, providers/, prices.js) and prompts (tasks.js)
server/generate.js    server task runner: auth, caps, one AI task, cost record (runs in the Edge Function and in tests)
supabase/             config, migrations (ai_usage), functions/generate (Deno entry; shared code copied in by fn:prepare)
docs/live-setup.md    connecting the live site: Supabase, keys, GitHub settings
scripts/ai-trial.mjs  phase 0 trial: run generation on real files and log tokens and cost
android/, ios/        Capacitor native projects
test/                 unit tests (npm test), browser smoke test (npm run smoke), upload end-to-end test (npm run e2e)
```

## Commands

```
npm install
npm run dev            # local dev server
npm test               # unit tests
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

## Status: where we left off (28 Oct 2026)

Read this first when picking the work up again. Keep it current at the end of each working day.

**Decisions made**
- This is a new app, separate from `kviz-final`. It reuses only that site's design (six looks) and its quiz engine, and none of its content.
- AI is Claude only: Haiku 5.5 for summaries, questions and topics, and Sonnet 5.5 for reading picture pages and scanned exams and for checking questions. The provider switch in `ai/` stays, but there are no plans to test other providers.
- Version 1 is the five core features above. Duolingo-style features (streaks, XP, leagues) come after version 1.
- Hosting: GitHub Pages for now (https://novlys2012-art.github.io/study-app/). Move to Cloudflare Pages or Vercel later, once a custom domain or headers are needed.
- Key names: in cloud coding sessions the Claude key is saved as `STUDY_APP_ANTHROPIC_KEY`, because `ANTHROPIC_API_KEY` is reserved there. On the live site the key is the Supabase function secret `ANTHROPIC_API_KEY`.

**Phase 0 AI trial** (full report in the project files, `ai-trial-2026-10-28/report.md`)
- Past exam mode on 5 real math exams cost $0.21 in total. Reading an exam costs $0.02 to $0.04, including one made only of screenshots. Topic ranking was sensible, and Sonnet rated 19 of 20 practice questions correct.
- Two finance lecture PDFs (11 and 19 pages) became summaries of 2.3 and 2.9 pages plus 10 questions each, for $0.16 including the Sonnet check and topics. The Sonnet check costs about 4× the Haiku generation, so it is the first place to save (check a sample, or use Batch).
- Haiku's questions lean towards calculations, so the quiz prompt now asks for theory in the source's own wording as well.

**What is live**
- The site has an upload screen. You sign in with an email code, accept the AI consent screen (it names Anthropic), and pick PDF, PPTX, DOCX or TXT files. Files are read in the browser. Sonnet reads picture pages, Haiku writes a summary and questions for each section, Sonnet checks the questions, and Haiku sorts everything into topics with weak spots. The result opens as a subject with the summaries, topics and quiz. Subjects are saved only in that browser.
- Supabase project (Frankfurt) with the `ai_usage` table and the `generate` function. Each account can spend at most $1 a month and the whole app $5 a day, and `ALLOWED_EMAILS` can limit who may use it. Both deploy from `main` through GitHub Actions.
- Merged pull requests: #3 (live uploads) and #5 (sign-in by code, and the Safari fix for reading PDFs).

**Open to-dos for Simon** (`docs/live-setup.md`, step 3)
1. Supabase → Authentication → Emails → Templates: paste `supabase/templates/sign-in.html` into **Magic link** and **Confirm signup**, with the subject `Kód na prihlásenie: {{ .Token }}`.
2. Connect your own mail sender (Gmail with an app password) and raise the email rate limit. The built-in sender only sends about 2 emails an hour.
3. Retry the PDF that failed (`4_CP A PODIELY_2026.pdf`) on the iPhone and on a PC. This will be the first real end-to-end run, so check the cost line and the `ai_usage` table.

**Next step**
After the first real upload works, build past exam mode in the app, which is feature 3 and the main paid feature. Students upload old exams, `pastExamSystem` / `rankTopics` from `ai/tasks.js` link the questions to the subject's topics and rank them, and the quiz practises the topics in that order. After that come keeping subjects in Supabase so they appear on every device, and the exam countdown plan (feature 4).

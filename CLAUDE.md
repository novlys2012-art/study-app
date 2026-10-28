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
| Accounts, database, storage, server function | Supabase, Frankfurt region (from phase 2) |
| AI | Behind `ai/index.js`, swappable by env variable. Default Claude Haiku 5.5 (`claude-haiku-5-5`) for summaries, quizzes and topics, Claude Sonnet 5.5 (`claude-sonnet-5-5`) for past exams. Google Gemini is wired in and being compared on cost. |
| Payments | RevenueCat (stores) and Stripe (web), phase 7 |
| iPhone builds | Codemagic free tier |

## Rules

- **AI keys never ship in the app.** Only `scripts/` and the Supabase server function (phase 3) call `ai/`. The server function checks the page quota and `file_cache` before every AI call.
- **Keep the provider swappable.** All AI calls go through `getProvider().complete({ tier, system, prompt })`. Prompts live in `ai/tasks.js` and must stay provider-neutral (plain text in, JSON out). A new provider is one file in `ai/providers/` plus its prices in `ai/prices.js`.
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
src/app/subjects.js   subjects and questions on the device (localStorage until Supabase in phase 2)
src/i18n/             sk.json, cs.json, t() and applyI18n()
src/styles/           app.css (all looks)
ai/                   provider layer (index.js, providers/, prices.js) and prompts (tasks.js)
scripts/ai-trial.mjs  phase 0 trial: run generation on real files and log tokens and cost
android/, ios/        Capacitor native projects
test/                 unit tests (npm test) and the browser smoke test (npm run smoke)
```

## Commands

```
npm install
npm run dev            # local dev server
npm test               # unit tests
npm run build && npm run smoke   # opens the app in Chromium, plays a round on a made-up subject, fails on any page error
npm run cap:sync       # build and copy into android/ and ios/
npm run trial -- --dry-run files...   # phase 0: extract and count tokens without AI calls
npm run trial -- files...             # phase 0: needs ANTHROPIC_API_KEY (or another provider) in .env
```

## Open decisions

- When to register a živnosť (before phase 7), or sell through Paddle instead.
- Age limit: 16+ only (recommended), or parental consent for younger students.
- Whether the repo stays public once it holds paid features.
- Which AI provider and models to use, after the cost comparison.

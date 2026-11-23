# Security to-do

From a code-level review on 23 Nov 2026 (no live testing). Tick items off here and in `STATUS.md` §5 as they land.

## High

- [ ] **Make the spending check atomic.** `server/generate.js` `handle()` reads spending (`spend()`), runs the AI call, and records the cost only after the call returns, so requests running at the same time all pass the monthly, daily and per-minute checks. Fix: a SQL function `ai_reserve(uid, est_usd, month_limit, daily_limit, per_minute)` that takes `pg_advisory_xact_lock`, re-checks the sums and inserts an `ai_usage` row at the worst-case cost (input chars/4 × input price + `maxTokens` × output price + ~1.6k tokens per image). After the call, the row is set to the real cost (0 on failure). Wire it into `supabase/functions/generate/index.ts` in place of `spend` + `record`, and update the fakes in `test/server.test.mjs`.
  - *Partly in progress (uncommitted work of 23 Nov: `RESERVE_USD`, `MAX_CONCURRENT`, `reserve`/`release`, `20261123140000_usage_hardening.sql`).* Still open in that version: (a) `spend()` → `reserve()` holds no lock, so parallel requests can still pass the check together; (b) `RESERVE_USD.strong = 0.04` is below the worst case of a Sonnet call with 16k output (~\$0.18); (c) the in-memory `inFlight` exists per Edge Function instance, not globally.
- [ ] **Keep the global daily cap from being a kill switch.** `DAILY_LIMIT_USD` (default \$5) adds up all users' spending, so a small number of free accounts can switch the AI off for everyone until midnight UTC. Options: raise it well above normal load and treat it as an alarm, give new accounts a smaller cap, turn on Supabase Auth CAPTCHA for sign-up, block disposable email domains.

## Medium

- [ ] **Limit rows per user.** `subjects` (4 MB per row) and `reviews` have no limit on the number of rows per `user_id`, so one account could fill the database through the REST API. Fix: a `before insert` trigger with a per-user row limit (e.g. 200 subjects, 200k reviews), and/or a lower size check. Add a case to `test/db/rls.sql`.
- [ ] **Enforce free-tier picture limits on the server.** "6 picture pages per file" (`src/upload/ui.js` `maxPictures`) and the photo-mode block only exist in the client; the server's `vision` task isn't plan-gated. Spending stays bounded by the credit cap once the first item is fixed. Fix if it matters: count vision pages per month on the server, by plan.

## Low

- [ ] **`ai_cache` and privacy.** The cached rows (AI output derived from users' files) stay after `delete_account`, and the `cached: true` field shows whether anyone else has already sent the same text. Add a TTL (e.g. 90 days) or a line in the privacy policy, and consider dropping `cached` from the response.
- [ ] **Malformed input returns 500.** `topics` (`x.id`) and `group` (`q.ref`) throw on `null` items, and `check` doesn't validate the shape of its questions. Filter out non-objects and return `bad_input`.
- [ ] **Malformed hash crashes the app.** `here()` in `src/app/app.js` calls `decodeURIComponent` without a try (`#%E0` → blank screen). Wrap it in try/catch and return `""`.
- [ ] **Add a Content-Security-Policy** meta tag to `index.html` (`script-src 'self'`, `connect-src 'self' https://*.supabase.co`). This is defense in depth; the DOM code is already free of `innerHTML` on user text.
- [ ] **CI:** `.github/workflows/mobile-release.yml` puts `github.event.inputs.version_name`/`version_code` straight into `run:`. Pass them through `env:` instead.
- [ ] **Dev server:** `vite.config.js` sets `host: "0.0.0.0"` plus `allowedHosts: true`, which exposes the dev server on the LAN with no host check. Keep it to the AI Studio container only.
- [ ] **Dashboard check:** keep "Confirm email" on, because `ALLOWED_EMAILS`/`PLUS_EMAILS` trust the email address. Turn on leaked-password protection if the plan has it.

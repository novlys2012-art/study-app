# Security to-do

From a code-level review on 23 Nov 2026 (no live testing). Tick items off here and in `STATUS.md` §5 as they land.

## High

- [x] **Make the spending check atomic.** Implemented `public.ai_reserve(...)` in `supabase/migrations/20261124120000_security_hardening.sql` using `pg_advisory_xact_lock`, worst-case cost estimation (`estimateMaxUsd` in `server/generate.js`), and pre-call row insertion/update/release wired into `supabase/functions/generate/index.ts`, with unit tests in `test/server.test.mjs` and Postgres tests in `test/db/rls.sql`.
- [x] **Keep the global daily cap from being a kill switch (code part).** Separated `FREE_DAILY_LIMIT_USD` (default \$3, Free accounts only) from the overall emergency ceiling `DAILY_LIMIT_USD` (default \$25, logs `daily_spend_high` at 80%) so Free-tier abuse cannot cut off paying Lekto Plus users.
  - [ ] *Dashboard follow-up before public launch:* turn on Supabase Auth CAPTCHA (Cloudflare Turnstile) for sign-up (`docs/live-setup.md` §3).

## Medium

- [x] **Limit rows per user.** Added `AFTER INSERT FOR EACH STATEMENT` row-limit triggers on `public.subjects` (200), `public.progress` (200), and `public.reviews` (200,000) in `supabase/migrations/20261124120000_security_hardening.sql` with `test/db/rls.sql` coverage (including upsert-at-cap).
- [x] **Enforce free-tier picture limits on the server.** Tracked `vision_pages` on `public.ai_usage` and enforced `FREE_VISION_PAGES_MONTHLY` (default 18 pages/month on Free → `402 plus_required`) atomically inside `ai_reserve` and `server/generate.js`.

## Low

- [x] **`ai_cache` and privacy.** Added a 90-day TTL filter in `cache.get`, automatic `ai_cache_prune_expired` trigger on `public.ai_cache`, explicit 90-day anonymous cache retention wording in `public/privacy.html` & `public/cs/privacy.html`, and dropped `cached` from HTTP responses in `server/generate.js`.
- [x] **Malformed input returns 500.** Validated `body`, `input`, and item shapes in `topics`, `group`, `check`, and `check_problems` (`server/generate.js`) so malformed payloads return `400 bad_input`.
- [x] **Malformed hash crashes the app.** Wrapped `decodeURIComponent` in `here()` (`src/app/app.js`) in `try/catch` returning `""`, and added `#%E0` coverage to `test/smoke.mjs`.
- [x] **Add a Content-Security-Policy** meta tag to `index.html` (`default-src 'self'`, `script-src 'self'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: blob:`, `worker-src 'self' blob:`, `connect-src 'self' https://*.supabase.co ...`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`).
- [x] **CI:** Passed `github.event_name`, `version_name`, and `version_code` through `env:` with validation in `.github/workflows/mobile-release.yml`.
- [x] **Dev server:** Scoped `host: "0.0.0.0"` and `allowedHosts: true` in `vite.config.js` / `package.json` to container environments only (defaults to `127.0.0.1` locally).
- [ ] **Dashboard check:** keep "Confirm email" on, because `ALLOWED_EMAILS`/`PLUS_EMAILS` trust the email address. Turn on leaked-password protection if the plan has it.

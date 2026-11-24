# Connecting the live site

The site at https://novlys2012-art.github.io/study-app/ can upload files and turn them into summaries, topics and a quiz once a Supabase project is connected. Until then the upload screen says it is not connected and everything else works.

How it fits together:

- **In the browser:** sign-in by email link, the AI consent screen, reading the files (PDF, PPTX, DOCX, TXT). The files themselves never leave the device; only their text, and pictures of pages that have no text, are sent.
- **Supabase server function `generate`:** holds the Claude key, checks who is calling, checks the per-minute limit and the spending caps, calls Claude, and records the cost of every call in the `ai_usage` table. Answers are also kept in `ai_cache`, so the same request again (an upload that failed half-way and is run again) costs nothing.
- **Results** are saved in the browser and, for a signed-in student, in their account (table `subjects`, and the answer log in `reviews`), so they come back after signing in on another device or after the browser cleared its storage.

All keys go into the Supabase or GitHub settings pages below. Never paste a key into a chat, an issue or a file in this repo.

## 1. Claude key (Anthropic console)

1. Open https://console.anthropic.com/settings/keys and create a key named `lekto-live`. A separate key from the trial one lets you switch it off on its own.
2. Open https://console.anthropic.com/settings/limits and set a monthly spend limit (for example $10). This is the last safety net under the app's own caps.

Keep the key open in that tab for step 4.

## 2. Supabase project

1. Open https://supabase.com/dashboard/new and create a project: name `lekto`, region **Central EU (Frankfurt)**, Free plan. Let it generate a database password and save that password in your password manager.
2. When it is ready, copy two public values (you will paste them into GitHub in step 5):
   - **Project ref**: Project Settings → General → Project ID (20 lowercase letters).
   - **Publishable key**: Project Settings → API Keys → `sb_publishable_...` (the legacy `anon` key works too).

## 3. Sign-in

Students register with an email + password (min. 8 characters) and verify their email once with an 8-digit code, then log in directly with email + password (plus a code-based "Forgot password" flow that also lets earlier passwordless accounts set a password).

**Auth settings.** Authentication → Providers → Email:

- Ensure **Enable Email provider** and **Confirm email** stay turned ON (`ALLOWED_EMAILS` and `PLUS_EMAILS` trust the verified email address).
- Under Authentication → Settings → Password Settings, set **Minimum password length** to `8`, and turn on **Leaked password protection** if your Supabase plan supports it.
- Before opening sign-ups publicly, enable **CAPTCHA protection** (Cloudflare Turnstile) under Authentication → Attack Protection to stop automated free-account bursts.

**URLs.** Authentication → URL Configuration:

- **Site URL:** `https://novlys2012-art.github.io/study-app/`
- **Redirect URLs:** add `https://novlys2012-art.github.io/study-app/` and `http://localhost:5173/`

**The emails.** Authentication → Emails → Templates (switch each editor to Source):

1. **Confirm signup**
   - **Subject:** `Overovací kód pre Lekto`
   - **Body:** paste the whole of [`supabase/templates/sign-in.html`](../supabase/templates/sign-in.html).
2. **Reset password**
   - **Subject:** `Obnovenie hesla v Lekto`
   - **Body:** paste the whole of [`supabase/templates/reset-password.html`](../supabase/templates/reset-password.html).

Both templates intentionally send only the verification code with no external redirect link (`{{ .ConfirmationURL }}`), which avoids cross-domain spam flags and works cleanly on iOS/Android.

**Your own mail sender (avoiding spam).** Supabase's built-in sender (`noreply@mail.app.supabase.io`) is a shared domain with low reputation and a 2-email/hour cap — it frequently lands in Spam. Sending transactional auth mail from a personal `@gmail.com` SMTP account also often gets filtered because consumer Gmail accounts are not meant for app auth mail.

- **Recommended (even before launch): Resend (or Postmark / Brevo) with your own domain.** Buy a cheap domain (e.g. `lekto.sk`), add it in https://resend.com, publish the **SPF**, **DKIM**, and **DMARC** (`v=DMARC1; p=none;` -> later `p=quarantine;`) DNS records Resend gives you, then set Supabase Authentication → Emails → SMTP Settings to `smtp.resend.com`, port `465`, username `resend`, password = API key, sender `prihlasenie@<your-domain>`, sender name `Lekto`. The free plan sends 100 emails/day (3,000/month) and lands in Primary inbox reliably.
- **Quick personal testing only (expect Spam folder): Gmail SMTP.** Turn on 2-Step Verification for your Google account, create an app password at https://myaccount.google.com/apppasswords, and fill in `smtp.gmail.com`, port `465`, username = your Gmail address, password = the 16-letter app password.

After configuring custom SMTP, raise the cap under Authentication → Rate Limits → "Rate limit for sending emails" (for example 30 an hour). Type passwords or API keys only into the Supabase dashboard, never into a chat.

## 4. Secrets for the server function

Edge Functions → Secrets (https://supabase.com/dashboard/project/_/functions/secrets), add:

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | the key from step 1 |
| `ALLOWED_EMAILS` | your email; add testers separated by commas. Leave it out to let anyone who signs in use it. |
| `PLUS_EMAILS` | optional, comma-separated emails (or `*` for all users) granted Lekto Plus (`150` credits/month + `Skúšky`, `Príklady`, `Vzory`). Accounts with `app_metadata.plan = "plus"` in Supabase Auth also get Plus. |
| `FREE_MONTHLY_LIMIT_USD` | optional, default `0.15` (15 credits per calendar month on the free plan) |
| `PLUS_MONTHLY_LIMIT_USD` | optional, default `1.5` (150 credits per calendar month on Lekto Plus) |
| `USER_MONTHLY_LIMIT_USD` | optional legacy override when `FREE_MONTHLY_LIMIT_USD` / `PLUS_MONTHLY_LIMIT_USD` are not set |
| `FREE_DAILY_LIMIT_USD` | optional, default `3` (total Free-tier AI spend per UTC day; isolated so Free bursts cannot block Lekto Plus users) |
| `DAILY_LIMIT_USD` | optional, default `25` (overall emergency AI spending ceiling per UTC day across all users; logs a warning at 80%) |
| `FREE_VISION_PAGES_MONTHLY` | optional, default `18` (monthly picture-page OCR cap on Free before requiring Lekto Plus) |
| `USER_RATE_PER_MINUTE` | optional, default `60` (AI tasks one account may run in a minute; the app waits and tries again when it is reached) |

## 5. GitHub settings

1. Create a Supabase access token at https://supabase.com/dashboard/account/tokens, named `github-deploy`.
2. Open https://github.com/novlys2012-art/study-app/settings/secrets/actions.
   - **Secrets** tab → New repository secret:
     - `SUPABASE_ACCESS_TOKEN`: the token from 5.1
     - `SUPABASE_DB_PASSWORD`: the database password from step 2
   - **Variables** tab → New repository variable:
     - `SUPABASE_PROJECT_REF`: the project ref
     - `SUPABASE_PUBLISHABLE_KEY`: the publishable key

## 6. Deploy and try it

1. Merge the pull request that added this file. The merge runs **Deploy server** (creates the usage table and the function) and **Deploy web preview** (rebuilds the site with the Supabase address) by themselves; watch them at https://github.com/novlys2012-art/study-app/actions. Both also run on every later merge.
   If you add the GitHub settings after the merge, run them by hand: on the Actions page pick **Deploy server** in the left list, then **Run workflow** on the right; then the same for **Deploy web preview**. These buttons only exist once the workflows are on `main`.
2. Open the site, choose **Pridať predmet**, enter your email, type the code from the email (you can read it on your phone), agree to the AI screen, pick a file and start.

## What it costs

Each file goes through: pictures of text-less pages read by Sonnet, a summary and questions by Haiku, a check of the questions by Sonnet, and one topic call by Haiku. A typical lecture deck should cost a few cents; the upload screen shows what you have spent this month against your limit. Every call is in the `ai_usage` table (Table Editor) with its tokens and cost; rows with `cached` ticked were answered from `ai_cache` for free. If an upload stops half-way, add the same files again: the parts that finished are not paid for twice.

## Running it on your computer

`npm run dev` with a `.env.local` file containing `VITE_SUPABASE_URL=https://<project ref>.supabase.co` and `VITE_SUPABASE_KEY=<publishable key>` uses the same Supabase project. `npm run e2e` tests the whole upload flow with a fake server and a fake AI, no keys needed.

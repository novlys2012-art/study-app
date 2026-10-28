# Connecting the live site

The site at https://novlys2012-art.github.io/study-app/ can upload files and turn them into summaries, topics and a quiz once a Supabase project is connected. Until then the upload screen says it is not connected and everything else works.

How it fits together:

- **In the browser:** sign-in by email link, the AI consent screen, reading the files (PDF, PPTX, DOCX, TXT). The files themselves never leave the device; only their text, and pictures of pages that have no text, are sent.
- **Supabase server function `generate`:** holds the Claude key, checks who is calling, checks the spending caps, calls Claude, and records the cost of every call in the `ai_usage` table.
- **Results** are saved in the browser like every other subject (accounts and sync come later).

All keys go into the Supabase or GitHub settings pages below. Never paste a key into a chat, an issue or a file in this repo.

## 1. Claude key (Anthropic console)

1. Open https://console.anthropic.com/settings/keys and create a key named `study-app-live`. A separate key from the trial one lets you switch it off on its own.
2. Open https://console.anthropic.com/settings/limits and set a monthly spend limit (for example $10). This is the last safety net under the app's own caps.

Keep the key open in that tab for step 4.

## 2. Supabase project

1. Open https://supabase.com/dashboard/new and create a project: name `study-app`, region **Central EU (Frankfurt)**, Free plan. Let it generate a database password and save that password in your password manager.
2. When it is ready, copy two public values (you will paste them into GitHub in step 5):
   - **Project ref**: Project Settings → General → Project ID (20 lowercase letters).
   - **Publishable key**: Project Settings → API Keys → `sb_publishable_...` (the legacy `anon` key works too).

## 3. Sign-in

Students sign in with a 6-digit code from an email, so they can read the email on their phone and type the code on the computer. The link in the same email also works, but only in the browser that asked for it.

**URLs.** Authentication → URL Configuration:

- **Site URL:** `https://novlys2012-art.github.io/study-app/`
- **Redirect URLs:** add `https://novlys2012-art.github.io/study-app/` and `http://localhost:5173/`

**The email.** Authentication → Emails → Templates. Do this for both **Magic link** and **Confirm signup**, because a first sign-in uses the second one:

- **Subject:** `Kód na prihlásenie: {{ .Token }}`
- **Body:** switch the editor to source and paste the whole of [`supabase/templates/sign-in.html`](../supabase/templates/sign-in.html) (open it on GitHub, press the copy button).

**Your own mail sender.** Supabase's built-in sender only sends about 2 emails an hour for the whole project, and only to members of your Supabase organisation. Connect your own sender to lift both limits. Authentication → Emails → SMTP Settings → enable custom SMTP:

- **Without your own domain: Gmail.** Turn on 2-Step Verification for your Google account, then create an app password at https://myaccount.google.com/apppasswords (name it `study-app`). Fill in host `smtp.gmail.com`, port `465`, username = your Gmail address, password = the 16-letter app password, sender email = your Gmail address, sender name `Study App`. Gmail allows about 500 emails a day, plenty for testing.
- **With your own domain (later): Resend.** Sign up at https://resend.com, add and verify your domain, create an API key, then fill in host `smtp.resend.com`, port `465`, username `resend`, password = the API key, sender email `prihlasenie@<your domain>`. The free plan sends 100 emails a day. Without a verified domain Resend only delivers to your own address.

After that, raise the cap under Authentication → Rate Limits → "Rate limit for sending emails" (for example 30 an hour). Type the password or key only into the Supabase page, never into a chat.

## 4. Secrets for the server function

Edge Functions → Secrets (https://supabase.com/dashboard/project/_/functions/secrets), add:

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | the key from step 1 |
| `ALLOWED_EMAILS` | your email; add testers separated by commas. Leave it out to let anyone who signs in use it. |
| `USER_MONTHLY_LIMIT_USD` | optional, default `1` (each account's AI spending per calendar month) |
| `DAILY_LIMIT_USD` | optional, default `5` (the whole app's AI spending per day, UTC) |

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

Each file goes through: pictures of text-less pages read by Sonnet, a summary and questions by Haiku, a check of the questions by Sonnet, and one topic call by Haiku. A typical lecture deck should cost a few cents; the upload screen shows what you have spent this month against your limit. Every call is in the `ai_usage` table (Table Editor) with its tokens and cost.

## Running it on your computer

`npm run dev` with a `.env.local` file containing `VITE_SUPABASE_URL=https://<project ref>.supabase.co` and `VITE_SUPABASE_KEY=<publishable key>` uses the same Supabase project. `npm run e2e` tests the whole upload flow with a fake server and a fake AI, no keys needed.

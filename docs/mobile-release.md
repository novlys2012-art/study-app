# Shipping Lekto on Mobile & Tablet (iOS, iPadOS, Android & PWA)

This guide covers everything needed to build, sign, verify, and submit the mobile/tablet version of Lekto (`sk.lekto.app`) to the Apple App Store, Google Play Store, and as an installable PWA.

## 1. Before Your First Store Build

1. **Deploy the updated Supabase Edge Function** so production supports in-app account deletion (`task: "delete_account"`):
   - Push to `main` (runs `.github/workflows/server.yml`) or run `npm run fn:prepare` and redeploy `generate`.
2. **Set build-time Supabase variables** in GitHub (`Settings -> Secrets and variables -> Actions -> Variables`):
   - `SUPABASE_PROJECT_REF`
   - `SUPABASE_PUBLISHABLE_KEY`
3. **Verify locally (on a machine with Node 22) or via GitHub Actions `Build`**:
   - `npm ci && npm test && npm run lint && npm run build && npm run smoke && npm run e2e`

## 2. Android (Google Play Store `.aab`)

### One-time upload keystore setup
Generate a Play Store upload keystore (store the `.jks` file and passwords safely in a password manager — never commit them):

```bash
keytool -genkey -v -keystore lekto-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias lekto
```

Base64-encode the keystore (`base64 -w 0 lekto-upload.jks`) and add these GitHub Actions Secrets:
- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS` (`lekto`)
- `ANDROID_KEY_PASSWORD`

### Building a release `.aab`
- Trigger **Actions -> Mobile Release (Android Play Store AAB)** (or push a tag like `v1.0.0`).
- Download `lekto-android-release-aab` and upload the `.aab` to Google Play Console (Internal testing -> Closed/Production).

### Play Console Data Safety & Policy Notes
- **Data collected**: Email address (account authentication), user-generated study content (summaries/questions/answers synced to the user's account). Not shared for advertising or tracking.
- **Account deletion**: Supported directly in-app (`Profil -> Odstrániť účet`). Also keep a web privacy/deletion notice at `privacy.html`.
- **Permissions**: Only `INTERNET` and `POST_NOTIFICATIONS` (optional, requested only when the user enables Daily Reminders). No exact-alarm special permission is used.
- **Large screens & tablets**: Adaptive layouts support phone portrait/landscape, tablet portrait (2-column grids), and tablet landscape (side rail + split subject/reader workspaces).

## 3. iOS & iPadOS (Apple App Store / TestFlight via Codemagic)

`codemagic.yaml` targets universal iPhone + iPad (`TARGETED_DEVICE_FAMILY = "1,2"`, `UIRequiresFullScreen = false` for iPad Split View/Slide Over) with `PrivacyInfo.xcprivacy`, `ITSAppUsesNonExemptEncryption = false`, and Slovak/Czech localizations preconfigured.

### One-time Codemagic setup
1. Connect the GitHub repo in [Codemagic](https://codemagic.io/) (free tier: 500 macOS build minutes/month).
2. Add an **App Store Connect API key** integration named `app_store_connect` (Team settings -> Integrations).
3. Create an environment variable group named `lekto_app` containing:
   - `VITE_SUPABASE_URL` (`https://<project-ref>.supabase.co`)
   - `VITE_SUPABASE_KEY` (`sb_publishable_...`)
   - `APP_STORE_APPLE_ID` (numeric Apple ID from App Store Connect -> App Information)
4. Create the app record for bundle ID `sk.lekto.app` in App Store Connect.
5. Run the **Lekto iOS & iPadOS Release** workflow in Codemagic to build and push directly to TestFlight.

### App Store Review Notes (Include in Review Submission)
- **Sign-in**: Email + password login with 8-digit email verification code on sign-up and code-based password reset; provide a reviewer test account or remove `ALLOWED_EMAILS` restriction before review. Students can also explore the built-in sample subject without signing in.
- **Account deletion (Guideline 5.1.1(v))**: Available in `Profil -> Odstrániť účet`, permanently deleting the auth user and cascading all synced subjects, answers, and usage records.
- **AI disclosure**: One-time upload consent screen explicitly discloses Claude (Anthropic) before any text or textless-page image is sent; original uploaded files stay on the device.
- **Age rating**: 16+ (aligned with `CLAUDE.md` privacy rule and signup confirmation checkbox).

## 4. Installable Mobile & Tablet PWA (Web)

- `public/manifest.webmanifest`, `public/sw.js`, and `public/icons/` (`192`, `512`, `maskable`, `apple-touch-icon`) ship automatically with `npm run build` / GitHub Pages deployment.
- On iOS Safari (`Share -> Add to Home Screen`) and Android Chrome (`Install app`), Lekto opens standalone with themed status bar, offline-cached app shell, and local subjects/quiz access.

## 5. On-Device Smoke Checklist Before Release

Test on at least one physical iPhone, one Android phone, and one tablet (iPad or Android tablet) in both portrait and landscape, light and dark mode:
- [ ] Launch splash screen matches light/dark mode with zero white flash.
- [ ] Status bar icons stay legible across `Účtovná kniha`, `Kocky`, `Riso`, `Zošit`, `Tabuľa`, and `Čistý` in light and dark modes.
- [ ] Android hardware Back button / predictive back closes bottom sheets first, quits quiz safely, navigates back, and backgrounds on `Dnes`.
- [ ] Bottom sheets dismiss smoothly on downward swipe without blocking internal scrolling.
- [ ] Soft keyboard never covers inputs in Sign-In, Custom Round, Exam Date, or Upload.
- [ ] File upload picker selects PDF, PPTX, DOCX, TXT, and (in Past Exams mode) camera/gallery photos.
- [ ] Enabling Daily Reminders in `Profil` requests OS permission, schedules notifications, and tapping a reminder opens the right subject.
- [ ] `Profil -> Odstrániť účet` deletes a disposable test account cleanly and returns to `#welcome`.

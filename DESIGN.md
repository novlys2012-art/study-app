---
name: Lekto
description: Authoritative Central European technical-compendium design language ("Alfa Skriptum") — Prussian-cobalt cloth shell, calendered blueprint daylight sheets, Cobalt Press actions, and unboxed Sulfur + Margin Locus source proof.
colors:
  paper: "#eef3f8"
  sheet: "#fbfdff"
  subtle: "#e2eaf3"
  shell: "#10233d"
  shell-elev: "#193256"
  shell-rule: "#27446e"
  on-shell: "#f4f8fc"
  shell-muted: "#b8c8de"
  ink: "#0f1726"
  muted: "#445166"
  ink-subtle: "#58667c"
  rule: "#cbd5e3"
  input-border: "#68778d"
  cobalt: "#154da3"
  cobalt-hover: "#0e3b82"
  cobalt-soft: "#dfeafa"
  on-cobalt: "#ffffff"
  mark: "#f4e547"
  mark-wash: "#fbf5be"
  mark-ink: "#0f1726"
  ok: "#156d3b"
  ok-soft: "#e2f4e9"
  no: "#b8292f"
  no-soft: "#fce8e8"
  warn: "#8c5100"
  warn-soft: "#fdf0d5"
  dark-paper: "#0d131d"
  dark-sheet: "#141d2b"
  dark-subtle: "#1d293b"
  dark-shell: "#090e16"
  dark-shell-elev: "#152033"
  dark-shell-rule: "#23324a"
  dark-on-shell: "#e6ecf3"
  dark-shell-muted: "#9eadc2"
  dark-ink: "#e6ecf3"
  dark-muted: "#9aa8bc"
  dark-ink-subtle: "#8191a6"
  dark-rule: "#233044"
  dark-input-border: "#5e6e84"
  dark-cobalt: "#73b2ff"
  dark-cobalt-hover: "#8ec2ff"
  dark-cobalt-soft: "#172b46"
  dark-on-cobalt: "#091526"
  dark-mark: "#3b3512"
  dark-mark-wash: "#2d2912"
  dark-mark-ink: "#faf0b8"
  dark-ok: "#6dd092"
  dark-ok-soft: "#142c1e"
  dark-no: "#f28b7a"
  dark-no-soft: "#351c19"
  dark-warn: "#e7b75d"
  dark-warn-soft: "#342812"
typography:
  display:
    fontFamily: "\"Schibsted Grotesk\", system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "clamp(2.25rem, 4.8vw, 3.375rem)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.032em"
  headline:
    fontFamily: "\"Schibsted Grotesk\", system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.14
    letterSpacing: "-0.026em"
  title:
    fontFamily: "\"Schibsted Grotesk\", system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "1.3125rem"
    fontWeight: 700
    lineHeight: 1.18
    letterSpacing: "-0.02em"
  body:
    fontFamily: "\"Schibsted Grotesk\", system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.52
    letterSpacing: "0em"
  reading:
    fontFamily: "\"Literata\", Georgia, \"Times New Roman\", serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "0em"
  label:
    fontFamily: "\"Schibsted Grotesk\", system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "-0.005em"
  code:
    fontFamily: "\"JetBrains Mono\", ui-monospace, Consolas, monospace"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: "0em"
rounded:
  ctl: "4px"
  card: "6px"
  sheet-mobile: "10px"
  track: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
  3xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.on-cobalt}"
    typography: "{typography.body}"
    rounded: "{rounded.ctl}"
    padding: "10px 20px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.cobalt-hover}"
  button-ghost:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.ctl}"
    padding: "10px 20px"
    height: "48px"
  button-rail:
    backgroundColor: "{colors.shell-elev}"
    textColor: "{colors.on-shell}"
    typography: "{typography.body}"
    rounded: "{rounded.ctl}"
    padding: "8px 12px"
    height: "44px"
  sheet:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "20px 24px"
  input:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.ctl}"
    padding: "10px 14px"
    height: "48px"
---

# Design System: Lekto

## Overview

**Creative North Star: "Alfa Skriptum"**

Lekto is built for Slovak and Czech university students studying under exam pressure—phone in one hand on a tram at 23:30 or laptop open at a faculty reading desk (*študovňa*) in daylight. **Alfa Skriptum** anchors the product in the tradition of Central European clothbound technical compendia (*Alfa Bratislava* and *SNTL Praha*): composed senior-classmate authority that cuts straight to what to study next without sterile all-white SaaS timidity, Duolingo gamification, or warm-cream literary AI clichés.

The system scales ambition strictly by surface mode across **Light**, **Dark**, and **Auto** (`prefers-color-scheme`). On `#welcome` (Persuade), a full-bleed **Prussian Cloth** stage dramatizes Lekto's core truth—turning a missed quiz question into the exact cited sentence in the student's own uploaded notes. On daily study screens (Operate), standard controls and predictable spatial hierarchy let the task lead while Prussian cloth rails/headers, crisp `4px`/`6px` bookbinding geometry, and Cobalt Press actions carry the world. On `#reader` and `#<subject>/review` (Read), `Schibsted Grotesk` owns the frame so a calm `65ch` `Literata` column can be read effortlessly for hours.

**Key Characteristics:**
- **Committed Prussian-Cloth shell over calendered blueprint paper:** Whole structural zones (`#welcome` hero stage, desktop navigation rail, `#today` priority subject band, legal mastheads, and toast notifications) commit to deep Prussian Cloth rather than floating white nav over grey backgrounds.
- **One signature move ("The Margin Locus & Tear-Proof"):** Cited evidence pairs an unboxed **Sulfur Highlighter** `<mark class="hl">` sentence with a compact **`§ str. N` locus badge** and dashed tear-register rule—zero nested colored boxes, zero one-sided card stripes.
- **Role-separated Central European typography:** Self-hosted variable `Schibsted Grotesk` (`400–800`) drives 100% of Persuade and Operate UI, headings, and pure numeric figures, while Prague-born `Literata` (`opsz 7–72`, `400–600`) appears exclusively inside summary prose (`#reader`, `#review`, and the `#welcome` proof excerpt).
- **Bookbinding geometry & hairline ledgers:** Tight `4px` control corners and `6px` sheet corners with `1px` structural rules replace pillowy SaaS card stacks, SVG progress rings, blur/glassmorphism, and decorative motion.

## Colors

Both Light and Dark palettes are intentionally composed in perceptual OKLCH (`hue 245°–254°` cobalt-mineral cool ground contrasted against `102°` Sulfur proof), meeting WCAG AA (`>= 4.5:1` text, `>= 3:1` controls/borders) and AAA (`>= 7:1` primary ink, shell, and CTA pairs) across every surface.

### Primary
- **Cobalt Press** (`--ledger` / `colors.cobalt` in Light, `colors.dark-cobalt` in Dark): The screen's single filled primary CTA button, active mobile tab indicator, `3px` progress fill, `2px` reader scroll rule, keyboard focus ring on light surfaces, and source-jump links (`Pozrieť v zhrnutí · str. 4`).
- **Cobalt Deep & Cobalt Wash** (`--ledger-hover`, `--ledger-soft`): Primary CTA hover state and tinted selection/notice wash (`#roundSheet` checked topic row, `Kontext` active pill, `.tipbox`).

### Secondary
- **Prussian Cloth** (`--shell` / `colors.shell` in Light, `colors.dark-shell` in Dark): Committed structural shell color owning the `#welcome` masthead and hero stage, the `>= 900px` desktop navigation rail, the `#today` priority exam header band, static legal mastheads, and floating toasts/tooltips.
- **Prussian Elevated, Prussian Rule & Študovňa Lamp** (`--shell-elev`, `--shell-rule`, `--shell-lamp`, `--shell-lamp-soft`, `--shell-grid`, `--shell-grid-major`, `--shell-rim`): Recessed interactive fills, active rail tabs, hairline borders, and directional library-lamp illumination inside Prussian Cloth regions, paired with **Prussian Chalk** (`--on-shell`) and hue-tinted **Prussian Mist** (`--shell-muted`) text.

### Tertiary
- **Sulfur Highlighter** (`--mark` / `colors.mark` in Light, `colors.dark-mark` with `colors.dark-mark-ink` in Dark): Reserved for inline `<mark class="hl">` cited source passages, `::selection` highlight, the brand-mark proof bar, and high-contrast (`11.8:1`) `:focus-visible` outlines inside dark Prussian Cloth regions (`--focus-shell`).
- **Semantic Status Triads** (`--ok`, `--no`, `--warn` and `-soft` washes): Verified Green for correct answers and completed uploads; Vermilion for wrong answers, `aria-invalid` fields, destructive confirmations, and `100%` quota; Deadline Amber for exams within 7 days and `>= 80%` monthly credit warnings.

### Neutral
- **Calendered Paper** (`--paper` / `colors.paper` in Light, `colors.dark-paper` in Dark): Glare-free `245°` blueprint-tinted canvas and native status/navigation bar color on Operate and Read screens.
- **Compendium Sheet & Inset Slate** (`--sheet`, `--subtle`): Crisp reading/working containers, hairline index lists, modal dialogs, form inputs, and hover/track states.
- **Cobalt-Carbon Ink Scale & Structural Rules** (`--ink`, `--muted`, `--ink-subtle`, `--rule`, `--input-border`): Three-step cobalt-tinted text hierarchy (`17.2:1`, `7.8:1`, `5.2:1` in Light; `13.9:1`, `6.8:1`, `5.1:1` in Dark) plus `1px` dividers (`--rule`) and `>= 3.4:1` field borders (`--input-border`).

### Named Rules
- **The One-Cobalt Rule.** Each screen exposes at most one solid Cobalt Press CTA button (on `#welcome`'s Prussian stage, one crisp `#fbfdff` primary sheet button); secondary actions use ghost, plain, or recessed Prussian rail styling.
- **The Tinted-Surface Rule.** Never place neutral grey text or low-contrast Cobalt focus rings on Prussian Cloth or semantic washes; use `--shell-muted` / `--on-shell` and `--focus-shell` on Prussian Cloth, and matching semantic hue tokens on status surfaces.
- **The Unboxed-Proof Rule.** Cited proof uses inline Sulfur `<mark class="hl">` and a `§` locus badge or dashed tear-register divider—never a nested colored box or a one-sided colored border on a rounded card.

## Typography

**Display & UI Font:** `Schibsted Grotesk` (self-hosted variable WOFF2 `400–800` in `public/fonts/fonts.css`, fallback `system-ui, -apple-system, "Segoe UI", sans-serif`)
**Reading Font:** `Literata` (self-hosted variable WOFF2 `opsz 7–72`, `400–600`, fallback `Georgia, "Times New Roman", serif`)
**Label/Mono Font:** `JetBrains Mono` (`500`, fallback `ui-monospace, Consolas, monospace`)

**Character:** `Schibsted Grotesk` brings crisp neo-grotesque authority and clean Slovak/Czech caron spacing (`ľ`, `ť`, `ď`, `ĺ`, `ŕ`, `ô`, `ä`, `ě`, `ř`, `ů`) across navigation, headings, and controls, while Prague-designed `Literata` gives multi-hour study summaries effortless coursebook legibility. `JetBrains Mono` is strictly restricted to OTP verification codes, `<kbd>` shortcut chips, numeric problem inputs, and inline formulas.

### Hierarchy
- **Display** (`800`, `clamp(2.25rem, 4.8vw, 3.375rem)`, `1.05`, `-0.032em`): Persuade hero headline on `#welcome` and tabular exam countdown figure (`2.75rem`, `800`).
- **Headline** (`700`, `1.75rem` mobile / `2rem` at `>= 1100px`, `1.14`, `-0.026em`): Fixed-rem Operate screen titles (`Dnes`, `Predmety`, `Profil`).
- **Title** (`700`, `1.25rem`–`1.3125rem`, `1.18`–`1.28`, `-0.02em`): Subscreen topbar titles, `#today` priority subject name, `dialog.bsheet` headers, quiz questions (`600`, `1.3125rem`, `1.34`), and `Schibsted Grotesk` summary section headings (`.md h3`, `28px` top margin vs `2px` bottom margin).
- **Reading** (`400` Light / `430` Dark, `1.0625rem` / `17px`, `1.65` Light / `1.70` Dark, max `65ch`): `Literata` summary prose inside `.md p`, `.md li`, and `.rev-excerpt p`.
- **Body** (`400` / `600`, `1rem` / `16px`, `1.52`): Buttons, quiz options, form fields, and list row titles.
- **Label** (`600`–`700`, `0.8125rem`–`0.875rem`, `1.35`, `-0.005em`): Plain sentence-case section labels, topic metadata, exam frequency ratios (`v 4 z 5 skúšok`), and `§ str. N` locus badges.

### Named Rules
- **The Prose-Fence Rule.** `Literata` is strictly fenced inside summary reading paragraphs (`.md p`, `.md li`, `#rBody > p:not(.hint)`, `.rev-excerpt p`); it never appears in headings, buttons, navigation, or cards.
- **The Proportional-Punctuation Rule.** Apply `font-variant-numeric: tabular-nums` only to pure numeric/count/percentage/price columns (`.countdown b`, `.sum-pct`, `.rc-pct`, `.tbar-top .pct`, `.count`, `.score`, `.result-pct`, `.up-pct`, `.limit-pct`, `.w-plan-price`, `.plus-price`), never to prose sentences or `.pdf` / `str.` locus strings where `Schibsted Grotesk`'s tabular period widens punctuation.
- **The Three-Axis Halation Rule.** Dark mode compensates light-on-dark reading on all three perceptual axes simultaneously: line-height (`1.65 → 1.70`), body letter-spacing (`0 → +0.005em`), and `Literata` variable weight (`400 → 430`).
- **The No-Eyebrow Rule.** Never place uppercase tracked kickers or eyebrows above headings; metadata uses plain sentence case.

## Layout

Spacing runs on a 4 px base scale (`4 / 8 / 12 / 16 / 20 / 24 / 32 / 48 / 64 px`), with tight internal grouping (`8–12px`) and clear structural separation (`16–24px` in Operate, `48–64px` in Persuade).

- **Phone (`< 640px`, tested down to `360px`):** Single-column flow (`16px` safe-area-aware inline padding), solid `56px` bottom tab bar on top-level screens, inline `+ Nahrať` header action on `#today` and `#home`, and full-bleed Prussian `.w-stage` above `.w-body` on `#welcome`.
- **Tablet Portrait (`640–899px`):** `800px` max container (`24px` inline padding); `#today` `.sheet.hero` spans its Prussian `.hero-open` band across both columns while splitting plan + CTA (left) from tabular countdown + progress (right, `244px`); quiz options form a `2×2` grid; `#profile` splits into 2 columns at `>= 760px`.
- **Tablet Landscape & Desktop (`>= 900px` / `1280px`):** Committed **Prussian Cloth** left rail (`236px` at `900px`, `248px` at `>= 1100px`) replaces the bottom tab bar and hides mobile header add buttons. `dialog.bsheet` sheets become centered modals (`max-width: 500px`). `#subject` splits into a sticky `296px–320px` summary column + tab workspace; `#reader` pairs the `65ch` `Literata` column with a hairline-separated sticky `260px–280px` `Kľúčové pojmy` glossary rail.

## Elevation & Depth

Working surfaces are flat at rest, relying on the contrast between **Calendered Paper** (`--paper`), **Compendium Sheet** (`--sheet`), **Prussian Cloth** (`--shell`), and crisp `1px` rules (`--rule`) rather than card drop shadows or `backdrop-filter: blur()`.

### Shadow Vocabulary
- **Stage Specimen & Študovňa Lamp** (`--shadow-stage: 0 18px 38px -14px rgba(5, 11, 22, 0.42)` + `--shell-lamp` + masked `24px`/`120px` drafting grid): Lifts `#wProof` off `#welcome`'s Prussian `.w-stage` inside an asymmetric reading-lamp light cone that reveals a millimeter grid (`--shell-grid`, `--shell-grid-major`) strictly around the proof card via `mask-image`. Operate Prussian shells (`#today` `.hero-open`, desktop `#tabbar`, static legal `.band`) echo only a quiet `--shell-lamp-soft` catchlight and `1px` `--shell-rim` top highlight with zero grid lines behind labels.
- **Modal Overlay** (`--shadow-overlay: 0 18px 42px -12px rgba(9, 18, 34, 0.24)`): Centered desktop `dialog.bsheet` modals (`>= 900px`) over `rgba(8, 14, 24, 0.52)` backdrop.
- **Toast & Tooltip** (`--shadow-toast: 0 8px 22px -6px rgba(9, 18, 34, 0.26)`): Prussian-Cloth toast notifications and context help popovers only.

### Named Rules
- **The Flat-Workspace Rule.** Cards, sheets, rows, and buttons inside Operate and Read never carry drop shadows, neon glows, or hard offset shadows (`4px 4px 0`).
- **The Masked-Lamp Rule.** Technical drafting grids (`24px`/`120px`) appear exclusively on `#welcome`'s `.w-stage` masked inside the `--shell-lamp` pool behind `#wProof`—never behind `.w-copy` headlines/ledes and never inside Operate navigation or headers.
- **The Purposeful-Motion Rule.** Transitions use a single exponential ease-out (`--ease: cubic-bezier(0.22, 1, 0.36, 1)`, `120ms` control state, `180ms` screen/sheet/verdict). Under `prefers-reduced-motion: reduce`, spatial slides and press scales turn off while preserving non-animated state feedback (`.toast.on` stays `opacity: 1`, `.hl-block` retains `--mark-wash`).

## Shapes

Alfa Skriptum uses tight, architectural bookbinding radii so every control and sheet reads as cut paper and cloth rather than soft SaaS plastic:

- **Controls (`--r-ctl: 4px`):** Buttons, inputs, selects, quiz options, segmented thumbs, locus badges (`3px`), checkboxes (`3px`), and brand mark tiles.
- **Sheets & Ledgers (`--r-card: 6px`):** `.sheet`, `.list`, `#wProof`, `.w-plans`, `.w-rank-ledger`, and desktop modal dialogs (`10px` top corners on mobile bottom sheets).
- **Tracks (`999px`):** Strictly for `3px–6px` progress tracks, upload step bars, and mobile sheet grab handles.
- **Icons:** Inline `24×24` SVG set (`1.8px` uniform stroke, round caps/joins); the Lekto brand mark pairs a vertical compendium spine with three horizontal rules whose middle proof bar is filled in Sulfur (`#f4e547`).

## Components

Every interactive control maintains `>= 44×44px` tap targets at both `360px` and `1280px` and implements complete `default`, `hover`, `focus-visible`, `active`, `disabled`, and `aria-invalid` states.

### Buttons
- **Shape:** Crisp `4px` corners (`--r-ctl`), `600 1rem/1.2` `Schibsted Grotesk`, `48px` min-height (`50px` `.btn.wide`).
- **Primary (`.btn`):** Solid Cobalt Press (`--ledger`) with `--on-ledger` text; on `#welcome`'s Prussian stage, `#wGuest` uses crisp `#fbfdff` sheet fill with `#0f1726` ink (`15.8:1`) in Light and Cobalt in Dark.
- **Hover / Focus:** Shifts to `--ledger-hover` in `120ms`; `2px solid var(--ledger)` focus ring (`2px solid var(--focus-shell)` inside Prussian Cloth regions); `scale(0.988)` press detent.
- **Ghost / Plain / Rail (`.btn.ghost`, `.btn.plain`, `.rail-add.btn.ghost`):** Clean `--sheet` fill with `1px` `--rule` border on paper; recessed `--shell-elev` fill with `--shell-rule` border inside the Prussian desktop rail.

### Chips
- **Style:** `44px` min-height (`4px` radius), `1px solid var(--rule)` on `--sheet` (`.seg button`, `.chips button`, `.up-ctx`).
- **State:** Multi-choice / filter active states (`aria-pressed="true"`) invert to `--ink` fill + `--sheet` text (or `--ledger-soft` + `--ledger` border on `Kontext`), reserving Cobalt solid fills for the primary CTA. Compact 2–3-way settings toggles use `.seg.fill` on `--subtle` track.

### Cards / Containers
- **Corner Style:** `6px` compendium radius (`--r-card`), `overflow: hidden` when topped by a Prussian header band.
- **Background & Border:** `--sheet` fill with `1px solid var(--rule)`. On `#today`, `.sheet.hero` leads with a full-width Prussian `.hero-open` band (`--shell` Light / `--shell-elev` Dark) over the daylight plan body.
- **Hairline Lists (`.list`, `#subjects`, `#tbars`, `#files`, `.ranks`, `.up-list`):** Unified `1px`-bordered containers dividing visible rows with `1px` internal hairlines (`:not([hidden]) ~ :not([hidden])`), pairing tabular `%` with `3px` `.bar` tracks.

### Inputs / Fields
- **Style:** `48px` min-height, `--sheet` background, `1px solid var(--input-border)` (`>= 3.4:1` contrast), `4px` radius.
- **Focus:** `2px solid var(--ledger)` outline at `2px` offset; `caret-color: var(--ledger)`.
- **Error / Disabled:** `aria-invalid="true"` shifts border to `--no` paired with an inline `.err` banner (`1px solid var(--no)` on `--no-soft`); `:disabled` drops opacity to `0.45`.

### Navigation
- **Mobile (`< 900px`):** Solid `--sheet` bottom bar (`56px` + safe area) with 3 labeled icon tabs (`Dnes`, `Predmety`, `Profil`) and a `2px` top Cobalt active indicator.
- **Desktop (`>= 900px`):** Committed Prussian Cloth (`--shell`) left rail (`236px` / `248px`) housing the `44px` `.brand` button, `.rail-add.btn.ghost`, and full-width `.tab` items whose active state (`aria-current="page"`) uses `--shell-elev` fill, `1px` `--shell-rule` inset frame, and a Sulfur-accented icon.
- **Subject Tabs (`.utabs`):** Flat horizontal tabs (`>= 44×44px`) over a `1px` hairline with a `2px` Cobalt active underline.

### Tear-Proof & Margin Locus (`#wProof`, `.rev-excerpt`, `.hl-block`, `mark.hl`)
- **Tear-Proof Excerpt (`.w-proof`, `.rev-excerpt`):** Pairs a `Schibsted Grotesk` question/answer header with a `Literata` source excerpt across a `1px dashed` tear-register rule (`.rev-reg`) showing `Zo zhrnutia` on the left and the source file/page locus (`bunkova-biochemia.pdf · str. 4`) on the right.
- **Reader Margin Locus (`.hl-block[data-locus]`, `mark.hl`):** Jumping from `#openSrc` (`Pozrieť v zhrnutí · str. 4`) scrolls `#reader` to the matched `<p>` or `<li>`, gently settles `--mark-wash` to transparent (`li.hl-block` keeps zero negative margin so list bullets stay aligned), prepends an inline `§ str. 4` badge, and wraps the exact phrase in Sulfur `<mark class="hl">` (`padding: 1px 2px; margin: 0 -1px` so trailing periods stay flush).

## Do's and Don'ts

### Do:
- **Do** commit whole shell zones (`#welcome` `.w-stage`, desktop `#tabbar`, `#today` `.hero-open`, legal `.band`, `.toast`) to Prussian Cloth (`--shell`) and keep working sheets crisp (`--sheet` on `--paper`).
- **Do** fence `Literata` strictly inside summary reading paragraphs and keep 100% of UI controls, headings, and metadata in `Schibsted Grotesk`.
- **Do** pair every source-proof jump with `sourceLocus()` (`§ str. N` badge + unboxed Sulfur `<mark class="hl">`).
- **Do** verify every interactive target at `>= 44×44px` and keep `<meta name="theme-color">`, PWA manifest, legal pages, and native Android/iOS chrome synced with the active screen's top surface.

### Don't:
- **Don't** put one-sided colored stripes (`border-left: 3px solid ...`) on rounded boxes or wrap `<mark class="hl">` inside nested colored border cards.
- **Don't** apply `font-variant-numeric: tabular-nums` to prose sentences, dates with dots (`30. 11.`), or `.pdf` / `str.` locus strings in `Schibsted Grotesk`.
- **Don't** use neutral grey text or dark Cobalt focus outlines inside Prussian Cloth regions—always use `--shell-muted` / `--on-shell` and `--focus-shell` (`#f4e547`).
- **Don't** introduce uppercase kickers/eyebrows, SVG progress rings, `backdrop-filter: blur()`, hard offset shadows, decorative monospace labels, or gamification (streaks, XP, badges).

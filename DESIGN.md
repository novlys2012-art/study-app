---
name: Lekto
description: Minimalistic, no-fuss study app design language ("Clean Proof") — flat mineral paper, 1px hairline structure, one spruce action ink, and one marker highlight for cited source proof.
colors:
  paper: "#f7f7f5"
  sheet: "#ffffff"
  subtle: "#efefea"
  ink: "#161716"
  muted: "#595b57"
  ink-subtle: "#6e706b"
  rule: "#e2e2dc"
  input-border: "#878983"
  spruce: "#14524c"
  spruce-hover: "#0e3e39"
  spruce-soft: "#e5f0ee"
  on-spruce: "#ffffff"
  mark: "#f5e28a"
  mark-ink: "#161716"
  ok: "#1d6e3d"
  ok-soft: "#e5f3ea"
  no: "#b43425"
  no-soft: "#faeae7"
  warn: "#8a5200"
  warn-soft: "#fbf1db"
  dark-paper: "#121312"
  dark-sheet: "#191b19"
  dark-subtle: "#222522"
  dark-ink: "#ecece8"
  dark-muted: "#9e9f9a"
  dark-ink-subtle: "#858781"
  dark-rule: "#2a2d2a"
  dark-input-border: "#686b66"
  dark-spruce: "#68cbbf"
  dark-spruce-hover: "#80d6cc"
  dark-spruce-soft: "#1a2c2a"
  dark-on-spruce: "#0d1918"
  dark-mark: "rgba(245, 226, 138, 0.22)"
  dark-mark-ink: "#faf2c8"
  dark-ok: "#6dd092"
  dark-ok-soft: "#182c20"
  dark-no: "#f28b7a"
  dark-no-soft: "#341e1b"
  dark-warn: "#e7b75d"
  dark-warn-soft: "#342914"
typography:
  display:
    fontFamily: "\"Source Sans 3\", system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "clamp(2.25rem, 5vw, 3.25rem)"
    fontWeight: 700
    lineHeight: 1.06
    letterSpacing: "-0.03em"
  page-title:
    fontFamily: "\"Source Sans 3\", system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  section:
    fontFamily: "\"Source Sans 3\", system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.015em"
  body:
    fontFamily: "\"Source Sans 3\", system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "0em"
  reading:
    fontFamily: "\"Source Sans 3\", system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "0em"
  meta:
    fontFamily: "\"Source Sans 3\", system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0em"
  code:
    fontFamily: "\"JetBrains Mono\", ui-monospace, Consolas, monospace"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: "0em"
rounded:
  ctl: "6px"
  card: "10px"
  track: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.spruce}"
    textColor: "{colors.on-spruce}"
    typography: "{typography.body}"
    rounded: "{rounded.ctl}"
    padding: "10px 20px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.spruce-hover}"
  button-ghost:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.ctl}"
    padding: "10px 20px"
    height: "48px"
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

**Creative North Star: "Clean Proof"**

Lekto is built for Slovak and Czech university students studying under exam pressure—phone in one hand on a tram at 23:30 or laptop open at a library desk in overcast daylight. **Clean Proof** strips the interface to the utilitarian clarity of Central European coursebooks (*vysokoškolské skriptá*): flat mineral paper, 1 px hairline dividers, decisive typographic weight jumps, and zero gamification or theme clutter.

The entire site—landing (`#welcome`), daily workspace (`#today`, `#home`, `#subject`), summary reader (`#reader`), quiz (`#quiz`, `#end`), upload (`#upload`), and settings (`#profile`)—shares one cohesive visual language in **Light**, **Dark**, and **Auto** (`prefers-color-scheme`).

**Key Characteristics:**
- **One signature move ("The Source Mark"):** Monochrome stone chrome lets only two chromatic signals command attention—the single primary action (**Spruce Ink**) and the highlighted proof sentence in a summary (**Marker Citron**).
- **Hairline lists over floating cards:** Repeated rows (subjects, topics, summaries, past exams, files, missed questions, FAQs) sit inside flat hairline-divided lists instead of stacked boxed cards.
- **Tabular numbers & 3 px tracks over ornaments:** No SVG progress rings, no glowing floating action buttons, no frosted glass blur, no spring bounce or typewriter rewrite scripts.
- **One workhorse typeface:** Self-hosted variable `Source Sans 3` (weights `400–700`, full Slovak/Czech `latin-ext`) carries display, UI, reading prose, and tabular numbers; `JetBrains Mono` is strictly limited to OTP inputs, `<kbd>` chips, and inline formulas/code.

## Colors

Stone-tinted neutrals carry ~90% of every viewport. Every foreground/background text pair meets WCAG AA (`>= 4.5:1`), primary ink and accent pairs meet AAA (`>= 7:1`), and input/control borders meet WCAG 1.4.11 (`>= 3:1`).

### Primary
- **Spruce Ink** (`--ledger`: `#14524c` light / `#68cbbf` dark): The screen's single filled primary button, active navigation indicator, keyboard focus outline, 3 px progress fill, and inline jump links (`Pozrieť v zhrnutí`). Shifted cooler than emerald so primary actions never collide with quiz grading green.
- **Spruce Hover** (`--ledger-hover`: `#0e3e39` light / `#80d6cc` dark): Hover fill for primary buttons.
- **Spruce Wash** (`--ledger-soft`: `#e5f0ee` light / `#1a2c2a` dark): Active desktop rail wash, selected context chip, and notice blocks.

### Signature Accent & Semantic States
- **Marker Citron** (`--mark`: `#f5e28a` light / `rgba(245, 226, 138, 0.22)` dark with `--mark-ink`): Exclusively for `<mark class="hl">` highlighting cited passages in `#reader`, `#review`, and `#welcome`.
- **Verified Green** (`--ok` / `--ok-soft`): Correct quiz feedback, mastery pass tone, completed upload rows.
- **Error Vermilion** (`--no` / `--no-soft`): Wrong quiz feedback, validation errors, destructive actions, 100% credit limit.
- **Deadline Amber** (`--warn` / `--warn-soft`): Exams within 7 days and `>= 80%` monthly credit warning.

### Neutral
- **Mineral Paper** (`--paper`: `#f7f7f5` light / `#121312` dark): Page canvas and native status/navigation bar color.
- **Clean Sheet** (`--sheet`: `#ffffff` light / `#191b19` dark): Elevated work sheets, hairline lists, side rail, tab bar, modals, and form fields.
- **Inset Stone** (`--subtle`: `#efefea` light / `#222522` dark): Row hover state, inactive progress tracks, segmented control tracks, neutral icon tiles.
- **Carbon Ink / Graphite Muted / Slate Subtle** (`--ink`, `--muted`, `--ink-subtle`): Three-step readable text scale (`16.8:1` / `6.4:1` / `4.7:1+`).
- **Hairline Rule / Control Outline** (`--rule`, `--input-border`): `1px` structural dividers and `>= 3:1` interactive field borders.

### Named Rules
- **The One-Spruce Rule.** Never place more than one filled Spruce Ink button on a screen; secondary actions stay monochrome (`ghost` or `plain`).
- **The Tinted-Surface Rule.** Never place neutral muted gray text on a tinted semantic or accent surface; use primary ink or the matching hue token.

## Typography

**Primary Font:** `Source Sans 3` (self-hosted variable WOFF2 `400 700` in `public/fonts/fonts.css`, fallback `system-ui, -apple-system, "Segoe UI", sans-serif`)
**Utility Mono Font:** `JetBrains Mono` (`500`, fallback `ui-monospace, Consolas, monospace`)

**Character:** Open humanist proportions with clean Central European diacritics (`á ä č ď é í ĺ ľ ň ó ô ŕ š ť ú ý ž ě ř ů`) and crisp built-in tabular numerals (`font-variant-numeric: tabular-nums`) so counts, percentages, and exam frequencies align without monospace decoration.

### Hierarchy
- **Display** (`700`, `clamp(2.25rem, 5vw, 3.25rem)`, `1.06`, `-0.03em`): Landing hero headline (`#welcome`) and Today exam countdown figure (`2.75rem`).
- **Page Title** (`700`, `1.75rem` mobile / `2rem` desktop, `1.15`, `-0.025em`): Screen headers (`Dnes`, `Predmety`, `Profil`).
- **Section & Question** (`600`, `1.25rem`–`1.375rem`, `1.3`, `-0.015em`): Quiz prompts, summary headings, sheet titles.
- **Reading Prose** (`400`, `1.0625rem` / `17px`, `1.65` light / `1.70` dark, max `65ch`): Summary body in `#reader` and `#review`.
- **UI Body** (`400` / `600`, `1rem` / `16px`, `1.55`): Options, buttons, inputs, list titles.
- **Metadata & Labels** (`500`–`600`, `0.8125rem`–`0.875rem`, `1.4`): Plain sentence-case labels, counts, dates, exam frequencies (`v 4 z 5 skúšok`).

### Named Rules
- **The No-Eyebrow Rule.** Never place uppercase kickers above headings.
- **The Dark-Mode Air Rule.** Dark mode increases reading line-height (`1.65 → 1.70`) and adds `+0.005em` body tracking to eliminate halation.

## Layout

Spacing runs on a 4 px base rhythm (`4 / 8 / 12 / 16 / 24 / 32 / 48 px`).

- **Phone (`< 640px`):** Single-column flow (`16px` inline padding), solid bottom tab bar (`56px` + safe area), and compact inline `+ Nahrať` header buttons on `#today` and `#home` (no floating FAB).
- **Tablet Portrait (`640–899px`):** `800px` centered canvas; `#today` hero splits horizontally (plan + CTA left, countdown + progress right); quiz options form a 2×2 grid.
- **Tablet Landscape & Desktop (`>= 900px`):** `232px` left rail (`248px` at `>= 1100px`) replaces the bottom tab bar and hides mobile header add buttons in favor of the rail action. Bottom sheets become centered modal dialogs (`max-width: 500px`). `#subject` splits into a sticky summary column + tab content; `#reader` pairs the `65ch` reading column with a hairline-separated sticky `Kľúčové pojmy` side column.

## Elevation & Depth

Surfaces are flat by default; depth comes from `Mineral Paper` vs. `Clean Sheet` contrast and `1px` hairlines. No `backdrop-filter: blur()` and no shadows on cards, buttons, or headers.

### Shadow Vocabulary
- **Overlay** (`--shadow-overlay: 0 16px 40px -12px rgba(0, 0, 0, 0.18)`): Centered desktop modal dialogs (`dialog.bsheet`) only.
- **Toast / Tooltip** (`--shadow-toast: 0 6px 20px -6px rgba(0, 0, 0, 0.20)`): Floating toast and context tooltip popover only.

### Motion
- Single curve `--ease: cubic-bezier(0.22, 1, 0.36, 1)` (zero spring bounce). `120ms` for interactive press/hover/color states; `180ms` for screens, sheets, accordions, and quiz feedback bar. Fully disabled under `prefers-reduced-motion: reduce`.

## Shapes

Two functional radii across the entire system (plus `999px` strictly for 3–6 px progress tracks and status dots):

- **Controls (`--r-ctl: 6px`):** Buttons, inputs, quiz options, segmented thumbs, checkboxes (`4px`), tooltips, brand mark.
- **Containers (`--r-card: 10px`):** Sheets, hairline lists, desktop dialogs (`14px` top corners on mobile bottom sheets).
- **Icons:** Single inline SVG set on `24×24`, uniform `1.8px` stroke, round caps/joins.

## Components

Every interactive component maintains `>= 44px` tap targets and complete `default`, `hover`, `focus-visible` (`2px solid var(--ledger)`), `active` (`scale(0.985)`), `disabled`, and `aria-invalid` states.

### Buttons
- **Primary (`.btn`):** Solid Spruce Ink, `6px` radius, `48px` min-height (`50px` `.wide`). One per screen.
- **Ghost (`.btn.ghost`):** Clean Sheet fill, `1px` Hairline Rule border, shifts to Inset Stone + Control Outline on hover.
- **Plain (`.btn.plain`):** Transparent fill, Muted text, Vermilion for `.danger`.

### Hairline Index Lists (`.list`, `#subjects`, `#tbars`, `#files`, `.ranks`, `.up-list`)
- Single Clean Sheet container (`1px` border, `10px` radius) with `1px` internal row dividers (`:not([hidden]) ~ :not([hidden])` so filtered rows never show a stray top rule). Rows show tabular percentage + a `3px` `.bar` instead of progress rings.

### Underline Tabs (`.utabs`) & Segmented Controls (`.seg.fill`)
- **`.utabs` (`#sTabs`):** Flat horizontal tabs over a `1px` hairline with a `2px` Spruce Ink active underline.
- **`.seg.fill` (`#themes`, `#langs`, `#remToggle`):** Reserved for compact 2–3-option settings toggles on Inset Stone track with a flat Clean Sheet thumb (zero shadow).

### Quiz Options & Feedback Bar (`.opt`, `.fb`)
- Flat `56px` option rows with `26×26` letter badges. Multi-select active state uses neutral Carbon Ink (`aria-pressed="true"`) so it never collides with semantic grading (`ok` / `no`). Feedback bar sits flush at the bottom with a `1px` colored top rule and soft semantic tint.

### Signature Component: Proof Highlight (`mark.hl`, `.hl-block`)
- Inline **Marker Citron** highlight directly inside calm prose (`border-radius: 3px`, `box-decoration-break: clone`). When jumped to from a quiz, `.hl-block` gently settles from a warm wash to transparent over `1.8s` without an outer border box.

## Do's and Don'ts

### Do:
- **Do** keep one filled Spruce Ink CTA per screen and group repeated rows into unified hairline lists.
- **Do** use `Source Sans 3` with `tabular-nums` for percentages, countdowns, and exam counts (`v 4 z 5 skúšok`).
- **Do** keep every browser surface themed (`::selection`, `caret-color`, scrollbars, `theme-color`, and native status bar sync).
- **Do** check new screens at `360px` and `1280px` in both Light and Dark mode.

### Don't:
- **Don't** nest bordered cards inside bordered cards or add an outer colored box around `<mark class="hl">`.
- **Don't** reintroduce SVG progress rings, floating glow FABs, `backdrop-filter: blur()`, hard offset shadows, or spring-bounce easings.
- **Don't** use `JetBrains Mono` for UI labels, counts, or dates—keep it strictly for OTP codes, `<kbd>`, and inline code/formulas.
- **Don't** add uppercase kickers above headings or per-look theme overrides.

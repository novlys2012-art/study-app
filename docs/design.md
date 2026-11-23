# Design brief

The rules every screen follows. Read this alongside root `DESIGN.md` ("Clean Proof") before adding or changing a screen.

## Who it is for

A student with a phone in one hand, a week before an exam, who wants to know what to do next and start doing it within two taps. The laptop is the second device: same app, more room.

## Principles

1. **One main action per screen.** Each screen has a single filled Spruce Ink button, placed where the thumb is. Everything else is a ghost button, a hairline row, or an icon.
2. **The same thing behaves the same everywhere.** Tapping a subject always opens it. Starting a round is always a button that says so (or the play button on a row). Nothing that looks like plain text starts anything.
3. **Things you need are visible, things you rarely need are in the menu.** The exam date sits on the subject screen. Resetting and deleting sit in the "⋯" menu, in red, with a confirmation.
4. **Back always works.** The phone's back button, the browser's back button, and the arrow in the top bar all go one step back. A sheet closes first. A reload stays on the same screen.
5. **Every tap answers.** Controls give a subtle `120 ms` press detent, sheets and feedback bars settle in `180 ms`, and a change with no visible result gets a short toast ("Dátum skúšky je uložený").
6. **Motion is calm and has a reason.** One ease-out curve (`--ease`), `120 ms` for press/state, `180 ms` for screens and sheets—zero bounce, shake, or typewriter effects. With `prefers-reduced-motion` on, nothing moves.
7. **Empty screens say what to do.** No blank lists: an empty state has one sentence and the button that fixes it.
8. **Destructive actions ask once**, in place, and say what is lost.

## Structure

- **Dnes**: what to do now. The subject with the nearest exam (or the one opened last) as one flat priority sheet with the countdown, `3 px` mastery bar, and today's round. Other subjects sit below inside a single hairline-ruled list, each with a play button.
- **Predmety**: the library as one unified hairline-ruled list (or empty state).
- **A subject**: tabular mastery percentage + `3 px` bar, exam date, "Učiť sa" and "Vlastné kolo", then flat underline tabs: Témy (weakest first, hairline-ruled), Zhrnutia, and Skúšky (old exams ranked by frequency, each opening to its old questions in a sheet, a round in that order, the uploaded exams, and the add button).
- **Reader, quiz, result, upload**: full screen, no tab bar. They have their own way out in the top bar. Reader prose sits directly on clean paper (`max-width: 65ch`) with the single-layer Marker Citron proof highlight (`<mark class="hl">`).
- **Profil**: account, monthly limit, reminders, Light / Dark / Auto mode, and SK / CS language.
- **Adding** is the compact `+ Nahrať` button in the `#today` and `#home` header on narrow screens and the button at the top of the side rail on wide screens.

On screens `900 px` and wider the bottom tab bar becomes a side rail and bottom sheets become centered modal dialogs.

## Building blocks

Reuse these before making a new one: `btn` (`ghost`, `wide`, `plain`, `danger`), `iconbtn`, `sheet`, `list`, `rowcard`, `utabs` (underline tabs), `seg` (`fill` for settings toggles), `chips`, `bar`, `bsheet` (opened with `openSheet`), `menu` rows, `empty` state, `dock`, `toast()`.

Tokens live in `src/styles/app.css` and are documented normatively in `DESIGN.md`: `--r-ctl` (`6px`), `--r-card` (`10px`), `--bw` (`1px`), `--ease`, `--t-fast`, `--t`, and semantic colour tokens (`--paper`, `--sheet`, `--subtle`, `--ink`, `--muted`, `--rule`, `--ledger`, `--mark`, `--ok`, `--no`, `--warn`) in Light and Dark mode.

## Checks before shipping a screen

- Works at `360 px` wide and at `1280 px`, in Light and Dark mode.
- Every tap target is at least `44 px`.
- Reachable and usable by keyboard, with a visible `2 px` Spruce focus ring.
- No text set in code: strings go through `src/i18n/`.
- `npm test`, `npm run smoke` and `npm run e2e` pass.

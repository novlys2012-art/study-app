# Design brief

The rules every screen follows. Read this before adding or changing a screen. The six looks (Kocky, Riso, Účtovná kniha, Zošit, Tabuľa, Čistý) change colour, type and shape; this brief is about layout, navigation and behaviour, which stay the same in every look.

## Who it is for

A student with a phone in one hand, a week before an exam, who wants to know what to do next and start doing it within two taps. The laptop is the second device: same app, more room.

## Principles

1. **One main action per screen.** Each screen has a single filled button, placed where the thumb is. Everything else is a ghost button, a row or an icon.
2. **The same thing behaves the same everywhere.** Tapping a subject always opens it. Starting a round is always a button that says so (or the round play button). Nothing that looks like plain text starts anything.
3. **Things you need are visible, things you rarely need are in the menu.** The exam date sits on the subject screen. Resetting and deleting sit in the "⋯" menu, in red, with a confirmation.
4. **Back always works.** The phone's back button, the browser's back button and the arrow in the top bar all go one step back. A sheet closes first. A reload stays on the same screen.
5. **Every tap answers.** Buttons press down, sheets slide, screens move in the direction you went, and a change that has no visible result gets a short toast ("Dátum skúšky je uložený").
6. **Motion is short and has a reason.** 120 ms for a press, about 220 ms for a screen or sheet. It shows where something came from or that an answer was right or wrong. With "reduce motion" on, nothing moves.
7. **Empty screens say what to do.** No blank lists: an empty state has one sentence and the button that fixes it.
8. **Destructive actions ask once**, in place, and say what is lost.

## Structure

- **Dnes**: what to do now. The subject with the nearest exam (or the one opened last) as a big card with the countdown and today's round. Other subjects below, each with a play button.
- **Predmety**: the library. Every subject, then the add card.
- **A subject**: progress, exam date, "Učiť sa" and "Vlastné kolo", then tabs: Témy (weakest first, each opens to its summary, weak spots and a practise button) and Zhrnutia.
- **Reader, quiz, result, upload**: full screen, no tab bar. They have their own way out in the top bar.
- **Profil**: account, monthly limit, look and light/dark.
- **Adding** is the floating "+" on a phone and the button at the top of the side rail on a wide screen.

On screens 900 px and wider the bottom tab bar becomes a side rail and sheets become centred dialogs.

## Building blocks

Reuse these before making a new one: `btn` (`ghost`, `wide`, `danger`), `iconbtn`, `rowcard`, `sheet`, `hero`, `seg` (`fill` for tabs), `chips`, `pill`, `bar`, `ring`, `bsheet` (bottom sheet, opened with `openSheet`), `menu` rows, `empty` state, `dock` (a bar stuck to the bottom of a full-screen view), `toast()`.

Shape and motion come from tokens, so a new part matches every look without its own rules: `--r-card`, `--r-ctl`, `--bw`, `--press`, `--ease`, `--spring`, `--t-fast`, `--t`. Colours come from the look's tokens (`--paper`, `--sheet`, `--ink`, `--muted`, `--rule`, `--ledger`, `--ok`, `--no`, `--warn`).

## Checks before shipping a screen

- Works at 360 px wide and at 1280 px, in light and dark, in Kocky, Riso and Čistý at least.
- Every tap target is at least 44 px.
- Reachable and usable by keyboard, with a visible focus ring.
- No text set in code: strings go through `src/i18n/`.
- `npm test`, `npm run smoke` and `npm run e2e` pass.

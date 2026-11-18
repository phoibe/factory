# Critique — board header, « Amélioration UI » button (issue #462)

Scope: the project header actions row (desktop 1280 px, tablet 820 px) and the phone « Plus » menu (390 px), plus the
board card of a `factory:ui-polish` request.

Score: 35/40 before and after (no fix needed in scope).

- The new button uses the existing secondary button style, same height, radius and weight as « Review générale »: consistent.
- Order « Signaler un bug · Review générale · Amélioration UI · Stack technique » groups the two whole-app runs together.
- Phone: the item sits right after « Review générale » in « Plus », full width like the others. OK.
- Tablet (≈ 600–870 px): the row wraps and « Stack technique » goes to a second line. The row already wrapped at
  these widths before this change (4 buttons do not fit under ~730 px); left-aligned wrap is the established behaviour. P3, kept.
- Card: « Amélioration UI · demande #9 », steps track shows 4 steps (no questions, no spec), like a general review. OK.
- Text on screen: no explanatory text added; the confirm is a single question. OK.
- Detector: 3 pre-existing findings (Geist pinned by DESIGN.md; the chat typing dots are tied to a live answer). Out of scope.

Questions skipped: run autonome de la factory.

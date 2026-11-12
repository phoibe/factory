# Phone header: « Mise en production » on the top line — Implementation Plan

> Executed inline in the build run (small feature; plan written because it touches four code files).

**Goal:** On a phone, a project with release-on-approval shows « Mise en production » + « Plus » on the top line, and « Nouvelle fonctionnalité » becomes the first item of « Plus ».

**Architecture:** One DOM move (`placeNewFeature()` in `panel/app.mjs`) called wherever the phone menu or the release button is redrawn; CSS keeps the actions on one full-width line under the project name.

**Tech Stack:** vanilla JS modules, CSS, Playwright e2e via `node --test`.

**Spec:** issue #343, comment `<!-- factory-spec -->` (version 1).

## Global Constraints

- Phone = `(max-width: 600px)`, same as the existing « Plus » menu.
- No new text; release button keeps its behaviour, count and greyed state.
- Desktop and auto-deploy projects unchanged.

## Review Focus

- Switching from an approval project to an auto project on a phone: the link must come back to the top line (drawRelease calls placeNewFeature).
- Resizing across 600px: the link returns before `#release` on desktop (placeMenu calls placeNewFeature).
- Live refresh while the link has keyboard focus: no re-insertion when it is already first.
- Short project names: the actions must not share a line with the name, or the board jumps when « (2) » appears.
- `drawRelease()` may run before `phoneMq` is declared: read the media query through a hoisted `PHONE` constant.

---

### Task 1: Move « Nouvelle fonctionnalité » into « Plus » on phone

**Files:**
- Test: `e2e/phone-release.e2e.mjs` (one test per spec criterion), rename one test in `e2e/release.e2e.mjs`
- Modify: `panel/app.mjs` (`PHONE` constant, `placeNewFeature()`, calls from `placeMenu()` and `drawRelease()`)
- Modify: `panel/style.css` (phone: `#release` flex 3 / nowrap / weight 500, `.more-menu #new-feature { flex: none }`, `.actions:has(> #release:not([hidden])) { flex: 1 1 100% }`)

- [x] Write the five journeys (top line, first menu item + href, « go » does not move with/without pending, auto project unchanged, desktop unchanged)
- [x] Run `node --test e2e/phone-release.e2e.mjs`: they fail
- [x] Implement `placeNewFeature(): void` and the CSS
- [x] Run the file: 5/5 pass; then the full suite
- [x] Commit

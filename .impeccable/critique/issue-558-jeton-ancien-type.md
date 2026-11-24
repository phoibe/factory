---
target: "carte jeton de lecture (onglet Agent), refus « Ce type de jeton n est pas accepté » (#558)"
total_score: 30
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
target_identity: "file:/home/user/factory/panel/index.html"
target_fingerprint: "sha256:1e4c3d37823f48e4c988c2c1ca3856ffa816de56d8318199be3436ef5a175c1c"
target_path: /home/user/factory/panel/index.html
timestamp: 2026-11-24T14-19-10Z
slug: panel-index-html
---
⚠️ DEGRADED: single-context (no sub-agent tool exposed in this session; Assessment A was completed and recorded before the detector ran)

# Critique — carte « Un jeton de lecture pour discuter » (onglet « Agent »), état d'erreur « Ce type de jeton n'est pas accepté » (#558)

Target: `panel/index.html` (#chat-setup), seen through the e2e fixture (`withPanel`, token `ghp_x` pasted) at 390×844 (phone) and 1366×900 (desktop), light and dark. Judged against PRODUCT.md, DESIGN.md (incl. « Mises en page » › « Page d'accueil réduite ») and the « Textes à l'écran » rule.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Refusal is immediate (no GitHub call for a `ghp_` token), announced (role=alert), field marked aria-invalid and refocused. |
| 2 | Match System / Real World | 3 | « Ce type de jeton » does not name the type, but the owner never has to know it: the message points to the button. |
| 3 | User Control and Freedom | 3 | Nothing stored, nothing sent; the owner simply pastes another token. |
| 4 | Consistency and Standards | 3 | Same shape as the other refusals (« … : créez-en un … avec le bouton ci-dessus »), same red, same place. |
| 5 | Error Prevention | 3 | The prefilled GitHub button only creates the accepted (fine-grained) type; the placeholder shows `github_pat_…`. |
| 6 | Recognition Rather Than Recall | 3 | « le bouton ci-dessus » is visible right above on both sizes. |
| 7 | Flexibility and Efficiency | 3 | One field, one button, Enter submits. |
| 8 | Aesthetic and Minimalist Design | 3 | On desktop the message breaks inside « ci-dessus » (« ci- » / « dessus. ») — ragged and harder to read. |
| 9 | Error Recovery | 3 | Message names the problem and the recovery in one sentence. |
| 10 | Help and Documentation | 3 | No help needed beyond the message; no explanatory text added. |
| **Total** | | **30/40** | **Good** |

## Design Specificity Verdict

**LLM assessment**: The card follows the panel's own « Page d'accueil réduite » model (single centred card, 560 px max, label above the field, short error under the field, blue validation button that DESIGN.md explicitly allows here). The new message reuses the exact grammar of the existing refusals, so it reads as part of the same product, calm and vouvoyé. Nothing generic was introduced.

**Deterministic scan**: `impeccable detect --json panel/index.html` → 4 warnings, none on this card: `broken-image` (lightbox `<img>` whose src is set at runtime — false positive), `overused-font` Geist (pinned by DESIGN.md — brief wins), two `pulsing-dot` (chat typing indicator, tied to a live wait — out of scope). Nothing on the read-token card.

**Visual overlays**: injection of `detect.js` was attempted in the Playwright page but blocked by the panel's Content-Security-Policy (`script-src 'self'`); no user-visible overlay. Fallback signal: CLI scan above plus screenshots.

## Overall Impression

A small, well-behaved error state: short, actionable, in the right place, consistent with its siblings. The only visible flaw is typographic: on desktop the line breaks at the hyphen of « ci-dessus ».

## What's Working

- The refusal happens before the token is sent anywhere, and the screen says so by being instant — no spinner, no wait.
- One sentence: problem + what to do, in the same pattern as « Ce jeton peut modifier vos projets : créez-en un en lecture seule avec le bouton ci-dessus. »
- Focus returns to the field with aria-invalid; the message is tied to it with aria-describedby.

## Priority Issues

- **[P2] Line break inside « ci-dessus » on desktop**
  - **Why it matters**: « ci- / dessus. » leaves a one-word orphan made of half a word; the error is the one thing the owner must read here.
  - **Fix**: balance the error's lines (`text-wrap: balance` on `.chat-setup .error`) so the break falls between words; applies to every refusal on this card.
  - **Suggested command**: /impeccable typeset

## Persona Red Flags

**Jordan (First-Timer)**: « Ce type de jeton » — Jordan does not know token types; saved by « créez-en un avec le bouton ci-dessus », which tells exactly what to do. No red flag left.

**Casey (Mobile)**: On 390 px the message wraps cleanly on two lines, the button stays 44 px high, no horizontal scroll (scrollWidth 390). No red flag.

**Sam (Accessibility)**: role=alert, aria-invalid, aria-describedby, focus back to the field; red text #c62828 on white and #ff8a80 on dark both pass AA. No red flag.

**Pierre (owner, phone, « go » in seconds)**: does not read code, will paste whatever GitHub shows; the message sends him back to the one button that makes the right token. OK.

## Minor Observations

- The refused token stays in the field (masked). Replacing it is one paste; not worth changing.
- The card's sentence « La discussion utilise désormais un jeton… » would be explanatory text under the « Textes à l'écran » rule, but it was validated word for word by the owner in spec #395 (owner exception, already recorded in `2026-11-18-review-generale.md`). Not a defect; left as is.
- DESIGN.md « Mises en page » already lists this screen (« jeton de lecture de la discussion » under « Page d'accueil réduite »); the card matches it (560 px centred, label above, short error under the field, 16 px margins on phone).

## Questions to Consider

- Should the refused value be selected when focus returns, so the next paste replaces it?

Questions skipped: run autonome de la factory (1 priority issue, fewer than 3)

## Fixes applied after this critique

- [P2] Line break inside « ci-dessus »: the card's refusal messages now keep hyphenated words (« ci-dessus », « créez-en ») and « mot : » together (`showReadTokenError` in `panel/app.mjs`, existing `.nowrap` class) and balance their lines (`text-wrap: balance` on `.chat-setup .error`). Checked at 320–1366 px for this message and « Ce jeton peut modifier vos projets… ». No P0/P1: no recritique (design-pass step 4). DESIGN.md unchanged (screen already listed under « Page d'accueil réduite »).

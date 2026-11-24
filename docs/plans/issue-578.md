# Red frames on the before/after images (issue #578) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan in one go. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every before/after image published in a PR carries red frames around what changed (« après »: appeared or modified; « avant »: disappeared or modified), never around content that only moved up or down, and the factory's captures message says so.

**Architecture:** A new pure module `agent/scripts/shot-frames.mjs` decodes the two captures (PNG → RGBA, `node:zlib`) and computes the frames of each side from the pixels: rows are aligned with a patience diff so that shifted rows count as unchanged, the remaining differing pixels are grouped into at most 10 boxes. `compose()` in `agent/scripts/shots.mjs` calls it for each image and `sideBySideHtml()` draws the boxes as absolutely positioned outlines over the `<img>` (the captures themselves are never rewritten). `shots.json` records which images carry frames (`framed`); `scripts/relay/events.mjs` adds the sentence when one of them is published.

**Tech Stack:** Node 22 ESM, `node:zlib`, Playwright (already used by `compose`), `node --test`. No dependency added; `STACK.md` unchanged.

**Spec:** issue #578, last `<!-- factory-spec -->` comment (read it with `node .factory/scripts/thread.mjs 578`); `docs/adr/0018-cadres-rouges-des-deux-cotes-sauf-sur-le-contenu-decale.md`; `GLOSSARY.md` (« Image avant/après », « Cadre rouge », « Contenu décalé »). Already merged (#587): do not edit them.

## Global Constraints

- Zero tolerance: one differing RGBA byte is a change. Content only shifted vertically is not framed; a horizontal move is a change.
- At most 10 frames per side (`MAX_FRAMES`); frames cover more than 3/4 of a side (`WHOLE_SCREEN = 0.75`) → no frame on that image and the exact mention « tout l'écran a changé » above the « après » image.
- New screen (no « avant »): no frame. Captures in `--before`/`--after` and `docs/readme/accueil.png` are never modified: frames exist only in `compare/*.png`.
- Exact sentence: « Les cadres rouges entourent ce qui a changé. », only when at least one published image carries frames; a `shots.json` without the information → no sentence.
- Frames must never break a publication: if they cannot be computed for an image, it is published without frames.
- Agent scripts import only `node:*` and `./*.mjs` siblings. `shots.mjs` must keep loading alone (the gate and the relay import it; a test runs it copied alone): it loads `./shot-frames.mjs` with `await import()` inside `compose()`, like `./specs.mjs` in `publish()`.
- Never edit `.factory/` nor `.claude/skills/`: `scripts/sync.mjs` copies every `agent/scripts/*.mjs` and the « Factory sync » workflow regenerates `.factory/` after the merge. Do not run the sync in this PR.
- Agent-facing text French « tu », with the glossary words (« image avant/après », « cadre rouge », « contenu décalé »); owner-facing French, vouvoiement; code and comments English. Each test written first and seen red; `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` green at the end.

## Decisions taken while planning (say the first four in the PR summary, in plain French)

1. **Pixels: a small PNG decoder in Node**, not a canvas in the Chromium page. The whole computation is then a pure function on RGBA arrays, tested without a browser, and no 25 MB array crosses the browser protocol. Measured: Playwright's screenshots are 8-bit RGB (colour type 2), not interlaced. The decoder accepts 8-bit colour types 2 and 6, the five row filters, and throws on anything else.
2. **Shift: patience diff on whole rows.** Rows are compared exactly (a `Map` keyed by the row's bytes, no hash collision). Unlike a plain LCS it needs no n×m table and does not pair unrelated blank rows. Measured on a prototype: 1280×5000 in about 0.15 s.
3. **Pure spacing gets no frame, unless it is the only change.** Rows added or removed that look like the row just above or below them (a taller margin, the empty bottom of a short page that grows when something is removed) are not framed, otherwise every removal on a short page would frame its empty bottom. When an image differs only by such rows, they are framed full width: something must say where to look.
4. **Sizes follow the capture's width** (GitHub shrinks a 2600 px image about four times), all in one function to retouch after the owner's look: 1280 px → red 8, white liseré 2, 8 px away from the zone, zone at least 40 px; 390 px → 4, 2, 6, 24. Red `#f00`.
5. `shots.json` gains `framed` (file names), only when not empty, like `setAside`. The relay checks it against the images really published.
6. In this PR the factory's message will **not** show the sentence: the relay that posts it runs the merged version. Say it to the owner in the PR comment.

## Review Focus

Each line is pinned by a test named in its task.

1. A short page (shorter than the viewport) where something is removed: the empty bottom grows; it must not be framed (Task 2, « filler »).
2. A capture the decoder does not support, or a damaged one: the image is still published, without frames, with one line on stderr (Task 3).
3. A change glued to a corner: the frame is whole, inside the image (Task 2, « corner »).
4. Before and after of different widths (a page that overflows sideways): no frame, « tout l'écran a changé » (Task 2).
5. A `shots.json` whose `framed` names an image that is not published, or is not a list: no sentence, no crash (Task 4).

## File Structure

- Create `agent/scripts/shot-frames.mjs`: `decodePng`, `frameSizes`, `changeFrames`, `MAX_FRAMES`, `WHOLE_SCREEN`. Imports `node:zlib` only.
- Create `test/shot-frames.test.mjs`.
- Modify `agent/scripts/shots.mjs` (`sideBySideHtml`, `compose`, `shotsMeta`, `publish`, new `FRAMES_SENTENCE`), `test/shots.test.mjs`, `test/sync.test.mjs`.
- Modify `scripts/relay/events.mjs` (`postLatestCaptures`, ~l.180-195), `test/relay.test.mjs` (after the #422 test, ~l.3369).
- Modify `agent/stages/screenshots.md` (step 5), `test/shots-stable.test.mjs`.

---

### Task 1: `decodePng`

**Files:** Create `agent/scripts/shot-frames.mjs`, `test/shot-frames.test.mjs`.

**Interfaces — Produces:** `decodePng(buf: Buffer) → { width, height, data: Uint8Array }`, `data` = RGBA, 4 bytes per pixel, rows top to bottom (alpha 255 for an RGB file). Throws `Error('not a PNG')` or `Error('unsupported PNG (depth D, type T, interlace I)')`.

- [ ] **Step 1: failing tests.** Test helper `png(width, height, type, rows)` builds a file from raw scanlines (`rows` = arrays `[filter, ...bytes]`): signature, `IHDR` (depth 8, colour `type`), one `IDAT` (`deflateSync`), `IEND`; the decoder does not check CRCs, write zeros.
  - `'decodePng reads an RGB capture'`: `png(2, 2, 2, [[0, 255,0,0, 0,255,0], [2, 0,0,0, 0,1,255]])` → `width 2`, `height 2`, `[...data]` equals `[255,0,0,255, 0,255,0,255, 255,0,0,255, 0,0,255,255]`.
  - `'decodePng undoes the sub, average and paeth filters, with transparency'`: `png(3, 3, 6, [[1, 10,20,30,255, 5,5,5,0, 5,5,5,0], [3, 10,10,10,0, 10,10,10,0, 10,10,10,0], [4, 1,2,3,0, 1,2,3,0, 1,2,3,0]])` → `[10,20,30,255, 15,25,35,255, 20,30,40,255, 15,20,25,127, 25,32,40,191, 32,41,50,223, 16,22,28,127, 26,34,43,191, 33,43,53,223]`.
  - `'decodePng refuses what it cannot read'`: `png(1, 1, 3, [[0, 0]])` throws `/unsupported PNG/`; `Buffer.from('abc')` throws `/not a PNG/`; the first PNG cut in half throws (any error).
- [ ] **Step 2:** `node --test test/shot-frames.test.mjs` → fails (module missing).
- [ ] **Step 3:** implement (read `IHDR`, concatenate every `IDAT`, `inflateSync`, undo filters 0-4 with bytes-per-pixel 3 or 4, expand RGB to RGBA; throw when the inflated data is shorter than `(width × bpp + 1) × height`).
- [ ] **Step 4:** tests pass. **Step 5:** commit `feat(shots): read the pixels of a capture (#578)`.

### Task 2: `changeFrames`

**Files:** Modify `agent/scripts/shot-frames.mjs`, `test/shot-frames.test.mjs`.

**Interfaces — Produces:**
- `frameSizes(width) → { red, white, pad, min, gap, text }`: `red = max(4, round(width/160))`, `white = 2`, `pad = max(6, round(width/160))`, `min = max(24, round(width/32))`, `gap = 2 × (red + white + pad) + 4`, `text = max(16, round(width/28))` (font size of the mention).
- `changeFrames(before, after, sizes = frameSizes(after.width)) → { before: Box[], after: Box[], whole: boolean, sizes }`; `before`/`after` in: `{ width, height, data }`. `Box = { x, y, w, h }`: integers, the outer rectangle of a frame (liseré included), always inside its image, sorted by `y` then `x`.
- `MAX_FRAMES = 10`, `WHOLE_SCREEN = 0.75`.

**Algorithm** (the tests do not determine it; keep each step a small function):
1. Different widths → `{ before: [], after: [], whole: true, sizes }`.
2. **Align rows.** Give each distinct row an id (`Map` keyed by the row's bytes as a latin1 string, shared by both images). Patience diff on the two id lists: strip the common start and end; in what is left, the rows present exactly once on each side are anchors; keep their longest increasing chain (binary-search LIS); recurse between consecutive anchors; a range without anchor is left unmatched. Matched rows are unchanged wherever they sit (contenu décalé).
3. **Mark differing pixels**, per side, in each run of unmatched rows between two matched pairs (the other side's run may be empty or of another length). Row `k` of the run is compared, same `x`, with row `k` of the other side's run when it exists. Beyond it, a pixel is marked when it differs from both the row just above the run and the row just below it in its own image (only one at the top or bottom of the image; none → every pixel marked). If no pixel is marked on either side in the whole image, mark full width every run that had none (decision 3).
4. **Group.** Marks go into a grid of `gap`-px cells, each keeping the tight bounds of its marks; 8-connected cells make one zone (union of the bounds). Widen each zone to `min` in both directions, centred, kept inside the image. Then merge the two closest zones (distance = the larger of the horizontal and vertical gaps between the rectangles, 0 when they overlap) while that distance is `< gap` or there are more than `MAX_FRAMES` zones.
5. **Whole screen.** If on either side the sum of the zone areas is `> WHOLE_SCREEN × width × height` → no box on both sides, `whole: true`.
6. **Frame** = zone grown by `pad + red + white` on each side: length `min(zone length + 2 × that, image length)`, start `round((lo + hi − length) / 2)` clamped to `[0, image length − length]`.

- [ ] **Step 1: failing tests**, with this helper and `const S = { red: 2, white: 1, pad: 2, min: 10, gap: 12, text: 16 }`:

```js
// White image; b(x0, y0, x1, y1, seed) paints a block whose pattern depends only on the seed and on the position
// inside the block (so a moved block keeps the same pixels); seed null paints black.
const img = (width, height, paint) => {
  const data = new Uint8Array(width * height * 4).fill(255);
  paint?.((x0, y0, x1, y1, seed) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data.set(seed === null ? [0, 0, 0] : [((x - x0) * 7 + (y - y0) * 13 + seed) % 251, ((x - x0) * 3 + (y - y0) * 5) % 241, seed % 200], (y * width + x) * 4); });
  return { width, height, data };
};
const base = img(200, 300, (b) => { b(20, 20, 80, 40, 1); b(20, 100, 180, 140, 2); });
const frames = (a, b) => { const { before, after, whole } = changeFrames(a, b, S); return { before, after, whole }; };
```

  Each test is `assert.deepEqual(frames(avant, apres), expected)`:
  - `'frame sizes follow the width of the capture'`: `frameSizes(1280)` = `{ red: 8, white: 2, pad: 8, min: 40, gap: 40, text: 46 }`; `frameSizes(390)` = `{ red: 4, white: 2, pad: 6, min: 24, gap: 28, text: 16 }`.
  - `'identical images have no frame'`: `frames(base, base)` → `{ before: [], after: [], whole: false }`.
  - `'a change in place is framed on both sides, at the same place'`: after = base with the first block on seed 9 → both sides `[{ x: 15, y: 15, w: 70, h: 30 }]`.
  - `'an added block is framed after only, and what it pushed down is not'`: after = `img(200, 340, …)` with `b(20,20,80,40,1); b(30,55,120,85,5); b(20,140,180,180,2)` → `before: []`, `after: [{ x: 25, y: 50, w: 100, h: 40 }]`. `'a removed block is framed before only'`: the same two images swapped.
  - `'what moved down and changed is framed on both sides'`: the previous « after » plus `b(120,150,160,170,7)` → `before: [{ x: 115, y: 105, w: 50, h: 30 }]`, `after: [{ x: 25, y: 50, w: 100, h: 40 }, { x: 115, y: 145, w: 50, h: 30 }]`.
  - `'the empty bottom of a short page is never framed'` (filler): before `b(20,20,80,40,1); b(20,60,80,80,3); b(20,100,180,140,2)`, after (same 200×300) `b(20,20,80,40,1); b(20,60,180,100,2)` → `before: [{ x: 15, y: 55, w: 70, h: 30 }]`, `after: []`. Also `img(100,100)` → `img(100,160, b(40,120,60,140,4))` → `before: []`, `after: [{ x: 35, y: 115, w: 30, h: 30 }]`.
  - `'a taller margin alone is framed full width'`: base → `img(200, 320, …)` with `b(20,20,80,40,1); b(20,120,180,160,2)` → `before: []`, `after: [{ x: 0, y: 95, w: 200, h: 30 }]`.
  - `'a block moved sideways is a change'`: after = first block at `b(60,20,120,40,1)` → both sides `[{ x: 15, y: 15, w: 110, h: 30 }]`.
  - `'one pixel in a corner gets a whole frame of the minimal size'` (corner): base plus `b(199,299,200,300,null)` → both sides `[{ x: 180, y: 280, w: 20, h: 20 }]`.
  - `'two changes far apart on the same rows get two frames'`: `img(400,100, b(10,40,40,60,1); b(350,40,380,60,2))` → seeds 3 and 4 → both sides `[{ x: 5, y: 35, w: 40, h: 30 }, { x: 345, y: 35, w: 40, h: 30 }]`.
  - `'more than ten changes are merged down to ten frames'`: `img(200,300)` → 14 black squares `b(5, 5+20k, 8, 8+20k, null)` and 3 `b(150, 5+100k, 153, 8+100k, null)` → `after.length === 10`, `before.length === 10`, every square inside one `after` box.
  - `'beyond three quarters of the screen there is no frame, only the mention'`: `img(100,100)` → `b(0,10,100,90,null)` → `{ before: [], after: [], whole: true }`; with `b(0,10,100,80,null)` → `whole: false`, both sides `[{ x: 0, y: 5, w: 100, h: 80 }]`.
  - `'different widths count as a whole new screen'`: `img(100,100)` vs `img(120,100)` → `whole: true`, no box.
  - `'a long page is compared quickly'`: two 1280×5000 images with a block every 40 rows; in the second, 200 rows holding one new block are inserted at row 2000 → one `after` box, none `before`, in under 5 s (default sizes).
- [ ] **Step 2:** run, fail. **Step 3:** implement. **Step 4:** `node --test test/shot-frames.test.mjs` passes. **Step 5:** commit `feat(shots): find what changed between two captures (#578)`.

### Task 3: draw the frames and record them

**Files:** Modify `agent/scripts/shots.mjs`, `test/shots.test.mjs`, `test/sync.test.mjs`.

**Interfaces — Consumes:** `decodePng`, `changeFrames` (Tasks 1-2). **Produces:**
- `sideBySideHtml({ beforeUri, afterUri, frames = null })`, `frames` = the result of `changeFrames`.
- `compose({ before, after, out, only }) → Promise<{ framed: string[] }>`: the files whose image carries at least one frame.
- `framesFor(beforeFile, afterFile, lib, log = console.error) → frames | null` (exported): the frames of one image, `null` for a new screen or when they cannot be computed; `lib` = the loaded `shot-frames.mjs`.
- `shotsMeta({ files, unchanged, setAside, framed = [] })`: adds `framed` only when not empty.
- `export const FRAMES_SENTENCE = 'Les cadres rouges entourent ce qui a changé.'`

- [ ] **Step 1: failing tests** in `test/shots.test.mjs`:
  - `'red frames are drawn over each side, outline only'`: `sideBySideHtml({ beforeUri: 'data:b', afterUri: 'data:a', frames: { before: [{ x: 10, y: 20, w: 100, h: 50 }], after: [{ x: 10, y: 60, w: 100, h: 50 }, { x: 0, y: 200, w: 40, h: 40 }], whole: false, sizes: { red: 8, white: 2, text: 46 } } })` has 3 `class="f"`; one is `left:12px;top:22px;width:96px;height:46px;border-width:8px;outline-width:2px`, before `data:a`; the style has `#f00`, `#fff`, and no `background` on `.f`; no « tout l'écran a changé ».
  - `'when the whole screen changed, a mention replaces the frames'`: `frames: { before: [], after: [], whole: true, sizes: { red: 8, white: 2, text: 46 } }` → no `class="f"`, « tout l'écran a changé » present with `font-size:46px`, after « Après » and before `data:a`.
  - `'without frames the image is as before: a new screen has none'`: `sideBySideHtml({ beforeUri: null, afterUri: 'data:a' })` has no `class="f"` and no mention (the two existing `sideBySideHtml` tests still pass).
  - `'publish records the images that carry frames'`: `JSON.parse(shotsMeta({ files: ['a--desktop.png'], unchanged: [], framed: ['a--desktop.png'] })).framed` equals `['a--desktop.png']`; without `framed` the key is absent (existing #378 and #422 tests unchanged).
  - `'the published image carries red frames, the captures stay untouched, a new screen has none'` (Playwright, with the existing `serveMovingPage()` / `serveMovingPage('<p>,</p>')` and `capture`): capture both into `before`/`after`, copy one after file as `nouveau--desktop.png` (after only), keep the bytes of every capture, `const { framed } = await compose({ before, after, out })`. Assert: `framed` is the after files minus `nouveau--desktop.png`; every capture file has the same bytes as before `compose`; `decodePng` of `out/accueil--desktop.png` contains a pixel `255,0,0,255` and `out/nouveau--desktop.png` none (the page's colours are `#c33` and `#36c`).
  - `'a capture that cannot be read is published without frames'`: the guard is tested alone (Chromium could not draw a broken file either). `framesFor(beforeFile, afterFile, lib, log)` with two files holding `Buffer.from('x')` and `Buffer.from('y')` and `lib = await import('../agent/scripts/shot-frames.mjs')` returns `null` and calls `log` once with a line matching `/cadres rouges non calculés/`; with `beforeFile` `null` it returns `null` without logging.
  - `test/sync.test.mjs`, in `'installs default skills and agent instructions'`: `.factory/scripts/shot-frames.mjs` exists.
- [ ] **Step 2:** run `node --test test/shots.test.mjs test/sync.test.mjs`, fail.
- [ ] **Step 3: implement.**
  - `sideBySideHtml`: wrap each image in `<div class="i">` and move the 1 px grey border from `img` to `.i` (`.i{position:relative;border:1px solid #ccc}`), so that a box's `left/top` are image pixels. One `<div class="f" style="left:${x + white}px;top:${y + white}px;width:${w - 2 * white}px;height:${h - 2 * white}px;border-width:${red}px;outline-width:${white}px">` per box; `.f{position:absolute;box-sizing:border-box;border:0 solid #f00;outline:0 solid #fff}`. When `whole`: under the « Après » title, `<div class="w" style="font-size:${text}px">tout l'écran a changé</div>` (`.w{color:#d00000;font-weight:700}`, not uppercase), and the same element with `visibility:hidden` under « Avant » so both images stay level.
  - `framesFor`: `null` when there is no before file; else `lib.changeFrames(lib.decodePng(read(before)), lib.decodePng(read(after)))` in a `try`; on error `log("cadres rouges non calculés pour <file> : <message>")` and `null`.
  - `compose`: `const lib = await import('./shot-frames.mjs')` once; per file pass `frames` to `sideBySideHtml`; collect the file in `framed` when `frames` has a box on either side; return `{ framed }`.
  - `publish`: `const { framed } = await compose(…)`, then `shotsMeta({ files, unchanged, setAside, framed })`. Update the header comment of the file (l.12): the image carries the red frames.
- [ ] **Step 4:** `npm test` passes. **Step 5:** commit `feat(shots): red frames on the before/after image (#578)`.

### Task 4: the sentence in the factory's captures message

**Files:** Modify `scripts/relay/events.mjs` (`postLatestCaptures`), `test/relay.test.mjs`.

**Interfaces — Consumes:** `FRAMES_SENTENCE` from `agent/scripts/shots.mjs` (add it to the existing import, l.12); `shots.json` field `framed`.

- [ ] **Step 1: failing tests**, after the #422 test, with `shotsGh` and `labeledChecks` as there:
  - `'the captures message explains the red frames when a published image has some (#578)'`: `shotsGh({ meta: { unchanged: [], framed: ['ecran--desktop.png'] } })` → the body includes `en clair puis en sombre :\n\nLes cadres rouges entourent ce qui a changé.\n\n<!-- shots: claude/factory-assets -->`.
  - `'no word about red frames when no published image has any (#578)'`: for each `meta` of `{ unchanged: [] }` (older tool), `null` (no `shots.json`), `{ unchanged: [], framed: ['autre--mobile.png'] }` (not published), `{ unchanged: [], framed: 'oui' }` → the body does not match `/cadres rouges/` and still holds the table.
- [ ] **Step 2:** run, fail. **Step 3:** in the `try` that parses `shots.json`, `framed = Array.isArray(parsed.framed) && parsed.framed.some((f) => files.includes(f))` (default `false`); the message becomes intro line, blank line, the sentence and a blank line when `framed`, then the table. Nothing else in the message changes.
- [ ] **Step 4:** `node --test test/relay.test.mjs` passes. **Step 5:** commit `feat(relay): say what the red frames are under the captures (#578)`.

### Task 5: the agent's screenshots stage

**Files:** Modify `agent/stages/screenshots.md` (step 5), `test/shots-stable.test.mjs`.

- [ ] **Step 1: failing test** `'the screenshots stage tells the agent about the red frames'`: the stage (whitespace collapsed) matches `/cadres rouges/`, `/contenu décalé/` and `/tout l'écran a changé/`.
- [ ] **Step 2:** in step 5, after « (avant à gauche, après à droite) », add one sentence: « Chaque image avant/après porte des cadres rouges autour de ce qui a changé (aucun autour du contenu décalé, ni sur un nouvel écran ; quand presque tout diffère, la mention « tout l'écran a changé » les remplace) : tu n'as rien à faire, et les captures elles-mêmes restent sans cadre. » Nothing else changes in the stage.
- [ ] **Step 3:** `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` green. Commit `docs(agent): the red frames in the screenshots stage (#578)`.

### Task 6: the examples shown in this PR (spec, section 3)

Nothing of this task is committed. The login screen (« Connectez le panneau à GitHub ») is the real panel screen shown without a token: static, no GitHub call. Use the tool of the branch, `agent/scripts/shots.mjs`: the copy in `.factory/` is the old one.

- [ ] **Step 1: three copies of the panel as published.**

```bash
D=/tmp/demo-578; rm -rf $D; mkdir -p $D
node scripts/stamp-panel.mjs $D/site-avant "$(git rev-parse HEAD)"
cp -r $D/site-avant $D/site-ex1; cp -r $D/site-avant $D/site-ex2
```

  - `$D/site-ex1/index.html`, three edits far from each other: text modified `</svg>Factory</a>` → `</svg>Fabrique</a>`; block added right after `<h1>Connectez le panneau à GitHub</h1>`: `<p>Le jeton reste dans ce navigateur : il ne sert qu'à parler à GitHub.</p>`; element removed: `<label for="token">Jeton</label>`.
  - `$D/site-ex2/style.css`, line 4: `--bg: #fbfbfa; --surface: #ffffff; --text: #0e0f11` → `--bg: #fff3d6; --surface: #fffaf0; --text: #3b2300`.
- [ ] **Step 2: capture.** Serve each folder in the background (`python3 -m http.server 4101 --bind 127.0.0.1 --directory $D/site-avant`, 4102 for `site-ex1`, 4103 for `site-ex2`), then for each `node agent/scripts/shots.mjs capture --base-url http://127.0.0.1:<port> --routes / --out $D/cap-<avant|ex1|ex2>`. Stop the three servers.
- [ ] **Step 3: assemble** `$D/before` and `$D/after` with these names: `exemple-1-trois-changements--desktop.png`, `--mobile.png`, `--desktop--sombre.png`, `--mobile--sombre.png` (from `accueil--…` of `cap-avant` / `cap-ex1`), and `exemple-2-tout-change--desktop.png` (from `accueil--desktop.png` of `cap-avant` / `cap-ex2`). Nothing else from `cap-ex2`.
- [ ] **Step 4: look before publishing.** `node -e "import('./agent/scripts/shots.mjs').then((m) => m.compose({ before: '$D/before', after: '$D/after', out: '$D/apercu' })).then(console.log)"`, open the 5 images with Read and check the spec's « Comment vérifier » list: « Fabrique » framed on both sides at the same place; the new paragraph framed after only and nothing below it framed; « Jeton » framed before only; nothing hidden; example 2 without frame, with the mention. If two changes end in one frame, move them apart in the example (not in the tool) and redo.
- [ ] **Step 5: publish** as usual captures: `node agent/scripts/shots.mjs publish --pr <PR> --before $D/before --after $D/after > /tmp/shots.md`, then steps 5 to 7 of `.factory/stages/screenshots.md` (comment without the table, `factory:checks`). In the comment, tell the owner in plain French: these are examples made from the login screen modified on purpose (nothing of it is kept), what each of the three changes is, that the second example shows « tout l'écran a changé », that sizes, thickness and colour can be retouched, and that the sentence « Les cadres rouges entourent ce qui a changé. » will only appear under the captures once this PR is merged.

## Self-check before the PR

- [ ] `git status`: no file under `.factory/` (except the run's journal), `.claude/skills/`, `panel/`, `docs/readme/`, `GLOSSARY.md`, `docs/adr/` changed.
- [ ] `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:a11y`, `npm run test:e2e` green.

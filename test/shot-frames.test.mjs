import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { decodePng, changeFrames, frameSizes, MAX_FRAMES, WHOLE_SCREEN, SHIFT_TOLERANCE } from '../agent/scripts/shot-frames.mjs';

// Builds a PNG from raw scanlines (each row = [filter, ...bytes]); CRCs are left at zero.
const chunk = (type, body) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  return Buffer.concat([len, Buffer.from(type, 'latin1'), body, Buffer.alloc(4)]);
};
const png = (width, height, type, rows) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = type;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from(rows.flat()))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

test('decodePng reads an RGB capture', () => {
  const { width, height, data } = decodePng(png(2, 2, 2, [[0, 255, 0, 0, 0, 255, 0], [2, 0, 0, 0, 0, 1, 255]]));
  assert.equal(width, 2);
  assert.equal(height, 2);
  assert.deepEqual([...data], [255, 0, 0, 255, 0, 255, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255]);
});

test('decodePng undoes the sub, average and paeth filters, with transparency', () => {
  const { data } = decodePng(png(3, 3, 6, [
    [1, 10, 20, 30, 255, 5, 5, 5, 0, 5, 5, 5, 0],
    [3, 10, 10, 10, 0, 10, 10, 10, 0, 10, 10, 10, 0],
    [4, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0],
  ]));
  assert.deepEqual([...data], [10, 20, 30, 255, 15, 25, 35, 255, 20, 30, 40, 255, 15, 20, 25, 127, 25, 32, 40, 191, 32, 41, 50, 223, 16, 22, 28, 127, 26, 34, 43, 191, 33, 43, 53, 223]);
});

test('decodePng refuses what it cannot read', () => {
  assert.throws(() => decodePng(png(1, 1, 3, [[0, 0]])), /unsupported PNG/);
  assert.throws(() => decodePng(Buffer.from('abc')), /not a PNG/);
  const good = png(2, 2, 2, [[0, 255, 0, 0, 0, 255, 0], [2, 0, 0, 0, 0, 1, 255]]);
  assert.throws(() => decodePng(good.subarray(0, Math.floor(good.length / 2))));
});

// White image; b(x0, y0, x1, y1, seed) paints a block whose pattern depends only on the seed and on the position
// inside the block (so a moved block keeps the same pixels); seed null paints black.
const img = (width, height, paint) => {
  const data = new Uint8Array(width * height * 4).fill(255);
  paint?.((x0, y0, x1, y1, seed) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data.set(seed === null ? [0, 0, 0] : [((x - x0) * 7 + (y - y0) * 13 + seed) % 251, ((x - x0) * 3 + (y - y0) * 5) % 241, seed % 200], (y * width + x) * 4); });
  return { width, height, data };
};
const S = { red: 2, white: 1, pad: 2, min: 10, gap: 12, text: 16 };
const base = img(200, 300, (b) => { b(20, 20, 80, 40, 1); b(20, 100, 180, 140, 2); });
const frames = (a, b) => { const { before, after, whole } = changeFrames(a, b, S); return { before, after, whole }; };
const added = img(200, 340, (b) => { b(20, 20, 80, 40, 1); b(30, 55, 120, 85, 5); b(20, 140, 180, 180, 2); });

test('frame sizes follow the width of the capture', () => {
  assert.deepEqual(frameSizes(1280), { red: 8, white: 2, pad: 8, min: 40, gap: 40, text: 46 });
  assert.deepEqual(frameSizes(390), { red: 4, white: 2, pad: 6, min: 24, gap: 28, text: 16 });
  assert.equal(MAX_FRAMES, 10);
  assert.equal(WHOLE_SCREEN, 0.75);
});

test('identical images have no frame', () => {
  assert.deepEqual(frames(base, base), { before: [], after: [], whole: false });
});

test('a change in place is framed on both sides, at the same place', () => {
  const after = img(200, 300, (b) => { b(20, 20, 80, 40, 9); b(20, 100, 180, 140, 2); });
  const box = [{ x: 15, y: 15, w: 70, h: 30 }];
  assert.deepEqual(frames(base, after), { before: box, after: box, whole: false });
});

test('an added block is framed after only, and what it pushed down is not', () => {
  assert.deepEqual(frames(base, added), { before: [], after: [{ x: 25, y: 50, w: 100, h: 40 }], whole: false });
});

test('a removed block is framed before only', () => {
  assert.deepEqual(frames(added, base), { before: [{ x: 25, y: 50, w: 100, h: 40 }], after: [], whole: false });
});

test('what moved down and changed is framed on both sides', () => {
  const after = img(200, 340, (b) => { b(20, 20, 80, 40, 1); b(30, 55, 120, 85, 5); b(20, 140, 180, 180, 2); b(120, 150, 160, 170, 7); });
  assert.deepEqual(frames(base, after), {
    before: [{ x: 115, y: 105, w: 50, h: 30 }],
    after: [{ x: 25, y: 50, w: 100, h: 40 }, { x: 115, y: 145, w: 50, h: 30 }],
    whole: false,
  });
});

test('the empty bottom of a short page is never framed', () => {
  const before = img(200, 300, (b) => { b(20, 20, 80, 40, 1); b(20, 60, 80, 80, 3); b(20, 100, 180, 140, 2); });
  const after = img(200, 300, (b) => { b(20, 20, 80, 40, 1); b(20, 60, 180, 100, 2); });
  assert.deepEqual(frames(before, after), { before: [{ x: 15, y: 55, w: 70, h: 30 }], after: [], whole: false });
  assert.deepEqual(frames(img(100, 100), img(100, 160, (b) => b(40, 120, 60, 140, 4))), { before: [], after: [{ x: 35, y: 115, w: 30, h: 30 }], whole: false });
});

test('a taller margin alone is framed full width', () => {
  const after = img(200, 320, (b) => { b(20, 20, 80, 40, 1); b(20, 120, 180, 160, 2); });
  assert.deepEqual(frames(base, after), { before: [], after: [{ x: 0, y: 95, w: 200, h: 30 }], whole: false });
});

test('a block moved sideways is a change', () => {
  const after = img(200, 300, (b) => { b(60, 20, 120, 40, 1); b(20, 100, 180, 140, 2); });
  const box = [{ x: 15, y: 15, w: 110, h: 30 }];
  assert.deepEqual(frames(base, after), { before: box, after: box, whole: false });
});

test('one pixel in a corner gets a whole frame of the minimal size', () => {
  const after = img(200, 300, (b) => { b(20, 20, 80, 40, 1); b(20, 100, 180, 140, 2); b(199, 299, 200, 300, null); });
  const box = [{ x: 180, y: 280, w: 20, h: 20 }];
  assert.deepEqual(frames(base, after), { before: box, after: box, whole: false });
});

test('two changes far apart on the same rows get two frames', () => {
  const before = img(400, 100, (b) => { b(10, 40, 40, 60, 1); b(350, 40, 380, 60, 2); });
  const after = img(400, 100, (b) => { b(10, 40, 40, 60, 3); b(350, 40, 380, 60, 4); });
  const boxes = [{ x: 5, y: 35, w: 40, h: 30 }, { x: 345, y: 35, w: 40, h: 30 }];
  assert.deepEqual(frames(before, after), { before: boxes, after: boxes, whole: false });
});

test('more than ten changes are merged down to ten frames', () => {
  const squares = [];
  for (let k = 0; k < 14; k++) squares.push([5, 5 + 20 * k, 8, 8 + 20 * k]);
  for (let k = 0; k < 3; k++) squares.push([150, 5 + 100 * k, 153, 8 + 100 * k]);
  const after = img(200, 300, (b) => squares.forEach(([x0, y0, x1, y1]) => b(x0, y0, x1, y1, null)));
  const result = frames(img(200, 300), after);
  assert.equal(result.after.length, 10);
  assert.equal(result.before.length, 10);
  for (const [x0, y0, x1, y1] of squares) {
    assert.ok(result.after.some((f) => f.x <= x0 && f.y <= y0 && f.x + f.w >= x1 && f.y + f.h >= y1), `square ${x0},${y0} is framed`);
  }
});

test('beyond three quarters of the screen there is no frame, only the mention', () => {
  assert.deepEqual(frames(img(100, 100), img(100, 100, (b) => b(0, 10, 100, 90, null))), { before: [], after: [], whole: true });
  const box = [{ x: 0, y: 5, w: 100, h: 80 }];
  assert.deepEqual(frames(img(100, 100), img(100, 100, (b) => b(0, 10, 100, 80, null))), { before: box, after: box, whole: false });
});

test('different widths count as a whole new screen', () => {
  assert.deepEqual(frames(img(100, 100), img(120, 100)), { before: [], after: [], whole: true });
});

test('a long page is compared quickly', () => {
  const blocks = (b, shift) => { for (let k = 0; k < 125; k++) { const y = 40 * k + 10 + (40 * k >= 2000 ? shift : 0); b(100, y, 600, y + 20, k + 1); } };
  const before = img(1280, 5000, (b) => blocks(b, 0));
  const after = img(1280, 5200, (b) => { blocks(b, 200); b(100, 2050, 600, 2150, 999); });
  const start = Date.now();
  const result = changeFrames(before, after);
  assert.ok(Date.now() - start < 5000, `took ${Date.now() - start} ms`);
  assert.equal(result.whole, false);
  assert.equal(result.before.length, 0);
  assert.equal(result.after.length, 1);
});

// Adds `delta` to the red of every pixel of the rectangle (a browser drawing the same thing a little differently).
const nudge = (image, x0, y0, x1, y1, delta = 1) => {
  const data = image.data.slice();
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data[(y * image.width + x) * 4] += delta;
  return { ...image, data };
};

test('a change of 1/255 in place is still framed', () => {
  const box = [{ x: 21, y: 16, w: 20, h: 20 }];
  assert.deepEqual(frames(base, nudge(base, 30, 25, 31, 26)), { before: box, after: box, whole: false });
});

test('a row pushed down and drawn 1/255 differently is not framed', () => {
  assert.deepEqual(frames(base, nudge(added, 40, 150, 140, 152)), { before: [], after: [{ x: 25, y: 50, w: 100, h: 40 }], whole: false });
});

test('beyond the shift tolerance a pushed-down row is a change', () => {
  const result = frames(base, nudge(added, 40, 150, 140, 152, SHIFT_TOLERANCE + 1));
  assert.equal(result.before.length, 1);
  assert.equal(result.after.length, 2);
});

test('rows pushed down right under a removed block are matched from the bottom', () => {
  // Before: a block then the top of a card; after: a block added above, the first block removed, the card's top row
  // drawn 1/255 differently (moved by a fraction of a pixel).
  const before = img(200, 300, (b) => { b(20, 20, 80, 40, 1); b(30, 60, 90, 80, 6); b(20, 100, 180, 140, 2); });
  const shifted = img(200, 300, (b) => { b(20, 20, 80, 40, 1); b(30, 55, 120, 85, 5); b(20, 110, 180, 150, 2); });
  const after = nudge(shifted, 20, 110, 180, 111);
  const result = frames(before, after);
  assert.equal(result.before.length, 1);
  assert.ok(result.before[0].y + result.before[0].h <= 100, JSON.stringify(result.before));
  assert.deepEqual(result.after, [{ x: 25, y: 50, w: 100, h: 40 }]);
});

test('a taller margin on a short page frames the margin, not the empty bottom left on the other side', () => {
  const before = img(200, 300, (b) => { b(20, 20, 80, 40, 1); b(20, 60, 180, 100, 2); });
  const after = img(200, 300, (b) => { b(20, 20, 80, 40, 1); b(20, 80, 180, 120, 2); });
  assert.deepEqual(frames(before, after), { before: [], after: [{ x: 0, y: 55, w: 200, h: 30 }], whole: false });
});

test('a taller margin is framed, not the one-row gaps of a fractional shift further down', () => {
  const before = img(200, 300, (b) => { b(20, 20, 80, 40, 1); b(20, 60, 180, 100, 2); b(20, 150, 180, 170, 3); });
  const after = img(200, 321, (b) => { b(20, 20, 80, 40, 1); b(20, 80, 180, 120, 2); b(20, 171, 180, 191, 3); });
  assert.deepEqual(frames(before, after), { before: [], after: [{ x: 0, y: 55, w: 200, h: 30 }], whole: false });
});

test('a taller margin is framed, not the rows it pushed down that are drawn 1/255 differently', () => {
  const before = img(200, 300, (b) => { b(20, 20, 80, 40, 1); b(20, 60, 180, 100, 2); });
  const after = nudge(img(200, 320, (b) => { b(20, 20, 80, 40, 1); b(20, 80, 180, 120, 2); }), 20, 100, 180, 103);
  assert.deepEqual(frames(before, after), { before: [], after: [{ x: 0, y: 55, w: 200, h: 30 }], whole: false });
});

test('a row of a card one pixel taller and its bottom drawn 1/255 differently are not framed', () => {
  // A card: a patterned top, plain sides repeated row after row, a patterned bottom row.
  const card = (top, height, data, width) => {
    for (let y = top; y < top + height; y++) for (let x = 20; x < 180; x++) {
      const edge = y === top || y === top + height - 1;
      data.set(edge ? [(x * 7 + (y === top ? 0 : 50)) % 251, 90, 90] : x === 20 || x === 179 ? [0, 0, 0] : [255, 255, 255], (y * width + x) * 4);
    }
  };
  const before = img(200, 300, (b) => b(20, 20, 80, 40, 1));
  card(60, 40, before.data, 200);
  const after = img(200, 321, (b) => b(20, 20, 80, 40, 1));
  card(80, 41, after.data, 200);
  const nudged = nudge(after, 20, 120, 180, 121);
  assert.deepEqual(frames(before, nudged), { before: [], after: [{ x: 0, y: 55, w: 200, h: 30 }], whole: false });
});

test('frames never overlap, even next to the edge of the image', () => {
  const after = img(1280, 200, (b) => { b(0, 80, 40, 120, null); b(80, 80, 120, 120, null); });
  const { before, after: boxes } = changeFrames(img(1280, 200), after);
  assert.equal(boxes.length, before.length);
  for (const [i, p] of boxes.entries()) for (const q of boxes.slice(i + 1)) {
    assert.ok(p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y, `${JSON.stringify(p)} overlaps ${JSON.stringify(q)}`);
  }
  assert.ok(boxes.some((f) => f.x <= 0 && f.x + f.w >= 120), JSON.stringify(boxes));
});

test('changes scattered all over a long page are the whole screen', () => {
  const after = img(1280, 8000);
  for (let y = 50; y < 8000; y += 100) for (let x = 50; x < 1280; x += 100) after.data.set([0, 0, 0], (y * 1280 + x) * 4);
  const result = changeFrames(img(1280, 8000), after);
  assert.equal(result.whole, true);
  assert.deepEqual([result.before, result.after], [[], []]);
});

// Whether one of the boxes holds the rectangle [x0, x1) × [y0, y1).
const holds = (boxes, x0, y0, x1, y1) => boxes.some((f) => f.x <= x0 && f.y <= y0 && f.x + f.w >= x1 && f.y + f.h >= y1);
// Paints a plain rectangle of one colour.
const fill = (image, x0, y0, x1, y1, rgb) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) image.data.set(rgb, (y * image.width + x) * 4); return image; };
const RED = [200, 0, 0];

test('a plain bar added is framed, even when a title changed too', () => {
  const after = fill(img(200, 304, (b) => { b(20, 20, 80, 40, 9); b(20, 104, 180, 144, 2); }), 20, 60, 180, 64, RED);
  const result = frames(base, after);
  assert.ok(holds(result.after, 20, 60, 180, 64), JSON.stringify(result.after));
  assert.ok(holds(result.after, 20, 20, 80, 40) && holds(result.before, 20, 20, 80, 40), JSON.stringify(result));
});

test('a plain banner added alone gets a tight frame, not a full-width one', () => {
  assert.deepEqual(frames(base, fill(img(200, 340, (b) => { b(20, 20, 80, 40, 1); b(20, 140, 180, 180, 2); }), 30, 55, 120, 85, RED)),
    { before: [], after: [{ x: 25, y: 50, w: 100, h: 40 }], whole: false });
});

test('a plain banner added between two blocks is framed, with another change further down', () => {
  const before = img(200, 400, (b) => { b(20, 20, 80, 40, 1); b(20, 100, 180, 140, 2); b(20, 300, 80, 320, 3); });
  const after = fill(img(200, 440, (b) => { b(20, 20, 80, 40, 1); b(20, 140, 180, 180, 2); b(20, 340, 80, 360, 9); }), 0, 55, 200, 95, RED);
  const result = frames(before, after);
  assert.ok(holds(result.after, 0, 55, 200, 95), JSON.stringify(result.after));
  assert.ok(holds(result.after, 20, 340, 80, 360), JSON.stringify(result.after));
});

test('a plain block removed is framed before, with another change further down', () => {
  const before = fill(img(200, 440, (b) => { b(20, 20, 80, 40, 1); b(20, 140, 180, 180, 2); b(20, 340, 80, 360, 9); }), 30, 55, 120, 85, RED);
  const after = img(200, 400, (b) => { b(20, 20, 80, 40, 1); b(20, 100, 180, 140, 2); b(20, 300, 80, 320, 3); });
  const result = frames(before, after);
  assert.ok(holds(result.before, 30, 55, 120, 85), JSON.stringify(result.before));
});

test('an empty box with a 2px border added is framed', () => {
  const before = img(200, 400, (b) => { b(20, 20, 80, 40, 1); b(20, 100, 180, 140, 2); b(20, 300, 80, 320, 3); });
  const after = img(200, 440, (b) => { b(20, 20, 80, 40, 1); b(20, 140, 180, 180, 2); b(20, 340, 80, 360, 9); });
  fill(fill(after, 30, 55, 120, 85, [0, 0, 0]), 32, 57, 118, 83, [255, 255, 255]);
  const result = frames(before, after);
  assert.ok(holds(result.after, 30, 55, 120, 85), JSON.stringify(result.after));
});

test('a progress bar recoloured and taller is framed on both sides', () => {
  const before = fill(img(200, 400, (b) => { b(20, 20, 80, 40, 1); b(20, 100, 180, 140, 2); }), 20, 60, 180, 68, [128, 128, 128]);
  const after = fill(img(200, 404, (b) => { b(20, 20, 80, 40, 1); b(20, 104, 180, 144, 2); }), 20, 60, 180, 72, [0, 160, 0]);
  const result = frames(before, after);
  assert.ok(holds(result.before, 20, 60, 180, 68), JSON.stringify(result.before));
  assert.ok(holds(result.after, 20, 60, 180, 72), JSON.stringify(result.after));
});

test('a plain rectangle growing taller and wider is framed after', () => {
  const before = img(200, 400, (b) => { b(20, 20, 80, 40, 1); b(20, 60, 80, 80, null); b(20, 100, 180, 140, 2); });
  const after = img(200, 410, (b) => { b(20, 20, 80, 40, 1); b(20, 60, 100, 90, null); b(20, 110, 180, 150, 2); });
  const result = frames(before, after);
  assert.ok(holds(result.after, 20, 60, 100, 90), JSON.stringify(result.after));
});

test('a soft vertical gradient added is framed', () => {
  const before = img(200, 400, (b) => { b(20, 20, 80, 40, 1); b(20, 100, 180, 140, 2); b(20, 300, 80, 320, 3); });
  const after = img(200, 500, (b) => { b(20, 20, 80, 40, 1); b(20, 200, 180, 240, 2); b(20, 400, 80, 420, 9); });
  for (let y = 55; y < 155; y++) fill(after, 0, y, 200, y + 1, [255 - ((y - 55) >> 1), 255 - ((y - 55) >> 1), 255]);
  const result = frames(before, after);
  assert.ok(holds(result.after, 0, 57, 200, 155), JSON.stringify(result.after));
});

test('a card border 1px to 3px is framed in a few frames, not in pieces', () => {
  const card = (image, t) => { fill(image, 20, 60, 180, 140, [0, 0, 0]); fill(image, 20 + t, 60 + t, 180 - t, 140 - t, [255, 255, 255]); return image; };
  const before = card(img(200, 300, (b) => b(20, 20, 80, 40, 1)), 1);
  const after = card(img(200, 300, (b) => b(20, 20, 80, 40, 1)), 3);
  const result = frames(before, after);
  assert.ok(result.after.length >= 1 && result.after.length <= 4, JSON.stringify(result.after));
  assert.ok(holds(result.after, 20, 60, 180, 63) && holds(result.after, 20, 137, 180, 140), JSON.stringify(result.after));
});

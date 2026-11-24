// Red frames (« cadres rouges ») of a before/after image: what changed between two captures, computed from
// their pixels. Rows only shifted up or down (« contenu décalé ») are not a change. Pure functions, no browser.
import { inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// Decodes an 8-bit, non-interlaced RGB or RGBA PNG (what Playwright writes) into RGBA rows, top to bottom.
export function decodePng(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  let width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  const idat = [];
  for (let pos = 8; pos + 8 <= buf.length;) {
    const len = buf.readUInt32BE(pos);
    const name = buf.toString('latin1', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (body.length < len) throw new Error('truncated PNG');
    if (name === 'IHDR') {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4);
      depth = body[8]; type = body[9]; interlace = body[12];
    } else if (name === 'IDAT') idat.push(body);
    else if (name === 'IEND') break;
    pos += 12 + len;
  }
  if (!width || !height) throw new Error('not a PNG');
  if (depth !== 8 || (type !== 2 && type !== 6) || interlace !== 0) {
    throw new Error(`unsupported PNG (depth ${depth}, type ${type}, interlace ${interlace})`);
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = type === 6 ? 4 : 3;
  const stride = width * bpp;
  if (raw.length < (stride + 1) * height) throw new Error('truncated PNG');
  const rows = unfilter(raw, stride, bpp, height);
  if (bpp === 4) return { width, height, data: rows };
  const data = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < rows.length; i += 3, j += 4) {
    data[j] = rows[i]; data[j + 1] = rows[i + 1]; data[j + 2] = rows[i + 2]; data[j + 3] = 255;
  }
  return { width, height, data };
}

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

// Undoes the five PNG row filters; returns the bare pixel bytes.
function unfilter(raw, stride, bpp, height) {
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1, row = y * stride, up = row - stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[row + i - bpp] : 0;
      const b = y > 0 ? out[up + i] : 0;
      const c = y > 0 && i >= bpp ? out[up + i - bpp] : 0;
      const pred = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : filter === 4 ? paeth(a, b, c) : -1;
      if (pred < 0) throw new Error(`unsupported PNG filter ${filter}`);
      out[row + i] = (raw[src + i] + pred) & 255;
    }
  }
  return out;
}

export const MAX_FRAMES = 10;
export const WHOLE_SCREEN = 0.75;

// Every size of a frame, in pixels of the capture: GitHub shrinks wide images, so they follow its width.
export function frameSizes(width) {
  const red = Math.max(4, Math.round(width / 160));
  const white = 2;
  const pad = Math.max(6, Math.round(width / 160));
  const min = Math.max(24, Math.round(width / 32));
  return { red, white, pad, min, gap: 2 * (red + white + pad) + 4, text: Math.max(16, Math.round(width / 28)) };
}

// The frames of each side of one before/after image. Box = outer rectangle of a frame, inside its image.
export function changeFrames(before, after, sizes = frameSizes(after.width)) {
  if (before.width !== after.width) return { before: [], after: [], whole: true, sizes };
  const pairs = alignRows(before, after);
  const cells = markChanges(before, after, pairs, sizes.gap);
  const zones = [];
  for (const [side, img] of [before, after].entries()) {
    const zs = mergeZones(groupMarks(cells[side]).map((z) => widen(z, sizes.min, img)), sizes.gap, WHOLE_SCREEN * img.width * img.height);
    if (!zs) return { before: [], after: [], whole: true, sizes };
    zones.push(zs);
  }
  const grow = sizes.pad + sizes.red + sizes.white;
  const [b, a] = zones.map((zs, side) => {
    const img = side === 0 ? before : after;
    return mergeOverlaps(zs.map((z) => toBox(z, grow, img))).sort((p, q) => p.y - q.y || p.x - q.x);
  });
  return { before: b, after: a, whole: false, sizes };
}

// Row ids: equal rows share an id, in both images.
function rowIds(images) {
  const ids = new Map();
  return images.map(({ width, height, data }) => {
    const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const out = new Int32Array(height);
    for (let y = 0; y < height; y++) {
      const key = bytes.toString('latin1', y * width * 4, (y + 1) * width * 4);
      let id = ids.get(key);
      if (id === undefined) { id = ids.size; ids.set(key, id); }
      out[y] = id;
    }
    return out;
  });
}

// Longest increasing chain of anchors (sorted by their before row) on their after row.
function longestChain(anchors) {
  const tails = [], prev = new Array(anchors.length);
  anchors.forEach(([, j], k) => {
    let lo = 0, hi = tails.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (anchors[tails[mid]][1] < j) lo = mid + 1; else hi = mid; }
    prev[k] = lo > 0 ? tails[lo - 1] : -1;
    tails[lo] = k;
  });
  const chain = [];
  for (let k = tails.length ? tails[tails.length - 1] : -1; k >= 0; k = prev[k]) chain.push(anchors[k]);
  return chain.reverse();
}

// Patience diff on whole rows: the matched [beforeRow, afterRow] pairs, in order.
function alignRows(before, after) {
  const [a, b] = rowIds([before, after]);
  const pairs = [];
  const stack = [[0, a.length, 0, b.length]];
  while (stack.length) {
    let [a0, a1, b0, b1] = stack.pop();
    while (a0 < a1 && b0 < b1 && a[a0] === b[b0]) pairs.push([a0++, b0++]);
    while (a0 < a1 && b0 < b1 && a[a1 - 1] === b[b1 - 1]) pairs.push([--a1, --b1]);
    if (a0 === a1 || b0 === b1) continue;
    const count = new Map();
    for (let i = a0; i < a1; i++) { const c = count.get(a[i]) || [0, 0, -1]; c[0]++; c[2] = i; count.set(a[i], c); }
    for (let j = b0; j < b1; j++) { const c = count.get(b[j]); if (c) { c[1]++; c[3] = j; } }
    const anchors = [];
    for (const c of count.values()) if (c[0] === 1 && c[1] === 1) anchors.push([c[2], c[3]]);
    if (!anchors.length) continue;
    anchors.sort((p, q) => p[0] - q[0]);
    let pa = a0, pb = b0;
    for (const [i, j] of longestChain(anchors)) {
      stack.push([pa, i, pb, j]);
      pairs.push([i, j]);
      pa = i + 1; pb = j + 1;
    }
    stack.push([pa, a1, pb, b1]);
  }
  return pairs.sort((p, q) => p[0] - q[0]);
}

const samePixel = (d1, o1, d2, o2) => d1[o1] === d2[o2] && d1[o1 + 1] === d2[o2 + 1] && d1[o1 + 2] === d2[o2 + 2] && d1[o1 + 3] === d2[o2 + 3];

// How far apart (per channel, out of 255) two pixels of a row that only moved up or down may be: a browser draws an
// element moved by a fraction of a pixel (text 17px/1.5 high, for instance) with slightly different soft edges.
export const SHIFT_TOLERANCE = 1;
const nearPixel = (d1, o1, d2, o2) => Math.abs(d1[o1] - d2[o2]) <= SHIFT_TOLERANCE && Math.abs(d1[o1 + 1] - d2[o2 + 1]) <= SHIFT_TOLERANCE
  && Math.abs(d1[o1 + 2] - d2[o2 + 2]) <= SHIFT_TOLERANCE && Math.abs(d1[o1 + 3] - d2[o2 + 3]) <= SHIFT_TOLERANCE;

// Marked pixels, gathered as they come into gap-sized cells that keep their tight bounds [x0, x1) × [y0, y1).
class Cells {
  constructor(gap) { this.gap = gap; this.map = new Map(); }
  mark(x, y) {
    const key = `${Math.floor(x / this.gap)},${Math.floor(y / this.gap)}`;
    const c = this.map.get(key);
    if (!c) this.map.set(key, { x0: x, y0: y, x1: x + 1, y1: y + 1 });
    else { if (x < c.x0) c.x0 = x; if (y < c.y0) c.y0 = y; if (x >= c.x1) c.x1 = x + 1; if (y >= c.y1) c.y1 = y + 1; }
  }
}

// Pixels compared in place (same height on both sides) must be equal; a row compared with a row at another height
// on the other side has only moved, and may differ a little.
const pixelTest = (y, j) => (y === j ? samePixel : nearPixel);

// Whether row y of img is row j of other (see pixelTest).
function sameRow(img, y, other, j) {
  const same = pixelTest(y, j), w4 = img.width * 4;
  for (let i = 0; i < w4; i += 4) if (!same(img.data, y * w4 + i, other.data, j * w4 + i)) return false;
  return true;
}

// Whether rows p and q of img are exactly equal (rows of one image: no shift tolerance, or a soft gradient would be
// a stretch of rows each repeating the next).
function equalRows({ width, data }, p, q) {
  const w4 = width * 4;
  for (let k = 0; k < w4; k++) if (data[p * w4 + k] !== data[q * w4 + k]) return false;
  return true;
}

// The spacing rows of the run [y0, y1) of img (1 = spacing, indexed from y0): rows that, through rows of the run
// repeating each other, repeat a row just outside the run, one matched on the other side. A stretch of new rows
// repeating only each other (a plain bar, a banner, the sides of an empty box) is content.
function spacingRows(img, y0, y1) {
  const out = new Uint8Array(y1 - y0);
  for (let s = y0; s < y1;) {
    let e = s;
    while (e + 1 < y1 && equalRows(img, e, e + 1)) e++;
    const touches = (s === y0 && y0 > 0 && equalRows(img, y0, y0 - 1)) || (e === y1 - 1 && y1 < img.height && equalRows(img, e, y1));
    if (touches) out.fill(1, s - y0, e + 1 - y0);
    s = e + 1;
  }
  return out;
}

// Marks one run of unmatched rows [y0, y1) of img; [o0, o1) = the other side's run, compared row for row from the
// top. A row that is the other side's row counted from the bottom of the run (what a change above it pushed), or
// that is spacing on the side with more rows (see spacingRows), is not marked. Whether a pixel was marked.
function markRun(img, y0, y1, other, o0, o1, cells) {
  const { width, height, data } = img;
  const above = y0 > 0 ? y0 - 1 : -1, below = y1 < height ? y1 : -1;
  const spacing = y1 - y0 > o1 - o0 ? spacingRows(img, y0, y1) : null;
  let any = false;
  for (let y = y0; y < y1; y++) {
    const j = o0 + y - y0, fromBottom = o1 - (y1 - y);
    if (fromBottom >= o0 && fromBottom !== j && sameRow(img, y, other, fromBottom)) continue;
    if (spacing?.[y - y0]) continue;
    const same = pixelTest(y, j);
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      let marked;
      if (j < o1) marked = !same(data, o, other.data, (j * width + x) * 4);
      else {
        // Beyond the other side's run: a pixel that repeats the row above or below is only spacing.
        marked = true;
        if (above >= 0 && samePixel(data, o, data, (above * width + x) * 4)) marked = false;
        if (below >= 0 && samePixel(data, o, data, (below * width + x) * 4)) marked = false;
      }
      if (marked) { cells.mark(x, y); any = true; }
    }
  }
  return any;
}

// Differing pixels of each side, given the matched rows. A run where only spacing changed (more rows on one side,
// nothing marked) is marked full width: where a margin grew or shrank. The empty bottom of a short page is not where,
// nor the rows of one pixel a shift by a fraction of a pixel adds here and there: they are shown only when nothing
// else changed.
function markChanges(before, after, pairs, gap) {
  const cells = [new Cells(gap), new Cells(gap)], spans = [], bands = [bottomBand(before), bottomBand(after)];
  const bounds = [[-1, -1], ...pairs, [before.height, after.height]];
  for (let p = 1; p < bounds.length; p++) {
    const b0 = bounds[p - 1][0] + 1, b1 = bounds[p][0], a0 = bounds[p - 1][1] + 1, a1 = bounds[p][1];
    if (b0 === b1 && a0 === a1) continue;
    const marked = [markRun(before, b0, b1, after, a0, a1, cells[0]), markRun(after, a0, a1, before, b0, b1, cells[1])];
    // As many rows on both sides: content that only moved, not spacing.
    const extra = Math.abs(b1 - b0 - (a1 - a0));
    if (!extra || marked[0] || marked[1]) continue;
    for (const [side, y0, y1] of [[0, b0, b1], [1, a0, a1]]) {
      if (y0 < y1) spans.push({ side, y0, y1, minor: y0 >= bands[side] || extra === 1 });
    }
  }
  const major = spans.filter((s) => !s.minor);
  const nothingElse = !cells[0].map.size && !cells[1].map.size;
  const shown = major.length || !nothingElse ? major : spans;
  for (const { side, y0, y1 } of shown) {
    const width = side === 0 ? before.width : after.width;
    for (let y = y0; y < y1; y++) for (let x = 0; x < width; x++) cells[side].mark(x, y);
  }
  return cells;
}

// First row of the band of rows equal to the last row of img, down to its bottom.
function bottomBand({ width, height, data }) {
  const w4 = width * 4, last = (height - 1) * w4;
  let y = height - 1;
  while (y > 0) {
    let equal = true;
    for (let i = 0; i < w4 && equal; i++) equal = data[(y - 1) * w4 + i] === data[last + i];
    if (!equal) break;
    y--;
  }
  return y;
}

// Cells into zones: 8-connected cells make one zone, the union of their bounds.
function groupMarks({ map: cells }) {
  const zones = [], seen = new Set();
  for (const start of cells.keys()) {
    if (seen.has(start)) continue;
    seen.add(start);
    const zone = { ...cells.get(start) }, todo = [start];
    while (todo.length) {
      const [cx, cy] = todo.pop().split(',').map(Number);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const key = `${cx + dx},${cy + dy}`;
        const c = cells.get(key);
        if (!c || seen.has(key)) continue;
        seen.add(key); todo.push(key);
        zone.x0 = Math.min(zone.x0, c.x0); zone.y0 = Math.min(zone.y0, c.y0); zone.x1 = Math.max(zone.x1, c.x1); zone.y1 = Math.max(zone.y1, c.y1);
      }
    }
    zones.push(zone);
  }
  return zones;
}

const distance = (p, q) => Math.max(0, Math.max(p.x0, q.x0) - Math.min(p.x1, q.x1), Math.max(p.y0, q.y0) - Math.min(p.y1, q.y1));

// Merges the two closest zones while they are closer than gap, or while there are too many. Null as soon as one zone
// covers more than `limit` pixels (zones only grow, so the finished merge would too): the whole screen changed, no
// need to merge further. Zones may overlap until they are merged, so their summed area is only checked at the end,
// when they no longer do. Each zone keeps its nearest neighbour, so that a merge only looks again at the zones it
// concerns.
function mergeZones(zones, gap, limit) {
  const zs = zones.slice();
  let largest = zs.reduce((m, z) => Math.max(m, zoneArea(z)), 0);
  const near = zs.map(() => ({ d: Infinity, k: -1 }));
  const refresh = (i) => {
    near[i] = { d: Infinity, k: -1 };
    for (let k = 0; k < zs.length; k++) if (k !== i) { const d = distance(zs[i], zs[k]); if (d < near[i].d) near[i] = { d, k }; }
  };
  zs.forEach((_, i) => refresh(i));
  while (zs.length > 1) {
    if (largest > limit) return null;
    let bi = 0;
    for (let i = 1; i < zs.length; i++) if (near[i].d < near[bi].d) bi = i;
    if (near[bi].d >= gap && zs.length <= MAX_FRAMES) break;
    let bj = near[bi].k;
    if (bj < bi) [bi, bj] = [bj, bi];
    const p = zs[bi], q = zs[bj];
    zs[bi] = { x0: Math.min(p.x0, q.x0), y0: Math.min(p.y0, q.y0), x1: Math.max(p.x1, q.x1), y1: Math.max(p.y1, q.y1) };
    largest = Math.max(largest, zoneArea(zs[bi]));
    zs.splice(bj, 1);
    near.splice(bj, 1);
    for (let i = 0; i < zs.length; i++) {
      if (i === bi) continue;
      const n = near[i];
      if (n.k === bi || n.k === bj) refresh(i);
      else {
        if (n.k > bj) n.k--;
        const d = distance(zs[i], zs[bi]);
        if (d < n.d) near[i] = { d, k: bi };
      }
    }
    refresh(bi);
  }
  return zs.reduce((sum, z) => sum + zoneArea(z), 0) > limit ? null : zs;
}

const zoneArea = (z) => (z.x1 - z.x0) * (z.y1 - z.y0);

// A segment [lo, hi) at least `length` long (at most `size`), centred on itself, kept inside [0, size).
function span(lo, hi, length, size) {
  const len = Math.min(Math.max(hi - lo, length), size);
  const start = Math.min(Math.max(Math.round((lo + hi - len) / 2), 0), size - len);
  return [start, start + len];
}

function widen(z, min, img) {
  const [x0, x1] = span(z.x0, z.x1, min, img.width);
  const [y0, y1] = span(z.y0, z.y1, min, img.height);
  return { x0, y0, x1, y1 };
}

// Boxes pushed inward by the edge of the image may overlap: overlapping boxes become one.
function mergeOverlaps(boxes) {
  const bs = boxes.slice();
  const overlap = (p, q) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
  for (let merged = true; merged;) {
    merged = false;
    for (let i = 0; i < bs.length && !merged; i++) for (let j = i + 1; j < bs.length && !merged; j++) {
      const p = bs[i], q = bs[j];
      if (!overlap(p, q)) continue;
      const x = Math.min(p.x, q.x), y = Math.min(p.y, q.y);
      bs[i] = { x, y, w: Math.max(p.x + p.w, q.x + q.w) - x, h: Math.max(p.y + p.h, q.y + q.h) - y };
      bs.splice(j, 1);
      merged = true;
    }
  }
  return bs;
}

function toBox(z, grow, img) {
  const [x0, x1] = span(z.x0, z.x1, z.x1 - z.x0 + 2 * grow, img.width);
  const [y0, y1] = span(z.y0, z.y1, z.y1 - z.y0 + 2 * grow, img.height);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

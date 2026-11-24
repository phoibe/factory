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

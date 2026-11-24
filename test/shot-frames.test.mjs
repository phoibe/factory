import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { decodePng } from '../agent/scripts/shot-frames.mjs';

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

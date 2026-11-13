// Issue #401: the relay engine is split into parts with one job each, composed by createRelay.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const PARTS = { state: 'statePart', launches: 'launchesPart', delivery: 'deliveryPart', watch: 'watchPart', events: 'eventsPart' };
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const lines = (f) => read(f).split('\n').length;

test('each part of the relay is its own file with its own factory', async () => {
  for (const [file, name] of Object.entries(PARTS)) {
    assert.ok(existsSync(new URL(`../scripts/relay/${file}.mjs`, import.meta.url)), file);
    const mod = await import(`../scripts/relay/${file}.mjs`);
    assert.equal(typeof mod[name], 'function', `${file} exports ${name}`);
  }
});

test('the big block is gone: the entry point is short and no part is huge', () => {
  assert.ok(lines('scripts/relay.mjs') < 500, `relay.mjs has ${lines('scripts/relay.mjs')} lines`);
  for (const f of [...Object.keys(PARTS), 'shared']) assert.ok(lines(`scripts/relay/${f}.mjs`) < 1000, f);
});

test('createRelay still returns the same functions', async () => {
  const { createRelay } = await import('../scripts/relay.mjs');
  const relay = createRelay({ gh: {}, repo: 'o/r', config: {} });
  assert.deepEqual(Object.keys(relay).sort(), ['handle', 'report', 'retrySoon', 'relaunchSoon', 'retryLaunches', 'dequeue', 'refill', 'release',
    'fabrication', 'notifyWaiting', 'prodReport', 'deployFailed', 'releaseChecking', 'liveUrl', 'previewWait', 'outputs'].sort());
});

test('every name defined at the top of a part is handed to the other parts', async () => {
  // Every name defined at the top of a part's factory must be returned by it, so the other parts can reach it.
  for (const [file, name] of Object.entries(PARTS)) {
    const src = read(`scripts/relay/${file}.mjs`);
    const body = src.slice(src.indexOf(`export function ${name}(ctx)`));
    const defined = [...body.matchAll(/^  (?:async )?function (\w+)|^  const (\w+) = (?!\(\.\.\.a\) => ctx\.)(?!ctx\b)/gm)].map((m) => m[1] || m[2]);
    const returned = /^  return \{([^}]*)\};\s*\}\s*$/m.exec(body)?.[1].split(',').map((s) => s.trim().split(':')[0]) || [];
    for (const d of defined) assert.ok(returned.includes(d), `${file}: ${d} is not returned`);
  }
});

test('the queue counter is one counter shared by the parts', () => {
  for (const f of ['launches', 'events']) assert.match(read(`scripts/relay/${f}.mjs`), /ctx\.dequeues/);
});

test('a function a part borrows from another part is provided by exactly one part', () => {
  const provided = {};
  for (const [file, name] of Object.entries(PARTS)) {
    const src = read(`scripts/relay/${file}.mjs`);
    const body = src.slice(src.indexOf(`export function ${name}(ctx)`));
    for (const n of /^  return \{([^}]*)\};\s*\}\s*$/m.exec(body)[1].split(',').map((s) => s.trim())) provided[n] = (provided[n] || 0) + 1;
  }
  for (const file of Object.keys(PARTS)) {
    for (const [, n] of read(`scripts/relay/${file}.mjs`).matchAll(/^  const (\w+) = \(\.\.\.a\) => ctx\.\1\(\.\.\.a\);$/gm)) {
      assert.equal(provided[n], 1, `${file} borrows ${n}`);
    }
  }
});

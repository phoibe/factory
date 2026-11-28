import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PRICES, PRICES_DATE, priceFor, costOf, parsePrices, updatePrices } from '../scripts/lib/prices.mjs';

const MTOK = { input: 1e6, cw5: 1e6, cw1: 1e6, cacheRead: 1e6, output: 1e6 };

test('the cost of a million tokens of each sort, at the public price of Opus 5.5', () => {
  assert.equal(costOf(MTOK, 'claude-opus-5-5'), 4 + 5 + 8 + 0.2 + 20);
});

test('a dated id is priced as its base version', () => {
  assert.equal(priceFor('claude-fable-5-2-20261101').input, 8);
  assert.equal(costOf(MTOK, 'claude-opus-5-5-20261201'), costOf(MTOK, 'claude-opus-5-5'));
});

test('a version with no price gives null', () => {
  assert.equal(priceFor('claude-opus-5-6'), null);
  assert.equal(costOf(MTOK, 'claude-opus-5-6'), null);
  assert.equal(priceFor('<synthetic>'), null);
  assert.equal(priceFor(undefined), null);
});

test('the table holds the four families of the catalog, checked on the date shown', () => {
  assert.equal(PRICES_DATE, '2026-11-03');
  assert.deepEqual(PRICES.map((p) => p.model).sort(), ['claude-fable-5-2', 'claude-haiku-5-5', 'claude-opus-5-5', 'claude-sonnet-5-5']);
  for (const p of PRICES) assert.match(p.since, /^\d{4}-\d{2}-\d{2}$/);
});

const OPUS = { model: 'claude-opus-5-5', input: 4, output: 20, cacheRead: 0.4 };

test('parsePrices reads a row of the pricing page in plain text', () => {
  const text = 'Model | Base Input Tokens | 5m Cache Writes | 1h Cache Writes | Cache Hits & Refreshes | Output Tokens\n'
    + 'Claude Opus 5.5 | $4 / MTok | $5 / MTok | $8 / MTok | $0.40 / MTok | $20 / MTok\n'
    + 'Claude Code 2 is a product, not a model: $20 per month\n';
  assert.deepEqual(parsePrices(text), [OPUS]);
});

test('parsePrices reads a markdown table, first table wins, legacy names ignored', () => {
  const text = `
| Model | Base Input Tokens | 5m Cache Writes | 1h Cache Writes | Cache Hits & Refreshes | Output Tokens |
|---|---|---|---|---|---|
| Claude Opus 5.5 | $4 / MTok | $5 / MTok | $8 / MTok | $0.40 / MTok | $20 / MTok |
| Claude Haiku 5.5 | $0.10 / MTok | $0.125 / MTok | $0.20 / MTok | $0.01 / MTok | $0.50 / MTok |
| Claude 3.5 Sonnet (deprecated) | $3 / MTok | $3.75 / MTok | $6 / MTok | $0.30 / MTok | $15 / MTok |

Batch processing:
| Claude Opus 5.5 | $2 / MTok | $10 / MTok |
| Claude Opus 5.5 | $2 / MTok | $2.5 / MTok | $4 / MTok | $0.20 / MTok | $10 / MTok |
`;
  assert.deepEqual(parsePrices(text), [OPUS, { model: 'claude-haiku-5-5', input: 0.1, output: 0.5, cacheRead: 0.01 }]);
});

test('parsePrices reads an HTML table whose cells span several lines', () => {
  const html = `<table><thead><tr><th>Model</th><th>Base Input Tokens</th></tr></thead><tbody>
<tr>
  <td><a href="/models">Claude Opus 5.5</a></td>
  <td>$4 / MTok</td>
  <td>$5 / MTok</td>
  <td>$8 / MTok</td>
  <td>$0.40 / MTok</td>
  <td>$20 / MTok</td>
</tr>
<tr><td>Claude Opus 4</td><td>$15 / MTok</td><td>$18.75 / MTok</td><td>$30 / MTok</td><td>$1.50 / MTok</td><td>$75 / MTok</td></tr>
</tbody></table>`;
  assert.deepEqual(parsePrices(html), [OPUS, { model: 'claude-opus-4', input: 15, output: 75, cacheRead: 1.5 }]);
  assert.deepEqual(parsePrices('nothing here'), []);
});

// A fixed table, never the live scripts/lib/prices.mjs: a real monthly bump must not break these tests.
const source = `// fixture
export const PRICES_DATE = '2026-11-03';
// prices:start
export const PRICES = [
  { model: 'claude-fable-5-2', input: 8, output: 40, cacheRead: 0.2, since: '2026-11-03' },
  { model: 'claude-opus-5-5', input: 4, output: 20, cacheRead: 0.2, since: '2026-11-03' },
];
// prices:end
export const AFTER = true;
`;

test('updatePrices bumps a changed version and appends a new one, removing none', async () => {
  const next = updatePrices(source, [OPUS, { model: 'claude-opus-6', input: 5, output: 25, cacheRead: 0.5 }], '2026-12-01');
  const file = join(mkdtempSync(join(tmpdir(), 'prices-')), 'prices.mjs');
  writeFileSync(file, next);
  const mod = await import(pathToFileURL(file).href);
  assert.deepEqual(mod.PRICES, [
    { model: 'claude-fable-5-2', input: 8, output: 40, cacheRead: 0.2, since: '2026-11-03' },
    { model: 'claude-opus-5-5', input: 4, output: 20, cacheRead: 0.4, since: '2026-12-01' },
    { model: 'claude-opus-6', input: 5, output: 25, cacheRead: 0.5, since: '2026-12-01' },
  ]);
  assert.equal(mod.PRICES_DATE, '2026-12-01', 'the date shown follows the last change');
  assert.equal(mod.AFTER, true);
  assert.equal(next.slice(next.indexOf('// prices:end')), source.slice(source.indexOf('// prices:end')));
});

test('updatePrices returns the same text when nothing changed', () => {
  const same = [{ model: 'claude-opus-5-5', input: 4, output: 20, cacheRead: 0.2 }];
  assert.equal(updatePrices(source, same, '2026-12-01'), source);
  assert.equal(updatePrices(source, [], '2026-12-01'), source);
});

test('the monthly script checks prices too, logs changes and survives a network failure', async () => {
  const { updatePrices: checkPrices, PRICE_SOURCES } = await import('../scripts/models.mjs');
  assert.deepEqual(PRICE_SOURCES, ['https://platform.claude.com/docs/en/about-claude/pricing', 'https://docs.anthropic.com/en/docs/about-claude/pricing']);
  const file = join(mkdtempSync(join(tmpdir(), 'prices-cli-')), 'prices.mjs');
  writeFileSync(file, source);
  const logs = [];
  const log = (l) => logs.push(l);
  const page = (text) => async () => ({ ok: true, text: async () => text });
  assert.equal(await checkPrices({ fetchImpl: async () => { throw new Error('offline'); }, file, log }), false);
  assert.equal(await checkPrices({ fetchImpl: page('Claude Opus 5.5 | $4 | $5 | $8 | $0.20 | $20'), file, log }), false);
  assert.equal(readFileSync(file, 'utf8'), source);
  assert.equal(await checkPrices({ fetchImpl: page('Claude Opus 5.5 | $4 | $5 | $8 | $0.40 | $20\nClaude Opus 6 | $5 | $6.25 | $10 | $0.50 | $25'), file, log, today: '2026-12-01' }), true);
  assert.match(readFileSync(file, 'utf8'), /model: 'claude-opus-5-5', input: 4, output: 20, cacheRead: 0.4, since: '2026-12-01'/);
  assert.ok(logs.includes('Prices: opus-5-5 4/20/0.2 -> 4/20/0.4'), logs.join('\n'));
  assert.ok(logs.includes('Prices: added opus-6 5/25/0.5'), logs.join('\n'));
});

test('a price source that never answers is given up, and the next one is read', async () => {
  const { updatePrices: checkPrices } = await import('../scripts/models.mjs');
  const file = join(mkdtempSync(join(tmpdir(), 'prices-hang-')), 'prices.mjs');
  writeFileSync(file, source);
  let calls = 0;
  const fetchImpl = async (url, opts = {}) => {
    calls += 1;
    if (calls === 1) return new Promise((_, reject) => { opts.signal?.addEventListener('abort', () => reject(opts.signal.reason)); });
    return { ok: true, text: async () => 'Claude Opus 6 | $5 | $6.25 | $10 | $0.50 | $25' };
  };
  let timer; // keeps the event loop alive: the abort timer alone does not
  const res = await Promise.race([checkPrices({ fetchImpl, file, log: () => {}, timeoutMs: 50 }),
    new Promise((r) => { timer = setTimeout(() => r('hung'), 2000); })]);
  clearTimeout(timer);
  assert.equal(res, true);
  assert.equal(calls, 2);
});

test('the monthly workflow proposes the price table with the catalog', () => {
  const yml = readFileSync(new URL('../.github/workflows/models.yml', import.meta.url), 'utf8');
  assert.match(yml, /git diff --quiet -- scripts\/lib\/models\.mjs scripts\/lib\/prices\.mjs/);
  assert.match(yml, /git add scripts\/lib\/models\.mjs scripts\/lib\/prices\.mjs/);
  assert.match(yml, /git diff -U0 -- scripts\/lib\/prices\.mjs/);
});

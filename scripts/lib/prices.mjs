// The public price of each Claude model version (issue #628), in dollars per million tokens: what the « Consommation »
// page of the panel shows the factory's runs would cost at the public price. Pure, shared by Node and the panel.
// Cache writes are priced from the input: × 1.25 for 5 minutes, × 2 for one hour.

// The day the table was last checked against the pricing page (shown on the page). Rewritten by the monthly update.
export const PRICES_DATE = '2026-11-03';

// Rewritten by the monthly update (scripts/models.mjs): keep the markers and one version per line.
// prices:start
export const PRICES = [
  { model: 'claude-fable-5-2', input: 8, output: 40, cacheRead: 0.2, since: '2026-11-03' },
  { model: 'claude-opus-5-5', input: 4, output: 20, cacheRead: 0.2, since: '2026-11-03' },
  { model: 'claude-sonnet-5-5', input: 2, output: 10, cacheRead: 0.1, since: '2026-11-03' },
  { model: 'claude-haiku-5-5', input: 0.1, output: 0.5, cacheRead: 0.01, since: '2026-11-03' },
];
// prices:end

const CACHE_WRITE_5M = 1.25;
const CACHE_WRITE_1H = 2;

// The price of a model id (a dated id such as claude-opus-5-5-20261201 is priced as its base), or null when unknown.
export function priceFor(modelId, prices = PRICES) {
  const base = String(modelId ?? '').replace(/-\d{8}$/, '');
  return prices.find((p) => p.model === base) || null;
}

// Dollars for { input, cw5, cw1, cacheRead, output } tokens of one model, or null when the model has no price.
export function costOf(t, modelId, prices = PRICES) {
  const p = priceFor(modelId, prices);
  if (!p) return null;
  const n = (k) => Number(t?.[k]) || 0;
  return (n('input') * p.input + n('cw5') * p.input * CACHE_WRITE_5M + n('cw1') * p.input * CACHE_WRITE_1H
    + n('cacheRead') * p.cacheRead + n('output') * p.output) / 1e6;
}

// The prices named in the pricing page (text, markdown or HTML): each row « Claude <Family> <version> » followed by at
// least five dollar amounts (input, 5 min cache write, 1 h cache write, cache read, output). The first row of a version
// wins (the standard table comes before batch and long-context ones); legacy names (« Claude 3.5 Sonnet ») are ignored.
const NOT_MODELS = new Set(['Code', 'Instant', 'Max', 'Pro', 'Team', 'Enterprise', 'Agent', 'Desktop', 'App']);
export function parsePrices(text) {
  let s = String(text);
  if (/<t[dr][\s>]/i.test(s)) {
    s = s.replace(/\r?\n/g, ' ').replace(/<\/tr>/gi, '\n').replace(/<\/t[dh]>/gi, ' | ').replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  }
  const found = new Map();
  for (const row of s.split('\n')) {
    const m = /(?<![A-Za-z])Claude\s+([A-Z][a-z]+)\s+(\d+(?:\.\d+)?)(?![\d.]*\d)/.exec(row);
    if (!m || NOT_MODELS.has(m[1])) continue;
    const amounts = [...row.slice(m.index + m[0].length).matchAll(/\$\s*(\d+(?:\.\d+)?)/g)].map((a) => Number(a[1]));
    if (amounts.length < 5) continue;
    const model = `claude-${m[1].toLowerCase()}-${m[2].replace('.', '-')}`;
    if (!found.has(model)) found.set(model, { model, input: amounts[0], output: amounts[4], cacheRead: amounts[3] });
  }
  return [...found.values()];
}

const entry = (p, since) => `  { model: '${p.model}', input: ${p.input}, output: ${p.output}, cacheRead: ${p.cacheRead}, since: '${since}' },`;
const same = (a, b) => a.input === b.input && a.output === b.output && a.cacheRead === b.cacheRead;

// The new text of this file: only the lines between the price markers and PRICES_DATE change. A version whose price
// changed is rewritten with `since: today`, a new one is appended; none is removed. Pure: text in, text out.
export function updatePrices(source, found, today) {
  const start = source.indexOf('// prices:start');
  const end = source.indexOf('// prices:end');
  if (start < 0 || end < start) return source;
  const from = source.indexOf('\n', start) + 1;
  const line = /^\s*\{ model: '([^']+)', input: ([\d.]+), output: ([\d.]+), cacheRead: ([\d.]+), since: '([^']+)' \},?$/;
  const byModel = new Map(found.map((f) => [f.model, f]));
  const seen = new Set();
  let changed = false;
  const lines = source.slice(from, end).split('\n').map((l) => {
    const m = line.exec(l);
    if (!m) return l;
    seen.add(m[1]);
    const f = byModel.get(m[1]);
    const now = { model: m[1], input: Number(m[2]), output: Number(m[3]), cacheRead: Number(m[4]) };
    if (!f || same(f, now)) return l;
    changed = true;
    return entry(f, today);
  });
  const added = found.filter((f) => !seen.has(f.model)).map((f) => entry(f, today));
  if (!changed && !added.length) return source;
  const close = lines.findIndex((l) => /^\s*\];/.test(l));
  if (close >= 0) lines.splice(close, 0, ...added);
  const head = source.slice(0, from).replace(/(export const PRICES_DATE = ')[^']*(')/, `$1${today}$2`);
  return head + lines.join('\n') + source.slice(end);
}

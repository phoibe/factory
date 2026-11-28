// Plan gauges (issue #628): the owner notes the « tous moteurs » and « Fable » percentages of their weekly plan; two
// readings with only factory work between them give the dollars one gauge point is worth. Pure module: no DOM, and the
// factory cost is injected as `cost(from: Date, to: Date, { fableOnly }) → dollars`.
//
// quota = { reset: { all: {day,hour}|null, fable: {day,hour}|null },
//           readings: [{ at: ISO, all: int, fable: int|null, outside: boolean|null }],
//           calibration: { from, to, all, fable, points: { all, fable }, previous? } | null }
// `points` keeps the gauge rises so the dollars per point can be recomputed from fresher prices.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MIN_RISE = 5;
const PROVISIONAL = 3 * HOUR;

const READING_ERROR = 'Entrez un nombre entre 0 et 100.';
const OUTSIDE = 'Ce relevé devient le point de départ du prochain étalonnage.';
const RESET_CROSSED = 'Une remise à zéro a eu lieu depuis le relevé précédent : ce relevé devient le point de départ.';
const NOTHING_SPENT = 'La factory n’a rien consommé depuis le relevé précédent : pas d’étalonnage.';
const tooSmall = (rise) => `La jauge tous moteurs a monté de ${rise} ${Math.abs(rise) > 1 ? 'points' : 'point'} depuis le relevé précédent : `
  + `il en faut au moins ${MIN_RISE} pour étalonner. Laissez la factory travailler, puis notez un nouveau relevé.`;

// Latest instant at or before `now` falling on the reset weekday (1 = lundi … 7 = dimanche) and hour, in local time.
export function weekStart(now, reset) {
  const d = new Date(now);
  d.setHours(reset.hour, 0, 0, 0);
  const isoDay = d.getDay() || 7;
  d.setDate(d.getDate() - ((isoDay - reset.day + 7) % 7));
  if (d > now) d.setDate(d.getDate() - 7);
  return d;
}

const daysBefore = (date, n) => { const d = new Date(date); d.setDate(d.getDate() - n); return d; };

export function periodOptions(now, reset) {
  const to = new Date(now);
  const last30 = { id: '30d', label: '30 derniers jours', from: new Date(now - 30 * DAY), to };
  if (!reset) return [{ id: '7d', label: '7 derniers jours', from: new Date(now - 7 * DAY), to }, last30];
  const start = weekStart(now, reset);
  return [
    { id: 'current', label: 'Semaine de forfait en cours', from: start, to },
    { id: 'previous', label: 'Semaine de forfait précédente', from: daysBefore(start, 7), to: start },
    last30,
  ];
}

// How many plan weeks a period spans, to turn its dollars into a weekly gauge share.
export const weeks = (periodId) => (periodId === '30d' ? 30 / 7 : 1);

export function parseReading(text, { optional = false } = {}) {
  const t = String(text ?? '').trim();
  if (t === '' && optional) return { value: null };
  if (!/^\d{1,3}$/.test(t) || Number(t) > 100) return { error: READING_ERROR };
  return { value: Number(t) };
}

const time = (r) => Date.parse(r.at);
const sorted = (readings) => [...(readings || [])].sort((a, b) => time(a) - time(b));
const inWeek = (quota, now) => {
  if (!quota?.reset?.all) return [];
  const start = weekStart(now, quota.reset.all).getTime();
  return sorted(quota.readings).filter((r) => time(r) >= start && time(r) <= now.getTime());
};

// The « Oui / Non » question about use outside the factory is asked from the second reading of a week on.
export const needsQuestion = (quota, now) => inWeek(quota, now).length > 0;

const crossed = (reset, a, b) => !!reset && weekStart(new Date(time(b)), reset).getTime() > time(a);
// A reset lies between two readings: its time was crossed, or a gauge went down.
function resetBetween(quota, a, b) {
  return crossed(quota.reset?.all, a, b) || crossed(quota.reset?.fable, a, b)
    || b.all < a.all || (a.fable != null && b.fable != null && b.fable < a.fable);
}

// Keeps one earlier calibration, enough for « Supprimer ce relevé » without growing settings.json forever.
const withoutPrevious = (c) => { if (!c) return null; const { previous, ...rest } = c; return rest; };

export function addReading(quota, { all, fable = null, outside = null }, { now, cost }) {
  const reading = { at: now.toISOString(), all, fable: fable ?? null, outside: outside ?? null };
  const oldest = new Date(now); oldest.setMonth(oldest.getMonth() - 3);
  const week = inWeek(quota, now);
  const readings = [...sorted(quota.readings).filter((r) => time(r) >= oldest.getTime()), reading];
  const next = (calibration, message) => ({ quota: { ...quota, readings, calibration }, message });
  const kept = quota.calibration ?? null;
  if (!week.length) return next(kept, null);
  if (reading.outside === true) return next(kept, OUTSIDE);
  if (reading.outside !== false) return next(kept, null); // question left unanswered: a plain starting point

  // Walk back while the later reading said « Non » and no reset lies between the two.
  const chain = [...week, reading];
  let s = chain.length - 1;
  while (s > 0 && chain[s].outside === false && !resetBetween(quota, chain[s - 1], chain[s])) s -= 1;
  if (s === chain.length - 1) return next(kept, RESET_CROSSED);
  const start = chain[s];

  const rise = reading.all - start.all;
  if (rise < MIN_RISE) return next(kept, tooSmall(rise));
  const from = new Date(start.at);
  const spent = cost(from, now, { fableOnly: false });
  if (!(spent > 0)) return next(kept, NOTHING_SPENT);
  const fableRise = reading.fable != null && start.fable != null ? reading.fable - start.fable : null;
  const fableSpent = fableRise >= MIN_RISE ? cost(from, now, { fableOnly: true }) : 0;
  const fableOk = fableRise >= MIN_RISE && fableSpent > 0;
  return next({
    from: start.at,
    to: reading.at,
    all: spent / rise,
    fable: fableOk ? fableSpent / fableRise : null,
    points: { all: rise, fable: fableOk ? fableRise : null },
    previous: withoutPrevious(kept),
  }, null);
}

export function deleteLast(quota) {
  const readings = sorted(quota.readings);
  const removed = readings.pop();
  if (!removed) return quota;
  const c = quota.calibration;
  const calibration = c && c.to === removed.at ? (c.previous ?? null) : (c ?? null);
  return { ...quota, readings, calibration };
}

// Dollars per gauge point, recomputed over the calibration window with today's cost function; the stored value stays
// when that window gives 0 (it lies outside the data read).
export function livePerPoint(quota, cost) {
  const c = quota?.calibration;
  if (!c) return { all: null, fable: null };
  const from = new Date(c.from);
  const to = new Date(c.to);
  const live = (stored, rise, fableOnly) => {
    if (stored == null) return null;
    if (!rise) return stored;
    const spent = cost(from, to, { fableOnly });
    return spent > 0 ? spent / rise : stored;
  };
  return { all: live(c.all, c.points?.all, false), fable: live(c.fable, c.points?.fable, true) };
}

const dollars = (v) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: v < 10 ? 1 : 0 }).format(v)} $`;
const shortDate = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

export function calibrationLine(quota, now, cost) {
  const c = quota?.calibration;
  if (!c) return 'Pas encore d’étalonnage';
  const per = livePerPoint(quota, cost);
  const parts = [`Étalonnage du ${shortDate(c.to)}`, `1 % de la semaine tous moteurs ≈ ${dollars(per.all)}`];
  if (per.fable != null) parts.push(`1 % de la semaine Fable ≈ ${dollars(per.fable)}`);
  const line = parts.join(' · ');
  return now - Date.parse(c.to) < PROVISIONAL ? `${line} (provisoire)` : line;
}

// For the newest reading of the current week, the share of each calibrated gauge the factory used.
export function splitLines(quota, now, cost) {
  const reading = inWeek(quota, now).at(-1);
  if (!reading || !quota.calibration) return [];
  const per = livePerPoint(quota, cost);
  const at = new Date(reading.at);
  const lines = [];
  let redo = false;
  const gauge = (name, value, perPoint, reset, fableOnly) => {
    if (value == null || perPoint == null || !reset) return;
    const start = weekStart(at, reset);
    const factory = Math.round(cost(start, at, { fableOnly }) / perPoint);
    if (factory > value) redo = true;
    lines.push(`Jauge ${name} à ${value} % : factory ≈ ${factory} %, hors factory ≈ ${Math.max(0, value - factory)} %`);
  };
  gauge('tous moteurs', reading.all, per.all, quota.reset.all, false);
  gauge('Fable', reading.fable, per.fable, quota.reset.fable ?? quota.reset.all, true);
  if (redo) lines.push('L’étalonnage est peut-être à refaire.');
  return lines;
}

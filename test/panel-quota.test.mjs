import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  weekStart, periodOptions, weeks, parseReading, needsQuestion, addReading, deleteLast, livePerPoint, calibrationLine, splitLines,
} from '../panel/quota.mjs';

// Thursday 9:00 reset for both gauges. 26 Nov 2026 is a Thursday.
const RESET = { day: 4, hour: 9 };
const H = 3_600_000;
const base = () => ({ reset: { all: RESET, fable: RESET }, readings: [], calibration: null });
const d = (day, hour, min = 0) => new Date(2026, 10, day, hour, min);
// A cost of 1 $ per hour of factory work, 0.3 $ of it on Fable.
const hourly = (from, to, { fableOnly } = {}) => ((to - from) / H) * (fableOnly ? 0.3 : 1);
const zero = () => 0;

function add(quota, reading, now, cost = hourly) {
  return addReading(quota, { fable: null, outside: null, ...reading }, { now, cost });
}

test('weekStart finds the latest reset instant at or before now, in local time', () => {
  assert.equal(weekStart(d(28, 10), RESET).getTime(), d(26, 9).getTime());
  assert.equal(weekStart(d(26, 8), RESET).getTime(), d(19, 9).getTime());
  assert.equal(weekStart(d(26, 9), RESET).getTime(), d(26, 9).getTime());
  assert.equal(weekStart(d(30, 12), { day: 1, hour: 0 }).getTime(), d(30, 0).getTime());
});

test('periodOptions offers plan weeks with a reset and rolling windows without', () => {
  const now = d(28, 10);
  const withReset = periodOptions(now, RESET);
  assert.deepEqual(withReset.map((p) => [p.id, p.label]), [
    ['current', 'Semaine de forfait en cours'], ['previous', 'Semaine de forfait précédente'], ['30d', '30 derniers jours']]);
  assert.equal(withReset[0].from.getTime(), d(26, 9).getTime());
  assert.equal(withReset[0].to.getTime(), now.getTime());
  assert.equal(withReset[1].from.getTime(), d(19, 9).getTime());
  assert.equal(withReset[1].to.getTime(), d(26, 9).getTime());
  assert.equal(withReset[2].to.getTime() - withReset[2].from.getTime(), 30 * 24 * H);
  const without = periodOptions(now, null);
  assert.deepEqual(without.map((p) => [p.id, p.label]), [['7d', '7 derniers jours'], ['30d', '30 derniers jours']]);
  assert.equal(without[0].to.getTime() - without[0].from.getTime(), 7 * 24 * H);
});

test('weeks counts 30 days as 30/7 weeks and every other period as one', () => {
  assert.equal(weeks('30d'), 30 / 7);
  assert.equal(weeks('current'), 1);
  assert.equal(weeks('7d'), 1);
});

test('parseReading accepts an integer from 0 to 100 and refuses the rest', () => {
  const error = 'Entrez un nombre entre 0 et 100.';
  assert.deepEqual(parseReading('43'), { value: 43 });
  assert.deepEqual(parseReading(' 0 '), { value: 0 });
  assert.deepEqual(parseReading('100'), { value: 100 });
  assert.deepEqual(parseReading('150'), { error });
  assert.deepEqual(parseReading('4,5'), { error });
  assert.deepEqual(parseReading('-3'), { error });
  assert.deepEqual(parseReading('abc'), { error });
  assert.deepEqual(parseReading(''), { error });
  assert.deepEqual(parseReading('', { optional: true }), { value: null });
  assert.deepEqual(parseReading('  ', { optional: true }), { value: null });
});

test('needsQuestion is true only when a reading exists in the current week', () => {
  let q = base();
  assert.equal(needsQuestion(q, d(28, 10)), false);
  q = add(q, { all: 10 }, d(25, 10)).quota; // previous week
  assert.equal(needsQuestion(q, d(28, 10)), false);
  q = add(q, { all: 10 }, d(27, 10)).quota;
  assert.equal(needsQuestion(q, d(28, 10)), true);
  assert.equal(needsQuestion({ ...q, reset: { all: null, fable: null } }, d(28, 10)), false);
});

test('the first reading of a week has no message and no calibration', () => {
  const { quota, message } = add(base(), { all: 10, fable: 4 }, d(27, 10));
  assert.equal(message, null);
  assert.equal(quota.calibration, null);
  assert.deepEqual(quota.readings, [{ at: d(27, 10).toISOString(), all: 10, fable: 4, outside: null }]);
});

test('« Oui » makes the reading the next starting point', () => {
  let q = add(base(), { all: 10 }, d(27, 10)).quota;
  const r = add(q, { all: 20, outside: true }, d(27, 20));
  assert.equal(r.message, 'Ce relevé devient le point de départ du prochain étalonnage.');
  assert.equal(r.quota.calibration, null);
});

test('« Non » with a rise of 6 calibrates the all-engines gauge and leaves Fable null when its rise is 2', () => {
  let q = add(base(), { all: 10, fable: 4 }, d(27, 10)).quota;
  const r = add(q, { all: 16, fable: 6, outside: false }, d(27, 22)); // 12 h → 12 $
  assert.equal(r.message, null);
  assert.equal(r.quota.calibration.from, d(27, 10).toISOString());
  assert.equal(r.quota.calibration.to, d(27, 22).toISOString());
  assert.equal(r.quota.calibration.all, 2);
  assert.equal(r.quota.calibration.fable, null);
});

test('« Non » with an empty Fable field calibrates only the all-engines gauge', () => {
  let q = add(base(), { all: 10, fable: null }, d(27, 10)).quota;
  const r = add(q, { all: 16, fable: null, outside: false }, d(27, 22));
  assert.equal(r.quota.calibration.all, 2);
  assert.equal(r.quota.calibration.fable, null);
});

test('a Fable rise of 5 or more calibrates the Fable gauge with the Fable cost', () => {
  let q = add(base(), { all: 10, fable: 4 }, d(27, 10)).quota;
  const r = add(q, { all: 22, fable: 10, outside: false }, d(27, 22)); // Fable: 3.6 $ over 6 points
  assert.equal(r.quota.calibration.all, 1);
  assert.ok(Math.abs(r.quota.calibration.fable - 0.6) < 1e-9);
});

test('a rise under 5 points asks for more work', () => {
  let q = add(base(), { all: 10 }, d(27, 10)).quota;
  const r = add(q, { all: 13, outside: false }, d(27, 22));
  assert.equal(r.message, 'La jauge tous moteurs a monté de 3 points depuis le relevé précédent : il en faut au moins 5 pour étalonner. Laissez la factory travailler, puis notez un nouveau relevé.');
  assert.equal(r.quota.calibration, null);
});

test('no factory cost means no calibration', () => {
  let q = add(base(), { all: 10 }, d(27, 10)).quota;
  const r = add(q, { all: 20, outside: false }, d(27, 22), zero);
  assert.equal(r.message, 'La factory n’a rien consommé depuis le relevé précédent : pas d’étalonnage.');
  assert.equal(r.quota.calibration, null);
});

test('a « Oui » in the middle moves the start to that reading', () => {
  let q = add(base(), { all: 10 }, d(27, 0)).quota;
  q = add(q, { all: 20, outside: true }, d(27, 10)).quota;
  const r = add(q, { all: 30, outside: false }, d(27, 20)); // from 27 10:00: 10 $ over 10 points
  assert.equal(r.quota.calibration.from, d(27, 10).toISOString());
  assert.equal(r.quota.calibration.all, 1);
});

test('the start goes back to the oldest reading of the week while every later reading said « Non »', () => {
  let q = add(base(), { all: 10 }, d(26, 10)).quota;
  q = add(q, { all: 13, outside: false }, d(26, 20)).quota; // too small, still « Non »
  const r = add(q, { all: 30, outside: false }, d(27, 10)); // from 26 10:00: 24 $ over 20 points
  assert.equal(r.quota.calibration.from, d(26, 10).toISOString());
  assert.equal(r.quota.calibration.all, 1.2);
});

test('a reading of the previous week is never the start', () => {
  let q = add(base(), { all: 80 }, d(26, 8)).quota;
  const r = add(q, { all: 10, outside: false }, d(26, 20));
  assert.equal(r.message, null);
  assert.equal(r.quota.calibration, null);
});

test('a Fable reset between the two readings blocks and the new reading becomes the start', () => {
  const q0 = { ...base(), reset: { all: RESET, fable: { day: 5, hour: 9 } } }; // Fable resets Friday 27 at 9:00
  let q = add(q0, { all: 10, fable: 20 }, d(26, 10)).quota;
  const r = add(q, { all: 30, fable: 25, outside: false }, d(27, 20));
  assert.equal(r.message, 'Une remise à zéro a eu lieu depuis le relevé précédent : ce relevé devient le point de départ.');
  assert.equal(r.quota.calibration, null);
  const next = add(r.quota, { all: 40, fable: 30, outside: false }, d(28, 6)); // from 27 20:00: 10 $ over 10 points
  assert.equal(next.quota.calibration.from, d(27, 20).toISOString());
  assert.equal(next.quota.calibration.all, 1);
});

test('a gauge that went down blocks as a reset', () => {
  let q = add(base(), { all: 10, fable: 20 }, d(26, 10)).quota;
  const r = add(q, { all: 30, fable: 5, outside: false }, d(27, 20));
  assert.equal(r.message, 'Une remise à zéro a eu lieu depuis le relevé précédent : ce relevé devient le point de départ.');
  assert.equal(r.quota.calibration, null);
});

test('a Fable drop across an empty Fable reading blocks as a reset', () => {
  let q = add(base(), { all: 10, fable: 20 }, d(26, 10)).quota;
  q = add(q, { all: 12, fable: null, outside: false }, d(26, 20)).quota;
  const r = add(q, { all: 30, fable: 5, outside: false }, d(27, 20));
  assert.equal(r.message, 'Une remise à zéro a eu lieu depuis le relevé précédent : ce relevé devient le point de départ.');
  assert.equal(r.quota.calibration, null);
});

test('calibrationLine shows cents below 10 $ and drops them when they round to ,00', () => {
  let q = add(base(), { all: 0, fable: 0 }, d(27, 0)).quota;
  const cost = (f, t, { fableOnly } = {}) => ((t - f) / H) * (fableOnly ? 0.3 : 2.05); // 20 h → 41 $ / 10, 6 $ / 10
  q = add(q, { all: 10, fable: 10, outside: false }, d(27, 20), cost).quota;
  assert.equal(calibrationLine(q, d(28, 10), cost), 'Étalonnage du 27 nov. · 1\u00a0% de la semaine tous moteurs ≈\u00a04,10\u00a0$ · 1\u00a0% de la semaine Fable ≈\u00a00,60\u00a0$');
});

test('a new calibration replaces the previous one and deleteLast restores it', () => {
  let q = add(base(), { all: 10 }, d(26, 10)).quota;
  q = add(q, { all: 20, outside: false }, d(26, 20)).quota; // 10 $ / 10 → 1
  const first = q.calibration;
  q = add(q, { all: 25, outside: false }, d(27, 20)).quota; // from 26 10:00: 34 $ / 15
  assert.equal(q.calibration.to, d(27, 20).toISOString());
  assert.notEqual(q.calibration.all, first.all);
  const back = deleteLast(q);
  assert.equal(back.readings.length, 2);
  assert.equal(back.calibration.to, first.to);
  assert.equal(back.calibration.all, 1);
  const none = deleteLast(back);
  assert.equal(none.readings.length, 1);
  assert.equal(none.calibration, null);
});

test('deleteLast keeps the calibration when it did not end on the removed reading', () => {
  let q = add(base(), { all: 10 }, d(26, 10)).quota;
  q = add(q, { all: 20, outside: false }, d(26, 20)).quota;
  q = add(q, { all: 22, outside: false }, d(27, 20)).quota; // too small: calibration stays
  const back = deleteLast(q);
  assert.equal(back.calibration.to, d(26, 20).toISOString());
});

test('readings older than 3 months are dropped', () => {
  let q = add(base(), { all: 10 }, new Date(2026, 7, 20, 10)).quota;
  q = add(q, { all: 10 }, d(27, 10)).quota;
  assert.deepEqual(q.readings.map((r) => r.at), [d(27, 10).toISOString()]);
});

test('livePerPoint recomputes from the window and keeps the stored values when the cost is 0', () => {
  let q = add(base(), { all: 10, fable: 0 }, d(26, 10)).quota;
  q = add(q, { all: 20, fable: 10, outside: false }, d(26, 20)).quota; // 10 $ / 10, 3 $ / 10
  const double = (f, t, o) => 2 * hourly(f, t, o);
  const live = livePerPoint(q, double);
  assert.equal(live.all, 2);
  assert.ok(Math.abs(live.fable - 0.6) < 1e-9);
  const kept = livePerPoint(q, zero);
  assert.equal(kept.all, 1);
  assert.ok(Math.abs(kept.fable - 0.3) < 1e-9);
  assert.deepEqual(livePerPoint(base(), hourly), { all: null, fable: null });
});

test('calibrationLine says there is none yet, then gives a dollar per point', () => {
  assert.equal(calibrationLine(base(), d(28, 10), hourly), 'Pas encore d’étalonnage');
  let q = add(base(), { all: 0, fable: 0 }, d(27, 0)).quota;
  const cost = (f, t, { fableOnly } = {}) => ((t - f) / H) * (fableOnly ? 3 : 9.5); // 20 h → 190 $ / 10, 60 $ / 10
  q = add(q, { all: 10, fable: 10, outside: false }, d(27, 20), cost).quota;
  assert.equal(calibrationLine(q, d(28, 10), cost), 'Étalonnage du 27 nov. · 1\u00a0% de la semaine tous moteurs ≈\u00a019\u00a0$ · 1\u00a0% de la semaine Fable ≈\u00a06\u00a0$');
});

test('calibrationLine omits Fable when it is not calibrated and is provisional under 3 hours', () => {
  let q = add(base(), { all: 0 }, d(28, 0)).quota;
  q = add(q, { all: 10, outside: false }, d(28, 10)).quota; // 10 $ / 10
  assert.equal(calibrationLine(q, d(28, 12), hourly), 'Étalonnage du 28 nov. · 1\u00a0% de la semaine tous moteurs ≈\u00a01\u00a0$ (provisoire)');
  assert.equal(calibrationLine(q, d(28, 13), hourly), 'Étalonnage du 28 nov. · 1\u00a0% de la semaine tous moteurs ≈\u00a01\u00a0$');
});

test('splitLines splits the newest reading of the week between factory and the rest', () => {
  const q = {
    ...base(),
    readings: [{ at: d(27, 9).toISOString(), all: 43, fable: 20, outside: null }],
    calibration: { from: d(20, 9).toISOString(), to: d(20, 19).toISOString(), all: 1, fable: 1, points: { all: 10, fable: 3 } },
  };
  // Week starts 26 9:00, reading at 27 9:00 → 24 h of factory (31 $, 12 $ Fable); the calibration window gives 1 $ / point
  const cost = (f, t, { fableOnly } = {}) => {
    if (f.getTime() === d(20, 9).getTime()) return fableOnly ? 3 : 10; // calibration window: 1 $ / point
    return ((t - f) / H) * (fableOnly ? 0.5 : 31 / 24);
  };
  assert.deepEqual(splitLines(q, d(28, 10), cost), [
    'Jauge tous moteurs à 43\u00a0% : factory ≈\u00a031\u00a0%, hors factory ≈\u00a012\u00a0%',
    'Jauge Fable à 20\u00a0% : factory ≈\u00a012\u00a0%, hors factory ≈\u00a08\u00a0%',
  ]);
});

test('splitLines warns when the factory share exceeds the reading', () => {
  const q = {
    ...base(),
    readings: [{ at: d(27, 9).toISOString(), all: 10, fable: null, outside: null }],
    calibration: { from: d(20, 9).toISOString(), to: d(20, 19).toISOString(), all: 1, fable: null, points: { all: 10, fable: null } },
  };
  const cost = (f, t) => (f.getTime() === d(20, 9).getTime() ? 10 : 24);
  assert.deepEqual(splitLines(q, d(28, 10), cost), [
    'Jauge tous moteurs à 10\u00a0% : factory ≈\u00a024\u00a0%, hors factory ≈\u00a00\u00a0%',
    'L’étalonnage est peut-être à refaire.',
  ]);
});

test('splitLines is empty without calibration or without a reading this week', () => {
  assert.deepEqual(splitLines(base(), d(28, 10), hourly), []);
  const q = {
    ...base(),
    readings: [{ at: d(25, 9).toISOString(), all: 43, fable: null, outside: null }],
    calibration: { from: d(20, 9).toISOString(), to: d(20, 19).toISOString(), all: 1, fable: null, points: { all: 10, fable: null } },
  };
  assert.deepEqual(splitLines(q, d(28, 10), hourly), []);
});

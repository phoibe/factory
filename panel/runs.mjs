// How many agent runs the factory started today, all projects together: the Claude routines have a daily limit,
// and the owner can see how close the day is to it. A start labels its card `factory:running` (the issue and,
// for a PR step, the PR too, within a second): starts closer than 10 s count once.

// Midnight in Paris, as a timestamp, for the day of `now`.
export function parisMidnight(now = Date.now()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(now)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offset = asUtc - Math.floor(now / 1000) * 1000; // Paris ahead of UTC
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day) - offset;
}

export function runsToday(events, now = Date.now()) {
  const from = parisMidnight(now);
  const times = events
    .filter((e) => e.event === 'labeled' && e.label?.name === 'factory:running')
    .map((e) => Date.parse(e.created_at))
    .filter((t) => t >= from && t <= now)
    .sort((a, b) => a - b);
  let count = 0;
  let last = -Infinity;
  for (const t of times) {
    if (t - last > 10_000) count += 1;
    last = t;
  }
  return count;
}

export function runsText(n) {
  if (!n) return "Aucun agent lancé aujourd'hui";
  return n === 1 ? "1 agent lancé aujourd'hui" : `${n} agents lancés aujourd'hui`;
}

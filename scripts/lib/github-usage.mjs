// The relay's GitHub usage at the end of a run (issue #491), printed in the Actions log: what costs the most is
// read there, figures in hand. `usage` is github().usage().
export function formatUsage(usage, top = 10) {
  const reserve = usage.remaining == null ? 'reserve unknown' : `reserve ${usage.remaining}/${usage.limit ?? '?'}`;
  const lines = Object.entries(usage.routes).sort((a, b) => b[1] - a[1]).slice(0, top).map(([route, n]) => `  ${n} ${route}`);
  return [`GitHub usage: ${usage.reads} counted reads, ${usage.free} free (304), ${usage.writes} writes, ${reserve}`, ...lines].join('\n');
}

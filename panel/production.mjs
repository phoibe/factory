// The production gap (issue #369): which validated changes are not on the live site yet. Pure functions, tested in
// test/panel-production.test.mjs; the panel (app.mjs) reads GitHub and draws the line under the project's name.
// A version is live only when its host reported a successful publication: never because « the site answers ».

// The deployments that are the live site (not a PR preview): the same rule as scripts/relay.mjs.
export const isLiveEnv = (env) => /^(production(\s+[–—-]\s+\S.*)?|github-pages)$/i.test(String(env || '').trim());

const PENDING = new Set(['pending', 'queued', 'in_progress']);
const FAILED = new Set(['failure', 'error']);
// « inactive »: the host took that deployment down. It is not live any more, and nothing says what is.
const GONE = 'inactive';

// `statusesById`: id → the deployment's statuses, newest first (as GitHub lists them); a missing id was not read.
// liveSha: the newest live deployment that ever succeeded. latest: how the newest live deployment ended.
export function deploymentState(deployments, statusesById) {
  const live = (deployments || []).filter((d) => isLiveEnv(d.environment)).sort((a, b) => Number(b.id) - Number(a.id));
  let liveSha = null;
  // An older deployment marked « inactive » is only one a newer one replaced: its success still counts.
  for (const d of live) {
    if ((statusesById[d.id] || []).some((s) => s.state === 'success')) { liveSha = d.sha; break; }
  }
  const newest = live[0] ? statusesById[live[0].id] : undefined;
  const state = newest?.[0]?.state;
  const latest = !live.length ? null
    : state === GONE ? 'gone'
      : !state || PENDING.has(state) ? 'pending' : FAILED.has(state) ? 'failure' : 'success';
  return { liveSha, latest };
}

const closesOf = (body) => Number(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/i.exec(body || '')?.[1]) || null;
const item = (p) => ({ number: p.number, issue: closesOf(p.body) || p.number, title: p.title || `Modification n° ${p.number}`, mergedAt: p.merged_at });

// The merged PRs whose merge commit is not live (`aheadShas`: the commits of the validated branch missing from the
// live one), oldest first. A PR the factory undid (live revert « claude/revert-pr-<n> ») comes back until the PR that
// closes its redo request is merged: that one then stands for it until it is live.
export function gapItems(pulls, aheadShas) {
  const merged = (pulls || []).filter((p) => p.merged_at && p.head?.ref !== 'preprod');
  const out = merged.filter((p) => aheadShas.has(p.merge_commit_sha)).map(item);
  for (const r of merged) {
    const undone = Number(/^claude\/revert-pr-(\d+)$/.exec(r.head?.ref || '')?.[1]);
    if (!undone || aheadShas.has(r.merge_commit_sha) || out.some((i) => i.number === undone)) continue;
    const redo = Number(/<!-- factory-revert-redo #(\d+)/.exec(r.body || '')?.[1]) || null;
    if (redo && merged.some((p) => closesOf(p.body) === redo)) continue;
    const original = merged.find((p) => p.number === undone);
    if (original) out.push(item(original));
  }
  return out.sort((a, b) => Date.parse(a.mergedAt) - Date.parse(b.mergedAt));
}

const count = (n) => `${n} modification${n > 1 ? 's' : ''} d'écart`;
const unknown = (why) => ({ kind: 'unknown', text: 'En ligne : version inconnue', items: [], why });

const NO_TAG = {
  external: 'Mise en ligne hors de la factory, et le site ne donne pas encore son étiquette de version.',
  silent: 'L\'hébergeur ne prévient pas GitHub, et le site ne donne pas encore son étiquette de version.',
};
const NONE = { kind: 'none', text: '', items: [] };

// The line once the live commit is known: up to date, or the validated changes it lacks.
function liveView({ aheadShas, pulls, truncated }, latest = 'success') {
  // The compare stops at 250 commits: the newest ones are then missing, and « à jour » would be a lie.
  if (truncated) return unknown('Le site en ligne est en retard de trop de modifications pour les compter : l\'écart exact n\'est pas connu.');
  const items = gapItems(pulls, aheadShas || new Set());
  if (!items.length) return { kind: 'ok', text: 'En ligne : à jour', items };
  if (latest === 'failure') return { kind: 'failed', text: `En ligne : ${count(items.length)} · la dernière publication a échoué`, items };
  return { kind: 'gap', text: `En ligne : ${count(items.length)}`, items };
}

// Whether the version tag (issue #372) says what is live: external production, or a site whose host reports no live
// deployment to GitHub. Projects without a site show nothing.
export const tagged = ({ mode, hasSite, deployments }) => Boolean(hasSite) && (mode === 'external' || !(deployments || []).some((d) => isLiveEnv(d.environment)));

// What the line under the project's name says. `mode`: 'auto' | 'approval' | 'external'. `hasSite`: the project
// has a site address. `aheadShas`: Set (see gapItems). `error`: GitHub could not be read. `tagSha`: the commit the
// site's version tag names (refs/factory/live), null when the site gives none.
export function gapView(input) {
  const { mode, hasSite, deployments, statusesById, aheadShas, pulls, error, tagSha } = input;
  const live = (deployments || []).some((d) => isLiveEnv(d.environment));
  if (!hasSite && (mode === 'external' || !live)) return NONE;
  if (error) return unknown('GitHub ne répond pas pour le moment : la version en ligne n\'a pas pu être lue.');
  if (tagged(input)) return tagSha ? liveView(input) : unknown(NO_TAG[mode === 'external' ? 'external' : 'silent']);
  const { liveSha, latest } = deploymentState(deployments, statusesById || {});
  if (latest === 'gone') return unknown('L\'hébergeur a retiré la dernière publication : on ne sait plus quelle version est en ligne.');
  if (latest === 'pending') return { kind: 'deploying', text: 'En ligne : publication en cours…', items: liveSha ? gapItems(pulls, aheadShas || new Set()) : [] };
  if (!liveSha) return unknown('Aucune publication réussie récente n\'est visible chez l\'hébergeur.');
  return liveView(input, latest);
}

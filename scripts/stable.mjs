#!/usr/bin/env node
// Helpers for .github/workflows/stable.yml, run in a full clone of main.
//   node scripts/stable.mjs tag    -> the next version tag, vYYYY.MM.DD (then .2, .3… the same day)
//   node scripts/stable.mjs notes  -> the changes since the current stable branch, in Markdown
//   node scripts/stable.mjs ready  -> ready=true|false (GITHUB_OUTPUT) : may the hourly run promote main on its own?
//   node scripts/stable.mjs yield  -> ready=true|false again, just before promoting: false once an owner request waits
//   node scripts/stable.mjs wait   -> an owner request waits for an hourly run already under way (at most 20 min)
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function nextTag(existing, date = new Date()) {
  const day = `v${date.toISOString().slice(0, 10).replace(/-/g, '.')}`;
  if (!existing.includes(day)) return day;
  let n = 2;
  while (existing.includes(`${day}.${n}`)) n++;
  return `${day}.${n}`;
}

export function notes(subjects) {
  const lines = subjects.filter((s) => s && !/^chore\(factory\)/.test(s)).map((s) => `- ${s}`);
  return ['Ce qui change pour les projets :', '', ...(lines.length ? lines : ['- (aucun changement visible)'])].join('\n');
}

export const SOAK_MS = 60 * 60_000;

// The factory repository runs main itself (the scout). Main becomes stable on its own once its newest change has
// run an hour there, its tests are green and nothing went wrong on the factory's own cards meanwhile.
export function readyToPromote({ ahead, lastCommitAt, mainGreen, troubles = [], now = Date.now() }) {
  if (!ahead) return { ready: false, reason: 'rien de nouveau depuis la version stable' };
  if (now - lastCommitAt < SOAK_MS) return { ready: false, reason: "le dernier changement tourne depuis moins d'une heure" };
  if (!mainGreen) return { ready: false, reason: "les tests de main ne sont pas verts" };
  if (troubles.length) return { ready: false, reason: `souci sur la factory : ${troubles.join(', ')}` };
  return { ready: true, reason: 'prête' };
}

// GitHub keeps one pending run per concurrency group and cancels the older one, so the hourly run has a queue of
// its own (stable.yml) and never displaces the owner's « Déclarer stable ». It gives way instead: it does not
// promote while an owner request is queued or running, and an owner request waits for an hourly run under way.
const active = (runs, selfId) => runs.filter((r) => r.id !== selfId && r.status !== 'completed');
export const ownerRequestActive = (runs, selfId) => active(runs, selfId).some((r) => r.event !== 'schedule');
export const hourlyRunActive = (runs, selfId) => active(runs, selfId).some((r) => r.event === 'schedule');

async function stableRuns() {
  return (await api('/actions/workflows/stable.yml/runs?per_page=30')).workflow_runs || [];
}

async function api(path) {
  const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}${path}`, {
    headers: { authorization: `Bearer ${process.env.GH_TOKEN}`, accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} on ${path}`);
  return res.json();
}

async function ready(git) {
  git('fetch', '--quiet', 'origin', 'stable');
  // The panel's sync commits change nothing in the factory's code: they neither count nor restart the hour.
  const changes = git('log', '--format=%ct %H %s', 'FETCH_HEAD..HEAD').split('\n').filter(Boolean)
    .map((l) => { const [t, sha, ...s] = l.split(' '); return { at: Number(t) * 1000, sha, subject: s.join(' ') }; })
    .filter((c) => !/^chore\(factory\)/.test(c.subject));
  if (ownerRequestActive(await stableRuns(), Number(process.env.GITHUB_RUN_ID))) {
    return { ready: false, reason: 'une demande « Déclarer stable » passe en premier' };
  }
  const head = git('rev-parse', 'HEAD');
  const runs = (await api(`/commits/${head}/check-runs?check_name=test`)).check_runs || [];
  const since = changes.length ? Math.min(...changes.map((c) => c.at)) : Date.now();
  const troubles = [];
  for (const label of ['factory:blocked', 'factory:skills-alert']) {
    for (const i of await api(`/issues?state=open&labels=${encodeURIComponent(label)}&per_page=50`)) {
      if (Date.parse(i.updated_at) >= since) troubles.push(`#${i.number} ${label === 'factory:blocked' ? 'bloquée' : 'alerte de skills'}`);
    }
  }
  return readyToPromote({
    ahead: changes.length,
    lastCommitAt: changes.length ? Math.max(...changes.map((c) => c.at)) : 0,
    mainGreen: runs.length > 0 && runs.every((r) => r.conclusion === 'success'),
    troubles,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const cmd = process.argv[2];
  if (cmd === 'tag') console.log(nextTag(git('tag', '--list', 'v*').split('\n').filter(Boolean)));
  else if (cmd === 'notes') {
    let range = 'HEAD';
    try { git('fetch', '--quiet', 'origin', 'stable'); range = 'FETCH_HEAD..HEAD'; } catch { /* first promotion */ }
    console.log(notes(git('log', '--format=%s', range).split('\n')));
  } else if (cmd === 'ready') {
    const r = await ready(git);
    console.log(`${r.ready ? 'Promotion automatique' : 'Pas de promotion'} : ${r.reason}`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `ready=${r.ready}\n`);
  } else if (cmd === 'yield') {
    const waiting = ownerRequestActive(await stableRuns(), Number(process.env.GITHUB_RUN_ID));
    console.log(waiting ? 'Pas de promotion : une demande « Déclarer stable » passe en premier' : 'Promotion automatique');
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `ready=${!waiting}\n`);
  } else if (cmd === 'wait') {
    const until = Date.now() + 20 * 60_000;
    while (hourlyRunActive(await stableRuns(), Number(process.env.GITHUB_RUN_ID)) && Date.now() < until) {
      console.log('La promotion automatique en cours se termine, puis votre demande passe');
      await new Promise((r) => setTimeout(r, 20_000));
    }
  } else { console.error('usage: stable.mjs tag|notes|ready|yield|wait'); process.exit(1); }
}

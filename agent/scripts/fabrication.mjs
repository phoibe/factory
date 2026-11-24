// Turns the agent's journal (.factory/journal/*.jsonl, written by a Claude Code hook) into the
// « Fabrication » section of a PR: which skills each run really loaded, the TDD proof, and alerts.
export const FABRICATION_MARKER = '<!-- factory-fabrication -->';

const UI_FILE = /\.(tsx|jsx|vue|svelte|astro|html|css|scss)$/;
const TEST_FILE = /(\.|\/)(test|spec)\.|(^|\/)(tests?|__tests__|e2e)\//;

// A change that only bumps a cache-busting « ?v=N » (to ship new code) changes nothing on screen.
export function cacheBustOnly(patch) {
  if (!patch) return false;
  const lines = String(patch).split('\n').filter((l) => /^[-+]/.test(l) && !/^(---|\+\+\+) /.test(l));
  const strip = (l) => l.slice(1).replace(/([?&]v=)\d+/g, '$1');
  const removed = lines.filter((l) => l[0] === '-').map(strip).sort();
  const added = lines.filter((l) => l[0] === '+').map(strip).sort();
  return removed.length > 0 && removed.length === added.length && removed.every((l, i) => l === added[i]);
}

// Files are names, or GitHub's PR file objects ({ filename, patch }) so that a cache bump is not counted.
export const uiChanged = (files) => files.some((f) => {
  const name = typeof f === 'string' ? f : f.filename;
  return UI_FILE.test(name) && !TEST_FILE.test(name) && !(typeof f === 'object' && cacheBustOnly(f.patch));
});

// A small change (a few source files) is built without a written plan: the plan only pays off on bigger work.
// Tests, docs, lock files and the factory's own files do not count.
const NOT_SOURCE = /(^|\/)(\.factory|\.impeccable|docs|\.github)\/|\.md$|(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/;
export const SMALL_FILES = 3;
export const smallChange = (files) => files
  .map((f) => (typeof f === 'string' ? f : f.filename))
  .filter((f) => !NOT_SOURCE.test(f) && !TEST_FILE.test(f)).length <= SMALL_FILES;

export function parseJournal(files) {
  const runs = [];
  for (const text of files) {
    let run = null;
    for (const line of String(text).split('\n')) {
      let e;
      try { e = JSON.parse(line); } catch { continue; }
      if (e.kind === 'run' || !run) {
        const isRun = e.kind === 'run';
        run = { stage: isRun ? e.stage : null, t: e.t, issue: isRun ? e.issue ?? null : null, models: isRun && e.models ? e.models : null, upstream: null, skills: [], tests: [], agents: [] };
        runs.push(run);
      }
      if (e.kind === 'skill') run.skills.push(e.name);
      if (e.kind === 'upstream') run.upstream = e;
      if (e.kind === 'test') run.tests.push(e);
      if (e.kind === 'agent') run.agents.push(e);
    }
  }
  return runs.sort((a, b) => String(a.t).localeCompare(String(b.t)));
}

const used = (run, skill) => run.skills.some((s) => s === skill || s.endsWith(`:${skill}`));
// TDD proof: a red test run, then a green one later in the same run.
export const redThenGreen = (run) => {
  const red = run.tests.findIndex((t) => !t.ok);
  return red >= 0 && run.tests.slice(red + 1).some((t) => t.ok);
};

// What each stage must show, given the stages the owner turned on.
export function expectations(stage, stages, ui, { small = false } = {}) {
  const on = (k) => stages[k] !== false;
  const out = [];
  if (stage === 'build') {
    if (on('plan') && !small) out.push({ skill: 'writing-plans', label: 'plan' });
    if (on('tdd')) out.push({ skill: 'test-driven-development', label: 'TDD', tdd: true });
  }
  if (stage === 'bugfix') out.push({ skill: 'systematic-debugging', label: 'recherche de la cause', tdd: true });
  // The general review is asked for explicitly: both passes are expected whatever the stage toggles.
  if (stage === 'audit') return [{ skill: 'impeccable', label: 'passe design' }, { skill: 'requesting-code-review', label: 'revue de code' }];
  // « Amélioration UI » (issue #462): the design rounds are the whole run.
  if (stage === 'ui-polish') return [{ skill: 'impeccable', label: 'passe design' }];
  if (['build', 'bugfix', 'foundation'].includes(stage)) {
    if (on('review')) out.push({ skill: 'requesting-code-review', label: 'revue de code' });
    if (on('designPass') && ui) out.push({ skill: 'impeccable', label: 'passe design' });
  }
  return out;
}

// Steps another run can still do after the fact (a plan or a red test written afterwards proves nothing).
export const CATCH_UP = ['requesting-code-review', 'impeccable'];

// What the whole PR is missing: a skill counts when any run of the PR used it (a catch-up run fills the gap).
export function missingSkills(runs, { stages = {}, ui = false, small = false } = {}) {
  const out = [];
  for (const run of runs) {
    for (const exp of expectations(run.stage, stages, ui, { small })) {
      if (!runs.some((r) => used(r, exp.skill)) && !out.some((o) => o.skill === exp.skill)) out.push({ ...exp, stage: run.stage });
    }
  }
  return out;
}

// Sub-agents: which model each one ran on (the table « Modèles par rôle » of AGENT.md; any family of the catalog is valid).
// The display names of MODEL_FAMILIES (scripts/lib/models.mjs), smallest first. Copied, not imported: the sync ships
// this script alone into each project's .factory/scripts/, without scripts/lib. test/upstream.test.mjs keeps both equal.
const FAMILIES = ['Haiku', 'Sonnet', 'Opus', 'Fable'];
export function modelFamily(model) {
  if (!model) return null;
  return FAMILIES.find((f) => String(model).toLowerCase().includes(f.toLowerCase())) || String(model);
}

// Without a model, an agent type may still carry its own; « session » is what the factory's agents get.
const SESSION = 'le modèle de la session';
const MAX_LABELS = 3;
export function agentsLine(runs) {
  if (!runs.length) return '**Sous-agents** : non mesuré';
  const groups = new Map();
  for (const a of runs.flatMap((r) => r.agents || [])) {
    const key = modelFamily(a.model) || SESSION;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a.label);
  }
  if (!groups.size) return '**Sous-agents** : aucun';
  const rank = (k) => (k === SESSION ? 99 : FAMILIES.includes(k) ? FAMILIES.indexOf(k) : 50);
  const parts = [...groups].sort(([a], [b]) => rank(a) - rank(b)).map(([k, labels]) => {
    const named = labels.filter(Boolean);
    const shown = named.slice(0, MAX_LABELS).join(', ') + (named.length > MAX_LABELS ? ', …' : '');
    return `${labels.length} sur ${k}${shown ? ` (${shown})` : ''}`;
  });
  return `**Sous-agents** : ${parts.join(', ')}`;
}

// Issue #417: the independent tasks of a large plan are built at the same time, each by a sub-agent in its own copy
// (isolation « worktree »), at most MAX_PARALLEL at once. Sub-agents are stamped at launch: copies launched within
// WAVE_MS of a wave's first launch were sent together and form one wave; a task sent again in that wave (it came back
// at once and was re-sent) counts once. A task started later (a place freed up) opens a new wave. Only a large build
// (plan executed by subagent-driven-development) has parallel tasks: elsewhere a copy is not a task.
export const MAX_PARALLEL = 3;
const WAVE_MS = 30_000;
const largeBuild = (runs) => runs.some((r) => used(r, 'subagent-driven-development'));
export function parallelWaves(runs, { windowMs = WAVE_MS } = {}) {
  if (!largeBuild(runs)) return [];
  const copies = runs.filter((r) => r.stage === 'build').flatMap((r) => r.agents || []).filter((a) => a.copy === true)
    .map((a) => ({ ...a, ms: Date.parse(a.t) })).sort((a, b) => (a.ms || 0) - (b.ms || 0));
  const waves = [];
  for (const a of copies) {
    const wave = waves[waves.length - 1];
    if (wave && Number.isFinite(a.ms) && Number.isFinite(wave[0].ms) && a.ms - wave[0].ms <= windowMs) {
      if (!a.label || !wave.some((b) => b.label === a.label)) wave.push(a);
    } else waves.push([a]);
  }
  return waves;
}
const ranTogether = (waves) => waves.some((w) => w.length > 1);

const MAX_WAVES_SHOWN = 3;
export function parallelLine(runs) {
  const waves = parallelWaves(runs);
  if (!waves.length) return null;
  // A task sent again later (a retry on a stronger model) is still one task.
  const all = waves.flat();
  const count = new Set(all.filter((a) => a.label).map((a) => a.label)).size + all.filter((a) => !a.label).length;
  const names = waves.slice(0, MAX_WAVES_SHOWN).map((w) => w.map((a) => a.label || 'sans nom').join(' + ')).join(', puis ')
    + (waves.length > MAX_WAVES_SHOWN ? ', …' : '');
  // Measured at launch: how many were sent together, not how long each one ran.
  const most = Math.max(...waves.map((w) => w.length));
  if (count === 1) return `**Tâches en parallèle** : 1 tâche construite dans sa propre copie, lancée seule (${names})`;
  const tasks = `${count} tâches construites chacune dans sa copie`;
  if (most === 1) return `**Tâches en parallèle** : ${tasks}, jamais lancées ensemble (${names})`;
  const launched = waves.length > 1 ? `lancées en ${waves.length} vagues` : 'lancées ensemble';
  return `**Tâches en parallèle** : ${tasks}, ${launched} (${names}), au plus ${most} lancées ensemble`;
}

// Issue #381: the route a build followed, read from the journal (never from the size the agent declared): a plan
// executed by one sub-agent per task (subagent-driven-development) is the large route, any other plan the medium one,
// no plan on a small change the small one. A bigger change without a plan claims nothing more (the plan alert says it).
export function routeLine(runs, { small = false } = {}) {
  if (!runs.some((r) => r.stage === 'build')) return null;
  const large = largeBuild(runs);
  if (large && ranTogether(parallelWaves(runs))) return `**Parcours** : grande demande, plan exécuté tâche par tâche, tâches indépendantes construites en même temps (${MAX_PARALLEL} au plus), chaque tâche relue`;
  if (large) return '**Parcours** : grande demande, plan exécuté tâche par tâche, chaque tâche relue';
  if (runs.some((r) => used(r, 'writing-plans'))) return "**Parcours** : demande moyenne, plan exécuté d'une traite avec une seule relecture finale";
  if (small) return "**Parcours** : petite demande, sans plan, construite d'une traite avec une seule relecture finale";
  return "**Parcours** : sans plan écrit, construite d'une traite avec une seule relecture finale";
}

// Issue #550: the upstream thinking (questions, spec, project sheet, analysis of a bug) is done by a sub-agent of
// role `plan` (or `review` when it failed). A run journaled by older scripts has no `models`: nothing is expected of it.
const ROLE_NAMES = { plan: 'Plans et organisation', review: 'Revue' };
const family = (m) => String(modelFamily(m) || '').toLowerCase();
export function roleOf(model, models) {
  if (!model || !models) return null;
  return ['plan', 'review'].find((role) => models[role] && family(model) === family(models[role])) || null;
}
const roleAgents = (run) => (run.agents || []).map((a) => ({ a, role: roleOf(a.model, run.models) })).filter((x) => x.role);
// The analysis comes before the fix: an agent with a role launched after the last red test is the final reviewer.
const analyst = (run) => {
  const red = (run.tests || []).filter((x) => !x.ok).at(-1);
  return roleAgents(run).find(({ a }) => !red || String(a.t) < String(red.t)) || null;
};
const madeBy = ({ model, role }) => `${modelFamily(model)} (rôle « ${ROLE_NAMES[role] || role} »)`;
// The journal is a committed file: a hand-edited `by` must not break the comment.
const makers = (by) => (Array.isArray(by) ? by : []).filter((b) => b && typeof b === 'object' && b.model);
// Issue #559: a bugfix journaled since then (all its agents carry the `role` key) is proved only by the entry
// journal-check wrote from the analysis sub-agent's record; an older one, or one journaled partly by older scripts,
// keeps the rule by model.
const bugMaker = (run) => {
  const agents = run.agents || [];
  if (agents.length && agents.every((a) => Object.hasOwn(a, 'role'))) {
    const e = run.upstream;
    return e?.doc === 'bug' && e.status === 'proved' ? makers(e.by)[0] || null : null;
  }
  const found = analyst(run);
  return found ? { model: found.a.model, role: found.role } : null;
};
const UNCHECKED = "l'outil n'a pas pu vérifier quel modèle les a faites";
// How the « unproved » step starts: the lock gives that refusal once per run (gate.mjs), since the agent may not
// be able to fix it.
export const UNPROVED_HOW = "questions et fiche : la fiche publiée n'a pas de preuve valable";

export function upstreamCheck(runs) {
  const lines = [];
  const missing = [];
  const bugs = runs.filter((r) => r.stage === 'bugfix' && r.models);
  if (bugs.length) {
    const found = bugs.map(bugMaker).find(Boolean);
    if (found) lines.push(`**Analyse du bug** : faite par ${madeBy(found)}`);
    else missing.push({
      alert: "Correction du bug : l'outil n'a pas pu vérifier quel modèle a analysé le bug avant sa correction.",
      how: "analyse du bug : lance `node .factory/scripts/journal-check.mjs` depuis le dossier du projet (il lit le relevé du sous-agent d'analyse) ; s'il la demande encore, fais analyser le bug par un sous-agent du rôle `plan` (« Phase amont » dans AGENT.md), lancé avec la description `[role:plan:amont]` et `model` = `models.plan.model`, puis reproduis-le par un test rouge et corrige à partir de son analyse",
    });
  }
  const docs = runs.filter((r) => ['build', 'foundation'].includes(r.stage) && r.models && r.issue != null);
  if (docs.length) {
    const withEntry = docs.filter((r) => r.upstream).sort((a, b) => String(a.upstream.t).localeCompare(String(b.upstream.t))).at(-1);
    const run = withEntry || docs.at(-1);
    const entry = withEntry?.upstream || null;
    const brief = entry ? entry.doc === 'brief' : run.stage === 'foundation';
    const label = brief ? 'Questions et fiche projet' : 'Questions et fiche';
    // Not read back yet: a step for the agent (journal-check), never an alert for the owner.
    if (!entry) {
      lines.push(`**${label}** : non mesuré (${UNCHECKED})`);
      missing.push({ alert: null, how: 'questions et fiche : lance `node .factory/scripts/journal-check.mjs` depuis le dossier du projet (il relit la demande)' });
    } else if (entry.status === 'proved') {
      const by = makers(entry.by);
      lines.push(by.length ? `**${label}** : faites par ${by.map(madeBy).join(', ')}` : `**${label}** : non mesuré (${UNCHECKED})`);
    } else if (entry.status === 'unproved') missing.push({
      alert: `${label} : ${UNCHECKED} (la dernière version publiée ne porte pas la preuve).`,
      how: `${UNPROVED_HOW} : la ligne de preuve manque, ou le texte ne correspond plus à ce que le sous-agent de réflexion a écrit. Fais-la réécrire par un sous-agent du rôle \`plan\` (description \`[role:plan:amont]\`) à partir du fil de la demande, sans rien changer à ce qui est décidé ni redemander de validation, publie-la comme nouvelle version terminée par la ligne de \`node .factory/scripts/upstream.mjs ${run.issue} <fichier>\`, puis relance \`node .factory/scripts/journal-check.mjs\` ; si \`upstream.mjs\` refuse encore, ne republie rien (aucune nouvelle version pour le propriétaire) et continue : le bilan le signalera`,
    });
    else if (entry.status === 'old') lines.push(`**${label}** : publiées avant la mise en place de cette preuve (non mesuré)`);
    else if (entry.status === 'unread') lines.push(`**${label}** : non mesuré (${UNCHECKED} : la demande n'a pas pu être relue)`);
  }
  return { lines, missing };
}

const STAGE_NAMES = {
  build: 'Construction', bugfix: 'Correction du bug', foundation: 'Fondations', 'fix-checks': 'Correction des contrôles',
  'visual-fix': 'Retouche visuelle', 'acceptance-fix': 'Correction après recette', 'update-branch': 'Mise à jour de la branche',
  'skills-fix': 'Rattrapage des étapes', audit: 'Review générale', 'ui-polish': 'Amélioration UI', stack: 'Fiche stack technique',
};

export function summarize(runs, { stages = {}, ui = false, small = false } = {}) {
  const alerts = [];
  const lines = [];
  for (const run of runs) {
    const name = STAGE_NAMES[run.stage] || run.stage || 'Run';
    const skills = [...new Set(run.skills)].map((s) => `\`${s}\``).join(', ') || 'aucun';
    const reds = run.tests.filter((t) => !t.ok).length;
    const greens = run.tests.length - reds;
    lines.push(`**${name}** (${String(run.t).slice(0, 16).replace('T', ' ')}) : skills ${skills} ; tests lancés ${run.tests.length} (${reds} rouges, ${greens} verts)`);
    for (const exp of expectations(run.stage, stages, ui)) {
      if (exp.tdd && used(run, exp.skill) && !redThenGreen(run)) alerts.push(`${name} : pas de preuve TDD (aucun test rouge suivi d'un test vert).`);
    }
  }
  for (const wave of parallelWaves(runs)) {
    if (wave.length > MAX_PARALLEL) alerts.push(`Tâches en parallèle : ${wave.length} sous-agents lancés ensemble, plus que les ${MAX_PARALLEL} permis.`);
  }
  const missing = missingSkills(runs, { stages, ui, small });
  for (const m of missing) alerts.push(`${STAGE_NAMES[m.stage] || m.stage} : le skill \`${m.skill}\` (${m.label}) n'a pas été utilisé.`);
  const upstream = upstreamCheck(runs);
  for (const m of upstream.missing) if (m.alert) alerts.push(m.alert);
  // No journal proves nothing either way: a discreet note, never an alert (no red card for it).
  const note = runs.some((r) => ['build', 'bugfix', 'foundation', 'audit', 'ui-polish'].includes(r.stage))
    ? null : "_Pas de journal de construction dans cette PR : les skills utilisés n'ont pas pu être vérifiés._";
  const tdd = runs.filter((r) => expectations(r.stage, stages, ui).some((e) => e.tdd));
  const proof = tdd.length && tdd.every(redThenGreen) ? 'oui ✅ (un test a d\'abord échoué, puis est passé)' : tdd.length ? 'non ⚠️' : '—';
  const route = routeLine(runs, { small });
  const parallel = parallelLine(runs);
  const body = [
    FABRICATION_MARKER,
    '## Fabrication',
    '',
    "Ce qui suit est noté automatiquement par l'outil pendant le travail de l'agent (ce n'est pas l'agent qui le déclare).",
    '',
    ...lines.map((l) => `- ${l}`),
    '',
    ...(route ? [route, ''] : []),
    ...(parallel ? [parallel, ''] : []),
    `**Preuve TDD** : ${proof}`,
    '',
    agentsLine(runs),
    '',
    ...upstream.lines.flatMap((l) => [l, '']),
    alerts.length ? `### ⚠️ Alertes\n\n${alerts.map((a) => `- ${a}`).join('\n')}` : '**Alertes** : aucune ✅',
    ...(note ? ['', note] : []),
  ].join('\n');
  return { body, alerts, missing: missing.map((m) => m.skill) };
}

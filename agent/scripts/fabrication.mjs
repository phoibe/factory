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
      if (e.kind === 'run' || !run) { run = { stage: e.kind === 'run' ? e.stage : null, t: e.t, skills: [], tests: [], agents: [] }; runs.push(run); }
      if (e.kind === 'skill') run.skills.push(e.name);
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

// Sub-agents: which model each one ran on (the grid « Modèle et effort des sous-agents » of AGENT.md).
const FAMILIES = ['Haiku', 'Sonnet', 'Opus'];
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

// Issue #381: the route a build followed, read from the journal (never from the size the agent declared): a plan
// executed by one sub-agent per task (subagent-driven-development) is the large route, any other plan the medium one,
// no plan on a small change the small one. A bigger change without a plan claims nothing more (the plan alert says it).
export function routeLine(runs, { small = false } = {}) {
  if (!runs.some((r) => r.stage === 'build')) return null;
  if (runs.some((r) => used(r, 'subagent-driven-development'))) return '**Parcours** : grande demande, plan exécuté tâche par tâche, chaque tâche relue';
  if (runs.some((r) => used(r, 'writing-plans'))) return "**Parcours** : demande moyenne, plan exécuté d'une traite avec une seule relecture finale";
  if (small) return "**Parcours** : petite demande, sans plan, construite d'une traite avec une seule relecture finale";
  return "**Parcours** : sans plan écrit, construite d'une traite avec une seule relecture finale";
}

const STAGE_NAMES = {
  build: 'Construction', bugfix: 'Correction du bug', foundation: 'Fondations', 'fix-checks': 'Correction des contrôles',
  'visual-fix': 'Retouche visuelle', 'acceptance-fix': 'Correction après recette', 'update-branch': 'Mise à jour de la branche',
  'skills-fix': 'Rattrapage des étapes', audit: 'Review générale', stack: 'Fiche stack technique',
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
  const missing = missingSkills(runs, { stages, ui, small });
  for (const m of missing) alerts.push(`${STAGE_NAMES[m.stage] || m.stage} : le skill \`${m.skill}\` (${m.label}) n'a pas été utilisé.`);
  // No journal proves nothing either way: a discreet note, never an alert (no red card for it).
  const note = runs.some((r) => ['build', 'bugfix', 'foundation', 'audit'].includes(r.stage))
    ? null : "_Pas de journal de construction dans cette PR : les skills utilisés n'ont pas pu être vérifiés._";
  const tdd = runs.filter((r) => expectations(r.stage, stages, ui).some((e) => e.tdd));
  const proof = tdd.length && tdd.every(redThenGreen) ? 'oui ✅ (un test a d\'abord échoué, puis est passé)' : tdd.length ? 'non ⚠️' : '—';
  const route = routeLine(runs, { small });
  const body = [
    FABRICATION_MARKER,
    '## Fabrication',
    '',
    "Ce qui suit est noté automatiquement par l'outil pendant le travail de l'agent (ce n'est pas l'agent qui le déclare).",
    '',
    ...lines.map((l) => `- ${l}`),
    '',
    ...(route ? [route, ''] : []),
    `**Preuve TDD** : ${proof}`,
    '',
    agentsLine(runs),
    '',
    alerts.length ? `### ⚠️ Alertes\n\n${alerts.map((a) => `- ${a}`).join('\n')}` : '**Alertes** : aucune ✅',
    ...(note ? ['', note] : []),
  ].join('\n');
  return { body, alerts, missing: missing.map((m) => m.skill) };
}

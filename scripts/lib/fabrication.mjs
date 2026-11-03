// Turns the agent's journal (.factory/journal/*.jsonl, written by a Claude Code hook) into the
// « Fabrication » section of a PR: which skills each run really loaded, the TDD proof, and alerts.
export const FABRICATION_MARKER = '<!-- factory-fabrication -->';

const UI_FILE = /\.(tsx|jsx|vue|svelte|astro|html|css|scss)$/;
const TEST_FILE = /(\.|\/)(test|spec)\.|(^|\/)(tests?|__tests__|e2e)\//;

export const uiChanged = (files) => files.some((f) => UI_FILE.test(f) && !TEST_FILE.test(f));

export function parseJournal(files) {
  const runs = [];
  for (const text of files) {
    let run = null;
    for (const line of String(text).split('\n')) {
      let e;
      try { e = JSON.parse(line); } catch { continue; }
      if (e.kind === 'run' || !run) { run = { stage: e.kind === 'run' ? e.stage : null, t: e.t, skills: [], tests: [] }; runs.push(run); }
      if (e.kind === 'skill') run.skills.push(e.name);
      if (e.kind === 'test') run.tests.push(e);
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
export function expectations(stage, stages, ui) {
  const on = (k) => stages[k] !== false;
  const out = [];
  if (stage === 'build') {
    if (on('plan')) out.push({ skill: 'writing-plans', label: 'plan' });
    if (on('tdd')) out.push({ skill: 'test-driven-development', label: 'TDD', tdd: true });
  }
  if (stage === 'bugfix') out.push({ skill: 'systematic-debugging', label: 'recherche de la cause', tdd: true });
  if (['build', 'bugfix', 'foundation'].includes(stage)) {
    if (on('review')) out.push({ skill: 'requesting-code-review', label: 'revue de code' });
    if (on('designPass') && ui) out.push({ skill: 'impeccable', label: 'passe design' });
  }
  return out;
}

const STAGE_NAMES = {
  build: 'Construction', bugfix: 'Correction du bug', foundation: 'Fondations', 'fix-checks': 'Correction des contrôles',
  'visual-fix': 'Retouche visuelle', 'acceptance-fix': 'Correction après recette', 'update-branch': 'Mise à jour de la branche',
};

export function summarize(runs, { stages = {}, ui = false } = {}) {
  const alerts = [];
  const lines = [];
  for (const run of runs) {
    const name = STAGE_NAMES[run.stage] || run.stage || 'Run';
    const skills = [...new Set(run.skills)].map((s) => `\`${s}\``).join(', ') || 'aucun';
    const reds = run.tests.filter((t) => !t.ok).length;
    const greens = run.tests.length - reds;
    lines.push(`**${name}** (${String(run.t).slice(0, 16).replace('T', ' ')}) : skills ${skills} ; tests lancés ${run.tests.length} (${reds} rouges, ${greens} verts)`);
    for (const exp of expectations(run.stage, stages, ui)) {
      if (!used(run, exp.skill)) alerts.push(`${name} : le skill \`${exp.skill}\` (${exp.label}) n'a pas été utilisé.`);
      else if (exp.tdd && !redThenGreen(run)) alerts.push(`${name} : pas de preuve TDD (aucun test rouge suivi d'un test vert).`);
    }
  }
  if (!runs.some((r) => ['build', 'bugfix', 'foundation'].includes(r.stage))) {
    alerts.push("Aucun journal de construction dans cette PR : impossible de prouver les skills utilisés.");
  }
  const tdd = runs.filter((r) => expectations(r.stage, stages, ui).some((e) => e.tdd));
  const proof = tdd.length && tdd.every(redThenGreen) ? 'oui ✅ (un test a d\'abord échoué, puis est passé)' : tdd.length ? 'non ⚠️' : '—';
  const body = [
    FABRICATION_MARKER,
    '## Fabrication',
    '',
    "Ce qui suit est noté automatiquement par l'outil pendant le travail de l'agent (ce n'est pas l'agent qui le déclare).",
    '',
    ...lines.map((l) => `- ${l}`),
    '',
    `**Preuve TDD** : ${proof}`,
    '',
    alerts.length ? `### ⚠️ Alertes\n\n${alerts.map((a) => `- ${a}`).join('\n')}` : '**Alertes** : aucune ✅',
  ].join('\n');
  return { body, alerts };
}

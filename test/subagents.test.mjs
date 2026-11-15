import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agentEntry, entryFor } from '../agent/scripts/journal.mjs';
import { fromTranscript } from '../agent/scripts/transcript.mjs';
import { agentsLine, modelFamily, parseJournal, summarize } from '../scripts/lib/fabrication.mjs';

const now = new Date('2026-11-09T10:00:00Z');

test('the journal records each sub-agent with its model, effort and task', () => {
  assert.deepEqual(entryFor({ hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_input: { description: 'Relecture finale', model: 'opus', effort: 'high', prompt: 'long' } }, now),
    { t: now.toISOString(), kind: 'agent', model: 'opus', effort: 'high', label: 'Relecture finale' });
  // Older Claude Code calls the tool Task; a call without a model inherits the session's.
  assert.deepEqual(agentEntry({ tool_name: 'Task', tool_input: { description: 'Search' } }), { kind: 'agent', model: null, effort: null, label: 'Search' });
  assert.equal(agentEntry({ tool_name: 'Bash', tool_input: {} }), null);
  assert.equal(entryFor({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { model: 'opus' } }, now), null);
});

test('the transcript fallback recovers the sub-agents too', () => {
  const lines = [
    { type: 'user', timestamp: '1', message: { content: '{"repo":"o/r","issue":1,"pr":null,"stage":"build"}' } },
    { type: 'assistant', timestamp: '2', message: { content: [{ type: 'tool_use', id: 'x', name: 'Agent', input: { description: 'Tâche 1', model: 'sonnet', effort: 'medium' } }] } },
  ].map((o) => JSON.stringify(o));
  assert.deepEqual(fromTranscript(lines)[1], { t: '2', kind: 'agent', model: 'sonnet', effort: 'medium', label: 'Tâche 1', id: 'x' });
});

test('model ids are grouped by family', () => {
  assert.equal(modelFamily('claude-sonnet-5-5'), 'Sonnet');
  assert.equal(modelFamily('opus[1m]'), 'Opus');
  assert.equal(modelFamily('haiku'), 'Haiku');
  assert.equal(modelFamily('fable'), 'fable');
  assert.equal(modelFamily(null), null);
});

const journal = (agents) => [JSON.stringify({ t: '2026-11-09T10:00', kind: 'run', stage: 'build' }), ...agents.map((a) => JSON.stringify({ t: '2026-11-09T10:01', kind: 'agent', ...a }))].join('\n');

test('the « Sous-agents » line counts the sub-agents per model, cheapest first', () => {
  const runs = parseJournal([journal([
    { model: 'opus', effort: 'high', label: 'Relecture finale' },
    { model: 'sonnet', label: 'Tâche 1' }, { model: 'claude-sonnet-5-5', label: 'Tâche 2' }, { model: 'sonnet', label: 'Revue tâche 1' }, { model: 'sonnet', label: 'Revue tâche 2' },
    { model: null, label: 'Recherche' },
  ])]);
  assert.equal(agentsLine(runs), '**Sous-agents** : 4 sur Sonnet (Tâche 1, Tâche 2, Revue tâche 1, …), 1 sur Opus (Relecture finale), 1 sur le modèle de la session (Recherche)');
  assert.equal(agentsLine(parseJournal([journal([])])), '**Sous-agents** : aucun');
});

test('the fabrication section shows the sub-agents line', () => {
  const { body, alerts } = summarize(parseJournal([journal([{ model: 'haiku', label: 'Captures' }])]), { stages: { plan: false, tdd: false, review: false } });
  assert.match(body, /\*\*Sous-agents\*\* : 1 sur Haiku \(Captures\)/);
  assert.deepEqual(alerts, []);
});

test('a sub-agent label cannot break the PR comment nor notify anyone', () => {
  assert.equal(agentEntry({ tool_name: 'Agent', tool_input: { description: 'Revue\n  de @someone *vite*' } }).label, 'Revue de @​someone *vite*');
});

test('no journal at all: the sub-agents line says it was not measured', () => {
  assert.equal(agentsLine([]), '**Sous-agents** : non mesuré');
});

// Issue #417: the independent tasks of a large plan run at the same time, each in its own copy (worktree).
const copies = (...ts) => ts.map(([t, label]) => JSON.stringify({ t, kind: 'agent', model: 'sonnet', label, copy: true }));
const parallelJournal = (...lines) => [JSON.stringify({ t: '2026-11-15T10:00:00Z', kind: 'run', stage: 'build' }),
  JSON.stringify({ t: '2026-11-15T10:00:30Z', kind: 'skill', name: 'subagent-driven-development' }), ...lines].join('\n');

test('the journal marks a sub-agent working in its own copy', () => {
  assert.deepEqual(agentEntry({ tool_name: 'Agent', tool_input: { description: 'Tâche 2', model: 'sonnet', effort: 'medium', isolation: 'worktree' } }),
    { kind: 'agent', model: 'sonnet', effort: 'medium', label: 'Tâche 2', copy: true });
  assert.equal('copy' in agentEntry({ tool_name: 'Agent', tool_input: { description: 'Tâche 2', isolation: 'remote' } }), false);
  const lines = [
    { type: 'user', timestamp: '1', message: { content: '{"repo":"o/r","issue":1,"pr":null,"stage":"build"}' } },
    { type: 'assistant', timestamp: '2', message: { content: [{ type: 'tool_use', id: 'y', name: 'Agent', input: { description: 'Tâche 3', model: 'sonnet', isolation: 'worktree' } }] } },
  ].map((o) => JSON.stringify(o));
  assert.equal(fromTranscript(lines)[1].copy, true);
});

test('sub-agents launched together in their own copies form one wave; a later launch starts a new one', async () => {
  const { parallelWaves } = await import('../scripts/lib/fabrication.mjs');
  const runs = parseJournal([parallelJournal(...copies(['2026-11-15T10:01:00Z', 'Tâche 1'], ['2026-11-15T10:01:01Z', 'Tâche 2'], ['2026-11-15T10:01:02Z', 'Tâche 3'], ['2026-11-15T10:20:00Z', 'Tâche 4']),
    JSON.stringify({ t: '2026-11-15T10:01:03Z', kind: 'agent', model: 'sonnet', label: 'Revue tâche 1' }))]);
  assert.deepEqual(parallelWaves(runs).map((w) => w.map((a) => a.label)), [['Tâche 1', 'Tâche 2', 'Tâche 3'], ['Tâche 4']]);
});

test('the fabrication section shows which tasks ran at the same time', async () => {
  const { parallelLine } = await import('../scripts/lib/fabrication.mjs');
  const runs = parseJournal([parallelJournal(...copies(['2026-11-15T10:01:00Z', 'Tâche 1'], ['2026-11-15T10:01:01Z', 'Tâche 2'], ['2026-11-15T10:20:00Z', 'Tâche 4']))]);
  assert.equal(parallelLine(runs), '**Tâches en parallèle** : 3 tâches construites chacune dans sa copie, lancées en 2 vagues (Tâche 1 + Tâche 2, puis Tâche 4), au plus 2 à la fois');
  const { body, alerts } = summarize(runs, { stages: { plan: false, tdd: false, review: false } });
  assert.match(body, /\*\*Tâches en parallèle\*\* : 3 tâches/);
  assert.match(body, /\*\*Parcours\*\* : grande demande, plan exécuté tâche par tâche, tâches indépendantes construites en même temps \(3 au plus\), chaque tâche relue/);
  assert.deepEqual(alerts, []);
});

test('more than 3 sub-agents launched together raise an alert', () => {
  const runs = parseJournal([parallelJournal(...copies(['2026-11-15T10:01:00Z', 'A'], ['2026-11-15T10:01:01Z', 'B'], ['2026-11-15T10:01:02Z', 'C'], ['2026-11-15T10:01:03Z', 'D']))]);
  const { alerts } = summarize(runs, { stages: { plan: false, tdd: false, review: false } });
  assert.deepEqual(alerts, ['Tâches en parallèle : 4 sous-agents lancés ensemble, plus que les 3 permis.']);
});

test('without any task in its own copy, nothing about parallel tasks is shown', async () => {
  const { parallelLine } = await import('../scripts/lib/fabrication.mjs');
  const runs = parseJournal([journal([{ model: 'sonnet', label: 'Tâche 1' }])]);
  assert.equal(parallelLine(runs), null);
  assert.doesNotMatch(summarize(runs, { stages: {} }).body, /parallèle|en même temps/);
});

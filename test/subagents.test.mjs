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

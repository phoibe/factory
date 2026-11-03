import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entryFor, runFromPrompt, TEST_COMMAND } from '../agent/scripts/journal.mjs';

const now = new Date('2026-11-03T10:00:00Z');

test('runFromPrompt reads the run JSON from the routine prompt', () => {
  assert.deepEqual(runFromPrompt('Voici le JSON :\n{"repo":"o/r","issue":5,"pr":null,"stage":"build","factory":"phoibe/factory"}\nLis AGENT.md'), { stage: 'build', issue: 5, pr: null });
  assert.equal(runFromPrompt('bonjour'), null);
});

test('records skills, red and green test runs, and ignores the rest', () => {
  assert.deepEqual(entryFor({ hook_event_name: 'PostToolUse', tool_name: 'Skill', tool_input: { skill: 'superpowers:test-driven-development' } }, now),
    { t: now.toISOString(), kind: 'skill', name: 'superpowers:test-driven-development' });
  assert.equal(entryFor({ hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_input: { command: 'npm test' } }, now).ok, false);
  assert.equal(entryFor({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'npx vitest run' }, tool_response: { stdout: 'Tests  1 failed | 3 passed' } }, now).ok, false);
  assert.equal(entryFor({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'npm run test:a11y' }, tool_response: { stdout: '4 passed' } }, now).ok, true);
  assert.equal(entryFor({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } }, now), null);
  assert.equal(entryFor({ hook_event_name: 'PostToolUse', tool_name: 'Read', tool_input: {} }, now), null);
  assert.equal(entryFor({ hook_event_name: 'UserPromptSubmit', prompt: '{"stage":"bugfix","issue":3}' }, now).stage, 'bugfix');
});

test('TEST_COMMAND spots common test runners', () => {
  for (const c of ['npm test', 'npm run test', 'pnpm test', 'npx vitest run src', 'npx playwright test', 'node --test']) assert.ok(TEST_COMMAND.test(c), c);
  for (const c of ['npm run build', 'git commit -m test', 'npm run lint']) assert.ok(!TEST_COMMAND.test(c), c);
});

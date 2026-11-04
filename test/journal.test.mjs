import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entryFor, runFromPrompt, isTestCommand } from '../agent/scripts/journal.mjs';

const now = new Date('2026-11-03T10:00:00Z');

test('runFromPrompt reads the run JSON from the routine prompt', () => {
  assert.deepEqual(runFromPrompt('Voici le JSON :\n{"repo":"o/r","issue":5,"pr":null,"stage":"build","factory":"phoibe/factory"}\nLis AGENT.md'), { stage: 'build', issue: 5, pr: null, repo: 'o/r' });
  assert.equal(runFromPrompt('bonjour'), null);
  // With the owner's screenshots the JSON holds nested objects.
  assert.deepEqual(runFromPrompt('{"repo":"o/r","issue":5,"stage":"build","attachments":[{"path":"a/1.png","source":"x"}]}'), { stage: 'build', issue: 5, pr: null, repo: 'o/r' });
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

test('isTestCommand spots common test runners', () => {
  for (const c of ['npm test', 'npm run test', 'pnpm test', 'npx vitest run src', 'npx playwright test', 'node --test', 'npm run test:a11y',
    'cd /home/user/app; npm test 2>&1 | tail -8', 'npm ci && npm test', 'CI=1 npx vitest run', 'sed -i s/a/b/ x.ts && npm test 2>&1 | grep FAIL']) assert.ok(isTestCommand(c), c);
  for (const c of ['npm run build', 'git commit -m test', 'npm run lint', 'cat package.json', 'git commit -m "npm test passes"']) assert.ok(!isTestCommand(c), c);
});

test('a file written with a heredoc that mentions vitest is not a test run', () => {
  const write = "mkdir -p tests && cat > tests/a.test.ts <<'EOF'\nimport { it } from \"vitest\";\nnpm test\nEOF";
  assert.ok(!isTestCommand(write));
  assert.ok(isTestCommand(`${write}\nnpx vitest run tests/a.test.ts`));
  assert.ok(!isTestCommand("python3 - <<'E'\nprint('npx vitest')\nE"));
});

test('a green node --test run (« # fail 0 ») is not read as a failure', () => {
  const ok = entryFor({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_response: { stdout: '# pass 12\n# fail 0', stderr: '' } });
  assert.equal(ok.ok, true);
  const ko = entryFor({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_response: { stdout: '# pass 11\n# fail 1', stderr: '' } });
  assert.equal(ko.ok, false);
});

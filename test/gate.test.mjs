import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, handsOver, MAX_DENIALS } from '../agent/scripts/gate.mjs';

const j = (...entries) => entries.map((e) => JSON.stringify(e)).join('\n');
const stages = { plan: true, tdd: true, review: true, designPass: true };
const run = (stage) => ({ t: '1', kind: 'run', stage });
const skill = (name) => ({ t: '2', kind: 'skill', name });
const bash = (command) => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } });
const env = (sessionText, files = ['app/page.tsx', '.factory/journal/s.jsonl']) => ({ files, read: () => sessionText, stages, sessionText });

test('handsOver spots opening a PR and handing it to the next step', () => {
  for (const c of ['gh api repos/o/r/pulls -f title=x -f head=b -f base=main -F body=@pr.md', 'gh pr create --fill',
    'gh api repos/o/r/issues/14/labels -f "labels[]=factory:checks"', "curl -X POST -d '{}' https://api.github.com/repos/o/r/pulls",
    'gh pr edit 3 --add-label factory:visual-review']) assert.ok(handsOver('Bash', { command: c }), c);
  for (const c of ['gh api repos/o/r/pulls/14', 'gh api repos/o/r/pulls/14/files', 'npm test', 'gh api repos/o/r/issues/14/labels -f "labels[]=factory:fixing"',
    "cat > pr.md <<'EOF'\ngh pr create\nEOF"]) assert.ok(!handsOver('Bash', { command: c }), c);
  assert.ok(handsOver('mcp__github__create_pull_request', { title: 'x' }));
  assert.ok(handsOver('mcp__github__issue_write', { labels: ['factory:checks'] }));
  assert.ok(!handsOver('mcp__github__issue_write', { labels: ['factory:building'] }));
});

test('a build run cannot open its PR while a step is missing', () => {
  const text = j(run('build'), skill('writing-plans'), skill('test-driven-development'), { t: '3', kind: 'test', ok: false }, { t: '4', kind: 'test', ok: true });
  const res = decide(bash('gh pr create --fill'), env(text));
  assert.equal(res.out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(res.out.hookSpecificOutput.permissionDecisionReason, /revue de code[\s\S]*passe design/);
});

test('a build run with every step goes through', () => {
  const text = j(run('build'), ...['writing-plans', 'test-driven-development', 'requesting-code-review', 'impeccable'].map(skill),
    { t: '3', kind: 'test', ok: false }, { t: '4', kind: 'test', ok: true });
  assert.equal(decide(bash('gh pr create --fill'), env(text)), null);
});

test('TDD without a red test then a green one is refused', () => {
  const text = j(run('build'), ...['writing-plans', 'test-driven-development', 'requesting-code-review', 'impeccable'].map(skill), { t: '3', kind: 'test', ok: true });
  assert.match(decide(bash('gh pr create'), env(text)).out.hookSpecificOutput.permissionDecisionReason, /preuve TDD/);
});

test('other runs are not locked, and a catch-up run only for what it catches up', () => {
  assert.equal(decide(bash('gh pr create'), env(j(run('fix-checks')))), null);
  assert.equal(decide(bash('gh pr create'), env('')), null); // not a factory run
  const build = j(run('build'), skill('test-driven-development'));
  const fix = j(run('skills-fix'));
  const files = ['app/page.tsx', '.factory/journal/b.jsonl', '.factory/journal/s.jsonl'];
  const res = decide(bash('gh api repos/o/r/issues/3/labels -f "labels[]=factory:checks"'),
    { files, read: (f) => (f.endsWith('b.jsonl') ? build : fix), stages, sessionText: fix });
  assert.doesNotMatch(res.out.hookSpecificOutput.permissionDecisionReason, /plan/);
  assert.match(res.out.hookSpecificOutput.permissionDecisionReason, /revue de code/);
});

test('the lock gives way after a few refusals so a run is never stuck', () => {
  const gates = Array.from({ length: MAX_DENIALS }, () => ({ t: '9', kind: 'gate' }));
  assert.equal(decide(bash('gh pr create'), env(j(run('build'), ...gates))), null);
});

test('stopping early is sent back once, and only when something was built', () => {
  const text = j(run('build'), skill('writing-plans'));
  assert.equal(decide({ hook_event_name: 'Stop' }, env(text)).out.decision, 'block');
  assert.equal(decide({ hook_event_name: 'Stop', stop_hook_active: true }, env(text)), null);
  assert.equal(decide({ hook_event_name: 'Stop' }, env(text, ['.factory/journal/s.jsonl'])), null);
});

test('a general review cannot open its PR without both passes', () => {
  const res = decide(bash('gh pr create'), env(j(run('audit'), skill('impeccable')), ['lib/x.ts', '.factory/journal/s.jsonl']));
  assert.match(res.out.hookSpecificOutput.permissionDecisionReason, /revue de code/);
  assert.equal(decide(bash('gh pr create'), env(j(run('audit'), skill('impeccable'), skill('requesting-code-review')))), null);
});

test('a command continued on the next line with a backslash still hands over', async () => {
  const { handsOver } = await import('../agent/scripts/gate.mjs');
  assert.equal(handsOver('Bash', { command: 'gh api repos/o/r/pulls \\\n  -f title=x -f head=b -f base=main' }), true);
  assert.equal(handsOver('Bash', { command: 'gh api repos/o/r/issues/5/labels \\\n  -f "labels[]=factory:checks"' }), true);
});

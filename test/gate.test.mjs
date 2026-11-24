import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, handsOver, MAX_DENIALS, readsThread, THREAD_REFUSAL } from '../agent/scripts/gate.mjs';

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
  assert.equal(decide(bash('gh pr create --body "Essayé en vrai : la page en ligne."'), env(text)), null);
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
  assert.equal(decide(bash('gh pr create --body "Pas vérifié en vrai : rien à essayer."'), env(j(run('audit'), skill('impeccable'), skill('requesting-code-review')))), null);
});

test('a command continued on the next line with a backslash still hands over', async () => {
  const { handsOver } = await import('../agent/scripts/gate.mjs');
  assert.equal(handsOver('Bash', { command: 'gh api repos/o/r/pulls \\\n  -f title=x -f head=b -f base=main' }), true);
  assert.equal(handsOver('Bash', { command: 'gh api repos/o/r/issues/5/labels \\\n  -f "labels[]=factory:checks"' }), true);
});

// Issue #375: a screenshots comment with a broken table is refused before it is posted.
const BAD_SHOTS = '<!-- factory-agent -->\n<!-- shots: claude/factory-assets -->\n| Écran | Avant (gauche) · Après (droite) |\n| --- | --- |\n'
  + '| a · desktop · sombre | [avant · après](` https://github.com/o/r/blob/claude/factory-assets/pr-1/t/compare/a--desktop--sombre.png?raw=true `) |\n';
const GOOD_SHOTS = '<!-- factory-agent -->\n<!-- shots: claude/factory-assets -->\n| Écran | Avant (gauche) · Après (droite) |\n| --- | --- |\n'
  + '| a · desktop · sombre | ![avant · après](https://github.com/o/r/blob/claude/factory-assets/pr-1/t/compare/a--desktop--sombre.png?raw=true) |\n';

test('a screenshots comment whose table is broken is refused, in a file or inline', () => {
  const text = j(run('visual-fix'));
  const files = { '/w/c.md': BAD_SHOTS, '/w/ok.md': GOOD_SHOTS };
  const e = { ...env(text), readFile: (p) => files[p] ?? null, cwd: '/w' };
  const res = decide({ ...bash('gh api repos/o/r/issues/3/comments -F body=@c.md'), cwd: '/w' }, e);
  assert.equal(res.out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(res.out.hookSpecificOutput.permissionDecisionReason, /captures[\s\S]*sombre/);
  assert.equal(decide({ ...bash('gh api repos/o/r/issues/3/comments -F body=@ok.md'), cwd: '/w' }, e), null);
  assert.ok(decide({ hook_event_name: 'PreToolUse', tool_name: 'mcp__github__add_issue_comment', tool_input: { body: BAD_SHOTS } }, e));
  assert.ok(decide(bash(`cat > c.md <<'EOF'\n${BAD_SHOTS}EOF\ngh api repos/o/r/issues/3/comments -F body=@c.md`), e));
  assert.equal(decide({ hook_event_name: 'PreToolUse', tool_name: 'mcp__github__add_issue_comment', tool_input: { body: GOOD_SHOTS } }, e), null);
});

test('only a command that posts is checked for a broken screenshots table', () => {
  const e = { ...env(j(run('visual-fix'))), readFile: () => BAD_SHOTS, cwd: '/w' };
  assert.equal(decide(bash(`cat > fixture.md <<'EOF'\n${BAD_SHOTS}EOF`), e), null);
  assert.equal(decide(bash('node --test'), e), null);
});

// Issue #550: a build whose spec does not carry the upstream proof cannot open its PR.
test('a build whose spec has no upstream proof is refused', () => {
  const models = { plan: 'fable', review: 'fable' };
  const text = j({ t: '1', kind: 'run', stage: 'build', issue: 42, models }, ...['writing-plans', 'test-driven-development', 'requesting-code-review', 'impeccable'].map(skill),
    { t: '3', kind: 'test', ok: false }, { t: '4', kind: 'test', ok: true }, { t: '5', kind: 'upstream', doc: 'spec', status: 'unproved', by: [] });
  const res = decide(bash('gh pr create --fill'), env(text));
  assert.equal(res.out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(res.out.hookSpecificOutput.permissionDecisionReason, /questions et fiche : la fiche publiée n'a pas de preuve valable/);
});

// Review #556 (D1): the upstream line the agent may not be able to fix is refused once per run, so it never uses up
// the refusals that keep the other guards on.
const unprovedBuild = (skills = ['writing-plans', 'test-driven-development', 'requesting-code-review', 'impeccable']) => [
  { t: '1', kind: 'run', stage: 'build', issue: 42, models: { plan: 'fable', review: 'fable' } }, ...skills.map(skill),
  { t: '3', kind: 'test', ok: false }, { t: '4', kind: 'test', ok: true }, { t: '5', kind: 'upstream', doc: 'spec', status: 'unproved', by: [] }];
const upstreamGate = { t: '6', kind: 'gate', event: 'PreToolUse', cause: 'upstream' };
const TRIED = 'gh pr create --body "Essayé en vrai : la page en ligne."';

test('a refusal caused only by the unproved upstream line records its cause and is given once', () => {
  const first = decide(bash(TRIED), env(j(...unprovedBuild())));
  assert.equal(first.out.hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(first.cause, 'upstream');
  assert.equal(decide(bash(TRIED), env(j(...unprovedBuild(), upstreamGate))), null);
});

test('after the upstream refusal, the other guards still hold', () => {
  const after = j(...unprovedBuild(), upstreamGate);
  const shots = { ...env(after), readFile: () => BAD_SHOTS, cwd: '/w' };
  assert.equal(decide(bash('gh api repos/o/r/issues/3/comments -F body=@c.md'), shots).out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(decide(bash('gh pr create --fill'), env(after)).out.hookSpecificOutput.permissionDecisionReason, /Essayé en vrai/);
  const noReview = j(...unprovedBuild(['writing-plans', 'test-driven-development', 'impeccable']), upstreamGate);
  assert.match(decide(bash(TRIED), env(noReview)).out.hookSpecificOutput.permissionDecisionReason, /revue de code/);
});

test('with another step missing too, the refusal lists both and has no upstream-only cause', () => {
  const res = decide(bash(TRIED), env(j(...unprovedBuild(['writing-plans', 'test-driven-development', 'impeccable']))));
  assert.match(res.out.hookSpecificOutput.permissionDecisionReason, /revue de code[\s\S]*questions et fiche/);
  assert.equal(res.cause, undefined);
});

// Issue #565: the messages of a thread are read only through thread.mjs, which leaves outsiders' messages aside.
test("reading a thread's messages the old way is spotted", () => {
  for (const c of ['gh api repos/o/r/issues/5/comments --paginate', "gh api repos/o/r/issues/5/comments --paginate --jq '.[] | .body'",
    'gh api "repos/o/r/issues/$N/comments?per_page=100"', 'gh api -X GET repos/o/r/issues/5/comments -f per_page=100',
    'gh api repos/o/r/pulls/5/comments', 'gh api repos/o/r/pulls/5/reviews', 'gh api repos/o/r/pulls/5/reviews/77/comments',
    'gh api repos/o/r/issues/5/timeline', 'gh api repos/o/r/issues/comments', 'gh api "repos/o/r/pulls/comments?since=2026-01-01"',
    'curl -s https://api.github.com/repos/o/r/issues/5/comments',
    "N=$(gh api repos/o/r/pulls?head=o:b --jq '.[0].number') && gh api repos/o/r/issues/$N/comments",
    'gh issue view 5 --comments', 'gh pr view 5 --json title,comments',
    'gh api graphql -f query=\'{ repository(owner:"o",name:"r"){ issue(number:5){ comments(first:50){ nodes{ body } } } } }\'']) {
    assert.ok(readsThread('Bash', { command: c }), c);
  }
  assert.ok(readsThread('mcp__github__issue_read', { method: 'get_comments' }));
  for (const method of ['get_comments', 'get_review_comments', 'get_reviews']) assert.ok(readsThread('mcp__github__pull_request_read', { method }), method);
});

test('writing a message, and the other reads, still go through', () => {
  for (const c of ['gh api repos/o/r/issues/5/comments -F body=@c.md', "gh api repos/o/r/issues/5/comments -f body='ok'",
    'gh api -X POST repos/o/r/issues/5/comments --input c.json', 'gh api -X PATCH repos/o/r/issues/comments/123 -F body=@c.md',
    "gh api repos/o/r/issues/comments/123 -H 'Accept: application/vnd.github.full+json' --jq .body_html",
    'gh api repos/o/r/pulls/5/reviews -f event=APPROVE -f body=ok', 'gh api repos/o/r/pulls/5/comments/9/replies -f body=ok',
    'gh api repos/o/r/issues/5', 'gh api repos/o/r/pulls/5', 'gh api repos/o/r/pulls/5/files',
    "gh api repos/o/r/issues/5/labels -f 'labels[]=factory:checks'", 'gh api "repos/o/r/issues?state=open&per_page=100"',
    'node .factory/scripts/thread.mjs 5', "cat > c.md <<'EOF'\ngh api repos/o/r/issues/5/comments\nEOF",
    // one comment by its id, however the id is given
    'gh api repos/o/r/issues/comments/$ID', 'gh api "repos/o/r/issues/comments/${ID}"', 'gh api repos/o/r/issues/comments/$(cat id)',
    'gh api repos/o/r/issues/comments/"$ID"', 'gh api R/issues/comments/<id>', 'gh api repos/o/r/pulls/comments/$ID',
    'gh api repos/o/r/pulls/5/reviews/$RID',
    'ID=$(gh api repos/o/r/issues/5/comments -F body=@c.md --jq .id); gh api repos/o/r/issues/comments/$ID --jq .body']) {
    assert.ok(!readsThread('Bash', { command: c }), c);
  }
  assert.ok(!readsThread('mcp__github__issue_read', { method: 'get' }));
  assert.ok(!readsThread('mcp__github__pull_request_read', { method: 'get_files' }));
  assert.ok(!readsThread('mcp__github__add_issue_comment', { body: 'x' }));
});

test('a factory run is refused and sent to thread.mjs, whatever its stage', () => {
  for (const stage of ['question', 'build']) {
    const res = decide(bash('gh api repos/o/r/issues/5/comments --paginate'), env(j(run(stage))));
    assert.equal(res.out.hookSpecificOutput.permissionDecision, 'deny');
    assert.equal(res.out.hookSpecificOutput.permissionDecisionReason, THREAD_REFUSAL);
    assert.equal(res.thread, true);
  }
});

test("the thread refusal never gives way and uses up none of the lock's refusals", () => {
  const gates = Array.from({ length: MAX_DENIALS }, () => ({ t: '5', kind: 'gate' }));
  const res = decide(bash('gh api repos/o/r/issues/5/comments --paginate'), env(j(run('build'), ...gates)));
  assert.equal(res.out.hookSpecificOutput.permissionDecision, 'deny');
});

test('outside a factory run nothing is refused', () => {
  assert.equal(decide(bash('gh api repos/o/r/issues/5/comments --paginate'), env('')), null);
});

// Review of #565: forms that read a thread and were let through.
test('a read is spotted however the shell wraps it, and a later write sign does not hide it', () => {
  for (const c of ['X=$(gh api repos/o/r/issues/5/comments)', "gh api repos/o/r/issues/5/comments|jq -r '.[].body'",
    'gh api repos/o/r/issues/5/comments>f.json', 'for i in 1; do gh api repos/o/r/issues/$i/comments; done',
    '(gh api repos/o/r/issues/5/comments)', 'gh api repos/o/r/issues/5/comments/', 'echo `gh api repos/o/r/issues/5/comments`',
    "gh api repos/o/r/issues/5/comments --paginate --jq '.[].body' | grep -F 'factory-spec'",
    "gh api repos/o/r/issues/5/comments --jq '.[-1].body' | tr -d '\\r'", "gh api repos/o/r/issues/5/comments | cut -d ' ' -f 1",
    'gh api repos/o/r/issues/5/comments && echo -f x', 'curl -s -f https://api.github.com/repos/o/r/issues/5/comments',
    'gh api repos/o/r/issues/5/comments -f per_page=100 --method get', 'gh api repos/o/r/issues/5/comments -X get -f per_page=100',
    'gh issue list --json number,comments', 'gh pr list --json reviews', 'gh api repos/o/r/issues/$(cat n)/comments',
    'gh api "repos/o/r/issues/$(cat n)/comments"', 'gh api "repos/o/r/issues/5/comments/"', "gh api 'repos/o/r/issues/5/comments/'",
    'gh api repos/o/r/issues/5/comments/|jq .', 'gh api repos/o/r/issues/5/comments/>f', 'gh api repos/o/r/issues/$(cat n)/comments/',
    'gh api repos/o/r/pulls/5/reviews/ --jq .[].body']) {
    assert.ok(readsThread('Bash', { command: c }), c);
  }
  for (const c of ['gh api repos/o/r/issues/5/comments -F body=@c.md | jq .id', "jq -n '{body:\"x\"}' | gh api repos/o/r/issues/5/comments --input -",
    'gh api repos/o/r/issues/5/comments -F body=@c.md && gh api -X DELETE repos/o/r/issues/5/labels/factory:running',
    'gh api -X delete repos/o/r/issues/comments/123', "gh api repos/o/r/issues/5/comments -F body=@c.md --jq '.id | tostring'",
    'gh api repos/o/r/issues/5/comments.patch', 'gh issue list --json number,title', 'curl -s -f https://api.github.com/repos/o/r/issues/5']) {
    assert.ok(!readsThread('Bash', { command: c }), c);
  }
});

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('the hook refuses a thread read even when git fails, and journals nothing for it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-nogit-')); // not a git repository: reading the branch throws
  const session = `t${Date.now()}`;
  const journal = join(dir, '.factory/journal', `${session}.jsonl`);
  mkdirSync(join(dir, '.factory/journal'), { recursive: true });
  writeFileSync(journal, `${JSON.stringify(run('build'))}\n`);
  const input = { ...bash('gh api repos/o/r/issues/5/comments'), session_id: session, tool_use_id: 'tu1', cwd: dir };
  const res = spawnSync(process.execPath, [new URL('../agent/scripts/gate.mjs', import.meta.url).pathname], {
    input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: dir, GIT_CEILING_DIRECTORIES: tmpdir() } });
  assert.equal(res.status, 0);
  assert.equal(JSON.parse(res.stdout || '{}').hookSpecificOutput?.permissionDecision, 'deny', res.stdout + res.stderr);
  assert.equal(readFileSync(journal, 'utf8'), `${JSON.stringify(run('build'))}\n`);
});

// Second review of #565.
test('many $(…) in an address are judged at once', () => {
  const start = Date.now();
  readsThread('Bash', { command: `gh api repos/o/r/issues/${'$(x)'.repeat(40)}/commentz` });
  assert.ok(Date.now() - start < 1000, `${Date.now() - start} ms`);
});

test('quotes inside the address do not hide a thread read', () => {
  for (const c of ['gh api repos/"$REPO"/issues/"$N"/comments', "gh api repos/o/r/issues/'5'/comments", 'gh api repos/o/r/"pulls"/5/reviews']) {
    assert.ok(readsThread('Bash', { command: c }), c);
  }
});

test('each call is judged on its own arguments', () => {
  assert.ok(readsThread('Bash', { command: "gh api graphql -f query='mutation{x}'; gh api graphql -f query='{repository{issue{comments{nodes{body}}}}}'" }));
  for (const c of ['gh pr view 5; ls -c', 'gh issue view 5 && grep --comments x', 'gh api repos/o/r/issues/5/comments -Fbody=@c.md',
    "gh api repos/o/r/issues/5/comments -fbody='ok'"]) {
    assert.ok(!readsThread('Bash', { command: c }), c);
  }
  assert.ok(readsThread('Bash', { command: 'gh pr view 5 -c' }));
});

test('curl is refused only toward GitHub', () => {
  for (const c of ['curl -s https://example.com/repos/o/r/issues/5/comments', 'curl -fsSL http://localhost:3000/api/issues/5/comments']) {
    assert.ok(!readsThread('Bash', { command: c }), c);
  }
  for (const c of ['curl -s https://api.github.com/repos/o/r/issues/5/comments', 'curl -fsSL https://github.com/o/r/issues/5/comments',
    'curl -s "$GITHUB_API_URL/repos/o/r/issues/5/comments"', 'curl -s -H "Authorization: token $T" api.github.com/repos/o/r/issues/5/comments']) {
    assert.ok(readsThread('Bash', { command: c }), c);
  }
});

test('a corrupt configuration does not let a thread read through', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-badcfg-'));
  const session = `t${Date.now()}`;
  mkdirSync(join(dir, '.factory/journal'), { recursive: true });
  writeFileSync(join(dir, '.factory/journal', `${session}.jsonl`), `${JSON.stringify(run('build'))}\n`);
  writeFileSync(join(dir, '.factory/config.resolved.json'), '{ not json');
  const input = { ...bash('gh api repos/o/r/issues/5/comments'), session_id: session, tool_use_id: 'tu1', cwd: dir };
  const res = spawnSync(process.execPath, [new URL('../agent/scripts/gate.mjs', import.meta.url).pathname], {
    input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: dir, GIT_CEILING_DIRECTORIES: tmpdir() } });
  assert.equal(JSON.parse(res.stdout || '{}').hookSpecificOutput?.permissionDecision, 'deny', res.stdout + res.stderr);
});

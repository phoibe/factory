import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isGenerated, mergeBranchesSettling, MergeConflict } from '../scripts/lib/merge-generated.mjs';

// A GitHub double: `sides[base...head]` lists the files the head side changed since the merge base.
function fakeGh({ conflict = true, sides = {} } = {}) {
  const calls = [];
  return {
    calls,
    mergeBranches: async (base, head) => { calls.push(['mergeBranches', base, head]); if (conflict) throw new Error('GitHub 409: Merge conflict'); return { sha: 'x' }; },
    compare: async (base, head) => ({ files: sides[`${base}...${head}`] || [] }),
    getBranch: async (name) => ({ object: { sha: `${name}-sha` } }),
    getCommit: async (sha) => ({ tree: { sha: `${sha}-tree` } }),
    getTree: async () => ({ tree: [{ path: 'scripts/run.sh', mode: '100755' }] }),
    createTree: async (base, tree) => { calls.push(['createTree', base, tree]); return { sha: 'tree2' }; },
    createGitCommit: async (message, tree, parents) => { calls.push(['createGitCommit', message, tree, parents]); return { sha: 'merged' }; },
    updateRef: async (name, sha) => calls.push(['updateRef', name, sha]),
  };
}

test('only what the factory regenerates counts as its own', () => {
  for (const p of ['.factory/AGENT.md', '.claude/skills/tdd/SKILL.md', '.claude/settings.json']) assert.ok(isGenerated(p), p);
  for (const p of ['.factory/journal/12.md', 'factory.config.json', 'src/app.py', '.claude/agents/x.md']) assert.ok(!isGenerated(p), p);
});

test('without a conflict, the plain GitHub merge is kept', async () => {
  const gh = fakeGh({ conflict: false });
  assert.deepEqual(await mergeBranchesSettling(gh, 'main', 'preprod', 'm', { prefer: 'main' }), { sha: 'x' });
  assert.ok(!gh.calls.some((c) => c[0] === 'createGitCommit'));
});

test('a conflict on the factory files alone is settled with the default branch copy, the rest of preprod kept', async () => {
  const gh = fakeGh({ sides: {
    'main...preprod': [{ filename: '.factory/AGENT.md', status: 'modified', sha: 'old' }, { filename: 'scripts/run.sh', status: 'added', sha: 's1' }, { filename: 'gone.py', status: 'removed' }],
    'preprod...main': [{ filename: '.factory/AGENT.md', status: 'modified', sha: 'new' }],
  } });
  const res = await mergeBranchesSettling(gh, 'main', 'preprod', 'Mise en production : #5', { prefer: 'main' });
  assert.deepEqual(res, { sha: 'merged', settled: ['.factory/AGENT.md'] });
  const [, baseTree, entries] = gh.calls.find((c) => c[0] === 'createTree');
  assert.equal(baseTree, 'main-sha-tree');
  assert.deepEqual(entries, [
    { path: 'scripts/run.sh', mode: '100755', type: 'blob', sha: 's1' },
    { path: 'gone.py', mode: '100644', type: 'blob', sha: null },
  ]);
  const commit = gh.calls.find((c) => c[0] === 'createGitCommit');
  assert.deepEqual(commit[3], ['main-sha', 'preprod-sha']);
  assert.match(commit[1], /Conflit réglé par la factory/);
  assert.deepEqual(gh.calls.at(-1), ['updateRef', 'main', 'merged']);
});

test('bringing main into preprod takes main copy of a factory file', async () => {
  const gh = fakeGh({ sides: {
    'preprod...main': [{ filename: '.factory/AGENT.md', status: 'modified', sha: 'new' }],
    'main...preprod': [{ filename: '.factory/AGENT.md', status: 'modified', sha: 'old' }],
  } });
  await mergeBranchesSettling(gh, 'preprod', 'main', 'sync', { prefer: 'main' });
  assert.deepEqual(gh.calls.find((c) => c[0] === 'createTree')[2], [{ path: '.factory/AGENT.md', mode: '100644', type: 'blob', sha: 'new' }]);
});

test('a conflict on the project own files is left to people, with the files named', async () => {
  const gh = fakeGh({ sides: {
    'main...preprod': [{ filename: '.factory/AGENT.md', status: 'modified', sha: 'a' }, { filename: 'app.py', status: 'modified', sha: 'b' }],
    'preprod...main': [{ filename: '.factory/AGENT.md', status: 'modified', sha: 'c' }, { filename: 'app.py', status: 'modified', sha: 'd' }],
  } });
  await assert.rejects(mergeBranchesSettling(gh, 'main', 'preprod', 'm', { prefer: 'main' }), (e) => e instanceof MergeConflict && e.files.join() === 'app.py');
  assert.ok(!gh.calls.some((c) => c[0] === 'updateRef'));
});

test('any other GitHub failure goes through untouched', async () => {
  const gh = fakeGh();
  gh.mergeBranches = async () => { throw new Error('GitHub 500'); };
  await assert.rejects(mergeBranchesSettling(gh, 'main', 'preprod', 'm', { prefer: 'main' }), /500/);
});

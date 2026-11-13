import test from 'node:test';
import assert from 'node:assert/strict';
import { lintText, typecheck, lint, build, walk } from '../tools/project-checks.mjs';

test('lintText flags conflict markers and debugger', () => {
  assert.equal(lintText('ok\n<<<<<<< HEAD\ndebugger;').length, 2);
  assert.equal(lintText('const a = 1;').length, 0);
});

test('the repository passes its own checks', () => {
  assert.ok(typecheck());
  assert.ok(lint());
  assert.ok(build());
});

test('the checks skip the installed skills and the agent worktrees (.claude, .factory)', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'checks-'));
  for (const d of ['.claude/worktrees/x', '.factory/scripts', 'src']) mkdirSync(join(dir, d), { recursive: true });
  writeFileSync(join(dir, '.claude/worktrees/x/a.mjs'), '');
  writeFileSync(join(dir, '.factory/scripts/b.mjs'), '');
  writeFileSync(join(dir, 'src/c.mjs'), '');
  assert.deepEqual(walk(dir).map((p) => p.slice(dir.length + 1)), ['src/c.mjs']);
});

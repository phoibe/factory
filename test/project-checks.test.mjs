import test from 'node:test';
import assert from 'node:assert/strict';
import { lintText, typecheck, lint, build } from '../tools/project-checks.mjs';

test('lintText flags conflict markers and debugger', () => {
  assert.equal(lintText('ok\n<<<<<<< HEAD\ndebugger;').length, 2);
  assert.equal(lintText('const a = 1;').length, 0);
});

test('the repository passes its own checks', () => {
  assert.ok(typecheck());
  assert.ok(lint());
  assert.ok(build());
});

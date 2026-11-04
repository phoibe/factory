import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// The chat server is Python: its own unit tests run as part of the project's test command.
test('chat server unit tests pass', () => {
  const r = spawnSync('python3', ['-m', 'unittest', 'discover', '-s', 'server/chat'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

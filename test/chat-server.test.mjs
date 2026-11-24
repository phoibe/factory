import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// The chat server is Python: its own unit tests run as part of the project's test command.
test('chat server unit tests pass', () => {
  const r = spawnSync('python3', ['-m', 'unittest', 'discover', '-s', 'server/chat'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

// Guard: the server and the panel must probe the same writes, or a token the panel accepts is refused by the server
// (or the other way round). The Python list is read from the source: the server's modules need fastapi to import.
function pythonProbes(source) {
  const line = source.match(/^WRITE_PROBES = \((.*)\)$/m);
  assert.ok(line, 'WRITE_PROBES not found in server/chat/service.py');
  return [...line[1].matchAll(/\("([A-Z]+)", "([^"]+)"\)/g)].map((m) => [m[1], m[2]]);
}

test('the chat server probes the same writes as the panel', async () => {
  const { readFile } = await import('node:fs/promises');
  const { WRITE_PROBES } = await import('../panel/chat.mjs');
  const source = await readFile(new URL('../server/chat/service.py', import.meta.url), 'utf8');
  assert.deepEqual(pythonProbes(source), WRITE_PROBES);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const tracked = (path) => execFileSync('git', ['ls-files', '-s', path], { encoding: 'utf8' });

for (const [file, mode] of [['outils/Nouveau projet.command', 'nouveau'], ['outils/Adopter un projet.command', 'adopter'], ['outils/Retirer un projet.command', 'retirer']]) {
  test(`${file} is executable and runs the setup script in « ${mode} » mode`, () => {
    assert.match(tracked(file), /^100755 /, 'a double-click needs the executable bit');
    const text = readFileSync(file, 'utf8');
    assert.match(text, /^#!\/bin\/bash\n/);
    assert.match(text, /raw\.githubusercontent\.com\/phoibe\/factory\/stable\/scripts\/factory\.sh -o "\$script"/);
    assert.match(text, new RegExp(`bash "\\$script" ${mode}\\n`));
    execFileSync('bash', ['-n', file]);
  });
}

// The Mac tools download the factory script each time: a failed download must say so, never « C'est fini ».
for (const tool of ['Nouveau projet.command', 'Adopter un projet.command', 'Retirer un projet.command']) {
  test(`${tool}: a failed download says so in French`, () => {
    const bin = mkdtempSync(join(tmpdir(), 'outils-'));
    writeFileSync(join(bin, 'curl'), '#!/bin/sh\necho "curl: (6) Could not resolve host" >&2\nexit 6\n');
    chmodSync(join(bin, 'curl'), 0o755);
    const run = spawnSync('bash', [`outils/${tool}`], {
      encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, HOME: bin, TERM: 'dumb' }, input: '',
    });
    const out = run.stdout + run.stderr;
    assert.match(out, /Impossible de télécharger/);
    assert.doesNotMatch(out, /C'est fini/);
  });
}

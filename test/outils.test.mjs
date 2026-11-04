import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const tracked = (path) => execFileSync('git', ['ls-files', '-s', path], { encoding: 'utf8' });

for (const [file, mode] of [['outils/Nouveau projet.command', 'nouveau'], ['outils/Adopter un projet.command', 'adopter']]) {
  test(`${file} is executable and runs the setup script in « ${mode} » mode`, () => {
    assert.match(tracked(file), /^100755 /, 'a double-click needs the executable bit');
    const text = readFileSync(file, 'utf8');
    assert.match(text, /^#!\/bin\/bash\n/);
    assert.match(text, new RegExp(`raw\\.githubusercontent\\.com/phoibe/factory/stable/scripts/factory\\.sh\\) ${mode}\\n`));
    execFileSync('bash', ['-n', file]);
  });
}

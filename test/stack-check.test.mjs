import { test } from 'node:test';
import assert from 'node:assert/strict';
import { libraries, stackVerdict, isManifest } from '../scripts/lib/stack.mjs';

const pkg = (deps, dev = {}) => JSON.stringify({ dependencies: deps, devDependencies: dev });

test('libraries are read from package.json, requirements and pyproject, with their main version', () => {
  const libs = libraries({
    'package.json': pkg({ react: '^18.3.1', zod: '~0.9.2' }, { playwright: '1.56.1', tool: 'latest' }),
    'server/requirements.txt': 'FastAPI==0.115.12  # web\nhttpx>=0.28\n-r other.txt\n\n',
    'api/pyproject.toml': '[project]\nname = "x"\ndependencies = [\n  "modal==1.6.3",\n  "pydantic[email]>=2.1",\n]\n',
  });
  assert.deepEqual([...libs].sort(), ['npm:playwright@1', 'npm:react@18', 'npm:tool', 'npm:zod@0.9', 'py:fastapi@0.115', 'py:httpx@0.28', 'py:modal@1', 'py:pydantic@2'].sort());
});

test('a broken manifest is skipped, not fatal', () => {
  assert.deepEqual([...libraries({ 'package.json': '{oops' })], []);
});

test('manifests inside node_modules or the factory checkout are ignored', () => {
  assert.equal(isManifest('package.json'), true);
  assert.equal(isManifest('web/requirements-dev.txt'), true);
  assert.equal(isManifest('node_modules/x/package.json'), false);
  assert.equal(isManifest('.factory-src/package.json'), false);
  assert.equal(isManifest('src/app.js'), false);
});

const side = (deps, sheet) => ({ files: { 'package.json': pkg(deps) }, sheet });

test('a library added while the sheet stays the same turns the check red', () => {
  const v = stackVerdict({ base: side({ a: '1.0.0' }, 'fiche'), head: side({ a: '1.0.0', b: '2.0.0' }, 'fiche') });
  assert.equal(v.status, 'fail');
  assert.deepEqual(v.added, ['npm:b@2']);
  assert.deepEqual(v.removed, []);
});

test('a library removed while the sheet stays the same turns the check red', () => {
  assert.equal(stackVerdict({ base: side({ a: '1', b: '2' }, 'fiche'), head: side({ a: '1' }, 'fiche') }).status, 'fail');
});

test('a new main version counts, a patch does not', () => {
  assert.equal(stackVerdict({ base: side({ a: '1.0.0' }, 'f'), head: side({ a: '2.0.0' }, 'f') }).status, 'fail');
  assert.equal(stackVerdict({ base: side({ a: '1.0.0' }, 'f'), head: side({ a: '^1.4.2' }, 'f') }).status, 'pass');
});

test('the check passes when the sheet changed with the libraries', () => {
  assert.equal(stackVerdict({ base: side({ a: '1' }, 'fiche'), head: side({ a: '1', b: '2' }, 'fiche à jour') }).status, 'pass');
});

test('a project with no sheet on either side is skipped (its sheet is made by its own card)', () => {
  assert.equal(stackVerdict({ base: side({ a: '1' }, null), head: side({ b: '1' }, null) }).status, 'skip');
});

test('a sheet removed while libraries change is red too', () => {
  assert.equal(stackVerdict({ base: side({ a: '1' }, 'fiche'), head: side({ b: '1' }, null) }).status, 'fail');
});

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { stackFromGit } from '../scripts/checks.mjs';

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'stack-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' }).toString();
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  writeFileSync(join(dir, 'package.json'), pkg({ a: '1.0.0' }));
  writeFileSync(join(dir, 'STACK.md'), 'fiche');
  git('add', '-A'); git('commit', '-qm', 'base');
  git('update-ref', 'refs/factory/base', 'HEAD');
  return { dir, git };
}

test('the PR and the default branch are read from git', () => {
  const { dir, git } = repo();
  writeFileSync(join(dir, 'package.json'), pkg({ a: '1.0.0', b: '3.1.0' }));
  git('commit', '-qam', 'add b');
  const v = stackFromGit(dir, 'refs/factory/base');
  assert.equal(v.status, 'fail');
  assert.deepEqual(v.added, ['npm:b@3']);
});

test('without the default branch at hand, the check is skipped', () => {
  const { dir } = repo();
  assert.equal(stackFromGit(dir, 'refs/factory/nope').status, 'skip');
});

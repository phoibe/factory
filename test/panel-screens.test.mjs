import { test } from 'node:test';
import assert from 'node:assert/strict';
import { files, all } from './panel-source.mjs';

const screens = Object.keys(files).filter((f) => f.startsWith('screen-'));
// `from './x.mjs'` and the bare `import './x.mjs'` of a part loaded for its effects.
const imports = (text) => [...text.matchAll(/\b(?:from|import) '\.\/([^'?]+)/g)].map((m) => m[1]);

test('a screen never imports another screen nor the entry point; the shared parts import no screen', () => {
  for (const f of [...screens, 'common.mjs', 'github.mjs']) {
    assert.deepEqual(imports(files[f]).filter((i) => i.startsWith('screen-') || i === 'app.mjs'), [], f);
  }
  assert.deepEqual(imports(files['common.mjs']).sort(), ['chat.mjs', 'lib.mjs'], 'common.mjs stays loadable by Node');
});

test('every action a part calls is provided exactly once', () => {
  const provided = [...all.matchAll(/\bprovide\('([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(provided.filter((n, i) => provided.indexOf(n) !== i), [], 'provided twice');
  const called = new Set([...all.matchAll(/\bcall\('([^']+)'/g)].map((m) => m[1]));
  assert.deepEqual([...called].filter((n) => !provided.includes(n)), [], 'called but never provided');
});

test('no part imports a name it does not use', () => {
  const unused = [];
  for (const f of ['app.mjs', 'common.mjs', 'github.mjs', ...screens]) {
    for (const m of files[f].matchAll(/^import \{([^}]+)\} from/gm)) {
      for (const name of m[1].split(',').map((x) => x.trim().split(' as ').pop())) {
        // `...name` (a spread) is a use; `x.name` is not.
        const uses = files[f].split(new RegExp(`(?<![\\w$])(?<![^.]\\.)${name.replace(/\$/g, '\\$')}(?![\\w$])`)).length - 1;
        if (uses < 2) unused.push(`${f}: ${name}`);
      }
    }
  }
  assert.deepEqual(unused, []);
});

const ORDER = ['common', 'github', 'screen-general', 'screen-projects', 'screen-board', 'screen-chat', 'screen-header', 'screen-rules', 'screen-login'];

test('app.mjs imports the parts in the documented order (the order of their reactions)', () => {
  const mine = imports(files['app.mjs']).map((i) => i.replace(/\.mjs$/, '')).filter((i) => ORDER.includes(i));
  assert.deepEqual(mine, ORDER);
});

test('the entry point keeps no screen state: it declares no reset, no view reaction, nothing unsaved', () => {
  assert.doesNotMatch(files['app.mjs'], /\bon(Reset|View|Unsaved)\(/);
  assert.deepEqual([...files['app.mjs'].matchAll(/\bprovide\('([^']+)'/g)].map((m) => m[1]).sort(), ['openProject', 'start']);
  assert.ok(files['app.mjs'].split('\n').length < 300, 'app.mjs only wires the parts');
});

test('every screen has its module, and every action provided is used', () => {
  assert.deepEqual(screens, ['screen-board.mjs', 'screen-chat.mjs', 'screen-general.mjs', 'screen-header.mjs', 'screen-login.mjs', 'screen-projects.mjs', 'screen-rules.mjs']);
  const provided = [...all.matchAll(/\bprovide\('([^']+)'/g)].map((m) => m[1]);
  const called = new Set([...all.matchAll(/\bcall\('([^']+)'/g)].map((m) => m[1]));
  assert.deepEqual(provided.filter((n) => !called.has(n)), []);
});

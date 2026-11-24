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
  // Action names are identifiers: `call('/user')` in checkReadToken is a local fetch helper, not an action.
  const called = new Set([...all.matchAll(/\bcall\('([\w$]+)'/g)].map((m) => m[1]));
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

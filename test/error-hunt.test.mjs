// The repeated-error hunt at the end of a general review (issue #605).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const text = readFileSync(new URL('../agent/stages/audit.md', import.meta.url), 'utf8');
const flat = text.replace(/\s+/g, ' ');
const hunt = flat.slice(flat.indexOf('## Chasse aux erreurs répétées'));
const between = (a, b) => flat.slice(flat.indexOf(a), flat.indexOf(b));

test('the hunt is step 3 quater, after the fixes and before the out-of-scope step', () => {
  const ter = flat.indexOf('3 ter.');
  const quater = flat.indexOf('3 quater. **Chasse aux erreurs répétées**');
  const out = flat.indexOf('4. **Hors périmètre**');
  assert.ok(ter >= 0 && ter < quater && quater < out);
  assert.ok(flat.includes('chacune suivie de ses corrections, puis la chasse aux erreurs répétées.'));
  assert.ok(between('1 bis.', '2. **Passe design').includes('chasse aux erreurs répétées'), 'the estimate counts the hunt');
  assert.ok(between('6. **PR**', '7. **Captures**').includes('une section « Erreurs répétées »'), 'the PR summary has its section');
});

test('the hunt section says what to read, what counts, how to protect, prove and record', () => {
  assert.ok(flat.includes('## Chasse aux erreurs répétées'));
  for (const s of ['50 au moins et 100 au plus', 'les 100 dernières', 'moins de 50 modifications : toutes', 'branche `claude/…`',
    'node .factory/scripts/thread.mjs <n>', 'ne comptent pas', '`[role:audit] Historique : …`', '`models.audit`',
    'un contrôle automatique existant', "changement d'avis", 'au moins 2 fois', 'au plus 5 familles',
    '« à traiter à la prochaine review »', 'Une famille par commit', "n'affaiblis jamais", "accepter le code d'aujourd'hui",
    '« non protégée »', 'au moins 2 cas réels', '« consigne seulement »', '`## Pièges connus`', '`CLAUDE.md`',
    'jamais dans `.factory/`', 'garde sa place et sa forme', 'seulement à la première famille trouvée', 'retire les règles',
    'remets les protections perdues', 'review générale de la factory elle-même', "rien n'est créé"]) {
    assert.ok(hunt.includes(s), `missing: ${s}`);
  }
});

test('protections are tried from the most solid to a written instruction, and each role keeps its job', () => {
  const steps = ['(a) changer la structure du code', '(b) un contrôle automatique', '(c) un test', '(d) une consigne écrite'].map((s) => hunt.indexOf(s));
  assert.ok(steps.every((i) => i >= 0), String(steps));
  assert.ok(steps[0] < steps[1] && steps[1] < steps[2] && steps[2] < steps[3]);
  const roles = ['[role:audit]', 'rôle `review`', 'rôle `code`'].map((s) => hunt.indexOf(s));
  assert.ok(roles.every((i) => i >= 0) && roles[0] < roles[1] && roles[1] < roles[2], String(roles));
});

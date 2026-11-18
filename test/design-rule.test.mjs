// The "no explainer text" rule (issue #174) must reach impeccable on every call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../agent/stages/', import.meta.url);
const read = (f) => readFileSync(new URL(f, dir), 'utf8');
const RULE = 'Textes à l\'écran';

test('design-pass.md holds the screen-text rule', () => {
  const md = read('design-pass.md');
  const section = md.split(`## ${RULE}`)[1]?.split('\n## ')[0];
  assert.ok(section, `missing "## ${RULE}" section`);
  for (const term of [
    'libellés', 'messages d\'erreur', 'écran vide', 'une seule phrase',
    'paragraphe', 'Comment ça marche', 'sous-titres', 'aides sous', 'tutoriels', 'visites guidées', 'astuce',
    'demande', 'défaut', 'DESIGN.md', 'Do\'s and Don\'ts',
    'sous-agents', 'retours sur la PR',
  ]) assert.ok(section.includes(term), `rule does not mention "${term}"`);
  assert.ok(!section.includes('**Liste les écrans**'), 'the steps must sit under their own heading');
});

test('the fix step never adds explanations and the PR lists removed texts', () => {
  const md = read('design-pass.md');
  assert.match(md, /clarify[^\n]*\n?[^\n]*(raccourci|retir)/);
  assert.match(md, /une ligne par texte retiré/);
});

test('every stage that calls impeccable points to the rule', () => {
  for (const f of readdirSync(dir)) {
    if (f === 'design-pass.md') continue;
    const md = read(f);
    if (!md.includes('impeccable')) continue;
    assert.ok(md.includes(RULE), `${f} calls impeccable without "${RULE}"`);
  }
});

test('framing and foundation write the rule into DESIGN.md', () => {
  for (const f of ['framing.md', 'foundation.md']) {
    assert.match(read(f), new RegExp(`DESIGN\\.md[^]{0,300}${RULE}|${RULE}[^]{0,300}DESIGN\\.md`), f);
  }
});

// Issue #461: the general review must follow the design-pass rule (one full critique, then at most one light
// P0/P1 check), not its own older "recritique, au plus 3 tours" loop.
test('stages that run the design pass never restate their own critique loop', () => {
  for (const f of readdirSync(dir)) {
    if (f === 'design-pass.md') continue;
    const md = read(f);
    if (!md.includes('design-pass.md')) continue;
    assert.doesNotMatch(md, /recritique[^.]{0,40}au plus \d+ tours/i, `${f} restates a critique loop`);
  }
  const audit = read('audit.md');
  assert.match(audit, /une seule critique complète[^.]*au plus un contrôle/, 'audit.md must state the current rule');
});

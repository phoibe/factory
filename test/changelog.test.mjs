import test from 'node:test';
import assert from 'node:assert/strict';
import { readChangelog, versionProblem, cutVersion, sectionOf, semverGreater, versionOf, versionLine } from '../panel/changelog.mjs';

const LOG = ['# Changelog', '', '## [Non publié]', '', '- Ajout du mode sombre', '- Correction du menu', '', '## [0.9.0] - 2026-11-01', '', '- Première version', ''].join('\n');

test('a changelog with a « Non publié » section is read: latest version and number of entries', () => {
  assert.deepEqual(readChangelog(LOG), { header: '## [Non publié]', last: '0.9.0', entries: 2 });
  assert.equal(readChangelog(LOG.replace('Non publié', 'Unreleased')).last, '0.9.0');
  assert.equal(readChangelog('# Changelog\n\n## [0.9.0]\n'), null, 'not versioned this way');
  assert.equal(readChangelog(null), null);
});

test('versions compare field by field, not as text', () => {
  assert.equal(semverGreater('0.10.0', '0.9.0'), true);
  assert.equal(semverGreater('0.9.0', '0.10.0'), false);
  assert.equal(semverGreater('1.0.0', '1.0.0'), false);
});

test('a version number is refused when malformed, not above the latest, or with nothing to publish', () => {
  assert.equal(versionProblem(LOG, '0.10.0'), null);
  assert.match(versionProblem(LOG, 'v0.10.0'), /forme 1\.2\.3/);
  assert.match(versionProblem(LOG, '0.8.0'), /pas supérieur à la dernière version \(0\.9\.0\)/);
  assert.match(versionProblem(LOG.replace(/- Ajout.*\n- Correction.*\n/, ''), '0.10.0'), /vide/);
  assert.match(versionProblem('# rien', '1.0.0'), /Non publié/);
});

test('the latest version given again (an earlier attempt already cut it) is accepted and changes nothing', () => {
  const cut = cutVersion(LOG, '0.10.0', '2026-11-10');
  assert.equal(versionProblem(cut, '0.10.0'), null);
  assert.equal(cutVersion(cut, '0.10.0', '2026-11-11'), cut);
});

test('the cut keeps an empty « Non publié » on top and moves the entries under the new version', () => {
  const cut = cutVersion(LOG, '0.10.0', '2026-11-10');
  assert.match(cut, /## \[Non publié\]\n\n## \[0\.10\.0\] - 2026-11-10\n\n- Ajout du mode sombre\n- Correction du menu\n\n## \[0\.9\.0\]/);
  assert.equal(readChangelog(cut).entries, 0);
  assert.equal(sectionOf(cut, '0.10.0'), '- Ajout du mode sombre\n- Correction du menu');
  assert.equal(sectionOf(cut, '2.0.0'), '');
});

test('the version line of a request is read back', () => {
  assert.equal(versionOf(`Demandé.\n\n${versionLine('1.2.3')}\n\n- X (#1)`), '1.2.3');
  assert.equal(versionOf('Demandé depuis le tableau de bord.'), null);
});

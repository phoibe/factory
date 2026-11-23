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

// Issue #540: Pulsar Novae writes its changes as paragraphs under « ### Modifié (…) » subheadings (its preprod
// changelog, 2026-11-23, trimmed), not as « - » bullets. The release was refused as « rien à publier ».
const PARAGRAPHS = [
  '# Changelog', '', 'Rappel de la convention : **`0.x.y`** jusqu\'à `1.0.0` :', '- aucun geste manuel', '',
  '## [Non publié]', '',
  '### Modifié (22/11/2026, issue #236 - la section « Capital » de /config devient explicite)', '',
  'Une seule case « Capital de référence », avec à côté « € » (devise du compte) ou « % de la valeur nette du',
  'compte », l\'équivalent dans l\'autre unité affiché dessous.', '',
  '## [0.10.4] - 2026-11-20', '', '### Corrigé', '', 'Un paragraphe.', '',
].join('\n');

test('any content under « Non publié » counts: subheadings and paragraphs, not only bullets (#540)', () => {
  assert.equal(readChangelog(PARAGRAPHS).entries, 3);
  assert.equal(versionProblem(PARAGRAPHS, '0.10.5'), null);
  const cut = cutVersion(PARAGRAPHS, '0.10.5', '2026-11-23');
  assert.equal(readChangelog(cut).entries, 0, 'the new « Non publié » is empty again');
  assert.match(sectionOf(cut, '0.10.5'), /^### Modifié \(22\/11\/2026.*\n\nUne seule case[^]*affiché dessous\.$/);
});

test('a « Non publié » section with only blank lines or HTML comments has nothing to publish (#540)', () => {
  const empty = ['## [Non publié]', '', '<!-- Ajoutez ici les modifications -->', '   ', '<!--', '- exemple caché', '-->', '## [0.10.4] - 2026-11-20', '', '- X'].join('\n');
  assert.equal(readChangelog(empty).entries, 0);
  assert.match(versionProblem(empty, '0.10.5'), /vide : rien à publier/);
});

test('text on the same line as a comment, before or after it, still counts (#540)', () => {
  const at = (body) => readChangelog(`## [Non publié]\n${body}\n## [0.1.0]\n`).entries > 0;
  assert.equal(at('- A <!-- note\nsuite -->'), true);
  assert.equal(at('<!--\ncaché\n--> - A'), true);
  assert.equal(at('<!-- x --> - A'), true);
  assert.equal(at('<!--\nh\n--> <!-- encore\n- caché\n-->'), false);
});

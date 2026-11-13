// Journeys of issue #372: projects whose host tells GitHub nothing show their production gap from the site's version tag.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel } from './fixture.mjs';

const site = { homepages: { 'o/r': 'https://r.example' } };
const external = { ...site, config: { production: 'external' } };
const pr = (number, title, sha, mergedAt, closes) => ({ number, title, merge_commit_sha: sha, merged_at: mergedAt, head: { ref: `claude/issue-${closes}-x` }, body: `Closes #${closes}` });

test('sur un projet en mise en ligne externe, après une mise en ligne, le texte sous le nom passe à « En ligne : à jour »', async () => {
  await withPanel({ ...external, deploy: { deployments: [], liveRef: 'a', compare: { commits: [] }, pulls: [pr(111, 'Ajout du mode sombre', 's1', '2026-11-08T10:00:00Z', 11)] } }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('#prod-gap', { hasText: 'En ligne : à jour' }).waitFor();
  });
});

test('après une validation pas encore mise en ligne, il affiche « En ligne : 1 modification d\'écart » et la liste montre la modification', async () => {
  await withPanel({ ...external, deploy: { deployments: [], liveRef: 'a', compare: { commits: [{ sha: 's2' }] }, pulls: [pr(112, 'Correction du menu', 's2', '2026-11-09T10:00:00Z', 12), pr(111, 'Ajout du mode sombre', 's1', '2026-11-08T10:00:00Z', 11)] } }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('#prod-gap', { hasText: 'En ligne : 1 modification d\'écart' }).click();
    const items = page.getByRole('dialog', { name: 'Pas encore en ligne' }).locator('#gap-list li');
    await items.first().waitFor();
    assert.equal(await items.count(), 1);
    assert.match(await items.first().textContent(), /Correction du menu/);
    assert.equal(await items.first().locator('a').getAttribute('href'), 'https://github.com/o/r/issues/12');
  });
});

test('un projet concerné sans étiquette affiche « En ligne : version inconnue » en gris, avec son explication', async () => {
  // A silent host: a site, previews only, and no tag read yet.
  await withPanel({ ...site, deploy: { deployments: [{ id: 1, sha: 'p', environment: 'Preview' }] } }, async ({ page, url }) => {
    await page.goto(url);
    const line = page.locator('#prod-gap', { hasText: 'En ligne : version inconnue' });
    await line.click();
    assert.doesNotMatch(await line.getAttribute('class'), /failed/);
    const dialog = page.getByRole('dialog', { name: 'Version en ligne inconnue' });
    await dialog.getByText(/étiquette de version/).waitFor();
  });
});

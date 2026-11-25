// Journey of the « Review générale » button: the request it opens (issue #605).
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel } from './fixture.mjs';

const created = (writes) => writes.filter((w) => w.method === 'POST' && w.path === '/repos/o/r/issues');

test('la demande créée par « Review générale » annonce la chasse aux erreurs répétées', async () => {
  await withPanel({}, async ({ page, writes, url }) => {
    await page.goto(url);
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Review générale' }).click();
    for (let i = 0; i < 20 && !created(writes).length; i++) await page.waitForTimeout(250);
    const [card] = created(writes);
    assert.equal(card?.body.title, 'Review générale de l\'appli');
    assert.deepEqual(card?.body.labels, ['factory:audit']);
    assert.deepEqual(card.body.body.split('\n'), ['Review générale demandée depuis le tableau.', '',
      '1. Passe design : critique impeccable de tous les écrans, puis correction de tout ce qu\'elle trouve.',
      '2. Revue de code générale de toute l\'appli, puis correction.',
      '3. Chasse aux erreurs répétées : relecture de l\'historique récent, puis une protection prouvée pour chaque erreur revenue au moins deux fois.', '',
      'Ce qui demande une vraie nouvelle feature devient une issue à part.']);
  });
});

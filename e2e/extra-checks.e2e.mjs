// Pulsar alignment: a project's own checks are set from the panel (« Contrôles supplémentaires »), never in the factory.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel } from './fixture.mjs';

const savedRules = (writes) => {
  const put = writes.filter((w) => w.method === 'PUT' && w.path.endsWith('/contents/factory.config.json')).pop();
  return put && JSON.parse(Buffer.from(put.body.content, 'base64').toString('utf8'));
};

test('j\'ajoute un contrôle supplémentaire avec son nom et sa commande, et il est enregistré dans les réglages du projet', async () => {
  await withPanel({}, async ({ page, url, writes }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Paramètres' }).click();
    await page.getByText('Avancé', { exact: true }).click(); // issue #342: technical settings are folded
    await page.getByRole('button', { name: 'Ajouter un contrôle' }).click();
    await page.locator('#extra-label-0').fill('Scan des secrets');
    await page.locator('#extra-label-0').press('Tab');
    await page.locator('#extra-command-0').fill('./scripts/installer_outil.sh gitleaks');
    await page.locator('#extra-command-0').press('Tab');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByText('Paramètres enregistrés.', { exact: false }).waitFor({ timeout: 5000 });
    assert.deepEqual(savedRules(writes).extraChecks, [{ label: 'Scan des secrets', command: './scripts/installer_outil.sh gitleaks', enabled: true }]);
  });
});

test('je coupe ou je retire un contrôle supplémentaire depuis le panneau', async () => {
  const config = { extraChecks: [{ label: 'Images', command: './scripts/scanner_images.sh --bases' }, { label: 'Failles Python', command: 'pip-audit' }] };
  await withPanel({ config }, async ({ page, url, writes }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Paramètres' }).click();
    await page.getByText('Avancé', { exact: true }).click(); // issue #342: technical settings are folded
    await page.getByRole('checkbox', { name: 'Activer Images' }).uncheck();
    await page.getByRole('button', { name: 'Retirer Failles Python' }).click();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByText('Paramètres enregistrés.', { exact: false }).waitFor({ timeout: 5000 });
    assert.deepEqual(savedRules(writes).extraChecks, [{ label: 'Images', command: './scripts/scanner_images.sh --bases', enabled: false }]);
  });
});

test('un contrôle sans commande n\'est pas enregistré, et le panneau dit pourquoi', async () => {
  await withPanel({}, async ({ page, url, writes }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Paramètres' }).click();
    await page.getByText('Avancé', { exact: true }).click(); // issue #342: technical settings are folded
    await page.getByRole('button', { name: 'Ajouter un contrôle' }).click();
    await page.locator('#extra-label-0').fill('Sans commande');
    await page.locator('#extra-label-0').press('Tab');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByText('Chaque contrôle supplémentaire a besoin d\'un nom et d\'une commande.').waitFor({ timeout: 5000 });
    assert.equal(savedRules(writes), undefined);
  });
});

test('un projet sans contrôle supplémentaire n\'en garde aucune trace dans ses réglages', async () => {
  await withPanel({}, async ({ page, url, writes }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Paramètres' }).click();
    await page.locator('#stage-plan').click();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByText('Paramètres enregistrés.', { exact: false }).waitFor({ timeout: 5000 });
    assert.equal('extraChecks' in savedRules(writes), false);
  });
});

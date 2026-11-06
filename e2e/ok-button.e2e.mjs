// « Ok » on the « Captures à valider » and « Tester » cards (issue #257): 5 s to cancel, then the « ok » leaves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const pr = (number, title, labels) => issue(number, title, ['factory:feature', ...labels], { pull_request: { url: `https://api.github.com/repos/o/r/pulls/${number}` }, html_url: `https://github.com/o/r/pull/${number}` });
const visual = pr(10, 'Partager une recette', ['factory:visual-review']);
const acceptance = { ...pr(11, 'Imprimer la liste', ['factory:acceptance']), comments: 1 };
const previewComment = [{ id: 1, body: 'Vous pouvez tester la nouvelle version ici : https://preview.example.com/', user: { login: 'github-actions[bot]' }, author_association: 'NONE', created_at: new Date().toISOString() }];
const buttons = (page, n) => page.locator(`.you-item[data-number="${n}"]`).locator('a.button, button').allTextContents();
const sentOn = (writes, n) => () => writes.filter((w) => w.path.endsWith(`/issues/${n}/comments`)).map((w) => w.body.body);
async function waitFor(check, page) { for (let i = 0; i < 100 && !check(); i++) await page.waitForTimeout(100); }

test('une carte « Captures à valider » montre « Ok » en bleu puis « Voir les captures »', async () => {
  await withPanel({ issues: [visual] }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('button.go[data-go="10"]').waitFor();
    assert.deepEqual((await buttons(page, 10)).map((t) => t.trim()), ['Ok', 'Voir les captures']);
    assert.equal(await page.locator('.you-item[data-number="10"] a.button.secondary').textContent(), 'Voir les captures');
    assert.equal(await page.locator('.you-item[data-number="10"] a.button.secondary').getAttribute('href'), 'https://github.com/o/r/pull/10');
  });
});

test('un clic sur « Ok » affiche « Annuler (5 s) », un second clic annule et rien n\'est envoyé', async () => {
  await withPanel({ issues: [visual] }, async ({ page, writes, url }) => {
    await page.goto(url);
    await page.locator('button.go[data-go="10"]').click();
    assert.match(await page.locator('button.go[data-go="10"]').textContent(), /Annuler \(\d s\)/);
    await page.locator('button.go[data-go="10"]').click();
    await page.waitForTimeout(6000);
    assert.deepEqual(sentOn(writes, 10)(), []);
    assert.equal(await page.locator('button.go[data-go="10"]').textContent(), 'Ok');
  });
});

test('sans annuler, le « ok » part et le message « Captures validées » apparaît', async () => {
  await withPanel({ issues: [visual] }, async ({ page, writes, url }) => {
    await page.goto(url);
    await page.locator('button.go[data-go="10"]').click();
    await waitFor(() => sentOn(writes, 10)().length, page);
    assert.deepEqual(sentOn(writes, 10)(), ['ok']);
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('Captures validées'));
    assert.equal(await page.locator('#toast').textContent(), '« ok » envoyé. Captures validées : la fusion se fera dès que les contrôles automatiques sont verts.');
    await page.locator('.ticket.pending[data-number="10"]').waitFor();
  });
});

test('une carte « Tester » montre « Ok », « Ouvrir l\'aperçu à tester » et « Voir la recette »', async () => {
  await withPanel({ issues: [acceptance], comments: { 11: previewComment } }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('.you-item[data-number="11"] a[href="https://preview.example.com/"]').waitFor();
    assert.deepEqual((await buttons(page, 11)).map((t) => t.replace(' ↗', '').trim()), ['Ok', 'Ouvrir l\'aperçu à tester', 'Voir la recette']);
  });
});

test('sans aperçu, une carte « Tester » montre seulement « Ok » et « Voir la recette »', async () => {
  await withPanel({ issues: [{ ...acceptance, comments: 0 }] }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('button.go[data-go="11"]').waitFor();
    assert.deepEqual((await buttons(page, 11)).map((t) => t.trim()), ['Ok', 'Voir la recette']);
  });
});

test('sur une carte « Tester », « Ok » laissé jusqu\'au bout annonce la mise en ligne', async () => {
  await withPanel({ issues: [{ ...acceptance, comments: 0 }] }, async ({ page, writes, url }) => {
    await page.goto(url);
    await page.locator('button.go[data-go="11"]').click();
    await waitFor(() => sentOn(writes, 11)().length, page);
    assert.deepEqual(sentOn(writes, 11)(), ['ok']);
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('Recette validée'));
    assert.equal(await page.locator('#toast').textContent(), '« ok » envoyé. Recette validée : la mise en ligne se fait maintenant.');
  });
});

test('changer de projet pendant le décompte annule l\'envoi', async () => {
  await withPanel({ issues: [visual], repos: ['o/r', 'o/autre'] }, async ({ page, writes, url }) => {
    await page.goto(url);
    await page.locator('button.go[data-go="10"]').click();
    await page.locator('#project').selectOption('o/autre');
    await page.waitForTimeout(6000);
    assert.equal(writes.filter((w) => w.path.endsWith('/comments')).length, 0);
  });
});

test('ouvrir l\'aperçu puis revenir laisse la carte « Tester » dans « À vous de jouer », prête pour « Ok »', async () => {
  await withPanel({ issues: [acceptance], comments: { 11: previewComment } }, async ({ page, url }) => {
    await page.goto(url);
    const link = page.locator('.you-item[data-number="11"] a[href="https://preview.example.com/"]');
    await link.waitFor();
    await link.click({ modifiers: ['ControlOrMeta'] });
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(500);
    assert.equal(await page.locator('.ticket.pending[data-number="11"]').count(), 0);
    assert.equal(await page.locator('.you-item[data-number="11"] button.go').textContent(), 'Ok');
  });
});

test('si l\'envoi échoue, un message le dit et le bouton redevient « Ok »', async () => {
  await withPanel({ issues: [visual], failing: new Set(['/repos/o/r/issues/10/comments']) }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('button.go[data-go="10"]').click();
    await page.waitForFunction(() => document.getElementById('toast').textContent.startsWith('Envoi impossible'), null, { timeout: 10000 });
    await page.waitForFunction(() => document.querySelector('button.go[data-go="10"]')?.textContent === 'Ok');
    assert.equal(await page.locator('button.go[data-go="10"]').isDisabled(), false);
  });
});

test('après l\'envoi, recharger la page ne permet pas d\'envoyer un second « ok »', async () => {
  await withPanel({ issues: [visual] }, async ({ page, writes, url }) => {
    await page.goto(url);
    await page.locator('button.go[data-go="10"]').click();
    await waitFor(() => sentOn(writes, 10)().length, page);
    await page.locator('.ticket.pending[data-number="10"]').waitFor();
    await page.reload();
    await page.locator('.ticket.pending[data-number="10"] button.go').waitFor();
    assert.equal(await page.locator('.ticket.pending[data-number="10"] button.go').isDisabled(), true);
  });
});

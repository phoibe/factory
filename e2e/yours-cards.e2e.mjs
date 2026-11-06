// « À vous de jouer » shown as cards, like the other lanes (issue #269).
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const at = (minutesAgo) => new Date(Date.now() - minutesAgo * 60000).toISOString();
const spec = (n, title, minutesAgo) => issue(n, title, ['factory:feature', 'factory:spec-review'], { updated_at: at(minutesAgo) });
const three = [spec(3, 'Imprimer la liste', 5), spec(1, 'Partager une recette', 30), spec(2, 'Trier par saison', 15)];
const yours = (page) => page.locator('section.lane-yours .ticket.yours');

test('je vois « À vous de jouer » en haut avec son nombre, puis une carte bleutée par demande', async () => {
  await withPanel({ issues: three }, async ({ page, url }) => {
    await page.goto(url);
    await yours(page).first().waitFor();
    const lane = page.locator('section.lane-yours');
    assert.match(await lane.locator('h2').textContent(), /^À vous de jouer/);
    assert.equal(await lane.locator('h2 .count').textContent(), '3');
    assert.equal(await page.locator('#board > :first-child').evaluate((n) => n.classList.contains('lane-yours')), true, 'the lane comes first');
    assert.equal(await yours(page).count(), 3);
    assert.equal(await page.getByText('choses vous attendent').count(), 0, 'the big sentence is gone');
    const bg = await yours(page).first().evaluate((n) => getComputedStyle(n).backgroundColor);
    assert.equal(bg, 'rgb(234, 240, 255)', 'the card is tinted soft blue (--you-bg)');
    assert.match(await page.title(), /3/);
  });
});

test('chaque carte montre type et numéro, « depuis … », titre, action attendue, boutons, barre d\'étapes et temps restant', async () => {
  const events = [{ id: 1, event: 'labeled', label: { name: 'factory:spec-review' }, issue: { number: 1 }, created_at: at(30) }];
  await withPanel({ issues: [spec(1, 'Partager une recette', 30)], events }, async ({ page, url }) => {
    await page.goto(url);
    const c = page.locator('.ticket.yours[data-number="1"]');
    await c.waitFor();
    assert.equal(await c.locator('.kind').textContent(), 'Fonctionnalité · demande #1');
    assert.match(await c.locator('.since').textContent(), /^depuis /);
    assert.equal(await c.locator('h3').textContent(), 'Partager une recette');
    assert.match(await c.locator('.cta').textContent(), /Validez la spec/);
    assert.equal(await c.locator('.card-actions button.go').textContent(), 'go');
    assert.equal(await c.locator('.track').count(), 1);
    assert.equal(await c.locator('.eta').count(), 1);
  });
});

test('le bouton bleu vient en premier, avant les boutons discrets', async () => {
  // A capture card has the three kinds of buttons: blue « Ok », then the quiet preview and captures links.
  const visual = { ...issue(2, 'Imprimer la liste', ['factory:feature', 'factory:visual-review'], { pull_request: { url: 'x' }, html_url: 'https://github.com/o/r/pull/2' }), comments: 1 };
  const comment = [{ id: 1, body: 'Vous pouvez tester la nouvelle version ici : https://preview.example.com/', user: { login: 'github-actions[bot]' }, author_association: 'NONE', created_at: new Date().toISOString() }];
  await withPanel({ issues: [visual, spec(1, 'Partager une recette', 30)], comments: { 2: comment } }, async ({ page, url }) => {
    await page.goto(url);
    const actions = page.locator('.ticket.yours[data-number="2"] .card-actions');
    await actions.locator('a[href="https://preview.example.com/"]').waitFor();
    assert.deepEqual((await actions.locator('a.button, button').allTextContents()).map((t) => t.replace(' ↗', '').trim()), ['Ok', 'Voir l\'aperçu', 'Voir les captures']);
    assert.equal(await actions.locator('> *').first().evaluate((n) => n.matches('button.go')), true);
    assert.equal(await page.locator('.ticket.yours[data-number="1"] .card-actions > *').first().evaluate((n) => n.matches('button.go')), true, '« go » first on a spec card');
  });
});

test('sur ordinateur les cartes se rangent jusqu\'à trois par ligne, sur téléphone une par ligne', async () => {
  for (const [viewport, perRow] of [[{ width: 1280, height: 900 }, 3], [{ width: 390, height: 844 }, 1]]) {
    await withPanel({ issues: three, viewport }, async ({ page, url }) => {
      await page.goto(url);
      await yours(page).nth(2).waitFor();
      const tops = await yours(page).evaluateAll((n) => n.map((x) => Math.round(x.getBoundingClientRect().top)));
      assert.equal(tops.filter((t) => t === tops[0]).length, perRow, `${viewport.width}px`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal scroll');
    });
  }
});

test('la demande la plus ancienne vient en premier', async () => {
  await withPanel({ issues: three }, async ({ page, url }) => {
    await page.goto(url);
    await yours(page).nth(2).waitFor();
    assert.deepEqual(await yours(page).evaluateAll((n) => n.map((x) => x.dataset.number)), ['1', '2', '3']);
  });
});

test('un clic sur « Ok » fait passer la carte en « Prise en compte en cours… », et « go » part comme avant', async () => {
  const visual = issue(2, 'Imprimer la liste', ['factory:feature', 'factory:visual-review'], { pull_request: { url: 'x' }, html_url: 'https://github.com/o/r/pull/2' });
  await withPanel({ issues: [visual, spec(1, 'Partager une recette', 30)] }, async ({ page, writes, url }) => {
    await page.goto(url);
    await page.locator('.ticket.yours button.go[data-go="2"]').click();
    await page.locator('.ticket.yours button.go[data-go="1"]').click();
    const sent = (n) => writes.filter((w) => w.path.endsWith(`/issues/${n}/comments`)).map((w) => w.body.body);
    for (let i = 0; i < 100 && !(sent(1).length && sent(2).length); i++) await page.waitForTimeout(100);
    assert.deepEqual([sent(1), sent(2)], [['go'], ['ok']]);
    await page.locator('.pending-zone .ticket.pending[data-number="2"]').waitFor();
  });
});

test('une demande bloquée a une carte rouge avec « Bloqué »', async () => {
  const blocked = issue(4, 'Importer un fichier', ['factory:feature', 'factory:building', 'factory:blocked']);
  await withPanel({ issues: [blocked] }, async ({ page, url }) => {
    await page.goto(url);
    const c = page.locator('.ticket.yours.blocked[data-number="4"]');
    await c.waitFor();
    assert.equal(await c.locator('.blocked-tag').textContent(), 'Bloqué');
  });
});

test('quand rien ne m\'attend, le message « Rien ne vous attend » s\'affiche comme avant', async () => {
  await withPanel({ issues: [issue(5, 'Exporter en PDF', ['factory:feature', 'factory:building', 'factory:running'])] }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('.you-card.calm').waitFor();
    assert.equal(await page.locator('.you-card.calm .headline').textContent(), 'Rien ne vous attend');
    assert.equal(await page.locator('section.lane-yours').count(), 0, 'no empty lane');
  });
});

test('les boutons discrets d\'une carte tiennent côte à côte sous le bouton bleu', async () => {
  const acceptance = { ...issue(3, 'Trier par saison', ['factory:feature', 'factory:acceptance'], { pull_request: { url: 'x' }, html_url: 'https://github.com/o/r/pull/3' }), comments: 1 };
  const comment = [{ id: 1, body: 'Vous pouvez tester la nouvelle version ici : https://preview.example.com/', user: { login: 'github-actions[bot]' }, author_association: 'NONE', created_at: new Date().toISOString() }];
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await withPanel({ issues: [acceptance], comments: { 3: comment }, viewport }, async ({ page, url }) => {
      await page.goto(url);
      const actions = page.locator('.ticket.yours[data-number="3"] .card-actions');
      await actions.locator('a[href="https://preview.example.com/"]').waitFor();
      const tops = await actions.locator('a.button').evaluateAll((n) => n.map((x) => Math.round(x.getBoundingClientRect().top)));
      assert.equal(tops.length, 2);
      assert.equal(tops[0], tops[1], `${viewport.width}px: « Ouvrir l'aperçu à tester » and « Voir la recette » share one row`);
    });
  }
});

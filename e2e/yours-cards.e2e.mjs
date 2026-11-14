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
    assert.deepEqual((await actions.locator('a.button, button').allTextContents()).map((t) => t.replace(' ↗', '').trim()), ['Ok', 'Aperçu', 'Captures']);
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

test('toutes les cartes ont les mêmes dimensions, quel que soit leur contenu (pas d\'effet d\'escalier)', async () => {
  // Five cards of very different lengths: two rows on a computer, so every row must share one height too.
  const long = 'Afficher la liste des courses de la semaine regroupée par rayon, avec les quantités additionnées et une case à cocher';
  const visual = { ...issue(4, long, ['factory:feature', 'factory:visual-review'], { pull_request: { url: 'x' }, html_url: 'https://github.com/o/r/pull/4' }), comments: 1 };
  const comment = [{ id: 1, body: 'Vous pouvez tester la nouvelle version ici : https://preview.example.com/', user: { login: 'github-actions[bot]' }, author_association: 'NONE', created_at: new Date().toISOString() }];
  const blocked = issue(5, 'Exporter en PDF', ['factory:feature', 'factory:blocked'], { updated_at: at(2) });
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await withPanel({ issues: [...three, visual, blocked], comments: { 4: comment }, viewport }, async ({ page, url }) => {
      await page.goto(url);
      await page.locator('.ticket.yours[data-number="4"] a[href="https://preview.example.com/"]').waitFor();
      await yours(page).nth(4).waitFor();
      const boxes = await yours(page).evaluateAll((n) => n.map((x) => { const r = x.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; }));
      assert.equal(new Set(boxes.map((b) => b.h)).size, 1, `${viewport.width}px: same height for every card ${JSON.stringify(boxes)}`);
      assert.equal(new Set(boxes.map((b) => b.w)).size, 1, `${viewport.width}px: same width for every card`);
      // The steps bar lines up at the bottom of every card, whatever comes above it.
      const gaps = await yours(page).evaluateAll((n) => n.map((x) => {
        const t = x.querySelector('.step'); return t ? Math.round(x.getBoundingClientRect().bottom - t.getBoundingClientRect().bottom) : null;
      }).filter((g) => g != null));
      assert.ok(gaps.length >= 2);
      assert.equal(new Set(gaps).size, 1, `${viewport.width}px: steps bar at the same place ${JSON.stringify(gaps)}`);
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

test('le bouton bleu et les deux boutons discrets d\'une carte tiennent sur une seule ligne, même pendant le compte à rebours', async () => {
  const acceptance = { ...issue(3, 'Trier par saison', ['factory:feature', 'factory:acceptance'], { pull_request: { url: 'x' }, html_url: 'https://github.com/o/r/pull/3' }), comments: 1 };
  const comment = [{ id: 1, body: 'Vous pouvez tester la nouvelle version ici : https://preview.example.com/', user: { login: 'github-actions[bot]' }, author_association: 'NONE', created_at: new Date().toISOString() }];
  for (const viewport of [{ width: 1280, height: 900 }, { width: 900, height: 800 }, { width: 390, height: 844 }]) {
    await withPanel({ issues: [acceptance], comments: { 3: comment }, viewport }, async ({ page, url }) => {
      await page.goto(url);
      const actions = page.locator('.ticket.yours[data-number="3"] .card-actions');
      await actions.locator('a[href="https://preview.example.com/"]').waitFor();
      const rows = () => actions.locator('> *').evaluateAll((n) => new Set(n.map((x) => Math.round(x.getBoundingClientRect().top))).size);
      assert.equal(await actions.locator('> *').count(), 3);
      assert.equal(await rows(), 1, `${viewport.width}px: « Ok », « Aperçu » and « Recette » share one row`);
      await actions.locator('button.go').click();
      assert.match(await actions.locator('button.go').textContent(), /Annuler \(\ds\)/);
      assert.equal(await rows(), 1, `${viewport.width}px: still one row during the countdown`);
      await actions.locator('button.go').click(); // cancel
    });
  }
});

test('toucher le fond d\'une carte bloquée ne l\'envoie pas en « Prise en compte en cours… »', async () => {
  const blocked = issue(4, 'Importer un fichier', ['factory:feature', 'factory:building', 'factory:blocked']);
  await withPanel({ issues: [blocked] }, async ({ page, url }) => {
    await page.goto(url);
    const c = page.locator('.ticket.yours[data-number="4"]');
    await c.waitFor();
    let popups = 0;
    page.context().on('page', () => { popups++; });
    await c.locator('.track').click({ force: true }); // the empty space around the step bar, away from the title and the button
    await page.waitForTimeout(300);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(300);
    assert.equal(popups, 0, 'no GitHub tab opened');
    assert.equal(await page.locator('.pending-zone').count(), 0);
    assert.equal(await c.count(), 1);
  });
});

test('le compte à rebours de « go » continue quand le tableau se redessine', async () => {
  await withPanel({ issues: [spec(1, 'Partager une recette', 30)] }, async ({ page, writes, url }) => {
    await page.goto(url);
    await page.locator('.ticket.yours button.go[data-go="1"]').click();
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.dispatchEvent(new Event('focus'))); // redraws the board
    assert.match(await page.locator('.ticket.yours button.go[data-go="1"]').textContent(), /Annuler \(\ds\)/);
    const sent = () => writes.filter((w) => w.path.endsWith('/issues/1/comments')).map((w) => w.body.body);
    for (let i = 0; i < 100 && !sent().length; i++) await page.waitForTimeout(100);
    await page.waitForTimeout(500);
    assert.deepEqual(sent(), ['go'], 'sent once');
  });
});

// The owner answered on GitHub, but GitHub did not start the factory yet: the card must not stay in « À vous de
// jouer » as if nothing had been sent, and must say so plainly once GitHub is late.
test('une réponse écrite sur GitHub et pas encore prise attend en « Prise en compte », avec une alerte après 10 min', async () => {
  const visual = (n, title) => ({ ...issue(n, title, ['factory:feature', 'factory:visual-review'], { pull_request: { url: 'x' }, html_url: `https://github.com/o/r/pull/${n}` }), comments: 2 });
  const asked = { id: 1, body: '<!-- factory-agent -->\nRépondez « ok » si cela vous convient.', user: { login: 'o' }, created_at: at(40) };
  const reply = (id, minutesAgo) => ({ id, body: 'Les deux captures du calage ne sont pas comparables.', user: { login: 'o' }, created_at: at(minutesAgo) });
  const comments = { 2: [asked, reply(2, 3)], 3: [asked, reply(3, 14)], 4: [asked, { ...asked, id: 4 }] };
  await withPanel({ issues: [visual(2, 'Balance'), visual(3, 'Réglages'), visual(4, 'Wi-Fi')], comments }, async ({ page, url }) => {
    await page.goto(url);
    const held = page.locator('section.pending-zone');
    await held.locator('.ticket[data-number="3"]').waitFor();
    assert.deepEqual(await held.locator('.ticket').evaluateAll((n) => n.map((x) => x.dataset.number)), ['2', '3']);
    assert.equal(await page.locator('section.lane-yours .ticket[data-number="4"]').count(), 1, 'a card still waiting for an answer stays yours');
    assert.equal((await held.locator('.ticket[data-number="2"] .doing').textContent()).trim(), 'En attente de GitHub');
    assert.equal(await held.locator('.ticket[data-number="2"] .alert').count(), 0, 'no warning before 10 min');
    assert.match(await held.locator('.ticket[data-number="3"] .alert').textContent(), /^Réponse pas encore prise en compte · GitHub tarde depuis 14 min$/);
  });
});

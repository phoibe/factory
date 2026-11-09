// The project list on the right, alphabetical, with one status dot per project (issue #314).
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const repos = ['o/r', 'o/delta', 'o/Bravo', 'o/alpha', 'o/charlie'];
const repoIssues = {
  'o/alpha': [issue(1, 'Question', ['factory:feature', 'factory:building', 'factory:blocked'])],
  'o/Bravo': [issue(2, 'Spec', ['factory:feature', 'factory:spec-review'])],
  'o/charlie': [issue(3, 'Construit', ['factory:feature', 'factory:building', 'factory:running'])],
};
const openR = (page) => page.addInitScript(() => localStorage.setItem('factory.project', 'o/r'));
const names = (page, list) => page.locator(`${list} .project-item .pname`).allTextContents();

test('sur ordinateur, la liste « Projets » est à droite, triée par ordre alphabétique, sans menu déroulant en haut', async () => {
  await withPanel({ repos, repoIssues, viewport: { width: 1280, height: 800 } }, async ({ page, url }) => {
    await openR(page);
    await page.goto(url);
    const aside = page.locator('#projects');
    await aside.getByRole('heading', { name: 'Projets' }).waitFor();
    assert.deepEqual(await names(page, '#projects'), ['alpha', 'Bravo', 'charlie', 'delta', 'r']);
    assert.equal(await page.locator('select#project').count(), 0);
    const box = await aside.boundingBox();
    assert.ok(box.x + box.width >= 1279 && box.width >= 220 && box.width <= 260, `column on the right edge: ${JSON.stringify(box)}`);
  });
});

test('le projet ouvert a un fond plus clair et un nom en gras ; un clic sur un autre projet l\'ouvre', async () => {
  await withPanel({ repos, repoIssues, viewport: { width: 1280, height: 800 } }, async ({ page, url }) => {
    await openR(page);
    await page.goto(url);
    const current = page.locator('#projects .project-item[aria-current="true"]');
    await current.waitFor();
    assert.equal(await current.locator('.pname').textContent(), 'r');
    const style = await current.evaluate((n) => ({ weight: getComputedStyle(n).fontWeight, bg: getComputedStyle(n).backgroundColor, other: getComputedStyle(n.closest('li').nextElementSibling || n.closest('li').previousElementSibling).backgroundColor }));
    assert.ok(Number(style.weight) >= 600, `bold: ${style.weight}`);
    assert.notEqual(style.bg, 'rgba(0, 0, 0, 0)', 'own background');
    await page.locator('#projects .project-item', { hasText: 'charlie' }).click();
    await page.waitForFunction(() => document.getElementById('project-name').textContent === 'charlie');
    assert.equal(await page.locator('#projects .project-item[aria-current="true"] .pname').textContent(), 'charlie');
  });
});

test('un projet bloqué a un point rouge, une spec à valider un point bleu, un agent au travail un point gris, sans rien aucun point', async () => {
  await withPanel({ repos, repoIssues, viewport: { width: 1280, height: 800 } }, async ({ page, url }) => {
    await openR(page);
    await page.goto(url);
    const dot = (name) => page.locator('#projects .project-item', { hasText: name }).locator('.pdot');
    await page.locator('#projects .pdot-blocked').waitFor();
    assert.match(await dot('alpha').getAttribute('class'), /pdot-blocked/);
    assert.match(await dot('Bravo').getAttribute('class'), /pdot-yours/);
    assert.match(await dot('charlie').getAttribute('class'), /pdot-working/);
    assert.doesNotMatch(await dot('delta').getAttribute('class'), /pdot-(blocked|yours|working)/);
  });
});

test('au survol d\'un point, sa légende apparaît', async () => {
  await withPanel({ repos, repoIssues, viewport: { width: 1280, height: 800 } }, async ({ page, url }) => {
    await openR(page);
    await page.goto(url);
    await page.locator('#projects .pdot-blocked').waitFor();
    assert.equal(await page.locator('#projects .pdot-blocked').getAttribute('title'), 'Bloqué');
    assert.equal(await page.locator('#projects .pdot-yours').getAttribute('title'), 'À vous de jouer');
    assert.equal(await page.locator('#projects .pdot-working').getAttribute('title'), 'En cours');
    assert.equal(await page.getByRole('img', { name: 'Bloqué' }).count(), 1);
  });
});

test('en faisant défiler le tableau, la liste reste visible', async () => {
  const many = Array.from({ length: 30 }, (_, i) => issue(100 + i, `Demande ${i}`, ['factory:feature', 'factory:queued']));
  await withPanel({ repos, repoIssues, issues: many, viewport: { width: 1280, height: 700 } }, async ({ page, url }) => {
    await openR(page);
    await page.goto(url);
    await page.locator('.ticket').first().waitFor();
    await page.mouse.wheel(0, 2000);
    await page.waitForFunction(() => window.scrollY > 500);
    const box = await page.locator('#projects').boundingBox();
    assert.ok(box.y <= 1 && box.y + box.height >= 699, `still in view: ${JSON.stringify(box)}`);
  });
});

test('sur téléphone, toucher le nom du projet ouvre la liste en plein écran ; toucher un projet l\'ouvre et referme la liste ; un point rouge apparaît près du nom', async () => {
  await withPanel({ repos, repoIssues, viewport: { width: 390, height: 800 } }, async ({ page, url }) => {
    await openR(page);
    await page.goto(url);
    assert.equal(await page.locator('#projects').isVisible(), false);
    const button = page.locator('#project-switch');
    await button.locator('.pdot-blocked').waitFor();
    assert.equal(await button.locator('.pdot-blocked').getAttribute('title'), 'Un autre projet est bloqué');
    await button.click();
    const dialog = page.locator('#projects-dialog');
    await dialog.waitFor();
    const box = await dialog.boundingBox();
    assert.ok(box.width >= 389 && box.height >= 799, `full screen: ${JSON.stringify(box)}`);
    assert.deepEqual(await names(page, '#projects-dialog'), ['alpha', 'Bravo', 'charlie', 'delta', 'r']);
    await dialog.locator('.project-item', { hasText: 'Bravo' }).click();
    await page.waitForFunction(() => document.getElementById('project-name').textContent === 'Bravo');
    assert.equal(await dialog.isVisible(), false);
    assert.equal(await button.locator('.pdot-blocked').count(), 1, 'alpha still blocked');
  });
});

// Journeys of issue #473: the « Agent » tab at the usual width, with a button for a true full screen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const AGENT = '<!-- factory-agent -->';
const question = issue(7, 'Comment publier ?', ['factory:question'], { comments: 1, body: 'Comment publier ?' });
const thread = { 7: [{ id: 1, body: `${AGENT}\nVoici la réponse.`, user: { login: 'o' }, author_association: 'OWNER', created_at: new Date().toISOString(), html_url: 'https://github.com/o/r/issues/7#c1' }] };
const desk = { width: 1600, height: 900 };
const repos = ['o/r', 'o/autre'];

async function openAgent(page, url) {
  await page.goto(url);
  await page.getByRole('tab', { name: 'Agent', exact: true }).click();
  // The only conversation still open opens by itself (issue #477), on a phone too.
  await page.locator('.conv.current', { hasText: 'Comment publier ?' }).waitFor({ state: 'attached' });
  await page.locator('#chat-messages .msg.agent').first().waitFor();
}
const full = (page) => page.getByRole('button', { name: 'Plein écran' });
const normal = (page) => page.getByRole('button', { name: 'Largeur normale' });

test('l\'onglet Agent a la même largeur que l\'onglet Suivi', async () => {
  await withPanel({ issues: [question], comments: thread, viewport: desk }, async ({ page, url }) => {
    await openAgent(page, url);
    const chat = await page.locator('#chat').boundingBox();
    await page.getByRole('tab', { name: 'Suivi' }).click();
    const board = await page.locator('#board').boundingBox();
    assert.ok(Math.abs(chat.width - board.width) <= 2, `Agent ${chat.width} px, Suivi ${board.width} px`);
  });
});

test('le bouton à deux flèches passe la conversation en plein écran, sous la barre du haut et à côté de la liste des projets', async () => {
  await withPanel({ issues: [question], comments: thread, repos, viewport: desk }, async ({ page, url }) => {
    await openAgent(page, url);
    await full(page).click();
    await normal(page).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Nouvelle fonctionnalité' }).isVisible(), false, 'le haut du projet reste visible');
    // The project name stays the page's title for screen readers, only out of sight.
    assert.equal(await page.getByRole('heading', { level: 1 }).count(), 1, 'la page perd son titre');
    assert.equal(await page.getByRole('tab', { name: 'Suivi' }).isVisible(), false, 'les onglets restent visibles');
    const top = await page.locator('header.top').boundingBox();
    const list = await page.locator('#projects').boundingBox();
    const chat = await page.locator('#chat').boundingBox();
    assert.ok(Math.abs(chat.y - (top.y + top.height)) <= 2, `la conversation commence à ${chat.y}, la barre finit à ${top.y + top.height}`);
    assert.ok(chat.x <= 1, `marge à gauche de ${chat.x} px`);
    assert.ok(Math.abs(chat.x + chat.width - list.x) <= 2, `la conversation finit à ${chat.x + chat.width}, la liste commence à ${list.x}`);
    assert.ok(chat.y + chat.height >= desk.height - 2 && chat.y + chat.height <= desk.height + 1, `bas à ${chat.y + chat.height}`);
    const input = await page.locator('#chat-input').boundingBox();
    assert.ok(input.y + input.height <= desk.height, 'zone de saisie sous le bas de l\'écran');
    const answer = await page.locator('#chat-messages .msg.agent').boundingBox();
    assert.ok(answer.width <= 870, `réponse de ${answer.width} px`);
  });
});

test('Échap ou un second clic sur le bouton reviennent à la largeur normale, avec le nom du projet et les onglets', async () => {
  await withPanel({ issues: [question], comments: thread, viewport: desk }, async ({ page, url }) => {
    await openAgent(page, url);
    await full(page).click();
    await page.keyboard.press('Escape');
    await full(page).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Nouvelle fonctionnalité' }).isVisible(), true);
    assert.equal(await page.getByRole('tab', { name: 'Suivi' }).isVisible(), true);
    await full(page).click();
    await normal(page).click();
    await full(page).waitFor();
    assert.equal(await page.getByRole('tab', { name: 'Suivi' }).isVisible(), true);
  });
});

// Issue #475 (asked after this spec) wins: another project always opens on « Suivi », full screen included.
test('en plein écran, changer de projet ouvre le « Suivi » du nouveau projet, à la largeur normale', async () => {
  await withPanel({ issues: [question], comments: thread, repos, viewport: desk }, async ({ page, url }) => {
    await openAgent(page, url);
    await full(page).click();
    await page.locator('#projects .project-item', { hasText: 'autre' }).click();
    await page.locator('#projects .project-item[aria-current="true"]', { hasText: 'autre' }).waitFor();
    await page.getByRole('tab', { name: 'Suivi', selected: true }).waitFor();
    assert.equal(await page.evaluate(() => document.body.classList.contains('chat-fullscreen')), false, 'plein écran resté');
    assert.equal(await page.getByRole('link', { name: 'Nouvelle fonctionnalité' }).isVisible(), true);
  });
});

test('après un rechargement, l\'onglet Agent revient à la largeur normale', async () => {
  await withPanel({ issues: [question], comments: thread, viewport: desk }, async ({ page, url }) => {
    await openAgent(page, url);
    await full(page).click();
    await page.reload();
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await full(page).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Nouvelle fonctionnalité' }).isVisible(), true);
  });
});

test('sur téléphone, pas de bouton plein écran', async () => {
  await withPanel({ issues: [question], comments: thread, viewport: { width: 390, height: 700 } }, async ({ page, url }) => {
    await openAgent(page, url);
    assert.equal(await full(page).isVisible(), false);
  });
});

test('un clic sur une image agrandie puis Échap referme l\'image sans quitter le plein écran', async () => {
  await withPanel({ issues: [question], comments: thread, viewport: desk }, async ({ page, url }) => {
    await openAgent(page, url);
    await full(page).click();
    await page.evaluate(() => document.querySelector('dialog.lightbox, dialog')?.showModal());
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    assert.equal(await normal(page).isVisible(), true, 'plein écran quitté');
  });
});

test('le bouton garde le focus quand on bascule au clavier', async () => {
  await withPanel({ issues: [question], comments: thread, viewport: desk }, async ({ page, url }) => {
    await openAgent(page, url);
    await full(page).focus();
    await page.keyboard.press('Enter');
    await normal(page).waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'chat-full');
  });
});

test('si le jeton de lecture est redemandé en plein écran, on retrouve le haut du projet et les onglets', async () => {
  await withPanel({ chatServer: { answer: 'Bonjour.', refuse: 401 }, viewport: desk }, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await full(page).click();
    await page.locator('#chat-input').fill('Encore là ?');
    await page.locator('#chat-input').press('Enter');
    await page.getByRole('heading', { name: 'Un jeton de lecture pour discuter' }).waitFor();
    assert.equal(await page.getByRole('tab', { name: 'Suivi' }).isVisible(), true, 'onglets cachés : pas de sortie');
  });
});

test('se déconnecter en plein écran ne laisse pas la page de connexion collée à la barre du haut', async () => {
  await withPanel({ issues: [question], comments: thread, viewport: desk }, async ({ page, url }) => {
    await openAgent(page, url);
    await full(page).click();
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await page.locator('#login').waitFor();
    assert.equal(await page.evaluate(() => document.body.classList.contains('chat-fullscreen')), false);
  });
});

test('sur un écran moyen (800 px), le plein écran garde le nom du projet comme titre pour les lecteurs d\'écran', async () => {
  await withPanel({ issues: [question], comments: thread, repos, viewport: { width: 800, height: 800 } }, async ({ page, url }) => {
    await openAgent(page, url);
    await full(page).click();
    await normal(page).waitFor();
    assert.equal(await page.getByRole('heading', { level: 1, name: 'r' }).count(), 1, 'titre vide');
  });
});

test('passer en plein écran, rétrécir la fenêtre à la taille d\'un téléphone puis l\'agrandir ne remet pas le plein écran', async () => {
  await withPanel({ issues: [question], comments: thread, viewport: desk }, async ({ page, url }) => {
    await openAgent(page, url);
    await full(page).click();
    await page.setViewportSize({ width: 500, height: 800 });
    await page.waitForFunction(() => !document.body.classList.contains('chat-fullscreen'));
    await page.setViewportSize(desk);
    if (!(await page.locator('#chat-full').isVisible())) await page.locator('.conv', { hasText: 'Comment publier ?' }).click();
    await full(page).waitFor();
    assert.equal(await page.getByRole('tab', { name: 'Suivi' }).isVisible(), true);
  });
});

// Review #556, finding 3: the full-screen rule removes main's padding; the general page must not inherit it.
test('ouvrir les Réglages généraux en plein écran quitte le plein écran et garde la marge', async () => {
  await withPanel({ issues: [question], comments: thread, repos, viewport: desk }, async ({ page, url }) => {
    await openAgent(page, url);
    await full(page).click();
    await normal(page).waitFor();
    await page.getByRole('button', { name: 'Réglages généraux' }).click();
    await page.getByRole('heading', { name: 'Réglages généraux', level: 1 }).waitFor();
    assert.equal(await page.evaluate(() => document.body.classList.contains('chat-fullscreen')), false);
    const pad = await page.evaluate(() => { const s = getComputedStyle(document.querySelector('main')); return [parseFloat(s.paddingLeft), parseFloat(s.paddingRight)]; });
    assert.ok(pad.every((p) => p >= 16), `main padding ${pad.join(' / ')} px`);
  });
});

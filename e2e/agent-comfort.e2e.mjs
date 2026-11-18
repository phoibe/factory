// Journeys of issue #460: the « Agent » tab made comfortable (copy, callouts, width, height, waiting time, images).
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const AGENT = '<!-- factory-agent -->';
const ANSWER = [
  'Voici la commande à lancer :',
  '```',
  'npm run build',
  '```',
  '⚠️ Attention, cela prend du temps.',
  '',
  '✅ Le site est en ligne.',
  '',
  '➡️ Répondez « go » pour continuer.',
].join('\n');
const question = issue(7, 'Comment publier ?', ['factory:question'], { comments: 1, body: 'Comment publier ?' });
const thread = { 7: [{ id: 1, body: `${AGENT}\n${ANSWER}`, user: { login: 'o' }, author_association: 'OWNER', created_at: new Date().toISOString(), html_url: 'https://github.com/o/r/issues/7#c1' }] };

async function openConversation(page, url) {
  await page.goto(url);
  await page.getByRole('tab', { name: 'Agent', exact: true }).click();
  await page.locator('.conv', { hasText: 'Comment publier ?' }).click();
  await page.locator('#chat-messages .msg.agent').first().waitFor();
}

test('sur ordinateur, la zone de saisie de l\'onglet Agent est visible en bas sans défiler', async () => {
  await withPanel({ issues: [question], comments: thread, viewport: { width: 1600, height: 900 } }, async ({ page, url }) => {
    await openConversation(page, url);
    const box = await page.locator('#chat').boundingBox();
    assert.ok(box.width <= 1100, `largeur ${box.width}`); // issue #473: the usual width by default
    const input = await page.locator('#chat-input').boundingBox();
    assert.ok(input.y + input.height <= 900, 'zone de saisie sous le bas de l\'écran');
    assert.equal(await page.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight + 1), true, 'la page défile');
    // Reading comfort: the answer does not run from edge to edge.
    const answer = await page.locator('#chat-messages .msg.agent').boundingBox();
    assert.ok(answer.width <= 870, `réponse de ${answer.width} px`);
  });
});

test('en réduisant la hauteur de la fenêtre, la zone de saisie reste visible', async () => {
  await withPanel({ issues: [question], comments: thread, viewport: { width: 1280, height: 900 } }, async ({ page, url }) => {
    await openConversation(page, url);
    await page.setViewportSize({ width: 1280, height: 620 });
    await page.waitForTimeout(200);
    const input = await page.locator('#chat-input').boundingBox();
    assert.ok(input.y + input.height <= 620, `bas de la saisie à ${input.y + input.height}`);
  });
});

test('les autres onglets gardent leur largeur actuelle', async () => {
  await withPanel({ issues: [question], comments: thread, viewport: { width: 1600, height: 900 } }, async ({ page, url }) => {
    await openConversation(page, url);
    await page.getByRole('tab', { name: 'Suivi' }).click();
    const main = await page.locator('main').boundingBox();
    assert.ok(main.width <= 1100, `largeur ${main.width}`);
  });
});

test('sur téléphone, la zone de saisie reste visible', async () => {
  await withPanel({ issues: [question], comments: thread, viewport: { width: 390, height: 700 } }, async ({ page, url }) => {
    await openConversation(page, url);
    const input = await page.locator('#chat-input').boundingBox();
    assert.ok(input.y + input.height <= 700);
  });
});

test('le bouton « copier » du bloc de commande copie la commande et affiche « Copié ✓ »', async () => {
  await withPanel({ issues: [question], comments: thread }, async ({ page, url, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openConversation(page, url);
    await page.locator('.code .copy-code').click();
    await page.locator('.code .copy-code', { hasText: 'Copié ✓' }).waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'npm run build');
  });
});

test('le bouton sous la réponse copie la réponse entière', async () => {
  await withPanel({ issues: [question], comments: thread }, async ({ page, url, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openConversation(page, url);
    await page.getByRole('button', { name: 'Copier la réponse' }).click();
    await page.locator('.copy-answer', { hasText: 'Copié ✓' }).waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), ANSWER);
  });
});

test('si la copie est refusée, le bouton dit « Copie impossible »', async () => {
  await withPanel({ issues: [question], comments: thread }, async ({ page, url }) => {
    await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('no')) } }); });
    await openConversation(page, url);
    await page.locator('.code .copy-code').click();
    await page.locator('.code .copy-code', { hasText: 'Copie impossible' }).waitFor();
  });
});

test('pendant l\'attente, le temps écoulé défile à côté de « Réfléchit… » avec le délai habituel', async () => {
  const waiting = issue(8, 'Une question', ['factory:question', 'factory:running'], { body: 'Une question', created_at: new Date(Date.now() - 42000).toISOString() });
  await withPanel({ issues: [waiting] }, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.locator('.conv', { hasText: 'Une question' }).click();
    const meta = page.locator('.thinking-meta');
    await meta.waitFor();
    assert.match(await meta.innerText(), /^Réfléchit… 0:4\d · d'habitude, environ 1 à 2 min$/);
    const before = await meta.locator('[data-since]').innerText();
    await page.waitForFunction((was) => document.querySelector('.thinking-meta [data-since]')?.textContent !== was, before, { timeout: 5000 });
  });
});

test('mes messages sont à droite dans une bulle colorée, ceux de l\'agent sans bulle', async () => {
  await withPanel({ issues: [question], comments: thread, viewport: { width: 1280, height: 800 } }, async ({ page, url }) => {
    await openConversation(page, url);
    const mine = page.locator('#chat-messages .msg.me .bubble');
    const agent = page.locator('#chat-messages .msg.agent .bubble');
    const style = (loc) => loc.evaluate((n) => { const s = getComputedStyle(n); return { bg: s.backgroundColor, pad: s.paddingLeft }; });
    assert.notEqual((await style(mine)).bg, 'rgba(0, 0, 0, 0)');
    assert.equal((await style(agent)).bg, 'rgba(0, 0, 0, 0)');
    assert.equal((await style(agent)).pad, '0px');
    const list = await page.locator('#chat-messages').boundingBox();
    const me = await page.locator('#chat-messages .msg.me').boundingBox();
    assert.ok(me.x + me.width > list.x + list.width * 0.7, 'mon message n\'est pas à droite');
  });
});

test('une réponse avec ⚠️, ✅ ou ➡️ montre l\'encadré orange, vert ou bleu', async () => {
  await withPanel({ issues: [question], comments: thread }, async ({ page, url }) => {
    await openConversation(page, url);
    assert.equal(await page.locator('.callout.warn', { hasText: 'Attention, cela prend du temps.' }).count(), 1);
    assert.equal(await page.locator('.callout.ok', { hasText: 'Le site est en ligne.' }).count(), 1);
    assert.equal(await page.locator('.callout.todo', { hasText: 'Répondez « go »' }).count(), 1);
    const bg = await page.locator('.callout.warn').evaluate((n) => getComputedStyle(n).backgroundColor);
    assert.notEqual(bg, 'rgba(0, 0, 0, 0)');
  });
});

test('un clic sur une image l\'agrandit ; Échap ou un clic à côté la referme', async () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const path = 'attachments/chat/1-abc.png';
  const withImage = issue(9, 'Regardez', ['factory:question'], { body: `Regardez\n\n<!-- factory-image: ${path} -->` });
  await withPanel({ issues: [withImage] }, async ({ page, url }) => {
    await page.route(`**/contents/${path}?ref=factory-attachments`, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(png, 'base64') }));
    await page.goto(url);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.locator('.conv', { hasText: 'Regardez' }).click();
    await page.locator('.shot img[src^="blob:"]').waitFor();
    await page.locator('.shot').click();
    await page.locator('#lightbox[open]').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('#lightbox:not([open])').waitFor({ state: 'attached' });
    await page.locator('.shot').click();
    await page.locator('#lightbox[open]').waitFor();
    await page.mouse.click(5, 5);
    await page.locator('#lightbox:not([open])').waitFor({ state: 'attached' });
  });
});

test('le temps écoulé ne repart pas de zéro quand la réponse est arrivée mais que l\'agent n\'a pas fini', async () => {
  const at = (ago) => new Date(Date.now() - ago).toISOString();
  const running = issue(10, 'Encore une question', ['factory:question', 'factory:running'], { body: 'Encore une question', created_at: at(50000), comments: 1 });
  const answered = { 10: [{ id: 3, body: `${AGENT}\nVoici.`, user: { login: 'o' }, author_association: 'OWNER', created_at: at(2000) }] };
  await withPanel({ issues: [running], comments: answered }, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.locator('.conv', { hasText: 'Encore une question' }).click();
    const time = page.locator('.thinking-meta [data-since]');
    await time.waitFor();
    assert.match(await time.innerText(), /^0:(4\d|5\d)$/);
  });
});

test('avec une longue conversation lue jusqu\'en bas, la page ne défile toujours pas', async () => {
  const long = Array.from({ length: 6 }, (_, i) => ({ id: 10 + i, body: `${AGENT}\n⚠️ Point ${i}.\n\n✅ Fait ${i}.\n\n${'Texte. '.repeat(40)}`, user: { login: 'o' }, author_association: 'OWNER', created_at: new Date().toISOString() }));
  await withPanel({ issues: [question], comments: { 7: long }, viewport: { width: 820, height: 700 } }, async ({ page, url }) => {
    await openConversation(page, url);
    await page.locator('#chat-messages').evaluate((n) => { n.scrollTop = n.scrollHeight; });
    await page.waitForTimeout(200);
    const { sh, ih } = await page.evaluate(() => ({ sh: document.scrollingElement.scrollHeight, ih: innerHeight }));
    assert.ok(sh <= ih + 1, `la page fait ${sh} px pour ${ih}`);
  });
});

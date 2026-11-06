// Journeys of issue #283: the « Agent » tab badge lights up when an answer arrives while the owner is elsewhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const AGENT = '<!-- factory-agent -->\n';
const at = (s) => new Date(Date.now() - s * 1000).toISOString();
const mine = (text, s = 20) => ({ body: text, created_at: at(s), html_url: 'u', user: { login: 'o' }, author_association: 'OWNER' });
const answer = (text) => ({ body: AGENT + text, created_at: at(0), html_url: 'u', user: { login: 'o' }, author_association: 'OWNER' });

// Conversation 7 waits for the agent (my last message, agent running); 8 is a quiet one.
function setup() {
  const waiting = issue(7, 'Combien de demandes en cours ?', ['factory:question', 'factory:running'], { comments: 1, body: 'Bonjour' });
  const quiet = issue(8, 'Une autre question', ['factory:question'], { comments: 0, body: 'Salut' });
  const comments = { 7: [mine('Et maintenant ?')] };
  const reply = () => {
    comments[7].push(answer('Deux demandes.'));
    waiting.comments = 2;
    waiting.labels = [{ name: 'factory:question' }];
    waiting.updated_at = at(0);
  };
  return { issues: [waiting, quiet], comments, reply };
}

const seen = () => localStorage.setItem('factory.chat.seen.o/r', JSON.stringify({ 7: 1, 8: 0 }));
const badge = (page) => page.locator('#tab-chat #chat-badge:not([hidden])');

test('je pars sur « Suivi » avant la réponse : quelques secondes après, un « 1 » apparaît à côté de « Agent »', async () => {
  const { issues, comments, reply } = setup();
  await withPanel({ issues, comments }, async ({ page, url }) => {
    await page.addInitScript(seen);
    await page.goto(url);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.locator('.conv', { hasText: 'Combien de demandes' }).click();
    await page.locator('.conv.current').waitFor();
    await page.getByRole('tab', { name: 'Suivi' }).click();
    reply();
    await badge(page).waitFor({ timeout: 10_000 });
    assert.match(await page.locator('#tab-chat').innerText(), /^Agent\s*1$/);
  });
});

test('je reviens sur « Agent » avec la conversation affichée : la réponse est là et la pastille disparaît', async () => {
  const { issues, comments, reply } = setup();
  await withPanel({ issues, comments }, async ({ page, url }) => {
    await page.addInitScript(seen);
    await page.goto(url);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.locator('.conv', { hasText: 'Combien de demandes' }).click();
    await page.locator('.conv.current').waitFor();
    await page.getByRole('tab', { name: 'Paramètres' }).click();
    reply();
    await badge(page).waitFor({ timeout: 10_000 });
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.locator('#chat-messages .msg.agent', { hasText: 'Deux demandes.' }).waitFor();
    await badge(page).waitFor({ state: 'detached', timeout: 5000 });
  });
});

test('je reviens avec une autre conversation ouverte : la pastille reste et la conversation répondue affiche « Nouvelle réponse » jusqu\'à ce que je l\'ouvre', async () => {
  const { issues, comments, reply } = setup();
  await withPanel({ issues, comments }, async ({ page, url }) => {
    await page.addInitScript(seen);
    await page.goto(url);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.locator('.conv', { hasText: 'Une autre question' }).click();
    await page.locator('.conv.current', { hasText: 'Une autre question' }).waitFor();
    await page.getByRole('tab', { name: 'Suivi' }).click();
    reply();
    await badge(page).waitFor({ timeout: 10_000 });
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    const answered = page.locator('.conv', { hasText: 'Combien de demandes' });
    await answered.locator('text=Nouvelle réponse').waitFor();
    await page.waitForTimeout(1500);
    assert.equal(await badge(page).count(), 1);
    await answered.click();
    await page.locator('#chat-messages .msg.agent', { hasText: 'Deux demandes.' }).waitFor();
    await badge(page).waitFor({ state: 'detached', timeout: 5000 });
  });
});

test('une conversation « Terminée » ne fait jamais apparaître la pastille', async () => {
  const { issues, comments, reply } = setup();
  await withPanel({ issues, comments }, async ({ page, url }) => {
    await page.addInitScript(seen);
    await page.goto(url);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.locator('.conv', { hasText: 'Une autre question' }).click();
    await page.getByRole('tab', { name: 'Suivi' }).click();
    reply();
    issues[0].state = 'closed';
    await page.waitForTimeout(9000);
    assert.equal(await badge(page).count(), 0);
  });
});

test('en mode instantané, je pars sur « Paramètres » pendant que la réponse s\'écrit : la pastille s\'allume quand elle est terminée', async () => {
  await withPanel({ chatServer: { delay: 2500, answer: 'Deux demandes en cours.' } }, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.getByRole('button', { name: 'Nouvelle conversation' }).click();
    await page.locator('#chat-input').fill('Combien de demandes en cours ?');
    await page.locator('#chat-send').click();
    await page.getByRole('tab', { name: 'Paramètres' }).click();
    await badge(page).waitFor({ timeout: 10_000 });
    assert.match(await page.locator('#tab-chat').innerText(), /^Agent\s*1$/);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.locator('#chat-messages .msg.agent', { hasText: 'Deux demandes en cours.' }).waitFor();
    await badge(page).waitFor({ state: 'detached', timeout: 5000 });
  });
});

test('en mode instantané, si je reste sur « Agent » à regarder la réponse s\'écrire, la pastille ne s\'allume pas', async () => {
  await withPanel({ chatServer: { delay: 500, answer: 'Deux demandes en cours.' } }, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.getByRole('button', { name: 'Nouvelle conversation' }).click();
    await page.locator('#chat-input').fill('Combien de demandes en cours ?');
    await page.locator('#chat-send').click();
    await page.locator('#chat-messages .msg.agent', { hasText: 'Deux demandes en cours.' }).waitFor();
    await page.getByRole('tab', { name: 'Suivi' }).click();
    await page.waitForTimeout(2000);
    assert.equal(await badge(page).count(), 0);
  });
});

test('j\'écris à l\'agent puis je pars aussitôt sur « Suivi » : mon propre message n\'allume pas la pastille', async () => {
  const conv = issue(7, 'Question', ['factory:question'], { comments: 1, body: 'Bonjour' });
  const comments = { 7: [answer('Salut')] };
  await withPanel({ issues: [conv], comments }, async ({ page, url }) => {
    await page.addInitScript(seen);
    // GitHub lists the new comment a moment after it was posted.
    await page.route('https://api.github.com/repos/o/r/issues/7/comments', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      setTimeout(() => { conv.comments = 2; comments[7].push(mine('Et alors ?', 0)); }, 1500);
      return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
    });
    await page.goto(url);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.locator('.conv', { hasText: 'Question' }).click();
    await page.locator('.conv.current').waitFor();
    await page.locator('#chat-input').fill('Et alors ?');
    await page.locator('#chat-send').click();
    await page.waitForTimeout(300);
    await page.getByRole('tab', { name: 'Suivi' }).click();
    await page.waitForTimeout(7000);
    assert.equal(await badge(page).count(), 0);
  });
});

test('sur téléphone, revenir sur « Agent » sans rouvrir la conversation laisse la pastille et « Nouvelle réponse »', async () => {
  const { issues, comments, reply } = setup();
  await withPanel({ issues, comments, viewport: { width: 390, height: 800 } }, async ({ page, url }) => {
    await page.addInitScript(seen);
    await page.goto(url);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.locator('.conv', { hasText: 'Combien de demandes' }).click();
    await page.locator('#chat-back').click();
    await page.getByRole('tab', { name: 'Suivi' }).click();
    reply();
    await badge(page).waitFor({ timeout: 10_000 });
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    const answered = page.locator('.conv', { hasText: 'Combien de demandes' });
    await answered.locator('text=Nouvelle réponse').waitFor();
    await page.waitForTimeout(2500);
    assert.equal(await badge(page).count(), 1);
    await answered.click();
    await page.locator('#chat-messages .msg.agent', { hasText: 'Deux demandes.' }).waitFor();
    await badge(page).waitFor({ state: 'detached', timeout: 5000 });
  });
});

test('avec un lecteur d\'écran, sur « Suivi », j\'entends « Nouvelle réponse de l\'agent » quand la pastille s\'allume', async () => {
  const { issues, comments, reply } = setup();
  await withPanel({ issues, comments }, async ({ page, url }) => {
    await page.addInitScript(seen);
    await page.goto(url);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.locator('.conv', { hasText: 'Combien de demandes' }).click();
    await page.getByRole('tab', { name: 'Suivi' }).click();
    reply();
    await badge(page).waitFor({ timeout: 10_000 });
    await page.locator('#chat-badge-announce', { hasText: 'Nouvelle réponse de l\'agent.' }).waitFor({ state: 'attached', timeout: 2000 });
  });
});

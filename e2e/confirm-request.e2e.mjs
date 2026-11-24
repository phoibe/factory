// Journeys of issue #492: a bug or a feature the agent proposes is only created after the owner's click.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const AGENT = '<!-- factory-agent -->';
const proposal = { kind: 'feature', title: 'Exporter mes données', body: 'Il veut exporter ses recettes en PDF.' };
const created = (writes) => writes.filter((w) => w.method === 'POST' && w.path === '/repos/o/r/issues' && w.body.title === proposal.title);

async function ask(page, url, text = 'Créez une feature pour exporter') {
  await page.goto(url);
  await page.getByRole('tab', { name: 'Agent', exact: true }).click();
  await page.locator('#chat-input').fill(text);
  await page.locator('#chat-send').click();
  return page.locator('.proposal', { hasText: proposal.title });
}

test('quand l\'agent propose une feature, je vois une carte « Créer cette demande » / « Ignorer », et rien n\'est créé', async () => {
  await withPanel({ chatServer: { answer: 'Voici la fiche que je vous propose.', issues: [proposal] } }, async ({ page, url, writes }) => {
    const card = await ask(page, url);
    await card.waitFor();
    await card.getByRole('button', { name: 'Créer cette demande' }).waitFor();
    await card.getByRole('button', { name: 'Ignorer' }).waitFor();
    assert.match(await card.innerText(), /fonctionnalité/i);
    await card.getByText('Lire le texte').click();
    await card.getByText('Il veut exporter ses recettes en PDF.').waitFor();
    assert.equal(created(writes).length, 0);
  });
});

test('en cliquant « Ignorer », la carte affiche « Ignorée » et rien n\'est créé', async () => {
  await withPanel({ chatServer: { answer: 'Voici.', issues: [proposal] } }, async ({ page, url, writes }) => {
    const card = await ask(page, url);
    await card.getByRole('button', { name: 'Ignorer' }).click();
    await card.getByText('Ignorée').waitFor();
    assert.equal(await card.getByRole('button').count(), 0);
    assert.equal(created(writes).length, 0);
  });
});

test('en cliquant « Créer cette demande », la carte affiche « Créée » avec le lien, et la demande est au tableau', async () => {
  await withPanel({ chatServer: { answer: 'Voici.', issues: [proposal] } }, async ({ page, url, writes }) => {
    const card = await ask(page, url);
    await card.getByRole('button', { name: 'Créer cette demande' }).dblclick();
    const link = card.getByRole('link', { name: /Voir la demande/ });
    await link.waitFor();
    await card.getByText('Créée').waitFor();
    assert.match(await link.getAttribute('href'), /^https:\/\/github\.com\/o\/r\/issues\/\d+$/);
    // A double click creates one request only, kept in the queue like any feature asked for.
    assert.equal(created(writes).length, 1);
    assert.deepEqual(created(writes)[0].body.labels, ['factory:feature', 'factory:kept']);
    await page.getByRole('tab', { name: 'Suivi' }).click();
    await page.locator('#board').getByText(proposal.title).first().waitFor();
  });
});

test('une carte laissée sans réponse est toujours là, avec ses deux boutons, quand je reviens', async () => {
  await withPanel({ chatServer: { answer: 'Voici.', issues: [proposal] } }, async ({ page, url }) => {
    const card = await ask(page, url, 'Je peux exporter ?');
    await card.waitFor();
    await page.waitForFunction(() => !document.getElementById('chat-send').disabled);
    await page.reload();
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.locator('.conv', { hasText: 'Je peux exporter ?' }).click();
    const again = page.locator('.proposal', { hasText: proposal.title });
    await again.getByRole('button', { name: 'Créer cette demande' }).waitFor();
    await again.getByRole('button', { name: 'Ignorer' }).waitFor();
  });
});

test('si la création échoue, la carte le dit et je peux réessayer', async () => {
  await withPanel({ chatServer: { answer: 'Voici.', issues: [proposal], refuseIssues: 1 } }, async ({ page, url, writes }) => {
    const card = await ask(page, url);
    await card.getByRole('button', { name: 'Créer cette demande' }).click();
    await card.getByText(/n'a pas pu être créée/).waitFor();
    await card.getByRole('button', { name: 'Créer cette demande' }).click();
    await card.getByRole('link', { name: /Voir la demande/ }).waitFor();
    assert.equal(created(writes).filter((w) => w.ok).length, 1);
  });
});

test('après « Signaler un bug », le bug ne démarre qu\'après mon clic sur « Créer cette demande »', async () => {
  // Without the chat server, the conversation is an issue and the agent answers in a comment.
  const conv = issue(7, 'Le bouton plante', ['factory:question'], { body: 'Le bouton Enregistrer plante', comments: 2 });
  const comments = { 7: [
    { id: 70, body: 'Créez une issue « Signaler un bug » à partir de cette conversation, puis donnez-moi le lien.', user: { login: 'o' }, author_association: 'OWNER', created_at: new Date(Date.now() - 120000).toISOString(), html_url: 'u70' },
    { id: 71, body: `${AGENT}\nVoici le bug que je vous propose.\n\n<creer-issue type="bug" titre="Enregistrer plante">\nLe bouton plante.\n</creer-issue>`, user: { login: 'o' }, author_association: 'OWNER', created_at: new Date(Date.now() - 60000).toISOString(), html_url: 'u71' },
  ] };
  await withPanel({ issues: [conv], comments }, async ({ page, url, writes }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.locator('.conv', { hasText: 'Le bouton plante' }).click();
    const card = page.locator('.proposal', { hasText: 'Enregistrer plante' });
    await card.getByRole('button', { name: 'Créer cette demande' }).waitFor();
    assert.match(await card.innerText(), /bug/i);
    assert.equal(await page.locator('#chat-messages').getByText('creer-issue').count(), 0);
    const bugs = () => writes.filter((w) => w.method === 'POST' && w.path === '/repos/o/r/issues' && w.body.title === 'Enregistrer plante');
    assert.equal(bugs().length, 0);
    await card.getByRole('button', { name: 'Créer cette demande' }).click();
    await card.getByRole('link', { name: /Voir la demande/ }).waitFor();
    assert.equal(bugs().length, 1);
    assert.deepEqual(bugs()[0].body.labels, ['factory:bug']);
    // The choice is kept in the conversation, hidden from the chat and ignored by the factory (agent marker).
    const note = writes.find((w) => w.method === 'POST' && w.path === '/repos/o/r/issues/7/comments');
    assert.match(note.body.body, /^<!-- factory-agent -->\n<!-- factory-proposal: 71-0 created https:\/\/github\.com\/o\/r\/issues\/\d+ -->$/);
  });
});

test('si j\'écris un message pendant la création, la demande n\'est créée qu\'une fois et la carte reste « Créée »', async () => {
  const conv = issue(7, 'Le bouton plante', ['factory:question'], { body: 'Le bouton Enregistrer plante', comments: 1 });
  const comments = { 7: [
    { id: 71, body: `${AGENT}\nVoici.\n\n<creer-issue type="bug" titre="Enregistrer plante">\nLe bouton plante.\n</creer-issue>`, user: { login: 'o' }, author_association: 'OWNER', created_at: new Date(Date.now() - 60000).toISOString(), html_url: 'u71' },
  ] };
  await withPanel({ issues: [conv], comments, issueDelay: 1500 }, async ({ page, url, writes }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.locator('.conv', { hasText: 'Le bouton plante' }).click();
    const card = page.locator('.proposal', { hasText: 'Enregistrer plante' });
    await card.getByRole('button', { name: 'Créer cette demande' }).click();
    await page.locator('#chat-input').fill('Merci !');
    await page.locator('#chat-send').click();
    await card.getByRole('link', { name: /Voir la demande/ }).waitFor();
    await page.waitForTimeout(1000);
    assert.equal(await card.getByRole('button', { name: 'Créer cette demande' }).count(), 0);
    assert.equal(writes.filter((w) => w.method === 'POST' && w.path === '/repos/o/r/issues' && w.body.title === 'Enregistrer plante').length, 1);
  });
});

test('mon propre choix sur une carte ne compte pas comme une nouvelle réponse de l\'agent', async () => {
  const conv = issue(7, 'Le bouton plante', ['factory:question'], { body: 'Le bouton Enregistrer plante', comments: 1 });
  const comments = { 7: [
    { id: 71, body: `${AGENT}\nVoici.\n\n<creer-issue type="bug" titre="Enregistrer plante">\nLe bouton plante.\n</creer-issue>`, user: { login: 'o' }, author_association: 'OWNER', created_at: new Date(Date.now() - 60000).toISOString(), html_url: 'u71' },
  ] };
  await withPanel({ issues: [conv], comments }, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.locator('.conv', { hasText: 'Le bouton plante' }).click();
    const card = page.locator('.proposal', { hasText: 'Enregistrer plante' });
    await card.getByRole('button', { name: 'Ignorer' }).click();
    await card.getByText('Ignorée').waitFor();
    // The decision is one more comment on the conversation: it is already seen.
    const seen = await page.evaluate(() => JSON.parse(localStorage.getItem('factory.chat.seen.o/r') || '{}')['7']);
    assert.equal(seen, 2);
  });
});

// Review #556, finding 10: the request is made, then its choice cannot be written in the conversation. After a
// reload the card must still say « Créée » with its link (never a second « Créer cette demande »), and the choice is
// written at a later refresh.
test('une demande créée dont le choix n\'a pas pu être enregistré reste « Créée » après un rechargement, puis est enregistrée', async () => {
  const failing = new Set();
  await withPanel({ chatServer: { answer: 'Voici.', issues: [proposal] }, failing }, async ({ page, url, writes }) => {
    const card = await ask(page, url, 'Je peux exporter ?');
    await card.getByRole('button', { name: 'Créer cette demande' }).waitFor();
    await page.waitForFunction(() => !document.getElementById('chat-send').disabled);
    const file = writes.find((w) => /\/contents\/chats\/.+\.json$/.test(w.path)).path;
    failing.add(file); // the network drops on the record
    await card.getByRole('button', { name: 'Créer cette demande' }).click();
    await page.getByText('Demande créée, mais ce choix n\'a pas pu être enregistré dans la conversation.').waitFor();
    const link = await card.getByRole('link', { name: /Voir la demande/ }).getAttribute('href');
    const open = async () => {
      await page.reload();
      await page.getByRole('tab', { name: 'Agent', exact: true }).click();
      await page.locator('.conv', { hasText: 'Je peux exporter ?' }).click();
      const again = page.locator('.proposal', { hasText: proposal.title });
      await again.getByText('Créée').waitFor();
      assert.equal(await again.getByRole('link', { name: /Voir la demande/ }).getAttribute('href'), link);
      assert.equal(await again.getByRole('button', { name: 'Créer cette demande' }).count(), 0);
    };
    await open(); // still not recorded
    failing.delete(file);
    const tries = writes.filter((w) => w.path === file).length;
    await open(); // the refresh records it
    const recorded = () => writes.filter((w) => w.path === file).slice(tries).map((w) => JSON.parse(Buffer.from(w.body.content, 'base64').toString()))
      .some((c) => c.messages.flatMap((m) => m.proposals || []).some((p) => p.state === 'created' && p.url === link));
    for (let i = 0; i < 100 && !recorded(); i++) await page.waitForTimeout(100);
    assert.ok(recorded(), 'the choice is written in the conversation');
    await page.waitForFunction(() => !Object.keys(localStorage).some((k) => k.startsWith('factory.chat.created.')));
    assert.equal(created(writes).filter((w) => w.ok).length, 1, 'one request only');
  });
});

// Review #556, round 2, finding 1: another project picked while the request is being created. The mark and the
// decision comment belong to the first project, never to the one on screen; back there, the card is « Créée » and a
// second request cannot be made.
const issueMode = () => {
  const conv = issue(7, 'Le bouton plante', ['factory:question'], { body: 'Le bouton Enregistrer plante', comments: 1 });
  const comments = { 7: [{ id: 71, body: `${AGENT}\nVoici.\n\n<creer-issue type="bug" titre="Enregistrer plante">\nLe bouton plante.\n</creer-issue>`, user: { login: 'o' }, author_association: 'OWNER', created_at: new Date(Date.now() - 60000).toISOString(), html_url: 'u71' }] };
  return { issues: [conv], comments, repos: ['o/r', 'o/autre'], issueDelay: 2000, viewport: { width: 1280, height: 800 } };
};
const bugs = (writes) => writes.filter((w) => w.method === 'POST' && w.path === '/repos/o/r/issues' && w.body.title === 'Enregistrer plante' && w.ok).length;
async function openCard(page) {
  await page.getByRole('tab', { name: 'Agent', exact: true }).click();
  await page.locator('.conv', { hasText: 'Le bouton plante' }).click();
  return page.locator('.proposal', { hasText: 'Enregistrer plante' });
}
const pick = (page, name) => (name === 'autre' ? page.locator('#projects .project-item', { hasText: 'autre' })
  : page.locator('#projects .project-item').filter({ hasNotText: 'autre' }).first()).click();

test('changer de projet pendant que la demande se crée ne touche pas l\'autre projet, et la carte reste « Créée »', async () => {
  await withPanel(issueMode(), async ({ page, url, writes }) => {
    const posts = [];
    await page.route(/https:\/\/api\.github\.com\/repos\/o\/[^/]+\/issues\/7\/comments/, (route) => {
      const req = route.request();
      if (req.method() !== 'POST') return route.fallback();
      posts.push(new URL(req.url()).pathname);
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"Server Error"}' });
    });
    await page.goto(url);
    const card = await openCard(page);
    await card.getByRole('button', { name: 'Créer cette demande' }).click();
    await page.waitForTimeout(300);
    await pick(page, 'autre');
    await page.waitForTimeout(3000);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.waitForTimeout(2000);
    assert.deepEqual(posts.filter((p) => p.startsWith('/repos/o/autre/')), []);
    assert.equal(await page.evaluate(() => localStorage.getItem('factory.chat.created.o/autre')), null);
    await pick(page, 'r');
    const again = await openCard(page);
    await again.getByText('Créée').waitFor();
    assert.equal(await again.getByRole('button', { name: 'Créer cette demande' }).count(), 0);
    assert.equal(bugs(writes), 1);
  });
});

test('revenir sur le projet pendant que la demande se crée ne permet pas d\'en créer une seconde', async () => {
  await withPanel(issueMode(), async ({ page, url, writes }) => {
    await page.goto(url);
    const card = await openCard(page);
    await card.getByRole('button', { name: 'Créer cette demande' }).click();
    await page.waitForTimeout(300);
    await pick(page, 'autre');
    await page.waitForTimeout(300);
    await pick(page, 'r');
    const again = await openCard(page);
    const create = again.getByRole('button', { name: /Créer cette demande|Création…/ });
    if (await create.count()) await create.click({ force: true, timeout: 1000 }).catch(() => {});
    await again.getByText('Créée').waitFor({ timeout: 10_000 });
    await page.waitForTimeout(2500);
    assert.equal(bugs(writes), 1, 'one request only');
  });
});

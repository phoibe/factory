// Journeys of issue #395: the chat server only receives a read-only token; the full token never leaves the browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel } from './fixture.mjs';

const agent = (page) => page.getByRole('tab', { name: 'Agent', exact: true }).click();
const card = (page) => page.getByRole('heading', { name: 'Un jeton de lecture pour discuter' });
const paste = async (page, value) => {
  await page.getByLabel('Jeton de lecture', { exact: true }).fill(value);
  await page.getByRole('button', { name: 'Valider le jeton' }).click();
};
const send = async (page, text) => {
  await page.locator('#chat-input').fill(text);
  await page.locator('#chat-send').click();
};

test('en ouvrant l\'onglet « Agent » sans second jeton, je vois la carte avec le bouton vers GitHub prérempli en lecture seule', async () => {
  await withPanel({ chatServer: { answer: 'Bonjour.' }, readToken: false }, async ({ page, url }) => {
    await page.goto(url);
    await agent(page);
    await card(page).waitFor();
    const href = await page.getByRole('link', { name: /Créer le jeton de lecture sur GitHub/ }).getAttribute('href');
    const u = new URL(href);
    assert.equal(u.searchParams.get('contents'), 'read');
    assert.equal(u.searchParams.get('expires_in'), '365');
    assert.equal(u.searchParams.get('issues'), null);
    assert.equal(await page.locator('#chat-input').isVisible(), false);
  });
});

test('coller mon jeton complet dans cette case est refusé avec un message clair', async () => {
  await withPanel({ chatServer: { answer: 'Bonjour.' }, readToken: false }, async ({ page, url, chatCalls }) => {
    await page.goto(url);
    await agent(page);
    await paste(page, 'test');
    await page.getByText('Ce jeton peut modifier vos projets : créez-en un en lecture seule avec le bouton ci-dessus.').waitFor();
    // Another token that can write is caught by GitHub's answer, not only by being the same.
    await paste(page, 'github_pat_ecriture');
    await page.getByText('Ce jeton peut modifier vos projets').waitFor();
    await card(page).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('factory.chatToken')), null);
    assert.deepEqual(chatCalls, []);
  });
});

// Issue #558: only the new (fine-grained) tokens, and only those that cannot change anything.
test('un jeton de l\'ancien type est refusé avec un message clair', async () => {
  await withPanel({ chatServer: { answer: 'Bonjour.' }, readToken: false }, async ({ page, url, chatCalls }) => {
    const asked = [];
    page.on('request', (r) => { if (r.url().startsWith('https://api.github.com/') && r.headers().authorization === 'Bearer ghp_ancien') asked.push(r.url()); });
    await page.goto(url);
    await agent(page);
    await paste(page, 'ghp_ancien');
    await page.getByText('Ce type de jeton n\'est pas accepté : créez-en un avec le bouton ci-dessus.').waitFor();
    assert.deepEqual(asked, []); // refused before asking GitHub anything
    // A token GitHub gives scopes to is of the old type too, whatever it starts with.
    await page.locator('#read-token-error').evaluate((e) => { e.textContent = ''; });
    await paste(page, 'github_pat_scopes');
    await page.getByText('Ce type de jeton n\'est pas accepté : créez-en un avec le bouton ci-dessus.').waitFor();
    await card(page).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('factory.chatToken')), null);
    assert.deepEqual(chatCalls, []);
  });
});

test('un jeton de l\'ancien type déjà enregistré est refusé par le serveur avec le même message clair, et redemandé', async () => {
  await withPanel({ chatServer: { answer: 'Bonjour.', refuse: 403, code: 'classic' } }, async ({ page, url }) => {
    await page.goto(url);
    await agent(page);
    await send(page, 'Encore là ?');
    await card(page).waitFor();
    await page.locator('#read-token-error', { hasText: 'Ce type de jeton n\'est pas accepté : créez-en un avec le bouton ci-dessus.' }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('factory.chatToken')), null);
    assert.equal(await page.locator('#chat-input').inputValue(), 'Encore là ?');
  });
});

test('un jeton qui peut lancer des tâches automatiques est refusé', async () => {
  await withPanel({ chatServer: { answer: 'Bonjour.' }, readToken: false }, async ({ page, url, chatCalls }) => {
    await page.goto(url);
    await agent(page);
    await paste(page, 'github_pat_actions');
    await page.getByText('Ce jeton peut modifier vos projets : créez-en un en lecture seule avec le bouton ci-dessus.').waitFor();
    await card(page).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('factory.chatToken')), null);
    assert.deepEqual(chatCalls, []);
  });
});

// Review #556: a classic token with delete_repo answers the write probes like a read-only one; its scopes give it away.
// Issue #558: any scope at all, read-only ones too, makes it a token of the old type.
for (const scope of ['delete_repo', 'read:user, read:org']) {
  test(`un jeton classique (${scope}) est refusé comme jeton de l'ancien type et rien n'est enregistré`, async () => {
    await withPanel({ chatServer: { answer: 'Bonjour.' }, readToken: false, scopes: { github_pat_lecture: scope } }, async ({ page, url, chatCalls }) => {
      await page.goto(url);
      await agent(page);
      await paste(page, 'github_pat_lecture');
      await page.getByText('Ce type de jeton n\'est pas accepté : créez-en un avec le bouton ci-dessus.').waitFor();
      await card(page).waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem('factory.chatToken')), null);
      assert.deepEqual(chatCalls, []);
    });
  });
}

test('un jeton créé avec le bouton est accepté', async () => {
  await withPanel({ chatServer: { answer: 'Bonjour.' }, readToken: false }, async ({ page, url, probes }) => {
    await page.goto(url);
    await agent(page);
    await paste(page, 'github_pat_lecture');
    await page.locator('#chat-input').waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('factory.chatToken')), 'github_pat_lecture');
    // Every probe was tried (each with an empty body), the commit statuses on the project's real last commit.
    const tried = probes.filter((p) => p.token === 'Bearer github_pat_lecture').map((p) => `${p.method} ${p.path}`).sort();
    assert.deepEqual(tried, [
      'POST /repos/o/r/actions/variables', 'POST /repos/o/r/deployments', 'POST /repos/o/r/environments/github-pages/variables',
      'POST /repos/o/r/hooks', 'POST /repos/o/r/issues', 'POST /repos/o/r/keys', 'POST /repos/o/r/pages/deployments', 'POST /repos/o/r/pulls',
      `POST /repos/o/r/statuses/${'c0ffee'.repeat(6)}c0ff`, 'POST /user/keys', 'PUT /repos/o/r/actions/oidc/customization/sub',
      'PUT /repos/o/r/actions/secrets/FACTORY_WRITE_PROBE', 'PUT /repos/o/r/contents/.factory-write-probe',
    ]);
  });
});

test('un jeton créé avec le bouton est accepté même quand il ne peut pas lire la dernière modification du projet', async () => {
  await withPanel({ chatServer: { answer: 'Bonjour.' }, readToken: false, tokenCheck: { head: 404 } }, async ({ page, url, probes }) => {
    await page.goto(url);
    await agent(page);
    await paste(page, 'github_pat_lecture');
    await page.locator('#chat-input').waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('factory.chatToken')), 'github_pat_lecture');
    assert.ok(probes.some((p) => p.method === 'POST' && p.path === `/repos/o/r/statuses/${'0'.repeat(40)}`));
  });
});

for (const [why, tokenCheck] of [['sa lecture de la dernière modification', { head: 'limited' }], ['une limite secondaire sur une vérification', { secondaryLimit: true }]]) {
  test(`si GitHub freine le jeton (${why}), le message dit que GitHub ne répond pas et le jeton n'est pas gardé`, async () => {
    await withPanel({ chatServer: { answer: 'Bonjour.' }, readToken: false, tokenCheck }, async ({ page, url, chatCalls }) => {
      await page.goto(url);
      await agent(page);
      await paste(page, 'github_pat_lecture');
      await page.locator('#read-token-error', { hasText: 'GitHub ne répond pas, réessayez dans un instant.' }).waitFor();
      await card(page).waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem('factory.chatToken')), null);
      assert.deepEqual(chatCalls, []);
    });
  });
}

test('avec le jeton de lecture, une conversation fonctionne, est retrouvée après rechargement, et la demande proposée par l\'agent apparaît dans le tableau', async () => {
  const issues = [{ kind: 'feature', title: 'Exporter mes données', body: 'Il veut exporter.' }];
  await withPanel({ chatServer: { answer: 'Non, pas encore.', issues }, readToken: false }, async ({ page, url, chatCalls, writes }) => {
    await page.goto(url);
    await agent(page);
    await paste(page, 'github_pat_lecture');
    await page.locator('#chat-input').waitFor();
    await send(page, 'Je peux exporter ?');
    // The request is created only once the owner confirms it on its card (issue #492).
    await page.locator('.proposal', { hasText: 'Exporter mes données' }).getByRole('button', { name: 'Créer cette demande' }).click();
    await page.locator('.proposal').getByRole('link', { name: /Voir la demande/ }).waitFor();
    // The server got the read token only; the panel created the issue and saved the conversation with the full one.
    assert.deepEqual(chatCalls.map((c) => c.token), ['Bearer github_pat_lecture']);
    const made = writes.find((w) => w.method === 'POST' && w.path === '/repos/o/r/issues' && w.body.title === 'Exporter mes données');
    assert.deepEqual(made.body.labels, ['factory:feature', 'factory:kept']);
    await page.waitForFunction(() => !document.getElementById('chat-send').disabled);
    await page.reload();
    await agent(page);
    await page.locator('.conv', { hasText: 'Je peux exporter ?' }).click();
    await page.locator('#chat-messages').getByText('Non, pas encore.').waitFor();
    await page.getByRole('tab', { name: 'Suivi' }).click();
    await page.locator('#board').getByText('Exporter mes données').first().waitFor();
  });
});

test('le QR code ouvre sur le téléphone une discussion qui marche sans rien recoller', async () => {
  await withPanel({ chatServer: { answer: 'Bonjour du téléphone.' } }, async ({ page, url, context, chatCalls }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url });
    await page.goto(url);
    await page.getByRole('button', { name: 'Sur mon téléphone' }).click();
    await page.getByRole('button', { name: 'Copier le lien' }).click();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(link, /#jeton=test&lecture=github_pat_lecture$/);
    // The phone: nothing stored yet, only the link (the fixture's GitHub answers this page only, so it is reused).
    await page.evaluate(() => localStorage.clear());
    await page.goto('about:blank');
    await page.goto(link);
    assert.equal(await page.evaluate(() => localStorage.getItem('factory.chatToken')), 'github_pat_lecture');
    await agent(page);
    await page.locator('#chat-input').waitFor();
    assert.equal(await card(page).count(), 0);
    await send(page, 'Salut');
    await page.locator('#chat-messages').getByText('Bonjour du téléphone.').waitFor();
    assert.deepEqual(chatCalls.map((c) => c.token), ['Bearer github_pat_lecture']);
  });
});

test('après « Se déconnecter », l\'onglet « Agent » redemande les deux jetons', async () => {
  await withPanel({ chatServer: { answer: 'Bonjour.' } }, async ({ page, url }) => {
    await page.goto(url);
    await agent(page);
    await page.locator('#chat-input').waitFor();
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await page.getByRole('heading', { name: 'Connectez le panneau à GitHub' }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('factory.chatToken')), null);
    await page.locator('#token').fill('test');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await agent(page);
    await card(page).waitFor();
  });
});

test('si GitHub refuse le jeton de lecture (expiré), l\'onglet « Agent » le redemande et mon message reste dans la zone de saisie', async () => {
  await withPanel({ chatServer: { answer: 'Bonjour.', refuse: 401 } }, async ({ page, url }) => {
    await page.goto(url);
    await agent(page);
    await send(page, 'Encore là ?');
    await card(page).waitFor();
    await page.locator('#read-token-error', { hasText: 'GitHub a refusé votre jeton de lecture' }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('factory.chatToken')), null);
    assert.equal(await page.evaluate(() => localStorage.getItem('factory.token')), 'test');
    assert.equal(await page.locator('#chat-input').inputValue(), 'Encore là ?');
  });
});

test('si l\'enregistrement échoue, la réponse reste affichée avec la mention, et mon message n\'est pas renvoyé', async () => {
  const failing = new Set(['/repos/o/r/contents/index.json']);
  await withPanel({ chatServer: { answer: 'Voici la réponse.' }, failing }, async ({ page, url, chatCalls }) => {
    await page.goto(url);
    await agent(page);
    await send(page, 'Une question');
    await page.locator('#chat-messages').getByText('Cette réponse n\'a pas pu être enregistrée.').waitFor();
    await page.locator('#chat-messages').getByText('Voici la réponse.').waitFor();
    await page.waitForFunction(() => !document.getElementById('chat-send').disabled);
    assert.equal(await page.locator('#chat-input').inputValue(), '');
    assert.equal(chatCalls.length, 1);
  });
});

test('deux messages de suite dans la même conversation sont bien enregistrés tous les deux', async () => {
  await withPanel({ chatServer: { answer: 'Réponse.' } }, async ({ page, url, chatCalls }) => {
    await page.goto(url);
    await agent(page);
    for (const [i, text] of ['Premier', 'Deuxième', 'Troisième'].entries()) {
      await send(page, text);
      await page.waitForFunction((n) => !document.getElementById('chat-send').disabled && document.querySelectorAll('#chat-messages .msg').length >= n, (i + 1) * 2);
    }
    assert.equal(chatCalls.length, 3);
    assert.equal(await page.locator('#chat-messages').getByText('pas pu être enregistrée').count(), 0);
    assert.equal(await page.locator('#toast.show').count(), 0, await page.locator('#toast').textContent());
    await page.reload();
    await agent(page);
    await page.locator('.conv', { hasText: 'Premier' }).click();
    await page.locator('#chat-messages').getByText('Troisième').waitFor();
  });
});

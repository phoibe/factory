// Journeys of issue #572: the panel never reloads by itself; a banner under the top bar says a new version is online.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { withPanel, issue } from './fixture.mjs';

const TEXT = 'Une nouvelle version du tableau de bord est disponible.';
const desk = { width: 1600, height: 900 };
const phone = { width: 390, height: 844 };
const banner = (page) => page.getByRole('status').filter({ hasText: TEXT });
const reloadButton = (page) => page.getByRole('button', { name: 'Recharger' });

// The page runs build `served`; version.json says `live` is online. Both may change on the way.
async function versions(page, url) {
  const v = { served: 'abc1234', live: 'abc1234' };
  await page.route(url, async (route) => { const res = await route.fetch(); route.fulfill({ response: res, body: (await res.text()).replace('__BUILD__', v.served) }); });
  await page.route('**/version.json*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ build: v.live }) }));
  return v;
}
// A mark on this very page: a reload forgets it.
const mark = (page) => page.evaluate(() => { window.__samePage = true; });
const samePage = (page) => page.evaluate(() => window.__samePage === true);
// The panel checks the version every minute and when the owner comes back to the tab. Once the banner shows it no
// longer asks; until then, the check is over when version.json's answer has arrived and been read.
async function check(page) {
  const asks = (await page.locator('#new-version[hidden]').count()) > 0;
  const answered = asks ? page.waitForResponse((r) => r.url().includes('version.json')).then((r) => r.finished()) : null;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await answered;
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
}
const newVersion = async (page, v, build = 'def5678') => { v.live = build; await check(page); };

async function open(page, url) {
  await page.goto(url);
  await page.locator('.ticket', { hasText: 'Une carte' }).waitFor();
  await mark(page);
}
const board = [issue(1, 'Une carte', ['factory:feature', 'factory:queued'])];
// « Recharger » refused: the strip says what to do first, in place of its usual sentence; no toast, no reload.
async function refused(page, why) {
  await page.locator('#new-version', { hasText: why }).waitFor({ timeout: 3000 });
  assert.equal(await page.locator('#new-version', { hasText: TEXT }).count(), 0, 'la phrase habituelle est restée à côté du refus');
  assert.equal(await page.locator('#toast.show').count(), 0, 'le refus est dit dans un message à part');
  assert.equal(await reloadButton(page).isVisible(), true, '« Recharger » a disparu');
  await page.waitForTimeout(500);
  assert.equal(await samePage(page), true, 'la page s\'est rechargée');
}
// The cause is gone: the usual sentence is back, and the page did not reload by itself.
async function sentenceBack(page) {
  await banner(page).waitFor({ timeout: 3000 });
  assert.equal(await samePage(page), true, 'la page s\'est rechargée toute seule');
}

test('une nouvelle version est en ligne : le bandeau apparaît et la page ne se recharge pas toute seule', async () => {
  await withPanel({ issues: board }, async ({ page, url }) => {
    const v = await versions(page, url);
    await open(page, url);
    await newVersion(page, v);
    await banner(page).waitFor();
    assert.equal(await banner(page).isVisible(), true);
    await check(page);
    await page.waitForTimeout(1000);
    assert.equal(await samePage(page), true, 'la page s\'est rechargée toute seule');
    assert.equal(await banner(page).isVisible(), true);
  });
});

test('le bandeau apparaît sous la barre du haut, en couleur neutre, sans croix', async () => {
  await withPanel({ issues: board, viewport: desk }, async ({ page, url }) => {
    const v = await versions(page, url);
    await open(page, url);
    await newVersion(page, v);
    await banner(page).waitFor();
    const bar = await page.locator('header.top .brand').boundingBox();
    const box = await banner(page).boundingBox();
    assert.ok(box.y >= bar.y + bar.height, `bandeau à ${box.y}, barre jusqu'à ${bar.y + bar.height}`);
    const tabs = await page.getByRole('tab', { name: 'Suivi' }).boundingBox();
    assert.ok(box.y + box.height <= tabs.y, 'le bandeau est au-dessus des onglets');
    assert.equal(await banner(page).getByRole('button').count(), 1, 'un seul bouton, pas de croix');
    const colors = await banner(page).evaluate((n) => {
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      const probe = document.createElement('i'); probe.style.color = accent; document.body.append(probe);
      const blue = getComputedStyle(probe).color; probe.remove();
      const b = n.querySelector('button');
      return { blue, all: [getComputedStyle(n).backgroundColor, getComputedStyle(n).color, getComputedStyle(b).backgroundColor, getComputedStyle(b).color, getComputedStyle(b).borderColor] };
    });
    assert.ok(!colors.all.includes(colors.blue), `bleu signal dans le bandeau : ${colors.all.join(', ')}`);
  });
});

test('le bandeau reste visible sur « Suivi », « Agent », « Paramètres » et dans les « Réglages généraux »', async () => {
  await withPanel({ issues: board, viewport: desk }, async ({ page, url }) => {
    const v = await versions(page, url);
    await open(page, url);
    await newVersion(page, v);
    await banner(page).waitFor();
    for (const tab of ['Agent', 'Paramètres', 'Suivi']) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      assert.equal(await banner(page).isVisible(), true, `pas de bandeau sur « ${tab} »`);
    }
    await page.getByRole('button', { name: 'Réglages généraux' }).click();
    await page.getByRole('heading', { name: 'Réglages généraux', level: 1 }).waitFor();
    assert.equal(await banner(page).isVisible(), true, 'pas de bandeau dans les Réglages généraux');
    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(200);
    const box = await banner(page).boundingBox();
    assert.ok(box.y >= 0 && box.y < desk.height, 'le bandeau suit la barre du haut quand on fait défiler');
  });
});

test('sur téléphone, le bandeau est visible en entier, sans faire déborder la page', async () => {
  await withPanel({ issues: board, viewport: phone }, async ({ page, url }) => {
    const v = await versions(page, url);
    await open(page, url);
    await newVersion(page, v);
    await banner(page).waitFor();
    const box = await banner(page).boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= phone.width + 1, `bandeau de ${box.x} à ${box.x + box.width}`);
    const button = await reloadButton(page).boundingBox();
    assert.ok(button.x + button.width <= phone.width && button.height >= 44, 'bouton coupé ou trop petit');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'la page déborde');
  });
});

test('l\'onglet « Agent » en plein écran garde le bandeau et sa zone de saisie visible', async () => {
  await withPanel({ issues: board, viewport: desk }, async ({ page, url }) => {
    const v = await versions(page, url);
    await open(page, url);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.getByRole('button', { name: 'Plein écran' }).click();
    await page.getByRole('button', { name: 'Largeur normale' }).waitFor();
    await newVersion(page, v);
    await banner(page).waitFor();
    assert.equal(await banner(page).isVisible(), true);
    await page.waitForTimeout(300);
    const input = await page.locator('#chat-input').boundingBox();
    assert.ok(input.y + input.height <= desk.height, 'zone de saisie sous le bas de l\'écran');
  });
});

test('le bouton Recharger recharge la page, qui s\'ouvre sans bandeau', async () => {
  await withPanel({ issues: board }, async ({ page, url }) => {
    const v = await versions(page, url);
    await open(page, url);
    await newVersion(page, v);
    await banner(page).waitFor();
    v.served = v.live; // the reloaded page is the new version
    const loaded = page.waitForEvent('load');
    await reloadButton(page).click();
    await loaded;
    assert.equal(await samePage(page), false, 'la page ne s\'est pas rechargée');
    await page.locator('.ticket', { hasText: 'Une carte' }).waitFor();
    await check(page);
    assert.equal(await banner(page).count(), 0, 'le bandeau est encore là');
  });
});

test('un seul bandeau même si plusieurs versions arrivent', async () => {
  await withPanel({ issues: board }, async ({ page, url }) => {
    const v = await versions(page, url);
    await open(page, url);
    for (const build of ['def5678', 'aaa1111', 'bbb2222']) {
      await newVersion(page, v, build);
      await check(page);
    }
    await banner(page).waitFor();
    assert.equal(await page.getByText(TEXT).count(), 1, 'la phrase est écrite plusieurs fois');
    assert.equal(await page.locator('.new-version').count(), 1, 'plusieurs bandeaux');
    assert.equal(await page.getByRole('button', { name: 'Recharger' }).count(), 1, 'plusieurs boutons Recharger');
    const nodes = await page.locator('#new-version-text').evaluate((n) => [...n.childNodes].map((c) => c.textContent));
    assert.deepEqual(nodes, [TEXT], 'la phrase du bandeau est en double');
    assert.equal(await samePage(page), true);
  });
});

test('un réglage non enregistré : Recharger ne recharge pas et le bandeau dit d\'enregistrer d\'abord ; une fois enregistré, il recharge', async () => {
  await withPanel({ issues: board }, async ({ page, url }) => {
    const v = await versions(page, url);
    await open(page, url);
    await page.getByRole('tab', { name: 'Paramètres' }).click();
    await page.locator('#stage-plan').click();
    await newVersion(page, v);
    await banner(page).waitFor();
    await reloadButton(page).click();
    await refused(page, 'Enregistrez d\'abord vos réglages, puis rechargez.');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByText('Paramètres enregistrés. Ils s\'appliquent dans une minute environ.').waitFor({ timeout: 5000 });
    await sentenceBack(page);
    const loaded = page.waitForEvent('load');
    await reloadButton(page).click();
    await loaded;
    assert.equal(await samePage(page), false);
  });
});

test('un réglage général non enregistré : Recharger ne recharge pas et dit d\'enregistrer d\'abord', async () => {
  await withPanel({ issues: board, factoryFiles: { 'settings.json': { machine: 'dev-server' } } }, async ({ page, url }) => {
    const v = await versions(page, url);
    await open(page, url);
    await page.getByRole('button', { name: 'Réglages généraux' }).click();
    await page.locator('#general:not([aria-busy])').waitFor();
    await page.getByRole('combobox', { name: 'Écriture du code' }).selectOption('sonnet');
    await newVersion(page, v);
    await banner(page).waitFor();
    await reloadButton(page).click();
    await refused(page, 'Enregistrez d\'abord vos réglages, puis rechargez.');
  });
});

test('un message en cours dans l\'onglet Agent : Recharger ne recharge pas et dit d\'envoyer ou d\'effacer', async () => {
  await withPanel({ issues: board }, async ({ page, url }) => {
    const v = await versions(page, url);
    await open(page, url);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.locator('#chat-input').fill('Un message pas fini');
    await newVersion(page, v);
    await banner(page).waitFor();
    await reloadButton(page).click();
    await refused(page, 'Envoyez ou effacez d\'abord votre message, puis rechargez.');
    assert.equal(await page.locator('#chat-input').inputValue(), 'Un message pas fini');
    await page.locator('#chat-input').fill('');
    await sentenceBack(page);
  });
});

test('une réponse de l\'agent en train d\'arriver : Recharger ne recharge pas et dit d\'attendre la fin', async () => {
  await withPanel({ issues: board, chatServer: { delay: 6000, answer: 'Bien reçu.' } }, async ({ page, url }) => {
    const v = await versions(page, url);
    await open(page, url);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.getByRole('button', { name: 'Nouvelle conversation' }).click();
    await page.locator('#chat-input').fill('Combien de demandes en cours ?');
    await page.locator('#chat-send').click();
    await newVersion(page, v);
    await banner(page).waitFor();
    await reloadButton(page).click();
    await refused(page, 'Attendez la fin de la réponse de l\'agent, puis rechargez.');
    await page.getByText('Bien reçu.').waitFor({ timeout: 15_000 });
    await sentenceBack(page);
  });
});

test('le titre de l\'onglet n\'est réécrit que si le nombre change', async () => {
  const issues = [issue(1, 'Une carte', ['factory:feature', 'factory:queued']), issue(2, 'Une spec', ['factory:feature', 'factory:spec-review'])];
  await withPanel({ issues }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('.ticket', { hasText: 'Une spec' }).waitFor();
    assert.equal(await page.title(), '(1) Factory');
    await page.evaluate(() => {
      window.__titles = [];
      new MutationObserver(() => window.__titles.push(document.title)).observe(document.querySelector('title'), { childList: true, characterData: true, subtree: true });
    });
    // The board changes, but nothing more waits for the owner.
    issues.push(issue(3, 'Une autre carte', ['factory:feature', 'factory:queued']));
    await page.locator('.ticket', { hasText: 'Une autre carte' }).waitFor({ timeout: 20_000 });
    assert.deepEqual(await page.evaluate(() => window.__titles), [], 'le titre a été réécrit sans changer');
    // A card arrives in « À vous de jouer »: the title changes.
    issues.push(issue(4, 'Une autre spec', ['factory:feature', 'factory:spec-review']));
    await page.waitForFunction(() => document.title === '(2) Factory', null, { timeout: 20_000 });
    assert.deepEqual(await page.evaluate(() => window.__titles), ['(2) Factory']);
  });
});

// Phone: the conversation of the Agent tab fills the screen. Opens one (a new one if the list shows).
async function openConversation(page) {
  await page.getByRole('tab', { name: 'Agent', exact: true }).click();
  await page.locator('#chat.viewing, #chat-new:visible').first().waitFor();
  if (!(await page.locator('#chat.viewing').count())) await page.locator('#chat-new').click();
  await page.locator('#chat.viewing .chat-thread').waitFor();
}
// The strip is at the very top, full width, « Recharger » answers a tap, and the conversation starts under it.
async function aboveConversation(page, size, label) {
  const strip = await page.locator('#new-version').boundingBox();
  assert.ok(Math.abs(strip.y) <= 1, `${label} : bandeau à y=${strip.y}`);
  assert.ok(Math.abs(strip.x) <= 1 && Math.abs(strip.width - size.width) <= 1, `${label} : bandeau de ${strip.x} sur ${strip.width}`);
  assert.equal(await hitReload(page), true, `${label} : « Recharger » est caché par la conversation`);
  const back = await page.locator('#chat-back').boundingBox();
  assert.ok(back.y >= strip.y + strip.height - 1, `${label} : le retour (${back.y}) est sous le bandeau (${strip.y + strip.height})`);
  const input = await page.locator('#chat-input').boundingBox();
  assert.ok(input.y + input.height <= size.height, `${label} : zone de saisie sous le bas de l'écran (${input.y + input.height})`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${label} : la page déborde`);
}
// What a tap at the centre of « Recharger » reaches.
const hitReload = (page) => page.locator('#new-version-reload').evaluate((b) => {
  const r = b.getBoundingClientRect();
  return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === b;
});

test('sur téléphone, dans une conversation de l\'onglet Agent, le bandeau reste visible au-dessus de la conversation', async () => {
  for (const size of [phone, { width: 650, height: 844 }]) {
    await withPanel({ issues: board, viewport: size, chatServer: { answer: 'Bien reçu.' } }, async ({ page, url }) => {
      const v = await versions(page, url);
      await open(page, url);
      await openConversation(page);
      await newVersion(page, v);
      await banner(page).waitFor();
      await aboveConversation(page, size, `${size.width} px`);
      // Banner shown first, conversation opened after.
      await page.locator('#chat-back').click();
      await openConversation(page);
      await aboveConversation(page, size, `${size.width} px, conversation rouverte`);
      // Another tab, the conversation left open (the conversation covers the tabs: chosen from the keyboard's side).
      await page.getByRole('tab', { name: 'Suivi' }).evaluate((t) => t.click());
      await page.locator('#chat').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('#chat.viewing').count(), 1, 'la conversation n\'est plus ouverte : le cas n\'est pas testé');
      const strip = await page.locator('#new-version').boundingBox();
      assert.ok(strip.y > 0, `${size.width} px, Suivi : bandeau à y=${strip.y}`);
      assert.equal(await hitReload(page), true, `${size.width} px, Suivi : « Recharger » ne répond pas`);
    });
  }
});

// Phone, scrolled down: the bar is gone, the strip alone sits at the top of the screen.
async function stripOnTop(page, label) {
  await page.waitForFunction(() => Math.abs(document.getElementById('new-version').getBoundingClientRect().y) <= 1, null, { timeout: 2000 }).catch(() => {});
  const strip = await page.locator('#new-version').boundingBox();
  assert.ok(Math.abs(strip.y) <= 1, `${label} : bandeau à y=${strip.y}`);
  const brand = await page.locator('.brand').boundingBox();
  assert.ok(brand.y + brand.height <= 1, `${label} : la barre est encore là (bas à ${brand.y + brand.height})`);
  assert.equal(await hitReload(page), true, `${label} : « Recharger » ne répond pas`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${label} : la page déborde`);
}
async function toBottom(page) {
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  assert.ok(await page.evaluate(() => scrollY > 200), 'la page est trop courte pour défiler : le cas n\'est pas testé');
}

test('sur téléphone, le bandeau reste en haut de l\'écran quand on fait défiler', async () => {
  await withPanel({ issues: board, viewport: phone }, async ({ page, url }) => {
    const v = await versions(page, url);
    await open(page, url);
    await newVersion(page, v);
    await banner(page).waitFor();
    await page.getByRole('tab', { name: 'Paramètres' }).click();
    const nav = await page.locator('nav').boundingBox();
    const before = await page.locator('#new-version').boundingBox();
    assert.ok(before.y >= nav.y + nav.height - 1, `en haut de la page, le bandeau (${before.y}) est sous la barre (${nav.y + nav.height})`);
    await toBottom(page);
    await stripOnTop(page, 'Paramètres');
    await page.evaluate(() => scrollTo(0, 0));
    await page.getByText('Plus', { exact: true }).click(); // on a phone the button is in « Plus »
    await page.getByRole('button', { name: 'Réglages généraux' }).click();
    await page.getByRole('heading', { name: 'Réglages généraux', level: 1 }).waitFor();
    await page.locator('#general:not([aria-busy])').waitFor();
    await toBottom(page);
    await stripOnTop(page, 'Réglages généraux');
  });
  // The banner arrives while the owner is already far down the page.
  await withPanel({ issues: board, viewport: phone }, async ({ page, url }) => {
    const v = await versions(page, url);
    await open(page, url);
    await page.getByRole('tab', { name: 'Paramètres' }).click();
    await toBottom(page);
    await newVersion(page, v);
    await banner(page).waitFor();
    await stripOnTop(page, 'arrivé en bas de page');
  });
});

test('sur téléphone, le refus s\'affiche dans le bandeau, au-dessus de la conversation, et le brouillon reste', async () => {
  for (const size of [phone, { width: 320, height: 700 }]) {
    await withPanel({ issues: board, viewport: size, chatServer: { answer: 'Bien reçu.' } }, async ({ page, url }) => {
      const v = await versions(page, url);
      await open(page, url);
      await openConversation(page);
      await page.locator('#chat-input').fill('Un brouillon');
      await newVersion(page, v);
      await banner(page).waitFor();
      await reloadButton(page).click();
      await refused(page, 'Envoyez ou effacez d\'abord votre message, puis rechargez.');
      await page.waitForTimeout(300); // the conversation follows the taller strip
      const label = `${size.width} px`;
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${label} : la page déborde`);
      const strip = await page.locator('#new-version').boundingBox();
      const back = await page.locator('#chat-back').boundingBox();
      assert.ok(back.y >= strip.y + strip.height - 1, `${label} : le retour (${back.y}) est sous le bandeau (${strip.y + strip.height})`);
      const input = await page.locator('#chat-input').boundingBox();
      assert.ok(input.y + input.height <= size.height, `${label} : zone de saisie sous le bas de l'écran`);
      assert.equal(await page.locator('#chat-input').inputValue(), 'Un brouillon');
    });
  }
});

test('le bandeau est une bande fine, avec un bouton sans cadre', async () => {
  await withPanel({ issues: board, viewport: desk }, async ({ page, url }) => {
    const v = await versions(page, url);
    await open(page, url);
    await newVersion(page, v);
    await banner(page).waitFor();
    const look = await page.locator('#new-version').evaluate((n) => {
      const s = getComputedStyle(n), b = getComputedStyle(n.querySelector('button'));
      return { top: s.paddingTop, bottom: s.paddingBottom, color: s.color, border: b.borderTopColor, background: b.backgroundColor };
    });
    assert.equal(look.top, '6px');
    assert.equal(look.bottom, '6px');
    assert.equal(look.border, 'rgba(0, 0, 0, 0)', 'le bouton a un cadre');
    assert.equal(look.background, 'rgba(0, 0, 0, 0)', 'le bouton a un fond');
    assert.ok((await reloadButton(page).boundingBox()).height >= 44, 'zone de clic sous 44 px');
    for (let i = 0; i < 12 && await page.evaluate(() => document.activeElement?.id) !== 'new-version-reload'; i++) await page.keyboard.press('Tab');
    const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return { id: document.activeElement.id, style: s.outlineStyle, width: s.outlineWidth, color: s.outlineColor }; });
    assert.equal(ring.id, 'new-version-reload', 'la touche Tab n\'atteint pas « Recharger »');
    assert.equal(ring.style, 'solid');
    assert.equal(ring.width, '2px');
    assert.equal(ring.color, look.color, 'le contour de focus n\'est pas couleur encre');
  });
});

test('sur téléphone, le texte et le bouton restent sur une seule rangée', async () => {
  for (const size of [phone, { width: 320, height: 700 }]) {
    await withPanel({ issues: board, viewport: size }, async ({ page, url }) => {
      const v = await versions(page, url);
      await open(page, url);
      await newVersion(page, v);
      await banner(page).waitFor();
      const label = `${size.width} px`;
      const text = await page.locator('#new-version-text').boundingBox();
      const button = await reloadButton(page).boundingBox();
      assert.ok(Math.abs((text.y + text.height / 2) - (button.y + button.height / 2)) <= 1, `${label} : texte et bouton ne sont pas sur la même rangée`);
      assert.ok(button.x >= text.x + text.width - 1, `${label} : le bouton chevauche le texte`);
      assert.ok(button.x + button.width <= size.width - 15, `${label} : le bouton touche le bord`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${label} : la page déborde`);
      if (size.width === 320) assert.ok(text.height > 30, `${label} : le texte ne passe pas à la ligne (${text.height} px)`);
    });
  }
});

test('des images en attente dans l\'onglet Agent : Recharger ne recharge pas', async () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  await withPanel({ issues: board, chatServer: { answer: 'Bien reçu.' } }, async ({ page, url }) => {
    const v = await versions(page, url);
    await open(page, url);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.getByRole('button', { name: 'Nouvelle conversation' }).click();
    await page.locator('#chat-file').setInputFiles({ name: 'capture.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.locator('.pending-images img').first().waitFor();
    assert.equal(await page.locator('#chat-input').inputValue(), '', 'le texte doit être vide : seules les images retiennent');
    await newVersion(page, v);
    await banner(page).waitFor();
    await reloadButton(page).click();
    await refused(page, 'Envoyez ou effacez d\'abord votre message, puis rechargez.');
    assert.ok(await page.locator('.pending-images img').count() > 0, 'les images ont disparu');
  });
});

test('le bandeau est annoncé dès son apparition : sa zone d\'annonce est déjà là, vide, avant la nouvelle version', async () => {
  await withPanel({ issues: board }, async ({ page, url }) => {
    const v = await versions(page, url);
    await open(page, url);
    const before = await page.locator('#new-version').evaluate((n) => ({ role: n.getAttribute('role'), display: getComputedStyle(n).display, text: n.innerText.trim(), hidden: n.getAttribute('aria-hidden') }));
    assert.equal(before.role, 'status');
    assert.notEqual(before.display, 'none', 'la zone d\'annonce n\'existe pas avant : son apparition ne sera pas lue');
    assert.equal(before.hidden, null);
    assert.equal(before.text, '', 'la zone d\'annonce parle avant la nouvelle version');
    assert.equal(await reloadButton(page).count(), 0, '« Recharger » est atteignable avant la nouvelle version');
    // What the browser gives screen readers: a status region, already there.
    const ax = await (await page.context().newCDPSession(page)).send('Accessibility.getFullAXTree');
    assert.ok(ax.nodes.some((n) => n.role?.value === 'status' && !n.ignored), 'pas de zone d\'annonce dans l\'arbre d\'accessibilité');
    const box = await page.locator('#new-version').boundingBox();
    assert.ok(!box || (box.width <= 1 && box.height <= 1), `la zone d'annonce se voit avant la nouvelle version (${JSON.stringify(box)})`);
    await newVersion(page, v);
    await banner(page).waitFor();
    assert.equal(await page.getByRole('status').filter({ hasText: TEXT }).locator('#new-version-text').textContent(), TEXT);
  });
});

test('le bandeau, avec sa phrase ou un refus, ne présente aucune erreur d\'accessibilité, en clair et en sombre', async () => {
  const axe = await readFile(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
  for (const scheme of ['light', 'dark']) {
    await withPanel({ issues: board, viewport: desk }, async ({ page, url }) => {
      await page.emulateMedia({ colorScheme: scheme });
      const v = await versions(page, url);
      await open(page, url);
      await newVersion(page, v);
      await banner(page).waitFor();
      await page.evaluate(axe);
      const run = () => page.evaluate(() => window.axe.run(document.getElementById('new-version'), { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] }).then((r) => r.violations.map((x) => `${x.id}: ${x.nodes.map((n) => n.target.join(' ')).join(', ')}`)));
      assert.deepEqual(await run(), [], `${scheme}, phrase habituelle`);
      await page.getByRole('tab', { name: 'Paramètres' }).click();
      await page.locator('#stage-plan').click();
      await reloadButton(page).click();
      await page.locator('#new-version', { hasText: 'Enregistrez d\'abord vos réglages, puis rechargez.' }).waitFor();
      assert.deepEqual(await run(), [], `${scheme}, refus`);
      await reloadButton(page).focus();
      assert.deepEqual(await run(), [], `${scheme}, « Recharger » au clavier`);
    });
  }
});

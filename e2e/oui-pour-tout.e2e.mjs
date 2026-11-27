// « Oui pour tout » on a « Questions en cours » card (issue #620): when the agent's last round proposes « oui à tout »,
// one touch sends it, like « go » and « Ok ».
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const AGENT = '<!-- factory-agent -->';
const at = new Date().toISOString();
const comment = (id, body, login = 'o', association = 'OWNER') => ({ id, body, user: { login }, author_association: association, html_url: `https://github.com/o/r/issues/20#issuecomment-${id}`, created_at: at });
const ROUND = `${AGENT}\n1. Un seul compte par appareil ? ➡️ oui\n2. Mot de passe oublié par e-mail ? ➡️ oui\n\nRépondez par numéro (ex. « 1 oui, 2 non : … »), ou « oui à tout ».`;
const round = comment(1, ROUND);
const questions = (number = 20, labels = ['factory:feature', 'factory:grilling']) => issue(number, 'Ajouter un compte', labels, { comments: 1 });
const card = (page, n = 20) => page.locator(`.ticket.yours[data-number="${n}"]`);
const buttons = (page, n = 20) => card(page, n).locator('.card-actions').locator('a.button, button').allTextContents();
const sentOn = (writes, n) => writes.filter((w) => w.path.endsWith(`/issues/${n}/comments`)).map((w) => w.body.body);
async function waitFor(check, page) { for (let i = 0; i < 100 && !check(); i++) await page.waitForTimeout(100); }

test('la carte de questions montre « Oui pour tout » en bleu puis « Répondre »', async () => {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await withPanel({ issues: [questions()], comments: { 20: [round] }, viewport }, async ({ page, url }) => {
      await page.goto(url);
      await page.locator('button.go[data-go="20"]').waitFor();
      assert.deepEqual((await buttons(page)).map((t) => t.trim()), ['Oui pour tout', 'Répondre']);
      const go = card(page).locator('.card-actions > :first-child');
      assert.equal(await go.evaluate((n) => n.matches('button.go')), true);
      assert.equal(await page.locator('button.go[data-go="20"]').getAttribute('aria-label'), 'Oui pour tout pour #20 Ajouter un compte');
      // Blue like « go » / « Ok »; « Répondre » stays quiet, on the same line.
      const reply = card(page).locator('.card-actions a.button.secondary');
      assert.equal(await reply.textContent(), 'Répondre');
      const [a, b] = [await page.locator('button.go[data-go="20"]').boundingBox(), await reply.boundingBox()];
      assert.ok(Math.abs(a.y + a.height / 2 - (b.y + b.height / 2)) < 2, `same line at ${viewport.width}px`);
      assert.ok(b.x + b.width <= viewport.width, 'nothing overflows the screen');
    });
  }
});

test('la carte de questions d\'un nouveau projet montre aussi « Oui pour tout »', async () => {
  await withPanel({ issues: [questions(20, ['factory:project', 'factory:grilling'])], comments: { 20: [round] } }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('button.go[data-go="20"]').waitFor();
    assert.deepEqual((await buttons(page)).map((t) => t.trim()), ['Oui pour tout', 'Répondre']);
  });
});

test('ouvrir les questions avec « Répondre » laisse la carte dans « À vous de jouer »', async () => {
  await withPanel({ issues: [questions()], comments: { 20: [round] } }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('button.go[data-go="20"]').waitFor();
    await card(page).locator('a.button.secondary').click({ modifiers: ['ControlOrMeta'] });
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(500);
    assert.equal(await page.locator('.ticket.pending[data-number="20"]').count(), 0);
    assert.equal(await card(page).locator('button.go').textContent(), 'Oui pour tout');
  });
});

test('« Oui pour tout » envoie « oui à tout » et la carte passe en prise en compte', async () => {
  await withPanel({ issues: [questions()], comments: { 20: [round] }, writeDelay: 800 }, async ({ page, writes, url }) => {
    await page.goto(url);
    await page.locator('button.go[data-go="20"]').click();
    await page.waitForFunction(() => document.querySelector('button.go[data-go="20"]')?.textContent === 'Envoi…');
    await waitFor(() => sentOn(writes, 20).length, page);
    assert.deepEqual(sentOn(writes, 20), ['oui à tout']);
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('oui à tout'));
    assert.equal(await page.locator('#toast').textContent(), '« oui à tout » envoyé. L\'agent reprend avec vos réponses.');
    await page.locator('.ticket.pending[data-number="20"]').waitFor();
    const sent = page.locator('.ticket.pending[data-number="20"] button.go');
    assert.equal(await sent.textContent(), 'Envoyé ✓');
    assert.equal(await sent.isDisabled(), true);
    assert.equal(sentOn(writes, 20).length, 1, 'sent once');
  });
});

test('si l\'envoi de « oui à tout » échoue, un message le dit et le bouton redevient utilisable', async () => {
  await withPanel({ issues: [questions()], comments: { 20: [round] }, forbidden: new Set(['/repos/o/r/issues/20/comments']) }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('button.go[data-go="20"]').click();
    await page.waitForFunction(() => document.getElementById('toast').textContent.startsWith('Envoi impossible'), null, { timeout: 10000 });
    await page.waitForFunction(() => document.querySelector('button.go[data-go="20"]')?.textContent === 'Oui pour tout');
    assert.equal(await page.locator('button.go[data-go="20"]').isDisabled(), false);
    assert.equal(await page.locator('.ticket.pending[data-number="20"]').count(), 0);
  });
});

test('sans « oui à tout » proposé par l\'agent, la carte n\'a que « Répondre »', async () => {
  const noAll = comment(1, `${AGENT}\nQuel nom voulez-vous donner à l'application ?`);
  // A later agent message without it hides an older round that had it.
  await withPanel({ issues: [questions(), { ...questions(21), comments: 2 }], comments: { 20: [noAll], 21: [round, comment(2, `${AGENT}\nUne dernière question : quelle couleur ?`)] } }, async ({ page, url }) => {
    await page.goto(url);
    await card(page, 21).locator('a.button.secondary').waitFor();
    await page.waitForTimeout(800); // the comments are read after the cards
    for (const n of [20, 21]) {
      assert.deepEqual((await buttons(page, n)).map((t) => t.trim()), ['Répondre']);
      assert.equal(await card(page, n).locator('button.go').count(), 0);
    }
  });
});

test('un message qui n\'est pas de l\'agent et propose « oui à tout » ne fait pas apparaître le bouton', async () => {
  const noAll = comment(1, `${AGENT}\nQuel nom voulez-vous donner à l'application ?`);
  const stranger = comment(2, ROUND, 'x', 'NONE'); // carries the agent's marker, written by someone else
  const owner = comment(3, 'Répondez par numéro, ou « oui à tout ».'); // the owner's own words, not the agent's
  await withPanel({ issues: [{ ...questions(), comments: 2 }, { ...questions(21), comments: 2 }], comments: { 20: [noAll, stranger], 21: [noAll, owner] } }, async ({ page, url }) => {
    await page.goto(url);
    await card(page, 20).locator('a.button.secondary').waitFor();
    await page.waitForTimeout(800);
    assert.equal(await page.locator('button.go').count(), 0);
  });
});

test('les cartes « go » et « Ok » n\'ont pas changé', async () => {
  const pr = (number, title, labels) => issue(number, title, ['factory:feature', ...labels], { pull_request: { url: `https://api.github.com/repos/o/r/pulls/${number}` }, html_url: `https://github.com/o/r/pull/${number}` });
  const spec = { ...issue(30, 'Exporter en PDF', ['factory:feature', 'factory:spec-review']), comments: 1 };
  const visual = { ...pr(31, 'Partager une recette', ['factory:visual-review']), comments: 1 };
  await withPanel({ issues: [spec, visual], comments: { 30: [comment(1, ROUND)], 31: [comment(2, ROUND)] } }, async ({ page, writes, url }) => {
    await page.goto(url);
    await page.locator('button.go[data-go="31"]').waitFor();
    await page.waitForTimeout(800);
    assert.deepEqual((await buttons(page, 30)).map((t) => t.trim()), ['go']);
    assert.deepEqual((await buttons(page, 31)).map((t) => t.trim()), ['Ok', 'Captures']);
    await page.locator('button.go[data-go="30"]').click();
    await waitFor(() => sentOn(writes, 30).length, page);
    assert.deepEqual(sentOn(writes, 30), ['go']);
    await page.waitForFunction(() => document.getElementById('toast').textContent === '« go » envoyé. La construction démarre.');
  });
});

test('avant la lecture des messages, la carte de questions ne montre aucun bouton de réponse (pas de « Répondre » qui laisse sa place)', async () => {
  // The final « Oui pour tout » spot, measured on a board whose messages come at once (same layout).
  let spot = null;
  await withPanel({ issues: [questions()], comments: { 20: [round] } }, async ({ page, url }) => {
    await page.goto(url);
    const box = await page.locator('button.go[data-go="20"]').boundingBox();
    spot = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });
  await withPanel({ issues: [questions()], comments: { 20: [round] }, slowReads: [[/\/issues\/20\/comments/, 2500]] }, async ({ page, writes, url, context }) => {
    await page.goto(url);
    await card(page).waitFor();
    assert.deepEqual(await buttons(page), [], 'no answer button until the messages are read');
    let popups = 0;
    context.on('page', () => { popups++; });
    await page.mouse.click(spot.x, spot.y); // where « Répondre » stood before the fix, and « Oui pour tout » will
    await page.locator('button.go[data-go="20"]').waitFor();
    assert.deepEqual((await buttons(page)).map((t) => t.trim()), ['Oui pour tout', 'Répondre']);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(300);
    assert.equal(popups, 0, 'nothing opened');
    assert.deepEqual(sentOn(writes, 20), [], 'nothing sent');
    assert.equal(await page.locator('.ticket.pending[data-number="20"]').count(), 0);
  });
});

test('sur téléphone, un second toucher au même endroit n\'envoie pas la réponse de la carte suivante qui glisse sous le doigt', async () => {
  const older = new Date(Date.now() - 60_000).toISOString();
  const first = { ...questions(20), updated_at: older }, second = { ...questions(21), title: 'Partager une liste' };
  await withPanel({ issues: [first, second], comments: { 20: [round], 21: [comment(2, ROUND)] }, viewport: { width: 390, height: 844 }, device: { hasTouch: true, isMobile: true } }, async ({ page, writes, url }) => {
    await page.goto(url);
    await page.locator('button.go[data-go="21"]').waitFor();
    await page.waitForTimeout(500);
    const box = await page.locator('button.go[data-go="20"]').boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.touchscreen.tap(x, y);
    await page.locator('.ticket.pending[data-number="20"]').waitFor();
    await page.waitForTimeout(400); // the board slid: the next card's blue button is now under the finger
    assert.equal(await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest('button.go')?.dataset.go, [x, y]), '21');
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(1000);
    assert.deepEqual(sentOn(writes, 20), ['oui à tout']);
    assert.deepEqual(sentOn(writes, 21), [], 'the card that slid under the finger is not answered');
    // A deliberate touch, once it has settled, answers it.
    await page.touchscreen.tap(x, y);
    await waitFor(() => sentOn(writes, 21).length, page);
    assert.deepEqual(sentOn(writes, 21), ['oui à tout']);
  });
});

test('« Oui pour tout » garde sa largeur d\'un état à l\'autre, avec la même marge que « go » et « Ok »', async () => {
  await withPanel({ issues: [questions()], comments: { 20: [round] }, writeDelay: 1500 }, async ({ page, url }) => {
    await page.goto(url);
    const go = page.locator('button.go[data-go="20"]');
    await go.waitFor();
    const measure = () => go.evaluate((n) => {
      const range = document.createRange(); range.selectNodeContents(n);
      const r = n.getBoundingClientRect(), t = range.getBoundingClientRect();
      return { text: n.textContent, width: Math.round(r.width * 10) / 10, left: t.left - r.left - n.clientLeft, right: r.right - t.right - n.clientLeft }; // from the inner edge of the border
    });
    const idle = await measure();
    assert.ok(idle.left >= 12 && idle.right >= 12, `room on both sides of the label (${idle.left.toFixed(1)} / ${idle.right.toFixed(1)} px)`);
    await go.click();
    const sending = await measure();
    assert.equal(sending.text, 'Envoi…');
    await page.locator('.ticket.pending[data-number="20"] button.go').waitFor();
    const sent = await page.locator('.ticket.pending[data-number="20"] button.go').evaluate((n) => ({ text: n.textContent, width: Math.round(n.getBoundingClientRect().width * 10) / 10 }));
    assert.equal(sent.text, 'Envoyé ✓');
    assert.deepEqual([sending.width, sent.width], [idle.width, idle.width]);
  });
});

test('les zones de toucher de « Oui pour tout » et « Répondre » ne se chevauchent pas', async () => {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await withPanel({ issues: [questions()], comments: { 20: [round] }, viewport }, async ({ page, url }) => {
      await page.goto(url);
      await page.locator('button.go[data-go="20"]').waitFor();
      const zones = await card(page).locator('.card-actions > *').evaluateAll((nodes) => nodes.map((n) => {
        const r = n.getBoundingClientRect(), a = getComputedStyle(n, '::after');
        return { left: r.left - parseFloat(a.left) * -1, right: r.right - parseFloat(a.right) };
      }));
      assert.equal(zones.length, 2);
      assert.ok(zones[0].right <= zones[1].left, `${viewport.width}px: ${zones[0].right} <= ${zones[1].left}`);
    });
  }
});

test('une nouvelle série de questions a un « Oui pour tout » neuf', async () => {
  const thread = [round];
  const q = questions();
  await withPanel({ issues: [q], comments: { 20: thread } }, async ({ page, writes, url }) => {
    await page.goto(url);
    await page.locator('button.go[data-go="20"]').click();
    await waitFor(() => sentOn(writes, 20).length, page);
    await page.locator('.ticket.pending[data-number="20"] button.go:disabled').waitFor();
    // The agent takes the answer, then asks a new round.
    thread.push(comment(2, 'oui à tout'));
    Object.assign(q, { labels: [...q.labels, { name: 'factory:running' }], comments: 2, updated_at: new Date(Date.now() + 1000).toISOString() });
    await page.locator('.ticket.working[data-number="20"]').waitFor({ timeout: 20000 });
    thread.push(comment(3, `${AGENT}\n1. Une seule langue ? ➡️ oui\n\nRépondez par numéro (ex. « 1 oui »), ou « oui à tout ».`));
    Object.assign(q, { labels: q.labels.filter((l) => l.name !== 'factory:running'), comments: 3, updated_at: new Date(Date.now() + 2000).toISOString() });
    await page.waitForFunction(() => { const b = document.querySelector('.ticket.yours[data-number="20"] button.go'); return b && !b.disabled && b.textContent === 'Oui pour tout'; }, null, { timeout: 20000 });
    await page.waitForTimeout(1000); // the card just slid back into « À vous de jouer »: a touch counts once it settled
    await page.locator('.ticket.yours[data-number="20"] button.go').click();
    await waitFor(() => sentOn(writes, 20).length > 1, page);
    assert.deepEqual(sentOn(writes, 20), ['oui à tout', 'oui à tout']);
  });
});

// Every distinct list of answer buttons card n shows in « À vous de jouer », in order (watched at each frame).
const watchButtons = (page, n) => page.evaluate((num) => {
  window.__seen = []; let last = null;
  const look = () => {
    const c = document.querySelector(`.ticket.yours[data-number="${num}"]`);
    if (c) {
      const s = JSON.stringify([...c.querySelectorAll('.card-actions a.button, .card-actions button')].map((b) => b.textContent.trim()));
      if (s !== last) { last = s; window.__seen.push(JSON.parse(s)); }
    }
    requestAnimationFrame(look);
  };
  look();
}, n);

test('une carte qui passe de « Les agents travaillent » à « À vous de jouer » n\'a aucun bouton avant la lecture de ses nouvelles questions', async () => {
  const thread = [comment(1, `${AGENT}\nJe lis le projet avant de poser mes questions.`)];
  const q = questions(20, ['factory:feature', 'factory:grilling', 'factory:running']);
  await withPanel({ issues: [q], comments: { 20: thread }, slowReads: [[/\/issues\/20\/comments/, 1200]], viewport: { width: 390, height: 844 }, device: { hasTouch: true, isMobile: true } }, async ({ page, url, reads }) => {
    await page.goto(url);
    await page.locator('.ticket.working[data-number="20"]').waitFor();
    const readsOf20 = () => reads.filter((r) => r.endsWith('/issues/20/comments')).length;
    await waitFor(() => readsOf20() > 0, page); // its messages were read once, while the agent works
    await page.waitForTimeout(1500);
    await watchButtons(page, 20);
    // The agent posts its round of questions and stops.
    thread.push(comment(2, ROUND));
    Object.assign(q, { labels: q.labels.filter((l) => l.name !== 'factory:running'), comments: 2, updated_at: new Date(Date.now() + 1000).toISOString() });
    await page.locator('.ticket.yours[data-number="20"] button.go').waitFor({ timeout: 20000 });
    const seen = await page.evaluate(() => window.__seen);
    assert.deepEqual(seen.filter((b) => b.length), [['Oui pour tout', 'Répondre']], `buttons seen in order: ${JSON.stringify(seen)}`);
  });
});

test('quand les messages ne se lisent pas, la carte de questions montre « Répondre » seul', async () => {
  for (const mode of ['500', 'limited']) {
    await withPanel({ issues: [questions()], comments: { 20: [round] } }, async ({ page, url }) => {
      await page.route('https://api.github.com/repos/o/r/issues/20/comments**', (route) => (mode === 'limited'
        ? route.fulfill({ status: 403, contentType: 'application/json', headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 1800), 'access-control-expose-headers': 'X-RateLimit-Remaining, X-RateLimit-Reset' }, body: JSON.stringify({ message: 'API rate limit exceeded' }) })
        : route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Server Error' }) })));
      await page.goto(url);
      await card(page).locator('a.button.secondary').waitFor({ timeout: 5000 });
      assert.deepEqual((await buttons(page)).map((t) => t.trim()), ['Répondre'], mode);
    });
  }
});

test('un « Oui pour tout » qui arrive après un échec de lecture ne prend pas le toucher destiné à « Répondre »', async () => {
  await withPanel({ issues: [questions()], comments: { 20: [round] }, viewport: { width: 390, height: 844 }, device: { hasTouch: true, isMobile: true } }, async ({ page, url, writes, context }) => {
    let fail = true;
    await page.route('https://api.github.com/repos/o/r/issues/20/comments**', (route) => (fail ? route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }) : route.fallback()));
    let popups = 0;
    context.on('page', () => { popups++; });
    await page.goto(url);
    const reply = card(page).locator('a.button.secondary');
    await reply.waitFor({ timeout: 5000 });
    const box = await reply.boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    fail = false; // the next refresh reads the round
    await page.locator('button.go[data-go="20"]').waitFor({ timeout: 20000 });
    assert.equal(await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest('button.go')?.dataset.go, [x, y]), '20', 'the blue button now stands where « Répondre » was');
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(1000);
    assert.deepEqual(sentOn(writes, 20), [], 'a touch aimed at « Répondre » does not send « oui à tout »');
    // A deliberate touch, once it has settled, answers.
    await page.touchscreen.tap(x, y);
    await waitFor(() => sentOn(writes, 20).length, page);
    assert.deepEqual(sentOn(writes, 20), ['oui à tout']);
    assert.equal(popups, 0);
  });
});

test('la barre d\'étapes de la carte de questions ne saute pas quand ses boutons arrivent', async () => {
  await withPanel({ issues: [questions()], comments: { 20: [round] }, slowReads: [[/\/issues\/20\/comments/, 2500]], viewport: { width: 390, height: 844 } }, async ({ page, url }) => {
    await page.goto(url);
    await card(page).waitFor();
    assert.deepEqual(await buttons(page), []);
    const top = () => card(page).locator('.step').evaluate((n) => n.getBoundingClientRect().top - n.closest('.ticket').getBoundingClientRect().top);
    const before = await top();
    await page.locator('button.go[data-go="20"]').waitFor();
    await page.waitForTimeout(500);
    const after = await top();
    assert.ok(Math.abs(after - before) < 1, `step bar from ${before} to ${after} px below the top of the card`);
  });
});

test('après un redessin du tableau, défiler un peu puis toucher un « go » resté en place l\'envoie', async () => {
  const spec = issue(30, 'Exporter en PDF', ['factory:feature', 'factory:spec-review']);
  const queued = (n) => issue(n, `Demande ${n}`, ['factory:feature', 'factory:queued']);
  const done = new Date().toISOString();
  const closed = [{ ...issue(5, 'Ancienne demande', ['factory:feature']), state: 'closed', closed_at: done, pull_request: { url: 'x', merged_at: done }, merged_at: done }];
  await withPanel({ issues: [spec, queued(40), queued(41), queued(42), queued(43)], closed, slowReads: [[/state=closed/, 2000]], viewport: { width: 1280, height: 500 } }, async ({ page, url, writes }) => {
    await page.goto(url);
    const go = page.locator('button.go[data-go="30"]');
    await go.waitFor();
    const top0 = await go.evaluate((n) => n.getBoundingClientRect().top + scrollY);
    await page.locator('.lane-done .count').waitFor({ timeout: 20000 }); // « Terminé » arrives: the board redraws
    await page.mouse.move(640, 250);
    await page.mouse.wheel(0, 60);
    await page.waitForFunction(() => scrollY >= 60);
    await page.waitForTimeout(300);
    const top1 = await go.evaluate((n) => n.getBoundingClientRect().top + scrollY);
    assert.ok(Math.abs(top1 - top0) < 10, `« go » stayed in place on the board (${top1 - top0} px)`);
    const box = await go.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await waitFor(() => sentOn(writes, 30).length, page);
    assert.deepEqual(sentOn(writes, 30), ['go']);
  });
});

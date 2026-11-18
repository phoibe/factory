// Journeys of issue #486: in the « Agent » chat, « and » stay glued to their word on a narrow screen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const AGENT = '<!-- factory-agent -->\n';
const answer = 'Ouvrez l\'onglet « Suivi » puis « Paramètres » et regardez la carte « Construction » tout en bas.';
const question = issue(7, 'Où voir mes demandes ?', ['factory:question'], { comments: 1, body: 'Où voir « Suivi » ?' });
const thread = { 7: [{ body: AGENT + answer, created_at: new Date().toISOString(), html_url: 'u1', user: { login: 'o' } }] };

async function linesOf(page, selector) {
  // Each rendered line of the bubble's text, read from the browser's own line boxes.
  return page.locator(selector).evaluate((node) => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const lines = new Map();
    for (let t; (t = walker.nextNode());) {
      for (let i = 0; i < t.length; i++) {
        const r = document.createRange();
        r.setStart(t, i); r.setEnd(t, i + 1);
        const box = [...r.getClientRects()].find((b) => b.width > 0);
        if (!box) continue;
        const y = Math.round(box.top);
        lines.set(y, (lines.get(y) || '') + t.data[i]);
      }
    }
    return [...lines.entries()].sort((a, b) => a[0] - b[0]).map(([, l]) => l.trim());
  });
}

test('sur un écran étroit, aucune ligne de la réponse ne commence par « » » ni ne finit par « « »', async () => {
  for (const width of [200, 230, 260, 290, 320, 360]) {
    await withPanel({ issues: [question], comments: thread, viewport: { width, height: 800 } }, async ({ page, url }) => {
      await page.goto(url);
      await page.getByRole('tab', { name: 'Agent', exact: true }).click();
      await page.locator('.conv', { hasText: 'Où voir mes demandes ?' }).click();
      const bubble = '#chat-messages .msg.agent .bubble';
      await page.locator(bubble).waitFor();
      for (const line of await linesOf(page, bubble)) {
        assert.ok(!line.startsWith('»'), `ligne qui commence par » à ${width}px : ${line}`);
        assert.ok(!line.endsWith('«'), `ligne qui finit par « à ${width}px : ${line}`);
      }
    });
  }
});

async function copied(page, select) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(select);
  await page.keyboard.press('Control+C');
  return page.evaluate(() => navigator.clipboard.readText());
}

// The rich copy (pasted into a mail or a document), as the browser put it on the clipboard.
const copiedHtml = (page) => page.evaluate(async () => {
  const [item] = await navigator.clipboard.read();
  return item.types.includes('text/html') ? (await item.getType('text/html')).text() : '';
});

const openChat = async (page, url) => {
  await page.goto(url);
  await page.getByRole('tab', { name: 'Agent', exact: true }).click();
  await page.locator('.conv', { hasText: 'Où voir mes demandes ?' }).click();
  await page.locator('#chat-messages .msg.agent .bubble').waitFor();
};

test('en copiant la réponse, je retrouve exactement le texte de l\'agent', async () => {
  await withPanel({ issues: [question], comments: thread, viewport: { width: 320, height: 800 } }, async ({ page, url }) => {
    await openChat(page, url);
    const text = await copied(page, () => {
      const range = document.createRange();
      range.selectNodeContents(document.querySelector('#chat-messages .msg.agent .bubble'));
      getSelection().removeAllRanges(); getSelection().addRange(range);
    });
    assert.equal(text.trim(), answer);
    const html = (await copiedHtml(page)).replace(/<[^>]*>/g, '');
    assert.match(html, /« Suivi »/);
    assert.doesNotMatch(html, /&nbsp;|\u00A0/);
    // The screen keeps the guillemets glued once the copy is done.
    await page.waitForTimeout(100);
    assert.match(await page.locator('#chat-messages .msg.agent .bubble').innerText(), /« Suivi »/);
  });
});

test('en copiant depuis le titre jusqu\'à la réponse, les guillemets ont des espaces ordinaires', async () => {
  await withPanel({ issues: [question], comments: thread, viewport: { width: 320, height: 800 } }, async ({ page, url }) => {
    await openChat(page, url);
    const text = await copied(page, () => {
      const range = document.createRange();
      range.setStart(document.getElementById('chat-title'), 0);
      range.setEndAfter(document.querySelector('#chat-messages .msg.agent .bubble'));
      getSelection().removeAllRanges(); getSelection().addRange(range);
    });
    assert.ok(text.includes('« Suivi »'), text);
    assert.ok(!text.includes(' '), JSON.stringify(text));
  });
});

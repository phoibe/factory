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

test('en copiant la réponse, je retrouve exactement le texte de l\'agent', async () => {
  await withPanel({ issues: [question], comments: thread, viewport: { width: 320, height: 800 } }, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.locator('.conv', { hasText: 'Où voir mes demandes ?' }).click();
    const bubble = page.locator('#chat-messages .msg.agent .bubble');
    await bubble.waitFor();
    const copied = await bubble.evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
      const data = new DataTransfer();
      node.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }));
      return data.getData('text/plain') || sel.toString();
    });
    assert.equal(copied.trim(), answer);
  });
});

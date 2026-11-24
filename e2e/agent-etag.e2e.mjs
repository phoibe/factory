// Journeys of issue #563: in instant mode, the conversations are read again every 30 s with their ETag, so an
// unchanged read is GitHub's free « 304 » and does not count against the owner's hourly limit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel } from './fixture.mjs';

const openAgent = (page) => page.getByRole('tab', { name: 'Agent', exact: true }).click();

// The reads of the `factory-chat` branch's conversations (raw contents), with what GitHub answered.
function branchReads(page) {
  const seen = [];
  page.on('response', (res) => {
    const req = res.request();
    const u = new URL(req.url());
    if (req.method() !== 'GET' || u.searchParams.get('ref') !== 'factory-chat' || req.headers().accept !== 'application/vnd.github.raw') return;
    seen.push({ file: u.pathname.replace('/repos/o/r/contents/', ''), etag: req.headers()['if-none-match'] || null, status: res.status() });
  });
  return seen;
}

// Lets the 30 s check run once, then waits for its two reads (the list and the open conversation).
async function nextCheck(page, seen) {
  const before = seen.length;
  await page.clock.runFor(31_000);
  for (let i = 0; i < 100 && seen.length < before + 2; i++) await page.waitForTimeout(50);
  return seen.slice(before);
}

async function startConversation(page, url) {
  await page.clock.install();
  await page.goto(url);
  await openAgent(page);
  await page.locator('#chat-input').fill('Première question');
  await page.locator('#chat-send').click();
  await page.locator('#chat-messages .msg.agent', { hasText: 'Bien reçu.' }).waitFor();
}

test('en mode instantané, une conversation inchangée est relue avec son ETag et ne compte pas dans la limite', async () => {
  await withPanel({ etag: true, chatServer: { answer: 'Bien reçu.' }, viewport: { width: 1280, height: 800 } }, async ({ page, url }) => {
    const seen = branchReads(page);
    await startConversation(page, url);
    await nextCheck(page, seen);
    const checks = [];
    for (let i = 0; i < 3; i++) checks.push(...await nextCheck(page, seen));
    const files = checks.map((r) => r.file);
    assert.ok(files.includes('index.json') && files.some((f) => /^chats\/.+\.json$/.test(f)), JSON.stringify(checks));
    // Nothing changed: every read carries the ETag and gets a free « 304 ».
    for (const r of checks) {
      assert.ok(r.etag, `${r.file} relu sans ETag`);
      assert.equal(r.status, 304, `${r.file} relu en ${r.status}`);
    }
  });
});

test('un message écrit depuis un autre appareil apparaît toujours tout seul', async () => {
  await withPanel({ etag: true, chatServer: { answer: 'Bien reçu.' }, viewport: { width: 1280, height: 800 } }, async ({ page, url, chatBranch }) => {
    const seen = branchReads(page);
    await startConversation(page, url);
    await nextCheck(page, seen);
    await nextCheck(page, seen);
    // Another device adds an exchange to the conversation.
    const [id] = Object.keys(chatBranch.chats);
    const at = new Date(Date.now() + 120_000).toISOString();
    const conv = structuredClone(chatBranch.chats[id]);
    conv.messages.push({ who: 'me', text: 'Question du téléphone', images: [], at }, { who: 'agent', text: 'Réponse sur le téléphone.', at });
    conv.updated = at;
    chatBranch.chats[id] = conv;
    chatBranch.index = chatBranch.index.map((e) => (e.id === id ? { ...e, updated: at } : e));
    const checks = await nextCheck(page, seen);
    assert.ok(checks.every((r) => r.status === 200), JSON.stringify(checks));
    await page.locator('#chat-messages .msg.agent', { hasText: 'Réponse sur le téléphone.' }).waitFor({ timeout: 5000 });
    // And the next check, with nothing new, is free again and keeps it on screen.
    const after = await nextCheck(page, seen);
    assert.ok(after.length && after.every((r) => r.status === 304), JSON.stringify(after));
    assert.equal(await page.locator('#chat-messages .msg.agent', { hasText: 'Réponse sur le téléphone.' }).count(), 1);
  });
});

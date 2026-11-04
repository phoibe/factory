import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachmentPath, imageSources, mirrorAttachments, ATTACHMENTS_BRANCH } from '../scripts/lib/attachments.mjs';

const signed = (id) => `https://private-user-images.githubusercontent.com/4254912/694536717-${id}.png?jwt=abc&amp;x=1`;
const ID = '7b4bb623-1dff-4e0c-b757-acb063a58ce1';

test('imageSources keeps the signed attachment links of a rendered comment', () => {
  const html = `<p><a href="x"><img src="${signed(ID)}" alt="CleanShot"></a> <img src="https://avatars.githubusercontent.com/u/1"></p>`;
  assert.deepEqual(imageSources(html), [`https://private-user-images.githubusercontent.com/4254912/694536717-${ID}.png?jwt=abc&x=1`]);
  assert.deepEqual(imageSources(''), []);
});

test('attachmentPath names the file after the asset id, per issue', () => {
  assert.equal(attachmentPath(15, signed(ID).replace('&amp;', '&')), `attachments/15/${ID}.png`);
});

function fakeGh({ branch = false, existing = [] } = {}) {
  const calls = [];
  return {
    calls,
    getIssueHtml: async (n) => ({ user: { login: 'phoibe' }, body_html: '' }),
    listCommentsHtml: async () => [
      { user: { login: 'phoibe' }, body_html: `<img src="${signed(ID)}">` },
      { user: { login: 'someone' }, body_html: `<img src="${signed('11111111-2222-3333-4444-555555555555')}">` },
    ],
    listReviewCommentsHtml: async () => [],
    listReviewsHtml: async () => [],
    getBranch: async () => (branch ? { ref: 'x' } : null),
    createOrphanBranch: async (name, files) => { calls.push(['branch', name, Object.keys(files)]); },
    getContent: async (path) => (existing.includes(path) ? { sha: '1' } : null),
    putContent: async (path, br, b64) => { calls.push(['put', path, br, b64]); },
  };
}

test("mirrors the owner's images to the attachments branch, once", async () => {
  const gh = fakeGh();
  const fetched = [];
  const fetchImpl = async (url) => { fetched.push(url); return { ok: true, arrayBuffer: async () => new TextEncoder().encode('PNG').buffer }; };
  const paths = await mirrorAttachments({ gh, fetchImpl, numbers: [15, null], owner: 'phoibe', isPr: () => true });
  assert.deepEqual(paths, [`attachments/15/${ID}.png`]);
  assert.deepEqual(gh.calls[0], ['branch', ATTACHMENTS_BRANCH, ['README.md', 'vercel.json']]);
  assert.deepEqual(gh.calls[1], ['put', `attachments/15/${ID}.png`, ATTACHMENTS_BRANCH, Buffer.from('PNG').toString('base64')]);
  assert.equal(fetched.length, 1); // not the other person's image

  const again = fakeGh({ branch: true, existing: [`attachments/15/${ID}.png`] });
  assert.deepEqual(await mirrorAttachments({ gh: again, fetchImpl: async () => assert.fail('no download'), numbers: [15], owner: 'phoibe' }), [`attachments/15/${ID}.png`]);
  assert.equal(again.calls.length, 0);
});

test('a failed download is skipped, the run still starts', async () => {
  const gh = fakeGh({ branch: true });
  const paths = await mirrorAttachments({ gh, fetchImpl: async () => ({ ok: false, status: 404 }), numbers: [15], owner: 'phoibe' });
  assert.deepEqual(paths, []);
});

test('images sent from the panel chat are already on the branch: listed, never downloaded', async () => {
  const gh = { ...fakeGh({ branch: true }),
    getIssueHtml: async () => ({ user: { login: 'phoibe' }, body: 'Vois\n<!-- factory-image: attachments/chat/1-a.jpg -->', body_html: '' }),
    listCommentsHtml: async () => [
      { user: { login: 'phoibe' }, body: '<!-- factory-image: attachments/chat/2-b.png -->', body_html: '' },
      { user: { login: 'someone' }, body: '<!-- factory-image: attachments/chat/3-c.png -->', body_html: '' },
    ] };
  const paths = await mirrorAttachments({ gh, fetchImpl: async () => assert.fail('no download'), numbers: [15], owner: 'phoibe' });
  assert.deepEqual(paths, ['attachments/chat/1-a.jpg', 'attachments/chat/2-b.png']);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVersionTag, tagConcerned, readSiteTag } from '../scripts/lib/version-tag.mjs';

const SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

test('the version tag is read from the home page meta, in either attribute order', () => {
  assert.equal(parseVersionTag(`<html><head><meta name="factory-version" content="${SHA}"></head></html>`), SHA);
  assert.equal(parseVersionTag(`<meta content='abc1234' name='factory-version' />`), 'abc1234');
  assert.equal(parseVersionTag(`<meta name="description" content="${SHA}">`), null);
  assert.equal(parseVersionTag('<html>nothing</html>'), null);
});

test('a bare commit id (factory-version.txt) is a tag; anything else is not', () => {
  assert.equal(parseVersionTag(`${SHA.toUpperCase()}\n`), SHA);
  assert.equal(parseVersionTag('abc12'), null);
  assert.equal(parseVersionTag('not a sha at all'), null);
  assert.equal(parseVersionTag(null), null);
});

test('only projects with a site whose host says nothing need the tag', () => {
  assert.equal(tagConcerned({ mode: 'external', site: 'https://p.example', liveEnvs: [] }), true);
  assert.equal(tagConcerned({ mode: 'auto', site: 'https://p.example', liveEnvs: ['Preview'] }), true);
  assert.equal(tagConcerned({ mode: 'auto', site: 'https://p.example', liveEnvs: ['Production'] }), false);
  assert.equal(tagConcerned({ mode: 'external', site: null, liveEnvs: [] }), false);
  assert.equal(tagConcerned({ mode: 'auto', site: null, liveEnvs: [] }), false);
});

const page = (body, ok = true) => ({ ok, text: async () => body });

test('the site is read at its address, then at factory-version.txt', async () => {
  const urls = [];
  const fetchImpl = async (url) => { urls.push(String(url)); return String(url).endsWith('factory-version.txt') ? page(`${SHA}\n`) : page('<html></html>'); };
  assert.equal(await readSiteTag('https://p.example/app', fetchImpl), SHA);
  assert.deepEqual(urls, ['https://p.example/app', 'https://p.example/app/factory-version.txt']);
});

test('a site that is down, refuses, or hangs gives no tag (never a stale one)', async () => {
  assert.equal(await readSiteTag('https://p.example', async () => { throw new Error('ECONNREFUSED'); }), null);
  assert.equal(await readSiteTag('https://p.example', async () => page('', false)), null);
  let signal;
  await readSiteTag('https://p.example', async (url, init) => { signal = init.signal; return page(''); });
  assert.ok(signal, 'the read is bounded by a timeout');
});

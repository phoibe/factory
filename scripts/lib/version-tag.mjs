// The version tag (issue #372): a site whose host tells GitHub nothing about its publications (external production,
// as on Pulsar Wheel, or a silent host, as on yoldmewhen2) says itself which commit it runs. The relay reads it on
// every tick (the panel cannot read another site) and points refs/factory/live at that commit.
import { isLiveEnv } from '../../panel/production.mjs';

export const VERSION_TAG_MARKER = '<!-- factory-version-tag -->';
export const LIVE_REF = 'factory/live';
const SHA = /^[0-9a-f]{7,40}$/i;
const READ_MS = 10_000;

// `<meta name="factory-version" content="<commit>">` in a page, or a bare commit id (factory-version.txt).
export function parseVersionTag(text) {
  const s = String(text ?? '');
  if (SHA.test(s.trim())) return s.trim().toLowerCase();
  for (const [tag] of s.matchAll(/<meta\b[^>]*>/gi)) {
    if (!/\bname\s*=\s*["']factory-version["']/i.test(tag)) continue;
    const value = /\bcontent\s*=\s*["']\s*([0-9a-f]{7,40})\s*["']/i.exec(tag)?.[1];
    if (value) return value.toLowerCase();
  }
  return null;
}

// A project needs the tag when it has a site and nothing else says what is live on it.
export const tagConcerned = ({ mode, site, liveEnvs }) => Boolean(site) && (mode === 'external' || !(liveEnvs || []).some(isLiveEnv));

// The commit id the site gives, or null: no answer, an error, a timeout, or no tag at all. Never an old value.
export async function readSiteTag(site, fetchImpl = fetch) {
  const read = async (url) => {
    try {
      const res = await fetchImpl(url, { redirect: 'follow', headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(READ_MS) });
      return res?.ok ? parseVersionTag((await res.text()).slice(0, 2_000_000)) : null;
    } catch { return null; }
  };
  const base = String(site);
  return (await read(base)) || read(new URL('factory-version.txt', base.endsWith('/') ? base : `${base}/`).href);
}

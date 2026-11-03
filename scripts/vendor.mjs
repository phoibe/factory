#!/usr/bin/env node
// Vendors skill packs at pinned commits into packs/<pack>/<skill>/ and writes packs/catalog.json.
// Usage: node scripts/vendor.mjs [--latest]   (--latest moves every pack to its upstream default branch HEAD)
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from './lib/frontmatter.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourcesPath = join(root, 'packs/sources.json');
const git = (args, cwd) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

function expand(base, pattern) {
  if (!pattern.endsWith('/*')) return existsSync(join(base, pattern)) ? [pattern] : [];
  const dir = pattern.slice(0, -2);
  return readdirSync(join(base, dir))
    .filter((n) => statSync(join(base, dir, n)).isDirectory() && existsSync(join(base, dir, n, 'SKILL.md')))
    .sort()
    .map((n) => `${dir}/${n}`);
}

export function vendor({ latest = false } = {}) {
  const sources = JSON.parse(readFileSync(sourcesPath, 'utf8'));
  const catalog = { packs: [] };
  const notice = ['# Notices', '', 'Skills in this folder are copied from third-party repositories, unmodified.', ''];
  const seen = new Map();
  for (const pack of sources.packs) {
    const tmp = mkdtempSync(join(tmpdir(), `pack-${pack.id}-`));
    git(['clone', '--quiet', `https://github.com/${pack.repo}`, tmp]);
    if (latest) pack.commit = git(['rev-parse', 'HEAD'], tmp);
    git(['checkout', '--quiet', pack.commit], tmp);
    const packDir = join(root, 'packs', pack.id);
    rmSync(packDir, { recursive: true, force: true });
    const skills = [];
    for (const pattern of pack.include) {
      for (const rel of expand(tmp, pattern)) {
        const id = basename(rel);
        if (seen.has(id)) throw new Error(`Duplicate skill id "${id}" in ${pack.id} and ${seen.get(id)}`);
        seen.set(id, pack.id);
        cpSync(join(tmp, rel), join(packDir, id), { recursive: true });
        const fm = parseFrontmatter(readFileSync(join(tmp, rel, 'SKILL.md'), 'utf8'));
        skills.push({
          id,
          path: `packs/${pack.id}/${id}`,
          description: fm.description || '',
          defaultEnabled: pack.defaultEnabled.includes(id),
        });
      }
    }
    cpSync(join(tmp, pack.licenseFile), join(packDir, 'LICENSE'));
    rmSync(tmp, { recursive: true, force: true });
    catalog.packs.push({ id: pack.id, name: pack.name, repo: pack.repo, commit: pack.commit, license: pack.license, skills });
    notice.push(`- **${pack.name}**: https://github.com/${pack.repo} at \`${pack.commit}\`, ${pack.license} (see \`packs/${pack.id}/LICENSE\`).`);
  }
  writeFileSync(sourcesPath, JSON.stringify(sources, null, 2) + '\n');
  writeFileSync(join(root, 'packs/catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
  writeFileSync(join(root, 'packs/NOTICE.md'), notice.join('\n') + '\n');
  return catalog;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const c = vendor({ latest: process.argv.includes('--latest') });
  for (const p of c.packs) console.log(`${p.id}@${p.commit.slice(0, 7)}: ${p.skills.length} skills`);
}

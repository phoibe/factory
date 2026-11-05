// A fingerprint of what the sync installs in a project (agent instructions, stages, hook scripts, skills). The sync
// writes it to .factory/synced.json; the relay compares it with its own on every tick and starts the sync when they
// differ, so a project gets new agent instructions with the next stable version, not at the weekly sync.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIRS = ['agent', 'packs'];

function files(dir) {
  let out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    out = statSync(p).isDirectory() ? out.concat(files(p)) : out.concat(p);
  }
  return out;
}

export function syncFingerprint(factoryDir) {
  const hash = createHash('sha256');
  for (const d of DIRS) {
    for (const p of files(join(factoryDir, d))) hash.update(relative(factoryDir, p)).update('\0').update(readFileSync(p)).update('\0');
  }
  return hash.digest('hex').slice(0, 16);
}

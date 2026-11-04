// Where the run's repository is. A routine that serves several projects starts in a parent folder that
// holds one clone per repository, so $CLAUDE_PROJECT_DIR is not the project: the run JSON names the repo,
// and the hooks remember the answer for the rest of the session in a small file outside the repositories.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const isProject = (d) => existsSync(join(d, '.factory')) || existsSync(join(d, '.git'));

export function findRoot(projectDir, repo) {
  const name = String(repo || '').split('/').pop();
  if (!name || basename(projectDir) === name) return projectDir;
  const sub = join(projectDir, name);
  if (existsSync(sub) && isProject(sub)) return sub;
  return projectDir;
}

const pointer = (session) => join(tmpdir(), 'factory-runs', `${String(session || 'session').replace(/[^\w-]/g, '').slice(0, 36)}.json`);

export function rememberRoot(session, root) {
  try { mkdirSync(join(tmpdir(), 'factory-runs'), { recursive: true }); writeFileSync(pointer(session), JSON.stringify({ root })); } catch { /* best effort */ }
}

// The run's repository for a hook call: the remembered one, else the project folder itself.
export function sessionRoot(session, projectDir) {
  try { return JSON.parse(readFileSync(pointer(session), 'utf8')).root || projectDir; } catch { return projectDir; }
}

// Shell command for .claude/settings.json: runs the factory script of the project folder, or of the first
// clone inside it (the multi-project layout). It never fails the hook when no script is there.
export function hookCommand(script) {
  const rel = `.factory/scripts/${script}`;
  return `for d in "$CLAUDE_PROJECT_DIR" "$CLAUDE_PROJECT_DIR"/*; do if [ -f "$d/${rel}" ]; then exec node "$d/${rel}"; fi; done; exit 0`;
}


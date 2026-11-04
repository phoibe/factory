import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT = resolve('scripts/factory.sh');

function run(args, answers) {
  const dir = mkdtempSync(join(tmpdir(), 'factory-sh-'));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  symlinkSync(resolve('test/fixtures/fake-gh.sh'), join(bin, 'gh'));
  const remote = join(dir, 'remote.git');
  execFileSync('git', ['init', '-q', '--bare', remote]);
  const log = join(dir, 'gh.log');
  writeFileSync(log, '');
  // The script reads its answers from /dev/tty; `script` gives it one fed from our input.
  const env = { ...process.env, PATH: `${bin}:/usr/bin:/bin`, FAKE_GH_LOG: log, FAKE_REMOTE: remote, XDG_CONFIG_HOME: join(dir, 'cfg'), HOME: dir };
  const out = execFileSync('script', ['-qec', `bash ${SCRIPT} ${args.join(' ')}`.trim(), '/dev/null'], { env, input: answers.join('\n') + '\n', encoding: 'utf8', timeout: 60_000 });
  return { out, log: readFileSync(log, 'utf8'), remote, cfg: join(dir, 'cfg') };
}

test('adopter installs the factory files, secrets, sync and framing issue', () => {
  const { out, log, remote, cfg } = run(['adopter', 'mon-appli'], ['', 'https://api.anthropic.com/v1/claude_code/routines/trig_x/fire', 'sk-secret', '', '', '']);
  assert.match(out, /C'est prêt/);
  const files = execFileSync('git', ['--git-dir', remote, 'ls-tree', '-r', '--name-only', 'main'], { encoding: 'utf8' });
  for (const f of ['.github/workflows/factory.yml', '.github/ISSUE_TEMPLATE/project.yml', 'factory.config.json', 'CLAUDE.md', 'package.json']) assert.ok(files.includes(f), f);
  assert.match(log, /secret set FACTORY_ROUTINE_URL -R phoibe\/mon-appli/);
  assert.match(log, /workflow run factory-sync.yml -R phoibe\/mon-appli/);
  assert.match(log, /issue create -R phoibe\/mon-appli --title Cadrage : mon-appli --label factory:project/);
  assert.match(readFileSync(join(cfg, 'factory/routine'), 'utf8'), /FACTORY_ROUTINE_TOKEN=sk-secret/);
});

test('nouveau creates the repository from the template', () => {
  const { log } = run(['nouveau', 'nouveau-projet'], ['', '', 'https://example.test/fire', 'tok', '', '', 'Une appli de recettes']);
  assert.match(log, /repo create phoibe\/nouveau-projet --private --template phoibe\/factory-template/);
  assert.match(log, /issue create .*--body Une appli de recettes/);
});

test('with no arguments, it asks what to do and lists only projects without the factory', () => {
  const { out, log } = run([], ['2', '1', '', 'https://example.test/fire', 'tok', '', '', '']);
  assert.match(out, /1\) Créer un nouveau projet/);
  assert.match(out, / 1\) vieux-site/);
  assert.doesNotMatch(out, /\) habitudes/);
  assert.match(log, /issue create -R phoibe\/vieux-site/);
});

test('answering no to the confirmation changes nothing', () => {
  const { out, log } = run([], ['1', 'mes-recettes', 'n']);
  assert.match(out, /Rien n'a été fait/);
  assert.doesNotMatch(log, /repo create/);
});

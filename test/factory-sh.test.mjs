import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT = resolve('scripts/factory.sh');

function run(args, answers, extraEnv = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'factory-sh-'));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  symlinkSync(resolve('test/fixtures/fake-gh.sh'), join(bin, 'gh'));
  const remote = join(dir, 'remote.git');
  execFileSync('git', ['init', '-q', '--bare', remote]);
  const log = join(dir, 'gh.log');
  writeFileSync(log, '');
  // The script reads its answers from /dev/tty; `script` gives it one fed from our input.
  const env = { ...process.env, PATH: `${bin}:/usr/bin:/bin`, FAKE_GH_LOG: log, FAKE_REMOTE: remote, XDG_CONFIG_HOME: join(dir, 'cfg'), HOME: dir, ...extraEnv };
  const out = execFileSync('script', ['-qec', `bash ${SCRIPT} ${args.join(' ')}`.trim(), '/dev/null'], { env, input: answers.join('\n') + '\n', encoding: 'utf8', timeout: 60_000 });
  return { out, log: readFileSync(log, 'utf8'), remote, cfg: join(dir, 'cfg') };
}

test('adopter installs the factory files, secrets, sync and framing issue', () => {
  const { out, log, remote, cfg } = run(['adopter', 'mon-appli'], ['', 'o', 'https://api.anthropic.com/v1/claude_code/routines/trig_x/fire', 'sk-secret', '', '', '']);
  assert.match(out, /C'est prêt/);
  const files = execFileSync('git', ['--git-dir', remote, 'ls-tree', '-r', '--name-only', 'main'], { encoding: 'utf8' });
  for (const f of ['.github/workflows/factory.yml', '.github/ISSUE_TEMPLATE/project.yml', 'factory.config.json', 'CLAUDE.md', 'package.json']) assert.ok(files.includes(f), f);
  assert.match(log, /secret set FACTORY_ROUTINE_URL -R phoibe\/mon-appli/);
  // HTTPS with the gh login, never SSH (no key on the owner's Mac).
  assert.match(log, /auth setup-git/);
  assert.match(log, /repo clone https:\/\/github\.com\/phoibe\/mon-appli\.git /);
  assert.match(log, /workflow run factory-sync.yml -R phoibe\/mon-appli/);
  assert.match(log, /issue create -R phoibe\/mon-appli --title Cadrage : mon-appli --label factory:project/);
  assert.match(readFileSync(join(cfg, 'factory/routines/phoibe_mon-appli'), 'utf8'), /FACTORY_ROUTINE_TOKEN=sk-secret/);
});

test('nouveau creates the repository from the template', () => {
  const { log } = run(['nouveau', 'nouveau-projet'], ['', '', 'o', 'https://example.test/fire', 'tok', '', 'Une appli de recettes']);
  assert.match(log, /repo create phoibe\/nouveau-projet --private --template phoibe\/factory-template/);
  assert.match(log, /issue create .*--body Une appli de recettes/);
});

test('with no arguments, it asks what to do and lists only projects without the factory', () => {
  const { out, log } = run([], ['2', '2', '', 'o', 'https://example.test/fire', 'tok', '', '', '']);
  assert.match(out, /1\) Créer un nouveau projet/);
  assert.match(out, / 1\) factory/); // the factory itself can be adopted
  assert.match(out, / 2\) vieux-site/);
  assert.doesNotMatch(out, /\) habitudes/);
  assert.match(log, /issue create -R phoibe\/vieux-site/);
});

test('answering no to the confirmation changes nothing', () => {
  const { out, log } = run([], ['1', 'mes-recettes', 'n']);
  assert.match(out, /Rien n'a été fait/);
  assert.doesNotMatch(log, /repo create/);
});

test('without a routine, it guides the creation of a routine for this project only', () => {
  const { out } = run(['adopter', 'mon-appli'], ['', 'n', '', '', '', '', '', '', 'https://example.test/fire', 'tok', '', '']);
  assert.match(out, /Création de la routine de ce projet, pas à pas/);
  assert.match(out, /Nom : Factory - mon-appli/);
  assert.match(out, /Repositories : ajoute phoibe\/mon-appli, et seulement lui/);
  assert.doesNotMatch(out, /Une seule routine|tous tes projets|Dernier clic/);
  assert.match(out, /C'est prêt/);
});

test('a routine saved for another project is never reused', () => {
  const cfg = mkdtempSync(join(tmpdir(), 'factory-cfg-'));
  mkdirSync(join(cfg, 'factory', 'routines'), { recursive: true });
  writeFileSync(join(cfg, 'factory', 'routines', 'phoibe_habitudes'), 'FACTORY_ROUTINE_URL=https://habitudes.test/fire\nFACTORY_ROUTINE_TOKEN=habitudes-token\n');
  const { out } = run(['adopter', 'mon-appli'], ['', 'o', 'https://example.test/fire', 'tok', '', '', ''], { XDG_CONFIG_HOME: cfg });
  assert.match(out, /Avez-vous déjà créé la routine « Factory - mon-appli »/);
  assert.match(readFileSync(join(cfg, 'factory', 'routines', 'phoibe_mon-appli'), 'utf8'), /FACTORY_ROUTINE_TOKEN=tok/);
});

test('choice 3 updates the routine of the one project picked', () => {
  const { out, log } = run([], ['3', '1', 'o', 'https://example.test/fire', 'nouveau-jeton']);
  assert.match(out, / 1\) habitudes/);
  assert.doesNotMatch(out, /\) vieux-site/);
  assert.match(log, /secret set FACTORY_ROUTINE_TOKEN -R phoibe\/habitudes/);
  assert.equal((log.match(/secret set FACTORY_ROUTINE_TOKEN/g) || []).length, 1);
});

test('adopting the factory itself skips Vercel (its board is on GitHub Pages)', () => {
  const { out, log } = run(['adopter', 'factory'], ['', 'o', 'https://example.test/fire', 'tok', '', '']);
  assert.match(out, /Pas besoin de Vercel/);
  assert.match(out, /C'est prêt/);
  assert.match(log, /issue create -R phoibe\/factory --title Cadrage : factory/);
});

test('when GitHub refuses to list the app installations, it gives a working link, never the error text', () => {
  const { out } = run(['adopter', 'mon-appli'], ['', 'o', 'https://api.anthropic.com/v1/claude_code/routines/trig_x/fire', 'sk-secret', '', '', ''],
    { FAKE_INSTALLATIONS: '{"message":"You must authenticate with an access token authorized to a GitHub App in order to list installations"}' });
  assert.match(out, /https:\/\/github\.com\/settings\/installations\s/);
  assert.doesNotMatch(out, /pas pu ajouter le dépôt/);
  assert.doesNotMatch(out, /installations\/\{/);
  assert.match(out, /C'est prêt/);
});

test('choice 3 keeps the saved token when the new one is rejected', () => {
  const cfg = mkdtempSync(join(tmpdir(), 'factory-cfg-'));
  mkdirSync(join(cfg, 'factory'));
  mkdirSync(join(cfg, 'factory', 'routines'));
  const file = join(cfg, 'factory', 'routines', 'phoibe_habitudes');
  writeFileSync(file, 'FACTORY_ROUTINE_URL=https://old.test/fire\nFACTORY_ROUTINE_TOKEN=old-token\n');
  assert.throws(() => run([], ['3', '1', 'o', 'pas-une-url', 'nouveau'], { XDG_CONFIG_HOME: cfg }),
    (e) => /ne ressemble pas à celle d'une routine/.test(`${e.stdout}${e.stderr}`));
  assert.ok(existsSync(file), 'the saved token file must survive a typo');
  assert.match(readFileSync(file, 'utf8'), /old-token/);
  assert.ok(!existsSync(`${file}.new`), 'no temporary file left behind');
});

test('choice 3 replaces the saved token once the new one is valid', () => {
  const cfg = mkdtempSync(join(tmpdir(), 'factory-cfg-'));
  mkdirSync(join(cfg, 'factory'));
  mkdirSync(join(cfg, 'factory', 'routines'));
  const file = join(cfg, 'factory', 'routines', 'phoibe_habitudes');
  writeFileSync(file, 'FACTORY_ROUTINE_URL=https://old.test/fire\nFACTORY_ROUTINE_TOKEN=old-token\n');
  run([], ['3', '1', 'o', 'https://new.test/fire', 'new-token'], { XDG_CONFIG_HOME: cfg });
  assert.match(readFileSync(file, 'utf8'), /FACTORY_ROUTINE_TOKEN=new-token/);
  assert.doesNotMatch(readFileSync(file, 'utf8'), /old-token/);
});

test('a failed first sync is reported even if an older sync succeeded', () => {
  // The fake lists run 6 (an old green one) before the dispatch, then 7 (the new one) after.
  const { out } = run(['adopter', 'mon-appli'], ['', 'o', 'https://example.test/fire', 'tok', '', '', ''], { FAKE_RUN_WATCH_FAILS: '7' });
  assert.match(out, /La synchro n'a pas fini en vert/);
  assert.doesNotMatch(out, /Labels créés et skills installés/);
});

test('first sync waits for the run it just started, not an older one', () => {
  const { log } = run(['adopter', 'mon-appli'], ['', 'o', 'https://example.test/fire', 'tok', '', '', '']);
  assert.match(log, /run watch 7 /);
  assert.doesNotMatch(log, /run watch 6 /);
});

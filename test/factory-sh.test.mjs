import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
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
  const env = { ...process.env, PATH: [bin, extraEnv.PATH_PREFIX, '/usr/bin', '/bin'].filter(Boolean).join(':'), FAKE_GH_LOG: log, FAKE_REMOTE: remote, XDG_CONFIG_HOME: join(dir, 'cfg'), HOME: dir, FACTORY_SH_NAP: '0', ...extraEnv };
  // Async, so the tests run side by side: `script` alone waits about 2 s before it exits.
  return new Promise((done, fail) => {
    const child = execFile('script', ['-qec', `bash ${SCRIPT} ${args.join(' ')}`.trim(), '/dev/null'], { env, encoding: 'utf8', timeout: 60_000 }, (err, out, stderr) => {
      if (err) return fail(Object.assign(err, { stdout: out, stderr }));
      done({ out, log: readFileSync(log, 'utf8'), remote, cfg: join(dir, 'cfg') });
    });
    child.stdin.end(answers.join('\n') + '\n');
  });
}

// Every case runs in its own temporary folder, so they can all run at once.
describe('factory.sh', { concurrency: true }, () => {

test('adopter installs the factory files, secrets, sync and framing issue', async () => {
  const { out, log, remote, cfg } = await run(['adopter', 'mon-appli'], ['', 'o', 'https://api.anthropic.com/v1/claude_code/routines/trig_x/fire', 'sk-secret', '', '', '']);
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

test('nouveau creates the repository from the template', async () => {
  const { log } = await run(['nouveau', 'nouveau-projet'], ['', '', 'o', 'https://example.test/fire', 'tok', '', 'Une appli de recettes']);
  assert.match(log, /repo create phoibe\/nouveau-projet --private --template phoibe\/factory-template/);
  assert.match(log, /issue create .*--body Une appli de recettes/);
});

test('with no arguments, it asks what to do and lists only projects without the factory', async () => {
  const { out, log } = await run([], ['2', '2', '', 'o', 'https://example.test/fire', 'tok', '', '', '']);
  assert.match(out, /1\) Créer un nouveau projet/);
  assert.match(out, / 1\) factory/); // the factory itself can be adopted
  assert.match(out, / 2\) vieux-site/);
  assert.doesNotMatch(out, /\) habitudes/);
  assert.match(log, /issue create -R phoibe\/vieux-site/);
});

test('answering no to the confirmation changes nothing', async () => {
  const { out, log } = await run([], ['1', 'mes-recettes', 'n']);
  assert.match(out, /Rien n'a été fait/);
  assert.doesNotMatch(log, /repo create/);
});

test('without a routine, it guides the creation of a routine for this project only', async () => {
  const { out } = await run(['adopter', 'mon-appli'], ['', 'n', '', '', '', '', '', '', 'https://example.test/fire', 'tok', '', '']);
  assert.match(out, /Création de la routine de ce projet, pas à pas/);
  assert.match(out, /Nom : Factory - mon-appli/);
  assert.match(out, /Repositories : ajoute phoibe\/mon-appli, et seulement lui/);
  assert.doesNotMatch(out, /Une seule routine|tous tes projets|Dernier clic/);
  assert.match(out, /C'est prêt/);
});

test('a routine saved for another project is never reused', async () => {
  const cfg = mkdtempSync(join(tmpdir(), 'factory-cfg-'));
  mkdirSync(join(cfg, 'factory', 'routines'), { recursive: true });
  writeFileSync(join(cfg, 'factory', 'routines', 'phoibe_habitudes'), 'FACTORY_ROUTINE_URL=https://habitudes.test/fire\nFACTORY_ROUTINE_TOKEN=habitudes-token\n');
  const { out } = await run(['adopter', 'mon-appli'], ['', 'o', 'https://example.test/fire', 'tok', '', '', ''], { XDG_CONFIG_HOME: cfg });
  assert.match(out, /Avez-vous déjà créé la routine « Factory - mon-appli »/);
  assert.match(readFileSync(join(cfg, 'factory', 'routines', 'phoibe_mon-appli'), 'utf8'), /FACTORY_ROUTINE_TOKEN=tok/);
});

test('choice 3 updates the routine of the one project picked', async () => {
  const { out, log } = await run([], ['3', '1', 'o', 'https://example.test/fire', 'nouveau-jeton']);
  assert.match(out, / 1\) habitudes/);
  assert.doesNotMatch(out, /\) vieux-site/);
  assert.match(log, /secret set FACTORY_ROUTINE_TOKEN -R phoibe\/habitudes/);
  assert.equal((log.match(/secret set FACTORY_ROUTINE_TOKEN/g) || []).length, 1);
});

test('the install never connects a host: it says the host comes with the stack, at framing', async () => {
  const { out, log } = await run(['nouveau', 'nouveau-projet'], ['', '', 'o', 'https://example.test/fire', 'tok', '', 'Une appli']);
  assert.match(out, /L'hébergeur sera choisi avec la stack, au cadrage : je vous dirai alors quoi cliquer\./);
  assert.doesNotMatch(out, /Vercel|Appuyez sur Entrée/);
  assert.doesNotMatch(log, /vercel/i);
  assert.match(out, /C'est prêt/);
});

test('installing works on a Mac without Node.js, even when npx would be found', async () => {
  // A trap: if the script ever called npx (or node), the run would fail loudly.
  const dir = mkdtempSync(join(tmpdir(), 'factory-trap-'));
  for (const tool of ['npx', 'node']) {
    writeFileSync(join(dir, tool), '#!/bin/sh\necho "$0 must not be called" >&2; exit 97\n', { mode: 0o755 });
  }
  const { out } = await run(['adopter', 'mon-appli'], ['', 'o', 'https://example.test/fire', 'tok', '', ''], { PATH_PREFIX: dir });
  assert.doesNotMatch(out, /must not be called/);
  assert.match(out, /C'est prêt/);
});

test('adopting the factory itself finishes without any host step', async () => {
  const { out, log } = await run(['adopter', 'factory'], ['', 'o', 'https://example.test/fire', 'tok', '', '']);
  assert.doesNotMatch(out, /Vercel|L'hébergeur sera choisi/);
  assert.match(out, /C'est prêt/);
  assert.match(log, /issue create -R phoibe\/factory --title Cadrage : factory/);
});

test('when GitHub refuses to list the app installations, it gives a working link, never the error text', async () => {
  const { out } = await run(['adopter', 'mon-appli'], ['', 'o', 'https://api.anthropic.com/v1/claude_code/routines/trig_x/fire', 'sk-secret', '', '', ''],
    { FAKE_INSTALLATIONS: '{"message":"You must authenticate with an access token authorized to a GitHub App in order to list installations"}' });
  assert.match(out, /https:\/\/github\.com\/settings\/installations\s/);
  assert.doesNotMatch(out, /pas pu ajouter le dépôt/);
  assert.doesNotMatch(out, /installations\/\{/);
  assert.match(out, /C'est prêt/);
});

test('choice 3 keeps the saved token when the new one is rejected', async () => {
  const cfg = mkdtempSync(join(tmpdir(), 'factory-cfg-'));
  mkdirSync(join(cfg, 'factory'));
  mkdirSync(join(cfg, 'factory', 'routines'));
  const file = join(cfg, 'factory', 'routines', 'phoibe_habitudes');
  writeFileSync(file, 'FACTORY_ROUTINE_URL=https://old.test/fire\nFACTORY_ROUTINE_TOKEN=old-token\n');
  await assert.rejects(run([], ['3', '1', 'o', 'pas-une-url', 'nouveau'], { XDG_CONFIG_HOME: cfg }),
    (e) => /ne ressemble pas à celle d'une routine/.test(`${e.stdout}${e.stderr}`));
  assert.ok(existsSync(file), 'the saved token file must survive a typo');
  assert.match(readFileSync(file, 'utf8'), /old-token/);
  assert.ok(!existsSync(`${file}.new`), 'no temporary file left behind');
});

test('choice 3 replaces the saved token once the new one is valid', async () => {
  const cfg = mkdtempSync(join(tmpdir(), 'factory-cfg-'));
  mkdirSync(join(cfg, 'factory'));
  mkdirSync(join(cfg, 'factory', 'routines'));
  const file = join(cfg, 'factory', 'routines', 'phoibe_habitudes');
  writeFileSync(file, 'FACTORY_ROUTINE_URL=https://old.test/fire\nFACTORY_ROUTINE_TOKEN=old-token\n');
  await run([], ['3', '1', 'o', 'https://new.test/fire', 'new-token'], { XDG_CONFIG_HOME: cfg });
  assert.match(readFileSync(file, 'utf8'), /FACTORY_ROUTINE_TOKEN=new-token/);
  assert.doesNotMatch(readFileSync(file, 'utf8'), /old-token/);
});

test('a failed first sync is reported even if an older sync succeeded', async () => {
  // The fake lists run 6 (an old green one) before the dispatch, then 7 (the new one) after.
  const { out } = await run(['adopter', 'mon-appli'], ['', 'o', 'https://example.test/fire', 'tok', '', '', ''], { FAKE_RUN_WATCH_FAILS: '7' });
  assert.match(out, /La synchro n'a pas fini en vert/);
  assert.doesNotMatch(out, /Labels créés et skills installés/);
});

test('first sync waits for the run it just started, not an older one', async () => {
  const { log } = await run(['adopter', 'mon-appli'], ['', 'o', 'https://example.test/fire', 'tok', '', '', '']);
  assert.match(log, /run watch 7 /);
  assert.doesNotMatch(log, /run watch 6 /);
});

test('phone alerts: the ntfy channel is asked once, kept, then set in every project', async () => {
  const cfg = mkdtempSync(join(tmpdir(), 'factory-cfg-'));
  const first = await run(['adopter', 'mon-appli'], ['', 'o', 'https://example.test/fire', 'tok', ' canal-secret-xyz ', '', ''], { XDG_CONFIG_HOME: cfg });
  assert.match(first.out, /Nom du canal ntfy/);
  assert.match(first.log, /secret set NTFY_TOPIC -R phoibe\/mon-appli/);
  assert.equal(readFileSync(join(cfg, 'factory', 'ntfy'), 'utf8'), 'canal-secret-xyz\n');
  const second = await run(['adopter', 'autre-appli'], ['', 'o', 'https://example.test/fire', 'tok', '', ''], { XDG_CONFIG_HOME: cfg });
  assert.doesNotMatch(second.out, /Nom du canal ntfy/);
  assert.match(second.log, /secret set NTFY_TOPIC -R phoibe\/autre-appli/);
});

test('phone alerts can be skipped: no secret, nothing saved, the install goes on', async () => {
  const { out, log, cfg } = await run(['adopter', 'mon-appli'], ['', 'o', 'https://example.test/fire', 'tok', '', '', '']);
  assert.match(out, /Pas d'alerte pour ce projet/);
  assert.doesNotMatch(log, /NTFY_TOPIC/);
  assert.ok(!existsSync(join(cfg, 'factory', 'ntfy')));
  assert.match(out, /C'est prêt/);
});
});

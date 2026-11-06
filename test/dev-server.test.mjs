import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT = resolve('scripts/dev-server.sh');
const STUBS = resolve('test/fixtures/fake-dev-server');

// Runs the dev-server script against a fake GitHub (runner list in runners.txt) and a fake server (stubs on PATH).
function run(args, { runners = '', fake, answers = [], env = {} } = {}) {
  fake ??= mkdtempSync(join(tmpdir(), 'dev-server-'));
  if (!existsSync(join(fake, 'runners.txt'))) writeFileSync(join(fake, 'runners.txt'), runners);
  writeFileSync(join(fake, 'log'), '');
  const fullEnv = { PATH: `${STUBS}:/usr/bin:/bin`, HOME: fake, FAKE: fake, DEV_SERVER_ROOT: join(fake, 'runners'), DEV_SERVER_SCAN: join(fake, 'elsewhere'), ...env };
  return new Promise((done) => {
    const child = execFile('bash', [SCRIPT, ...args], { env: fullEnv, encoding: 'utf8', timeout: 30_000 }, (err, out, stderr) => {
      done({ code: err ? err.code : 0, out: `${out}${stderr}`, log: readFileSync(join(fake, 'log'), 'utf8'), runners: readFileSync(join(fake, 'runners.txt'), 'utf8'), fake });
    });
    child.stdin.end(answers.join('\n') + (answers.length ? '\n' : ''));
  });
}

// A runner set up by hand before the factory, in another folder of the server.
function handMadeRunner(name, repo) {
  const fake = mkdtempSync(join(tmpdir(), 'dev-server-'));
  const dir = join(fake, 'elsewhere', 'actions-runner');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '.runner'), `{\n  "agentName": "${name}",\n  "gitHubUrl": "https://github.com/${repo}"\n}\n`);
  writeFileSync(join(dir, 'svc.sh'), '#!/usr/bin/env bash\necho "svc.sh $* in $(basename "$PWD")" >> "$FAKE/log"\n[ "$1" = install ] && touch .service\nexit 0\n', { mode: 0o755 });
  return fake;
}

const factoryDev = (runners) => runners.trim().split('\n').filter((l) => l && l.split(' ')[2].split(',').includes('factory-dev') && l.endsWith(' online'));

describe('dev-server.sh', { concurrency: true }, () => {
  test('a private project without runner gets 2 runners with the factory label, started on boot', async () => {
    const r = await run(['phoibe/prive']);
    assert.equal(r.code, 0, r.out);
    assert.equal(factoryDev(r.runners).length, 2, JSON.stringify(r.runners));
    assert.match(r.log, /config\.sh --unattended --url https:\/\/github\.com\/phoibe\/prive --token REGTOKEN --name devbox-prive-1 --labels factory-dev/);
    assert.match(r.log, /--name devbox-prive-2 /);
    assert.equal((r.log.match(/^svc\.sh install factory-runner/gm) || []).length, 2);
    assert.equal((r.log.match(/^svc\.sh start/gm) || []).length, 2);
    assert.match(r.out, /2 runners prêts/);
  });

  test('the jobs never run under the owner\'s own account: a dedicated user is created', async () => {
    const r = await run(['phoibe/prive']);
    assert.match(r.log, /useradd .*factory-runner/);
    assert.match(r.log, /sudo -u factory-runner .*config\.sh/);
  });

  test('each new runner gets the system libraries it needs', async () => {
    const r = await run(['phoibe/prive']);
    assert.equal((r.log.match(/^installdependencies\.sh$/gm) || []).length, 2);
  });

  test('the first time it installs the software of the browser checks', async () => {
    const r = await run(['phoibe/prive']);
    assert.match(r.log, /apt-get install -y/);
    assert.match(r.log, /npx -y playwright@1\.56\.1 install-deps chromium/);
  });

  test('a project that already has a runner on this server keeps it, gets the label, and only one more runner', async () => {
    const fake = handMadeRunner('ancien-runner', 'phoibe/prive');
    const r = await run(['phoibe/prive'], { fake, runners: '77 ancien-runner self-hosted,Linux,X64 online\n' });
    assert.equal(r.code, 0, r.out);
    assert.match(r.runners, /^77 ancien-runner self-hosted,Linux,X64,factory-dev online$/m);
    assert.equal(r.runners.trim().split('\n').length, 2);
    assert.equal((r.log.match(/^config\.sh /gm) || []).length, 1);
    assert.match(r.out, /déjà là, je le garde/);
  });

  test('a runner online on another machine is neither labelled nor counted', async () => {
    const r = await run(['phoibe/prive'], { runners: '55 mac-de-pierre self-hosted,macOS,ARM64 online\n' });
    assert.equal(r.code, 0, r.out);
    assert.match(r.runners, /^55 mac-de-pierre self-hosted,macOS,ARM64 online$/m);
    assert.match(r.out, /mac-de-pierre.*pas sur ce serveur/);
    assert.equal((r.log.match(/^config\.sh /gm) || []).length, 2);
  });

  test('a runner of another project with the same name is not taken for this one', async () => {
    const fake = handMadeRunner('devbox', 'phoibe/autre');
    const r = await run(['phoibe/prive'], { fake, runners: '66 devbox self-hosted,Linux,X64 offline\n' });
    assert.equal(r.code, 0, r.out);
    assert.doesNotMatch(r.log, /svc\.sh install pierre in actions-runner/);
    assert.equal((r.log.match(/^config\.sh /gm) || []).length, 2);
  });

  test('cleaning never touches the runners of a project whose name starts the same', async () => {
    const other = await run(['phoibe/prive-web']);
    writeFileSync(join(other.fake, 'runners.txt'), ''); // GitHub lists only the runners of phoibe/prive
    const r = await run(['phoibe/prive'], { fake: other.fake });
    assert.equal(r.code, 0, r.out);
    assert.ok(existsSync(join(other.fake, 'runners', 'phoibe-prive-web-1', '.runner')));
    assert.doesNotMatch(r.log, /uninstall/);
  });

  test('running the command again changes nothing', async () => {
    const first = await run(['phoibe/prive']);
    const again = await run(['phoibe/prive'], { fake: first.fake });
    assert.equal(again.code, 0, again.out);
    assert.equal(again.runners, first.runners);
    assert.doesNotMatch(again.log, /config\.sh|apt-get|npx|\/labels/);
    assert.doesNotMatch(again.log, /svc\.sh install/);
    assert.match(again.out, /Rien à ajouter/);
  });

  test('a public project never gets a runner', async () => {
    const r = await run(['phoibe/public'], { env: { FAKE_PUBLIC: '1' } });
    assert.notEqual(r.code, 0);
    assert.match(r.out, /projet public/);
    assert.doesNotMatch(r.log, /config\.sh|apt-get|registration-token/);
  });

  test('an unknown project is refused in French, nothing installed', async () => {
    const r = await run(['inconnu']);
    assert.notEqual(r.code, 0);
    assert.match(r.out, /Je ne trouve pas le projet phoibe\/inconnu/);
    assert.doesNotMatch(r.log, /apt-get|config\.sh/);
  });

  test('run on a Mac by mistake, it says it must run on the dev server', async () => {
    const r = await run(['phoibe/prive'], { env: { FAKE_OS: 'Darwin' } });
    assert.notEqual(r.code, 0);
    assert.match(r.out, /serveur de dev/);
    assert.doesNotMatch(r.log, /apt-get|config\.sh/);
  });

  test('as root on a server without sudo, the runners still run under the dedicated user', async () => {
    const r = await run(['phoibe/prive'], { env: { FAKE_UID: '0', FAKE_USER: 'root' } });
    assert.equal(r.code, 0, r.out);
    assert.match(r.log, /useradd .*factory-runner/);
    assert.match(r.log, /runuser -u factory-runner -- .*config\.sh/);
    assert.doesNotMatch(r.log, /^sudo /m);
    assert.match(r.log, /^svc\.sh install factory-runner/m);
  });

  test('a runner deleted on GitHub leaves no folder or service behind, and its place is taken again', async () => {
    const first = await run(['phoibe/prive']);
    writeFileSync(join(first.fake, 'runners.txt'), '');
    const again = await run(['phoibe/prive'], { fake: first.fake });
    assert.equal(again.code, 0, again.out);
    assert.match(again.log, /^svc\.sh uninstall in phoibe-prive-1/m);
    assert.match(again.log, /--name devbox-prive-1 /);
    assert.match(again.log, /--name devbox-prive-2 /);
    assert.doesNotMatch(again.log, /devbox-prive-3/);
    assert.equal(factoryDev(again.runners).length, 2);
  });

  test('after a failure halfway, the next run finishes the same runners without drifting', async () => {
    const failed = await run(['phoibe/prive'], { env: { FAKE_CONFIG_FAILS: '1' } });
    assert.notEqual(failed.code, 0);
    const again = await run(['phoibe/prive'], { fake: failed.fake });
    assert.equal(again.code, 0, again.out);
    assert.match(again.log, /--name devbox-prive-1 /);
    assert.doesNotMatch(again.log, /devbox-prive-3/);
    assert.equal(factoryDev(again.runners).length, 2);
  });

  test('a download cut off midway does not block the next run', async () => {
    const fake = mkdtempSync(join(tmpdir(), 'dev-server-'));
    writeFileSync(join(fake, 'curl-fails'), '');
    const failed = await run(['phoibe/prive'], { fake });
    assert.notEqual(failed.code, 0);
    const again = await run(['phoibe/prive'], { fake });
    assert.equal(again.code, 0, again.out);
    assert.equal(factoryDev(again.runners).length, 2);
  });

  test('the project name typed in another case finds the same runners', async () => {
    const first = await run(['phoibe/prive']);
    const again = await run(['Prive'], { fake: first.fake });
    assert.equal(again.code, 0, again.out);
    assert.doesNotMatch(again.log, /^config\.sh /m);
  });

  test('a runner offline and not on this server is kept on GitHub but not counted', async () => {
    const r = await run(['phoibe/prive'], { runners: '88 vieux-pc self-hosted,Linux,X64 offline\n' });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /vieux-pc.*hors ligne/);
    assert.match(r.runners, /^88 vieux-pc self-hosted,Linux,X64 offline$/m);
    assert.equal((r.log.match(/^config\.sh /gm) || []).length, 2);
  });

  test('a runner installed by hand on this server is made to start with the server', async () => {
    const fake = handMadeRunner('ancien-runner', 'phoibe/prive');
    const r = await run(['phoibe/prive'], { fake, runners: '77 ancien-runner self-hosted,Linux,X64 offline\n' });
    assert.equal(r.code, 0, r.out);
    assert.match(r.log, /^svc\.sh install pierre in actions-runner/m);
    assert.equal((r.log.match(/^config\.sh /gm) || []).length, 1);
  });

  test('without the administrator right on the project, it stops in French before installing anything', async () => {
    const r = await run(['phoibe/prive'], { env: { FAKE_NOT_ADMIN: '1' } });
    assert.notEqual(r.code, 0);
    assert.match(r.out, /administrateur/);
    assert.doesNotMatch(r.log, /apt-get|config\.sh/);
  });

  test('a private project outside the factory is refused', async () => {
    const r = await run(['phoibe/autre']);
    assert.notEqual(r.code, 0);
    assert.match(r.out, /pas dans la factory/);
    assert.doesNotMatch(r.log, /apt-get|config\.sh/);
  });

  test('when nobody answers the project question, it stops instead of asking forever', async () => {
    const r = await run([]);
    assert.notEqual(r.code, 0);
    assert.doesNotMatch(r.log, /config\.sh/);
  });

  test('without a project name, it lists the private factory projects to pick from', async () => {
    const r = await run([], { answers: ['1'] });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /1\) prive/);
    assert.doesNotMatch(r.out, /\) autre/);
    assert.equal(factoryDev(r.runners).length, 2);
  });
});

test('the browser libraries installed on the server match the Playwright version of the factory', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.match(readFileSync(SCRIPT, 'utf8'), new RegExp(`^PLAYWRIGHT_VERSION=${pkg.devDependencies.playwright.replace(/\./g, '\\.')}$`, 'm'));
});

test('the French guide gives the command and says what to expect, without technical words', () => {
  const guide = readFileSync('docs/serveur-de-dev.md', 'utf8');
  assert.match(guide, /bash <\(curl -fsSL https:\/\/raw\.githubusercontent\.com\/phoibe\/factory\/stable\/scripts\/dev-server\.sh\) mon-appli/);
  assert.match(guide, /settings\/actions\/runners/);
  assert.match(guide, /Idle/);
  assert.match(guide, /projet public/i);
  assert.match(guide, /Tailscale/);
  assert.doesNotMatch(guide, /systemd|apt-get|svc\.sh|config\.sh/);
  assert.match(readFileSync('outils/LISEZMOI.txt', 'utf8'), /serveur-de-dev/);
});

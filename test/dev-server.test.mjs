import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT = resolve('scripts/dev-server.sh');
const STUBS = resolve('test/fixtures/fake-dev-server');

// Runs the dev-server script against a fake GitHub (runner list in runners.txt) and a fake server (stubs on PATH).
function run(args, { runners = '', fake, answers = [], env = {} } = {}) {
  fake ??= mkdtempSync(join(tmpdir(), 'dev-server-'));
  if (!existsSync(join(fake, 'runners.txt'))) writeFileSync(join(fake, 'runners.txt'), runners);
  writeFileSync(join(fake, 'log'), '');
  const fullEnv = { PATH: `${STUBS}:/usr/bin:/bin`, HOME: fake, FAKE: fake, DEV_SERVER_ROOT: join(fake, 'runners'), ...env };
  return new Promise((done) => {
    const child = execFile('bash', [SCRIPT, ...args], { env: fullEnv, encoding: 'utf8', timeout: 30_000 }, (err, out, stderr) => {
      done({ code: err ? err.code : 0, out: `${out}${stderr}`, log: readFileSync(join(fake, 'log'), 'utf8'), runners: readFileSync(join(fake, 'runners.txt'), 'utf8'), fake });
    });
    child.stdin.end(answers.join('\n') + (answers.length ? '\n' : ''));
  });
}

const factoryDev = (runners) => runners.trim().split('\n').filter((l) => l && l.split(' ')[2].split(',').includes('factory-dev'));

describe('dev-server.sh', { concurrency: true }, () => {
  test('a private project without runner gets 2 runners with the factory label, started on boot', async () => {
    const r = await run(['phoibe/prive']);
    assert.equal(r.code, 0, r.out);
    assert.equal(factoryDev(r.runners).length, 2, JSON.stringify(r.runners));
    assert.match(r.log, /config\.sh --unattended --url https:\/\/github\.com\/phoibe\/prive --token REGTOKEN --name devbox-prive-1 --labels factory-dev/);
    assert.match(r.log, /--name devbox-prive-2 /);
    assert.equal((r.log.match(/^svc\.sh install pierre/gm) || []).length, 2);
    assert.equal((r.log.match(/^svc\.sh start/gm) || []).length, 2);
    assert.match(r.out, /2 runners prêts/);
  });

  test('the first time it installs the software of the browser checks', async () => {
    const r = await run(['phoibe/prive']);
    assert.match(r.log, /apt-get install -y/);
    assert.match(r.log, /npx -y playwright@1\.56\.1 install-deps chromium/);
  });

  test('a project that already has a runner keeps it, gets the label, and only one more runner', async () => {
    const r = await run(['phoibe/prive'], { runners: '77 ancien-runner self-hosted,Linux,X64\n' });
    assert.equal(r.code, 0, r.out);
    assert.match(r.runners, /^77 ancien-runner self-hosted,Linux,X64,factory-dev$/m);
    assert.equal(r.runners.trim().split('\n').length, 2);
    assert.equal((r.log.match(/^config\.sh /gm) || []).length, 1);
    assert.match(r.out, /déjà là, je le garde/);
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

  test('as root, the runners run under a dedicated user', async () => {
    const r = await run(['phoibe/prive'], { env: { FAKE_UID: '0', FAKE_USER: 'root' } });
    assert.equal(r.code, 0, r.out);
    assert.match(r.log, /useradd .*factory-runner/);
    assert.match(r.log, /svc\.sh install factory-runner/);
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

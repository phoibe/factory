import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT = resolve('scripts/dev-server.sh');
const STUBS = resolve('test/fixtures/fake-dev-server');

// Runs the dev-server script against a fake GitHub (runner list in runners.txt) and a fake server (stubs on PATH).
function run(args, { runners = '', fake, answers = [], env = {} } = {}) {
  fake ??= mkdtempSync(join(tmpdir(), 'dev-server-'));
  if (!existsSync(join(fake, 'runners.txt'))) writeFileSync(join(fake, 'runners.txt'), runners);
  writeFileSync(join(fake, 'log'), '');
  const fullEnv = { PATH: `${STUBS}:/usr/bin:/bin`, HOME: fake, FAKE: fake, DEV_SERVER_ROOT: join(fake, 'runners'), DEV_SERVER_SCAN: join(fake, 'elsewhere'), DEV_SERVER_SYSTEMD: join(fake, 'systemd'), DEV_SERVER_CACHE: join(fake, 'cache'), ...env };
  mkdirSync(join(fake, 'systemd'), { recursive: true });
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

// A runner installed before the factory under its own isolated account (« gh-runner »), with a systemd service written
// by hand (no « .service » file from svc.sh in its folder), as on a server hardened by the owner.
function isolatedRunner(name, repo, { groups = 'gh-runner' } = {}) {
  const fake = mkdtempSync(join(tmpdir(), 'dev-server-'));
  const dir = join(fake, 'elsewhere', 'gh-runner', 'appli');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '.runner'), `{\n  "agentName": "${name}",\n  "gitHubUrl": "https://github.com/${repo}"\n}\n`);
  writeFileSync(join(dir, '.owner'), 'gh-runner\n');
  writeFileSync(join(dir, 'svc.sh'), '#!/usr/bin/env bash\necho "svc.sh $* in $(basename "$PWD")" >> "$FAKE/log"\nexit 0\n', { mode: 0o755 });
  mkdirSync(join(fake, 'users'));
  writeFileSync(join(fake, 'users', 'gh-runner'), `${groups}\n`);
  mkdirSync(join(fake, 'systemd'), { recursive: true });
  writeFileSync(join(fake, 'systemd', `actions.runner.${repo.replace('/', '-')}.${name}.service`), `[Service]\nExecStart=${dir}/runsvc.sh\nUser=gh-runner\nWorkingDirectory=${dir}\n`);
  return { fake, env: { DEV_SERVER_SYSTEMD: join(fake, 'systemd'), FAKE_RUNNER_USER: groups.includes('docker') ? 'factory-runner' : 'gh-runner' } };
}

// Three runners made by this command (1, 2 and 3), as left by an install that went wrong once: runner 3 is a copy of
// runner 2 with its own name, service and GitHub entry. `busy` marks runner 3 as running a job.
async function threeRunners({ busy = false } = {}) {
  const first = await run(['phoibe/prive']);
  const runners = join(first.fake, 'runners');
  cpSync(join(runners, 'phoibe-prive-2'), join(runners, 'phoibe-prive-3'), { recursive: true });
  writeFileSync(join(runners, 'phoibe-prive-3', '.runner'), '{\n  "agentName": "devbox-prive-3",\n  "gitHubUrl": "https://github.com/phoibe/prive"\n}\n');
  writeFileSync(join(first.fake, 'systemd', 'actions.runner.phoibe-prive.devbox-prive-3.service'), `[Service]\nExecStart=${runners}/phoibe-prive-3/runsvc.sh\nWorkingDirectory=${runners}/phoibe-prive-3\n`);
  writeFileSync(join(first.fake, 'runners.txt'), `${first.runners}333 devbox-prive-3 self-hosted,Linux,X64,factory-dev online${busy ? ' true' : ''}\n`);
  return first.fake;
}

const names = (runners) => runners.trim().split('\n').map((l) => l.split(' ')[1]).sort();

const factoryDev = (runners) => runners.trim().split('\n').filter((l) => l && l.split(' ')[2].split(',').includes('factory-dev') && l.endsWith(' online'));

describe('dev-server.sh', { concurrency: true }, () => {
  test('a private project without runner gets 2 runners with the factory label, started on boot', async () => {
    const r = await run(['phoibe/prive']);
    assert.equal(r.code, 0, r.out);
    assert.equal(factoryDev(r.runners).length, 2, JSON.stringify(r.runners));
    assert.match(r.log, /config\.sh --unattended --url https:\/\/github\.com\/phoibe\/prive --token REGTOKEN --name devbox-prive-1 --labels factory-dev/);
    assert.match(r.log, /--name devbox-prive-2 /);
    for (const n of [1, 2]) {
      const unit = readFileSync(join(r.fake, 'systemd', `actions.runner.phoibe-prive.devbox-prive-${n}.service`), 'utf8');
      assert.match(unit, /^User=factory-runner$/m);
      assert.match(unit, new RegExp(`^ExecStart=.*/runners/phoibe-prive-${n}/runsvc\\.sh$`, 'm'));
      // The service's program is in place, or systemd fails to start it (203/EXEC).
      assert.ok(existsSync(join(r.fake, 'runners', `phoibe-prive-${n}`, 'runsvc.sh')));
    }
    assert.equal((r.log.match(/^systemctl enable --now actions\.runner\.phoibe-prive\.devbox-prive-\d\.service$/gm) || []).length, 2);
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
    assert.match(readFileSync(join(r.fake, 'systemd', 'actions.runner.phoibe-prive.devbox-prive-1.service'), 'utf8'), /^User=factory-runner$/m);
  });

  test('the administrator never runs a file of a runner\'s folder, which its jobs can rewrite', async () => {
    const first = await run(['phoibe/prive']);
    const again = await run(['phoibe/prive'], { fake: first.fake });
    for (const r of [first, again]) {
      assert.equal(r.code, 0, r.out);
      assert.doesNotMatch(r.log, /\bsvc\.sh/);
    }
    // The runner's libraries come from the administrator's own copy of the archive, outside the runners' folders.
    const extracts = first.log.match(/^tar -xzf \S+ -C (\S+)$/gm) || [];
    assert.ok(extracts.some((l) => !l.includes('/runners/')), first.log);
    assert.match(first.log, /^sudo curl -fsSL -o .*\/cache\/actions-runner-linux-/m);
  });

  test('a runner deleted on GitHub leaves no folder or service behind, and its place is taken again', async () => {
    const first = await run(['phoibe/prive']);
    writeFileSync(join(first.fake, 'runners.txt'), '');
    const again = await run(['phoibe/prive'], { fake: first.fake });
    assert.equal(again.code, 0, again.out);
    assert.match(again.log, /^systemctl disable --now actions\.runner\.phoibe-prive\.devbox-prive-1\.service$/m);
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
    assert.match(readFileSync(join(r.fake, 'systemd', 'actions.runner.phoibe-prive.ancien-runner.service'), 'utf8'), /^User=pierre$/m);
    assert.doesNotMatch(r.log, /\bsvc\.sh/);
    assert.equal((r.log.match(/^config\.sh /gm) || []).length, 1);
  });

  test('a runner with its own hand-written service keeps it: the administrator never runs svc.sh from its folder', async () => {
    const { fake, env } = isolatedRunner('pulsar-dev-prive', 'phoibe/prive');
    const r = await run(['phoibe/prive'], { fake, env, runners: '91 pulsar-dev-prive self-hosted,pulsar-dev online\n' });
    assert.equal(r.code, 0, r.out);
    assert.doesNotMatch(r.log, /svc\.sh (install|start) in appli/);
    assert.match(r.log, /systemctl enable --now actions\.runner\.phoibe-prive\.pulsar-dev-prive\.service/);
    assert.match(r.out, /garde son démarrage automatique/);
    assert.match(r.runners, /^91 pulsar-dev-prive self-hosted,pulsar-dev,factory-dev online$/m);
    assert.equal((r.log.match(/^config\.sh /gm) || []).length, 1);
  });

  test('new runners join the isolated account already used on the server, not a second account', async () => {
    const { fake, env } = isolatedRunner('pulsar-dev-autre', 'phoibe/autre');
    const r = await run(['phoibe/prive'], { fake, env });
    assert.equal(r.code, 0, r.out);
    assert.doesNotMatch(r.log, /useradd/);
    assert.match(r.log, /sudo -u gh-runner .*config\.sh/);
    assert.doesNotMatch(r.log, /factory-runner/);
    assert.match(readFileSync(join(r.fake, 'systemd', 'actions.runner.phoibe-prive.devbox-prive-1.service'), 'utf8'), /^User=gh-runner$/m);
    assert.match(r.out, /compte isolé déjà en place sur ce serveur : gh-runner/);
  });

  test('an existing account that can reach the administrator or Docker is not reused', async () => {
    const { fake, env } = isolatedRunner('pulsar-dev-autre', 'phoibe/autre', { groups: 'gh-runner docker' });
    const r = await run(['phoibe/prive'], { fake, env });
    assert.equal(r.code, 0, r.out);
    assert.match(r.log, /useradd .*factory-runner/);
    assert.doesNotMatch(r.log, /sudo -u gh-runner/);
  });

  test('a runner installed earlier with svc.sh keeps its service, started by systemctl only', async () => {
    const fake = handMadeRunner('ancien-runner', 'phoibe/prive');
    writeFileSync(join(fake, 'elsewhere', 'actions-runner', '.service'), 'actions.runner.phoibe-prive.ancien-runner.service\n');
    const r = await run(['phoibe/prive'], { fake, runners: '77 ancien-runner self-hosted,Linux,X64,factory-dev online\n' });
    assert.equal(r.code, 0, r.out);
    assert.match(r.log, /^systemctl enable --now actions\.runner\.phoibe-prive\.ancien-runner\.service$/m);
    assert.doesNotMatch(r.log, /\bsvc\.sh/);
  });

  test('a runner whose service could not start (runsvc.sh missing) is repaired by running the command again', async () => {
    const first = await run(['phoibe/prive']);
    const { rmSync } = await import('node:fs');
    rmSync(join(first.fake, 'runners', 'phoibe-prive-1', 'runsvc.sh'));
    const again = await run(['phoibe/prive'], { fake: first.fake });
    assert.equal(again.code, 0, again.out);
    assert.ok(existsSync(join(first.fake, 'runners', 'phoibe-prive-1', 'runsvc.sh')));
    assert.match(again.log, /^sudo -u factory-runner .*cp bin\/runsvc\.sh runsvc\.sh/m);
    assert.match(again.log, /^systemctl enable --now actions\.runner\.phoibe-prive\.devbox-prive-1\.service$/m);
  });

  test('a runner that failed to install (offline, no folder here) is deleted on GitHub and its number used again', async () => {
    const r = await run(['phoibe/prive'], { runners: '111 devbox-prive-1 self-hosted,Linux,X64,factory-dev offline\n' });
    assert.equal(r.code, 0, r.out);
    assert.match(r.log, /^gh api -X DELETE repos\/phoibe\/prive\/actions\/runners\/111$/m);
    assert.deepEqual(names(r.runners), ['devbox-prive-1', 'devbox-prive-2']);
    assert.equal(factoryDev(r.runners).length, 2);
    assert.doesNotMatch(r.log, /devbox-prive-3/);
  });

  test('an offline runner of this server that still has its folder is restarted, not deleted', async () => {
    const first = await run(['phoibe/prive']);
    writeFileSync(join(first.fake, 'runners.txt'), first.runners.replace(/devbox-prive-1 (\S+) online/, 'devbox-prive-1 $1 offline'));
    const again = await run(['phoibe/prive'], { fake: first.fake });
    assert.equal(again.code, 0, again.out);
    assert.doesNotMatch(again.log, /DELETE/);
    assert.match(again.log, /^systemctl enable --now actions\.runner\.phoibe-prive\.devbox-prive-1\.service$/m);
  });

  test('runners numbered 2 and 3 become 1 and 2: runner 1 is added first, then runner 3 removed', async () => {
    const fake = await threeRunners();
    rmSync(join(fake, 'runners', 'phoibe-prive-1'), { recursive: true });
    rmSync(join(fake, 'systemd', 'actions.runner.phoibe-prive.devbox-prive-1.service'));
    const runners = readFileSync(join(fake, 'runners.txt'), 'utf8').replace(/^\d+ devbox-prive-1 (\S+) online$/m, '111 devbox-prive-1 $1 offline');
    writeFileSync(join(fake, 'runners.txt'), runners);
    const r = await run(['phoibe/prive'], { fake });
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(names(r.runners), ['devbox-prive-1', 'devbox-prive-2']);
    assert.ok(r.log.indexOf('--name devbox-prive-1 ') < r.log.indexOf('actions/runners/333'), 'the new runner comes before the old one goes');
    assert.match(r.log, /^systemctl disable --now actions\.runner\.phoibe-prive\.devbox-prive-3\.service$/m);
    assert.ok(!existsSync(join(fake, 'runners', 'phoibe-prive-3')));
    assert.ok(!existsSync(join(fake, 'systemd', 'actions.runner.phoibe-prive.devbox-prive-3.service')));
    assert.ok(existsSync(join(fake, 'systemd', 'actions.runner.phoibe-prive.devbox-prive-1.service')));
    assert.match(r.out, /devbox-prive-3 retiré/);
  });

  test('a third runner beyond the two wanted is removed', async () => {
    const fake = await threeRunners();
    const r = await run(['phoibe/prive'], { fake });
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(names(r.runners), ['devbox-prive-1', 'devbox-prive-2']);
    assert.doesNotMatch(r.log, /^config\.sh /m);
    assert.ok(!existsSync(join(fake, 'runners', 'phoibe-prive-3')));
  });

  test('a runner to remove that is running a job is left alone until the next run', async () => {
    const fake = await threeRunners({ busy: true });
    const r = await run(['phoibe/prive'], { fake });
    assert.equal(r.code, 0, r.out);
    assert.match(r.runners, /devbox-prive-3/);
    assert.ok(existsSync(join(fake, 'runners', 'phoibe-prive-3')));
    assert.doesNotMatch(r.log, /DELETE|disable --now/);
    assert.match(r.out, /devbox-prive-3 occupé par une tâche/);
  });

  test('a hand-made runner is never removed, even with more runners than wanted', async () => {
    const fake = handMadeRunner('ancien-runner', 'phoibe/prive');
    const first = await run(['phoibe/prive'], { fake, runners: '77 ancien-runner self-hosted,Linux,X64,factory-dev online\n' });
    const again = await run(['phoibe/prive'], { fake: first.fake });
    assert.equal(again.code, 0, again.out);
    assert.match(again.runners, /ancien-runner/);
    assert.doesNotMatch(again.log, /DELETE/);
  });

  test('run from a real terminal, the runners already there are recognised and kept', { skip: !existsSync('/usr/bin/script') }, async () => {
    const first = await run(['phoibe/prive']);
    const fake = first.fake;
    writeFileSync(join(fake, 'log'), '');
    const env = { PATH: `${STUBS}:/usr/bin:/bin`, HOME: fake, FAKE: fake, DEV_SERVER_ROOT: join(fake, 'runners'), DEV_SERVER_SCAN: join(fake, 'elsewhere'), DEV_SERVER_SYSTEMD: join(fake, 'systemd'), DEV_SERVER_CACHE: join(fake, 'cache') };
    // A pseudo-terminal 47 rows high: bash then rewrites LINES after every command.
    const out = await new Promise((done) => execFile('script', ['-qec', `stty rows 47 cols 120; bash ${SCRIPT} phoibe/prive </dev/null`, '/dev/null'], { env, encoding: 'utf8', timeout: 30_000 }, (err, o) => done(o)));
    assert.match(out, /devbox-prive-1 déjà là/, out);
    assert.doesNotMatch(out, /nettoyé|Runner {2}\(/, out);
    assert.doesNotMatch(readFileSync(join(fake, 'log'), 'utf8'), /^config\.sh /m);
    assert.ok(existsSync(join(fake, 'runners', 'phoibe-prive-1', '.runner')));
  });

  test('the script never keeps its data in a variable bash rewrites by itself', () => {
    const script = readFileSync(SCRIPT, 'utf8');
    for (const name of ['LINES', 'COLUMNS', 'RANDOM', 'SECONDS', 'PWD', 'OLDPWD', 'LINENO', 'PIPESTATUS', 'BASH_REMATCH']) {
      assert.doesNotMatch(script, new RegExp(`(^|[\\s;(])${name}=`, 'm'), name);
      assert.doesNotMatch(script, new RegExp(`\\$\\{?${name}\\b`), name);
    }
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

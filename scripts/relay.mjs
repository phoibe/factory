#!/usr/bin/env node
// The factory's orchestrator, run by .github/workflows/relay.yml on every project event.
//   node scripts/relay.mjs decide
//   node scripts/relay.mjs report --result success|failure --pr 12
//   node scripts/relay.mjs release            (end of an Actions agent run: PAYLOAD env)
import { appendFileSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveConfig, parseRawConfig } from './lib/config.mjs';
import { github } from './lib/github.mjs';
import { isRateLimited } from './lib/ratelimit.mjs';
import { withLock } from './lib/lock.mjs';
import { toJobOutput, fromJobOutput } from './lib/job-output.mjs';
import { statePart } from './relay/state.mjs';
import { launchesPart } from './relay/launches.mjs';
import { deliveryPart } from './relay/delivery.mjs';
import { watchPart } from './relay/watch.mjs';
import { eventsPart } from './relay/events.mjs';
import { ROOT, rateLimitHandled } from './relay/shared.mjs';

// The engine lives in scripts/relay/: one file per job, composed by createRelay below. Their public names stay exported here.
export { LOCK_MINUTES, PROJECT_WORKFLOW, PROD_BRANCH, DELIVERY_MARKER, manualMergeText, MAX_BRANCH_UPDATES, branchUpdates, IDLE_MINUTES, RATE_LIMIT_STEP, MAX_RATE_LIMIT_ATTEMPTS, rateLimitHandled, redoOf, isLiveEnv, linkedIssue, vercelPreview, isDocFile } from './relay/shared.mjs';
import { eventFromPayload } from './relay/events.mjs';
export { eventFromPayload };

export function createRelay({ gh, repo, config, env = {}, fetchImpl = fetch, now = () => Date.now(), log = console.log, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const ctx = { gh, repo, config, env, fetchImpl, now, log, sleep };
  for (const part of [statePart, launchesPart, deliveryPart, watchPart, eventsPart]) Object.assign(ctx, part(ctx));
  const { handle, refilling, report, retrySoon, relaunchSoon, retryLaunches, dequeue, refill, release, fabrication, notifyWaiting, prodReport, deployFailed, releaseChecking, liveUrl, previewWait, outputs } = ctx;
  return { handle, report: refilling(report), retrySoon, relaunchSoon, retryLaunches, dequeue, refill, release, fabrication, notifyWaiting, prodReport: refilling(prodReport), deployFailed: refilling(deployFailed), releaseChecking, liveUrl, previewWait, outputs };
}

// The smoke check's result file (smoke.mjs --out). A missing or broken file means the check could not run.
function readResult(file) {
  try { const r = JSON.parse(readFileSync(file, 'utf8')); if (['passed', 'failed', 'skipped'].includes(r.result)) return r; } catch { /* below */ }
  return { result: 'skipped', detail: "la vérification n'a pas pu tourner" };
}

// The check a dispatch asked for (decide's preview or production output, see lib/job-output.mjs).
function readCheck() {
  try { return JSON.parse(fromJobOutput(process.env.CHECK) || '{}') || {}; } catch { return {}; }
}

export function writeOutputs(outputs) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return console.log(outputs);
  for (const [k, v] of Object.entries(outputs)) {
    const eof = `ghadelim_${randomUUID()}`; // the value is raw input: a fixed delimiter could be written in it
    appendFileSync(file, `${k}<<${eof}\n${v}\n${eof}\n`);
  }
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  // An empty value must never swallow the next option (« --sha --started 12 » would read « --started » as the sha).
  const arg = (name) => { const i = rest.indexOf(`--${name}`); const v = i >= 0 ? rest[i + 1] : undefined; return v?.startsWith('--') ? undefined : v; };
  const repo = process.env.GITHUB_REPOSITORY;
  const ownerLogin = process.env.GITHUB_REPOSITORY_OWNER;
  const gh = github({ token: process.env.GITHUB_TOKEN, repo });
  const catalog = JSON.parse(readFileSync(join(ROOT, 'packs/catalog.json'), 'utf8'));
  const file = await gh.getContent('factory.config.json');
  const parsed = parseRawConfig(file ? Buffer.from(file.content, 'base64').toString('utf8') : null);
  const { config, warnings } = resolveConfig(parsed.raw, catalog);
  if (parsed.warning) warnings.push(parsed.warning);
  for (const w of warnings) console.log(`::warning::${w}`);
  const relay = createRelay({ gh, repo, config, env: process.env });
  if (command === 'decide') {
    const payload = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    // One decision at a time in the whole repository: see lib/lock.mjs.
    await withLock(gh.queueLock, () => relay.handle(eventFromPayload(process.env.GITHUB_EVENT_NAME, payload), { ownerLogin }));
  } else if (command === 'report') {
    // A report may merge and then dequeue: same lock as the decisions.
    await withLock(gh.queueLock, () => relay.report({ result: arg('result'), pr: Number(arg('pr')), runId: process.env.GITHUB_RUN_ID, sha: arg('sha'), started: Number(arg('started')) || null, transient: arg('transient') === 'server' ? 'server' : arg('transient') === 'true' }));
    await relay.retrySoon(Number(arg('pr'))); // first retry after an outage, outside the lock
    await relay.relaunchSoon(); // a fix whose launch failed for a passing reason: first relaunch, outside the lock
    await withLock(gh.queueLock, () => relay.notifyWaiting()); // the recette may just have started waiting for the owner
  } else if (command === 'release') {
    // The lock and the replay need no queue lock: done first, they never wait behind it. Then the place the run may
    // have freed is filled at once (issue #384), under the same lock as the decisions.
    await relay.release(JSON.parse(process.env.PAYLOAD || '{}'));
    await withLock(gh.queueLock, () => relay.refill()).catch((e) => console.log(`queue check after the run: ${e.message}`));
  } else if (command === 'relaunch-soon') {
    // Its own job after a decision whose launch failed for a passing reason (issue #383): the first relaunch, 2 min later.
    await relay.relaunchSoon(Number(arg('ms')) || 0);
    return;
  } else if (command === 'preview-report') {
    // After the preview check (smoke.mjs): the report goes on, with the preview's result.
    const check = readCheck();
    const url = fromJobOutput(arg('url')) || check.url || null;
    const res = url ? readResult(arg('result-file')) : { result: 'skipped', detail: "la preview n'est pas apparue" };
    await withLock(gh.queueLock, () => relay.report({ result: 'success', pr: Number(check.pr), sha: check.sha, preview: { ...res, url, runId: process.env.GITHUB_RUN_ID } }));
    await relay.relaunchSoon(); // a fix whose launch failed for a passing reason: first relaunch, outside the lock
    await withLock(gh.queueLock, () => relay.notifyWaiting());
  } else if (command === 'preview-url') {
    // The preview job waits for the preview here, without the queue lock: minutes that block no decision.
    const url = await relay.previewWait(readCheck());
    writeOutputs({ url: toJobOutput(url) });
    return;
  } else if (command === 'release-step') {
    // The new version of a release is online: move its card to « Vérification du site en ligne » (issue #370).
    await relay.releaseChecking(readCheck());
    return;
  } else if (command === 'live-url') {
    const check = readCheck();
    let url = await relay.liveUrl(check.sha, { since: Number(check.retriedAt) || 0, url: check.url || null });
    // The re-run of a failed publication published nothing at all: as good as a second failure.
    if (url === null && check.deployRetried) url = { failed: true, detail: "la nouvelle tentative n'a rien publié en 10 minutes" };
    writeOutputs({ url: toJobOutput(typeof url === 'string' ? url : ''), deployFailed: url?.failed ? 'true' : 'false', deployFailure: url?.failed ? toJobOutput(JSON.stringify(url)) : '' });
    return;
  } else if (command === 'prod-report') {
    const check = readCheck();
    // The re-check of a stuck card could not open the site: the card starts (never a re-run of an old version).
    if (check.redo && arg('deploy-failed') === 'true') {
      await withLock(gh.queueLock, () => relay.prodReport({ pr: Number(check.pr), sha: check.sha, result: 'skipped', detail: "la version en ligne n'a pas pu être ouverte", redo: check.redo }));
      return;
    }
    if (arg('deploy-failed') === 'true') {
      let failure = {};
      try { failure = JSON.parse(fromJobOutput(process.env.DEPLOY_FAILURE) || '{}') || {}; } catch { /* no details */ }
      await withLock(gh.queueLock, () => relay.deployFailed({ pr: Number(check.pr), sha: check.sha, detail: failure.detail, runId: failure.runId, retried: Boolean(check.deployRetried), release: check.release || null }));
      return;
    }
    // Issue #370: a release reached the production job without any deployment ever observed (no site opened, no
    // failure). End it as live-but-unchecked so the request closes and the button is freed, instead of staying open.
    if (!fromJobOutput(arg('url')) && check.release?.issue) {
      await withLock(gh.queueLock, () => relay.prodReport({ pr: Number(check.pr), sha: check.sha, result: 'skipped', detail: "l'hébergeur n'a pas signalé la nouvelle version", release: check.release }));
      return;
    }
    const res = readResult(arg('result-file'));
    const dir = arg('dir') || '.';
    const git = (args) => execFileSync('git', args, { cwd: dir, stdio: ['ignore', 'pipe', 'inherit'] }).toString();
    await withLock(gh.queueLock, () => relay.prodReport({ pr: Number(check.pr), sha: check.sha, url: fromJobOutput(arg('url')), ...res, runId: process.env.GITHUB_RUN_ID, git, redo: check.redo || null, release: check.release || null }));
  } else if (command === 'dequeue') {
    await withLock(gh.queueLock, () => relay.dequeue());
  } else {
    throw new Error(`unknown command ${command}`);
  }
  writeOutputs({ checks: 'false', agent: 'false', pr: '', payload: '', preview: '', production: '', previewSha: '', productionSha: '', releaseIssue: '', checksMinutes: String(config.checksMinutes || 30), ...relay.outputs });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    // GitHub's « too many requests » for longer than a pause: the step `RATE_LIMIT_STEP` of relay.yml fails on this
    // output, and the next tick re-runs the run (retryRateLimited), so the event is taken up instead of lost.
    if (isRateLimited(e) && rateLimitHandled(process.argv[2])) { writeOutputs({ checks: 'false', agent: 'false', pr: '', payload: '', preview: '', production: '', ratelimited: 'true' }); return; }
    process.exit(1);
  });
}

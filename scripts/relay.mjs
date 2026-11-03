#!/usr/bin/env node
// The factory's orchestrator, run by .github/workflows/relay.yml on every project event.
//   node scripts/relay.mjs decide
//   node scripts/relay.mjs report --result success|failure --pr 12
import { appendFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide, afterChecks } from './lib/decide.mjs';
import { L, AGENT_MARKER, CHECKS_FAILED_MARKER, CHECKS_RESET_MARKER } from './lib/labels.mjs';
import { resolveConfig } from './lib/config.mjs';
import { github } from './lib/github.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const LOCK_MINUTES = 90;
const FOOTER = '\n\n---\n_Message automatique de la software factory_';
const say = (text) => `${AGENT_MARKER}\n${text}${FOOTER}`;
const names = (labels = []) => labels.map((l) => (typeof l === 'string' ? l : l.name));

export function linkedIssue(body) {
  const m = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/i.exec(body || '');
  return m ? Number(m[1]) : null;
}

// Normalises a GitHub webhook payload into the shape decide() expects.
export function eventFromPayload(eventName, p) {
  const owner = p.repository?.owner?.login;
  const isOwner = (login) => Boolean(login) && (login === owner || login === 'claude[bot]');
  const base = { event: eventName, action: p.action, addedLabel: p.label?.name, fromAgent: false, text: '' };
  if (eventName === 'issues') {
    return { ...base, kind: 'issue', number: p.issue.number, labels: names(p.issue.labels), fromOwner: p.sender?.login === owner };
  }
  if (eventName === 'issue_comment') {
    const body = p.comment?.body || '';
    return {
      ...base, kind: p.issue.pull_request ? 'pr' : 'issue', number: p.issue.number, labels: names(p.issue.labels),
      text: body, fromAgent: body.includes(AGENT_MARKER), fromOwner: p.comment?.user?.login === owner,
    };
  }
  if (eventName === 'pull_request_review') {
    const body = p.review?.body || '';
    return {
      ...base, kind: 'pr', number: p.pull_request.number, labels: names(p.pull_request.labels),
      text: body, fromAgent: body.includes(AGENT_MARKER), fromOwner: p.review?.user?.login === owner,
    };
  }
  if (eventName === 'pull_request') {
    return {
      ...base, kind: 'pr', number: p.pull_request.number, labels: names(p.pull_request.labels),
      merged: Boolean(p.pull_request.merged), fromOwner: isOwner(p.sender?.login),
    };
  }
  return { ...base, kind: 'none', number: null, labels: [], fromOwner: false };
}

export function createRelay({ gh, repo, config, env = {}, fetchImpl = fetch, now = () => Date.now(), log = console.log, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const outputs = {};

  async function inFlight() {
    const open = await gh.listIssues({ labels: L.building });
    return (open || []).filter((i) => !i.pull_request).length;
  }

  async function lockFresh(number, labels) {
    if (!labels.includes(L.running)) return false;
    const events = (await gh.listEvents(number)) || [];
    const last = events.filter((e) => e.event === 'labeled' && e.label?.name === L.running).pop();
    return Boolean(last) && now() - Date.parse(last.created_at) < LOCK_MINUTES * 60_000;
  }

  async function fireAgent({ stage, issue, pr }) {
    const targets = [issue, pr].filter(Boolean);
    for (const n of targets) await gh.addLabels(n, [L.running]);
    const payload = { repo, issue, pr: pr || null, stage, factory: 'phoibe/factory' };
    log(`fire ${stage} ${JSON.stringify(payload)}`);
    if (config.runner === 'github-actions') {
      outputs.agent = 'true';
      outputs.payload = JSON.stringify(payload);
      return;
    }
    if (!env.FACTORY_ROUTINE_URL || !env.FACTORY_ROUTINE_TOKEN) {
      for (const n of targets) await gh.removeLabel(n, L.running);
      await gh.comment(targets[targets.length - 1], say(
        "Je n'ai pas pu lancer l'agent : la routine Claude n'est pas configurée pour ce dépôt.\n\n"
        + 'Ajoute les secrets `FACTORY_ROUTINE_URL` et `FACTORY_ROUTINE_TOKEN` (voir le guide de mise en route du README), puis réécris ton message.'));
      throw new Error('routine secrets missing');
    }
    const res = await fetchImpl(env.FACTORY_ROUTINE_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.FACTORY_ROUTINE_TOKEN}`,
        'anthropic-beta': 'experimental-cc-routine-2026-04-01',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: JSON.stringify(payload) }),
    });
    if (!res.ok) {
      const detail = await res.text();
      for (const n of targets) await gh.removeLabel(n, L.running);
      await gh.comment(targets[targets.length - 1], say(
        `Je n'ai pas pu lancer l'agent (la routine Claude a répondu ${res.status}). `
        + "Ça arrive quand la limite quotidienne de lancements est atteinte. Réécris ton message plus tard, ou passe ce projet sur le moteur « GitHub Actions » dans le panneau."));
      throw new Error(`routine fire failed: ${res.status} ${detail}`);
    }
    const body = await res.json().catch(() => ({}));
    log(`session: ${body.claude_code_session_url || '?'}`);
  }

  async function dequeue() {
    let free = config.maxParallel - (await inFlight());
    if (free <= 0) return;
    const queued = ((await gh.listIssues({ labels: L.queued, sort: 'created', direction: 'asc' })) || []).filter((i) => !i.pull_request);
    for (const issue of queued.slice(0, free)) {
      await gh.removeLabel(issue.number, L.queued);
      await gh.addLabels(issue.number, [L.building]);
      const isBug = names(issue.labels).includes(L.bug);
      await gh.comment(issue.number, say('Une place s\'est libérée : je démarre la construction.'));
      await fireAgent({ stage: isBug ? 'bugfix' : 'build', issue: issue.number });
      free -= 1;
      if (config.runner === 'github-actions') break; // one agent job per workflow run
    }
  }

  async function mergePr(prNumber) {
    const pr = await gh.getPr(prNumber);
    await gh.merge(prNumber);
    const issue = linkedIssue(pr.body);
    for (const l of [L.acceptance, L.checks, L.fixing, L.running]) await gh.removeLabel(prNumber, l);
    await gh.comment(prNumber, say("C'est fusionné ✅. La version en ligne se met à jour automatiquement dans quelques minutes."));
    if (issue) await gh.removeLabel(issue, L.building);
    await dequeue();
  }

  async function previewUrl(sha, { attempts = 30, delayMs = 20_000 } = {}) {
    for (let i = 0; i < attempts; i++) {
      for (const d of (await gh.deployments(sha)) || []) {
        const ok = ((await gh.deploymentStatuses(d.id)) || []).find((s) => s.state === 'success');
        if (ok) return ok.environment_url || ok.target_url;
      }
      if (i < attempts - 1) await sleep(delayMs);
    }
    return null;
  }

  async function handle(ev) {
    const ctx = { inFlight: 0, lockFresh: false };
    if (ev.kind !== 'none' && ev.number) {
      ctx.lockFresh = await lockFresh(ev.number, ev.labels);
      ctx.inFlight = await inFlight();
    }
    const action = decide(ev, config, ctx);
    log(`decision: ${action.type}${action.stage ? ` ${action.stage}` : ''} (${action.reason || ''})`);
    const n = ev.number;
    for (const l of action.remove || []) await gh.removeLabel(n, l);
    if (action.add?.length) await gh.addLabels(n, action.add);
    switch (action.type) {
      case 'fire': {
        if (ev.kind === 'pr') {
          const pr = await gh.getPr(n);
          await fireAgent({ stage: action.stage, issue: linkedIssue(pr.body), pr: n });
        } else {
          await fireAgent({ stage: action.stage, issue: n });
        }
        break;
      }
      case 'queue':
        await gh.comment(n, say(`C'est noté. ${config.maxParallel} feature(s) sont déjà en construction, c'est le maximum réglé pour ce projet : celle-ci est en file d'attente et démarrera toute seule dès qu'une place se libère.`));
        break;
      case 'checks':
        outputs.checks = 'true';
        outputs.pr = String(n);
        break;
      case 'merge':
        await mergePr(n);
        break;
      case 'dequeue':
        await dequeue();
        break;
      default:
        break;
    }
    return { action, outputs };
  }

  async function report({ result, pr: prNumber }) {
    const pr = await gh.getPr(prNumber);
    const issueNumber = linkedIssue(pr.body);
    const issue = issueNumber ? await gh.getIssue(issueNumber) : null;
    const isBug = names(issue?.labels).includes(L.bug);
    const comments = (await gh.listComments(prNumber)) || [];
    const lastReset = comments.map((c) => (c.body || '').includes(CHECKS_RESET_MARKER)).lastIndexOf(true);
    const failures = comments.slice(lastReset + 1).filter((c) => (c.body || '').includes(CHECKS_FAILED_MARKER)).length;
    const next = afterChecks({ result, isBug, acceptanceOn: config.stages.acceptance, failures, maxLoops: config.review.maxLoops });
    log(`checks ${result} -> ${next}`);
    for (const l of [L.checks, L.fixing]) await gh.removeLabel(prNumber, l);
    if (next === 'merge') return mergePr(prNumber);
    if (next === 'acceptance') {
      await gh.addLabels(prNumber, [L.acceptance]);
      const url = await previewUrl(pr.head.sha);
      const where = url
        ? `Tu peux tester la nouvelle version ici : ${url}`
        : "Je n'ai pas trouvé de preview pour cette PR. Vérifie que Vercel est bien connecté au dépôt (voir le README).";
      await gh.comment(prNumber, say(`Les contrôles automatiques sont tous verts ✅\n\n${where}\n\nVérifie les critères d'acceptation de la spec. Réponds « ok » pour mettre en ligne, ou décris ce qui ne va pas.`));
      return;
    }
    if (next === 'fix') {
      await gh.addLabels(prNumber, [L.fixing]);
      await gh.comment(prNumber, `${CHECKS_FAILED_MARKER}\n${say(`Un contrôle automatique a échoué. L'agent corrige (tentative ${failures + 1} sur ${config.review.maxLoops}), rien à faire de ton côté.`)}`);
      await fireAgent({ stage: 'fix-checks', issue: issueNumber, pr: prNumber });
      return;
    }
    // blocked: the next failure count starts again from zero once the owner unblocks it.
    if (issueNumber) await gh.addLabels(issueNumber, [L.blocked]);
    await gh.comment(prNumber, `${CHECKS_RESET_MARKER}\n${say("Les contrôles restent rouges : j'ai mis la construction en pause et expliqué la situation sur l'issue.")}`);
    await gh.comment(issueNumber || prNumber, say(`Les contrôles automatiques échouent encore après ${config.review.maxLoops} tentatives de correction, donc je m'arrête pour ne pas tourner en rond.\n\nLe détail technique est dans la PR #${prNumber}. Tu peux répondre ici par « réessaie » pour relancer une tentative, ou me dire de simplifier la feature.`));
  }

  return { handle, report, dequeue, outputs };
}

function writeOutputs(outputs) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return console.log(outputs);
  for (const [k, v] of Object.entries(outputs)) appendFileSync(file, `${k}<<__EOF__\n${v}\n__EOF__\n`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const arg = (name) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
  const repo = process.env.GITHUB_REPOSITORY;
  const gh = github({ token: process.env.GITHUB_TOKEN, repo });
  const catalog = JSON.parse(readFileSync(join(ROOT, 'packs/catalog.json'), 'utf8'));
  const file = await gh.getContent('factory.config.json');
  const raw = file ? JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')) : {};
  const { config, warnings } = resolveConfig(raw, catalog);
  for (const w of warnings) console.log(`::warning::${w}`);
  const relay = createRelay({ gh, repo, config, env: process.env });
  if (command === 'decide') {
    const payload = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    await relay.handle(eventFromPayload(process.env.GITHUB_EVENT_NAME, payload));
  } else if (command === 'report') {
    await relay.report({ result: arg('result'), pr: Number(arg('pr')) });
  } else if (command === 'dequeue') {
    await relay.dequeue();
  } else {
    throw new Error(`unknown command ${command}`);
  }
  writeOutputs({ checks: 'false', agent: 'false', pr: '', payload: '', ...relay.outputs });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

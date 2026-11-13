// Part of the relay engine (scripts/relay.mjs): merging, production (release, live check, rollback, redo), the site version tag and the stack sheet.
// Its functions reach the other parts through the shared context `ctx` built by createRelay.
import { L, AGENT_MARKER, UPDATE_BRANCH_MARKER, REVERT_MARKER, PROD_BUG_MARKER, releaseNote } from '../lib/labels.mjs';
import { effectiveProduction, workBranch, PREPROD_BRANCH } from '../lib/config-core.mjs';
import { mergeBranchesSettling, MergeConflict } from '../lib/merge-generated.mjs';
import { isRateLimited } from '../lib/ratelimit.mjs';
import { readWatch, writeWatch } from '../lib/watch.mjs';
import { deliveryOf, DELIVERY_SECTION } from '../../panel/stack.mjs';
import { CHANGELOG_PATHS, readChangelog, versionProblem, cutVersion, sectionOf, versionOf } from '../../panel/changelog.mjs';
import { readSiteTag, tagConcerned, VERSION_TAG_MARKER } from '../lib/version-tag.mjs';
import { siteLink } from '../../panel/lib.mjs';
import { PROJECT_WORKFLOW, PROD_BRANCH, DELIVERY_MARKER, manualMergeText, MAX_BRANCH_UPDATES, updateMark, branchUpdates, REVERT_REDO, REDO_OF, RECHECK_MARKER, REDO_STUCK_MS, STILL_LIVE, redoOf, isLiveEnv, prIssue, say, names, isDocFile } from './shared.mjs';

export function deliveryPart(ctx) {
  const { gh, repo, config, fetchImpl, now, log, sleep } = ctx;
  const liveLabels = (...a) => ctx.liveLabels(...a);
  const releaseOver = (...a) => ctx.releaseOver(...a);
  const noteWatch = (...a) => ctx.noteWatch(...a);
  const fromFork = (...a) => ctx.fromFork(...a);
  const fireOrBlock = (...a) => ctx.fireOrBlock(...a);
  const dequeue = (...a) => ctx.dequeue(...a);
  const unstickConflicts = (...a) => ctx.unstickConflicts(...a);
  const dropCard = (...a) => ctx.dropCard(...a);
  const handle = (...a) => ctx.handle(...a);

  // The documents written during the questions (glossary, decisions) are merged as soon as their PR opens, but only
  // when it touches nothing else: a doc PR that carries code is left for the owner.
  async function mergeDocsPr(prNumber) {
    const pr = await gh.getPr(prNumber);
    const sha = pr?.head?.sha;
    const def = (await gh.getRepo?.())?.default_branch || 'main';
    // Only the factory's own branch, in this repo, aimed at the branch the factory merges into.
    if (!pr || pr.state !== 'open' || pr.draft || ![def, workBranch(config.production, def)].includes(pr.base?.ref) || (pr.head?.repo?.full_name && pr.head.repo.full_name !== repo)) {
      log(`docs PR #${prNumber}: not a plain docs PR of this repo, left alone`); return;
    }
    const list = (await gh.listPrFiles(prNumber)) || [];
    if (!list.length || !list.every((f) => f.status !== 'renamed' && !f.previous_filename && isDocFile(f.filename))) { log(`docs PR #${prNumber}: not only documents, left alone`); return; }
    try {
      await gh.merge(prNumber, sha);
      log(`docs PR #${prNumber} merged`);
    } catch (e) {
      log(`docs PR #${prNumber} not merged: ${e.message || e}`);
      await gh.comment(prNumber, say("Je n'ai pas pu fusionner ces documents (glossaire et décisions) tout seul, sans doute un conflit. Rien n'est cassé : le projet continue sans eux pour l'instant.")).catch(() => {});
    }
  }

  async function mergePr(prNumber, sha) {
    const pr = await gh.getPr(prNumber);
    const issue = prIssue(pr);
    // Where the change lands. External production (chosen in the settings, or by default when the stack sheet says
    // « Manuelle »: a merge deploys nothing, as on Pulsar Wheel): main, and the factory stops there. On approval
    // (« Sur mon accord »): preprod, until « Mise en production » merges it into main. An undo of a broken delivery
    // goes to main at once, unless other changes already wait: publishing them without the owner's accord is worse.
    const isUndo = String(pr?.body || '').includes(REVERT_MARKER);
    const othersWait = async () => ((await gh.listAwaiting?.().catch(() => [])) || []).some((p) => p.number !== prNumber && names(p.labels).includes(L.awaitingProd));
    const mode = effectiveProduction(config, config.production ? null : await readDelivery());
    const manual = mode === 'external';
    const held = mode === 'approval' && (!isUndo || await othersWait());
    const def = (await gh.getRepo?.().catch(() => null))?.default_branch || 'main';
    const target = held ? PREPROD_BRANCH : def;
    // A PR opened before the mode changed is moved onto the right branch before its merge.
    if (pr?.base?.ref && pr.base.ref !== target && [def, PREPROD_BRANCH].includes(pr.base.ref) && gh.setPrBase) {
      try {
        if (held) await ensurePreprod(def);
        await gh.setPrBase(prNumber, target);
        log(`PR #${prNumber} moved from ${pr.base.ref} to ${target}`);
      } catch (e) { log(`PR #${prNumber} not moved to ${target}: ${e.message || e}`); }
    }
    try {
      await gh.merge(prNumber, sha);
    } catch (e) {
      if (isRateLimited(e)) throw e; // not a refused merge: the event is taken up again once the limit is over
      // The merge may have gone through behind a 5xx: a merged PR is a success, not a refusal.
      const fresh = await gh.getPr(prNumber);
      if (fresh?.merged) log(`merge reported as failed (${e}) but PR #${prNumber} is merged`);
      else {
        log(`merge failed: ${e}`);
        const state = fresh?.mergeable_state;
        const head = sha || pr?.head?.sha;
        const updates = branchUpdates(await gh.listComments(prNumber), head);
        if ((state === 'behind' || state === 'dirty') && updates < MAX_BRANCH_UPDATES) {
          await fireOrBlock({ stage: 'update-branch', issue, pr: prNumber, why: 'La branche doit être mise à jour avant la fusion', then: {
            labels: [{ n: prNumber, remove: [L.acceptance, L.checks], add: [L.fixing] }],
            comments: [{ n: prNumber, body: `${UPDATE_BRANCH_MARKER}\n${updateMark(head)}\n${say("Je n'ai pas pu fusionner : la branche n'est plus à jour avec la version en ligne (une autre feature est sans doute passée entre-temps). L'agent la met à jour, puis les contrôles repartent. Rien à faire de votre côté.")}` }],
          } });
          return;
        }
        for (const l of [L.acceptance, L.checks, L.fixing]) await gh.removeLabel(prNumber, l);
        if (issue) await gh.addLabels(issue, [L.blocked]);
        await gh.comment(issue || prNumber, say(`Je n'arrive pas à fusionner la PR #${prNumber} (GitHub répond : « ${String(e.message || e).slice(0, 200)} »). Ce n'est pas un problème de code : souvent une règle du dépôt (protection de branche, revue obligatoire) ou une branche impossible à remettre à jour automatiquement. Dites-moi « réessaie » une fois la règle ajustée, ou fusionnez la PR vous-même.`));
        return;
      }
    }
    for (const l of [L.acceptance, L.checks, L.fixing, L.running, L.blocked]) await gh.removeLabel(prNumber, l);
    await afterMerge(prNumber, { held });
    if (manual) {
      await gh.comment(prNumber, say(manualMergeText()));
    } else if (held) {
      await holdForApproval(prNumber).catch((e) => log(`hold for approval: ${e.message}`));
      await gh.comment(prNumber, say("C'est fusionné ✅. Le site en ligne ne change pas encore : cette modification attend que vous cliquiez sur « Mise en production », en haut du projet dans le tableau de bord."));
    } else {
      await followMain(prNumber).catch((e) => log(`production branch: ${e.message}`));
      await checkLive(prNumber).catch((e) => log(`live check not started: ${e.message}`));
    }
    await redoAfterRevert(pr).catch((e) => log(`redo after revert: ${e.message}`));
    if (!held && !manual) await gh.comment(prNumber, say("C'est fusionné ✅. La version en ligne se met à jour automatiquement dans quelques minutes."));
    if (issue) for (const l of [L.building, L.blocked]) await gh.removeLabel(issue, l);
    // A merge made with the workflow's token does not close the issues the PR names (« Closes #n »): close it here.
    if (issue) await gh.closeIssue(issue).catch((e) => log(`close #${issue}: ${e.message}`));
    await dequeue({ freed: issue });
    await unstickConflicts().catch((e) => log(`conflicts: ${e.message}`));
  }

  // How the project goes to production, read in its stack sheet (STACK.md, « Mise en production »). null when the sheet
  // is missing, says neither, or cannot be read: the factory then keeps its former ways (automatic).
  async function readDelivery() {
    if (!gh.getContent) return null;
    const file = await gh.getContent('STACK.md').catch(() => null);
    if (!file?.content) return null;
    return deliveryOf(Buffer.from(file.content, 'base64').toString('utf8'));
  }

  // A merge made with the workflow's own token starts no workflow, so the panel deploy (GitHub Pages) and the
  // skills sync that the push would have started are started by hand. A project without them is skipped.
  async function afterMerge(prNumber, { held = false } = {}) {
    let files = [];
    try { files = ((await gh.listPrFiles(prNumber)) || []).map((f) => f.filename); } catch { /* deploy anyway */ }
    const ref = (await gh.getRepo())?.default_branch || 'main';
    // A held change is not published: GitHub Pages is deployed at « Mise en production » instead.
    const wanted = [...(held ? [] : ['pages.yml']), ...(files.includes('factory.config.json') ? ['factory-sync.yml'] : [])];
    for (const wf of wanted) {
      try { await gh.dispatch(wf, ref, {}); } catch (e) { log(`after merge: ${wf} not started (${String(e.message || e).slice(0, 80)})`); }
    }
  }

  // ---- Production on approval (issue #294) ----
  // Validated changes are merged into `preprod`; « Mise en production » merges preprod into the default branch, which
  // the host publishes as usual: nothing to set up at the host. The `production` branch of the first version (the host
  // was set to publish it) is still moved along with main when a project has one, so that such a host keeps working.
  async function moveProduction(sha) {
    const cur = (await gh.getBranch(PROD_BRANCH).catch(() => null))?.object?.sha;
    if (cur === sha) return false;
    if (cur) await gh.updateRef(PROD_BRANCH, sha); else await gh.createRef(PROD_BRANCH, sha);
    log(`production branch moved to ${String(sha).slice(0, 7)}`);
    return true;
  }

  async function followMain(prNumber) {
    if (!gh.getBranch || !(await gh.getBranch(PROD_BRANCH).catch(() => null))) return;
    const sha = (await gh.getPr(prNumber))?.merge_commit_sha;
    if (sha) await moveProduction(sha);
  }

  // A held change: labelled for the board's button.
  async function holdForApproval(prNumber) {
    await gh.addLabels(prNumber, [L.awaitingProd]);
  }

  // The preprod branch, created on the default branch the first time it is needed.
  async function ensurePreprod(def) {
    if (await gh.getBranch(PREPROD_BRANCH).catch(() => null)) return;
    const sha = (await gh.getBranch(def))?.object?.sha;
    if (sha) { await gh.createRef(PREPROD_BRANCH, sha); log(`${PREPROD_BRANCH} created on ${def} (${sha.slice(0, 7)})`); }
  }

  // On approval, what lands on main without going through preprod (the panel's settings, the factory's own syncs) is
  // brought into preprod, so that the agent starts from it and the next « Mise en production » does not undo it.
  async function syncPreprod() {
    if (config.production !== 'approval' || !gh.mergeBranches) return;
    const def = (await gh.getRepo())?.default_branch || 'main';
    if (!(await gh.getBranch(PREPROD_BRANCH).catch(() => null))) return ensurePreprod(def);
    let res;
    try {
      res = await mergeBranchesSettling(gh, PREPROD_BRANCH, def, `chore(factory): bring ${def} into ${PREPROD_BRANCH}`, { prefer: def });
    } catch (e) {
      if (!(e instanceof MergeConflict)) throw e;
      return log(`::warning::${def} ne peut pas être ramenée dans ${PREPROD_BRANCH} : ${e.message}. Un humain doit régler ce conflit.`);
    }
    if (res?.settled) log(`${PREPROD_BRANCH}: conflit réglé sur les fichiers de la factory (${res.settled.join(', ')})`);
    if (res?.sha) log(`${def} brought into ${PREPROD_BRANCH} (${res.sha.slice(0, 7)})`);
  }

  // The project's versioned CHANGELOG on `branch`: { path, text } of the first one with a « Non publié » section.
  async function findChangelog(branch) {
    for (const path of CHANGELOG_PATHS) {
      const c = await gh.getContent(path, branch).catch(() => null);
      const text = c?.content ? Buffer.from(c.content, 'base64').toString('utf8') : null;
      if (readChangelog(text)) return { path, text };
    }
    return null;
  }
  // Cuts « Non publié » into « [version] - date » on the branch that goes live (preprod, else the default branch).
  // Returns why it cannot (a sentence for the owner), or null once the cut is committed (or was already).
  async function cutChangelog(version, ref) {
    const branch = (await gh.getBranch(PREPROD_BRANCH).catch(() => null)) ? PREPROD_BRANCH : ref;
    const cl = await findChangelog(branch);
    if (!cl) return `le numéro de version ${version} a été donné, mais le projet n'a pas de CHANGELOG avec une section « Non publié ».`;
    const problem = versionProblem(cl.text, version);
    if (problem) return `le numéro de version ne convient pas : ${problem}`;
    if (await gh.getTagRef(`v${version}`).catch(() => null)) return `le tag v${version} existe déjà.`;
    const date = new Date(now()).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
    const text = cutVersion(cl.text, version, date);
    if (text === cl.text) return null;
    const parent = (await gh.getBranch(branch))?.object?.sha;
    const tree = await gh.createTree((await gh.getCommit(parent))?.tree?.sha, [{ path: cl.path, mode: '100644', type: 'blob', content: text }]);
    const commit = await gh.createGitCommit(`chore(release): v${version}`, tree.sha, [parent]);
    await gh.updateRef(branch, commit.sha);
    return null;
  }
  // Tags the commit that went live and publishes its notes (the CHANGELOG section). The sentence for the owner.
  async function tagRelease(version, head, ref) {
    const tag = `v${version}`;
    try {
      const notes = sectionOf((await findChangelog(ref))?.text, version);
      const obj = await gh.createTagObject(tag, `Version ${version}`, head);
      await gh.createTagRef(tag, obj.sha);
      await gh.createRelease(tag, tag, notes.slice(0, 120000));
      return `Version ${version} : le tag \`${tag}\` est posé sur ce qui part, et ses notes sont publiées dans les versions du projet.`;
    } catch (e) {
      log(`release: tag ${tag} failed (${String(e.message || e).slice(0, 120)})`);
      return `⚠️ Le tag \`${tag}\` n'a pas pu être posé (GitHub répond : « ${String(e.message || e).slice(0, 160)} »).`;
    }
  }

  const mergedAt = (p) => Date.parse(p.pull_request?.merged_at || p.merged_at || p.closed_at || 0);
  // « Mise en production » (the board's button opens an issue with L.production): every pending change goes live
  // together, the live site is checked as after any merge, and the owner is told what left.
  async function releaseToProduction(issueNumber) {
    const pending = ((await gh.listAwaiting()) || []).filter((p) => names(p.labels).includes(L.awaitingProd)).sort((a, b) => mergedAt(a) - mergedAt(b));
    const ref = (await gh.getRepo())?.default_branch || 'main';
    if (!pending.length) {
      if (issueNumber) {
        await endRelease(issueNumber, "Rien n'attendait d'être mis en production : le site en ligne est déjà à jour.", { state: 'nothing' });
      }
      return;
    }
    // The version number the owner gave in the dialog (a project whose CHANGELOG has a « Non publié » section): the
    // section is cut on preprod before it goes to main, and the release is tagged there. A refusal changes nothing.
    const version = issueNumber ? versionOf((await gh.getIssue(issueNumber))?.body) : null;
    if (version) {
      const refused = await cutChangelog(version, ref);
      if (refused) {
        const todo = 'Recliquez sur « Mise en production » avec un autre numéro.';
        await endRelease(issueNumber, `Je n'ai pas mis en production : ${refused} Rien n'a changé ; ${todo.charAt(0).toLowerCase()}${todo.slice(1)}`, { state: 'failed', reason: `${refused.charAt(0).toUpperCase()}${refused.slice(1)}`, todo });
        return;
      }
    }
    let head = null;
    let from = null;
    try {
      from = (await gh.getBranch(ref))?.object?.sha;
      if (!from) throw new Error(`branche ${ref} introuvable`);
      // preprod into main: the host publishes main. Nothing in preprod (changes merged before preprod existed): main
      // already holds them.
      const merged = (await gh.getBranch(PREPROD_BRANCH).catch(() => null))
        ? await mergeBranchesSettling(gh, ref, PREPROD_BRANCH, `Mise en production : ${pending.map((p) => `#${p.number}`).join(', ')}`, { prefer: ref })
        : null;
      head = merged?.sha || from;
      if (await gh.getBranch(PROD_BRANCH).catch(() => null)) {
        from = (await gh.getBranch(PROD_BRANCH))?.object?.sha || from;
        await moveProduction(head);
      }
    } catch (e) {
      if (issueNumber && e instanceof MergeConflict) {
        await endRelease(issueNumber, `Je n'ai pas pu mettre en production : ${PREPROD_BRANCH} et ${ref} ont modifié les mêmes fichiers, et je ne règle seul que les miens. Fichiers en conflit : ${e.files.slice(0, 10).map((f) => `\`${f}\``).join(', ')}${e.files.length > 10 ? ` (et ${e.files.length - 10} autres)` : ''}. Rien n'a changé en ligne ; il faut régler ce conflit avant de recliquer sur « Mise en production ».`,
          { state: 'failed', reason: 'Des modifications en attente touchent les mêmes fichiers que la version en ligne.', todo: 'Ce conflit doit être réglé avant de recliquer sur « Mise en production ».' });
        throw e;
      }
      if (issueNumber) {
        await endRelease(issueNumber, `Je n'ai pas pu mettre en production (GitHub répond : « ${String(e.message || e).slice(0, 200)} »). Rien n'a changé en ligne ; recliquez sur « Mise en production » dans quelques minutes.`,
          { state: 'failed', reason: 'GitHub n\'a pas répondu comme prévu.', todo: 'Recliquez sur « Mise en production » dans quelques minutes.' });
      }
      throw e;
    }
    try { await gh.dispatch('pages.yml', ref, {}); } catch (e) { log(`release: pages.yml not started (${String(e.message || e).slice(0, 80)})`); }
    const tagged = version ? await tagRelease(version, head, ref) : null;
    for (const p of pending) await gh.removeLabel(p.number, L.awaitingProd);
    const release = { from, prs: pending.map((p) => p.number), issue: issueNumber || null, ...(version ? { version } : {}) };
    const checking = await checkLive(pending.at(-1).number, head, { release }).catch((e) => { log(`live check not started: ${e.message}`); return false; });
    const list = pending.map((p) => `- ${p.title} (#${p.number})`).join('\n');
    const n = pending.length;
    const prs = pending.map((p) => ({ number: p.number, title: p.title }));
    const extra = { ...(version ? { version } : {}) };
    if (!issueNumber) return;
    // The request stays open (the board's card « en cours ») until the live site is checked: prodReport ends it.
    if (checking) {
      // Noted on the request, so that the tick checks the site again if that check never reports (issue #396).
      await noteWatch(issueNumber, { kind: 'production', check: checking, at: now(), tries: 0 }).catch((e) => log(`release watch: ${e.message}`));
      await gh.comment(issueNumber, say(`${n === 1 ? 'Cette modification part' : `Ces ${n} modifications partent`} en ligne :\n\n${list}\n\nLe site se met à jour dans quelques minutes ; je le vérifie ensuite, et je vous dis ici quand c'est fait.${tagged ? `\n\n${tagged}` : ''}\n\n${releaseNote({ state: 'deploying', prs, ...extra })}`));
      return;
    }
    // Nothing tells when the new version is online (no deployment, no site address): it cannot be checked.
    await endRelease(issueNumber, `En production ✅ : ${n === 1 ? 'cette modification part' : `ces ${n} modifications partent`} en ligne.\n\n${list}\n\nJe ne peux pas vérifier le site en ligne : l'hébergeur ne dit pas quand la nouvelle version est publiée.${tagged ? `\n\n${tagged}` : ''}`,
      { state: 'live', prs, ...extra, unchecked: true });
  }

  // The end of a « Mise en production »: the owner's message, with the outcome the board reads, then the request closes.
  // `checking`: the request may carry the second step's label (after the new version went online).
  async function endRelease(issueNumber, text, note, { checking = false } = {}) {
    if (!issueNumber) return;
    await gh.comment(issueNumber, say(`${text}\n\n${releaseNote(note)}`));
    // Ended by the factory: its live-check note goes, so a late report of that check is known as late (issue #396).
    const body = (await gh.getIssue(issueNumber).catch(() => null))?.body;
    if (readWatch(body)) await gh.updateIssue(issueNumber, { body: writeWatch(body, null) }).catch((e) => log(`release watch: ${e.message}`));
    if (checking) await gh.removeLabel(issueNumber, L.releaseChecking).catch(() => {});
    await gh.closeIssue(issueNumber).catch(() => {});
  }

  // The new version of a release is online: its card moves on to « Vérification du site en ligne » (production-step job).
  async function releaseChecking(check) {
    const n = Number(check?.release?.issue);
    if (n) await gh.addLabels(n, [L.releaseChecking]);
  }

  // The live site works (or could not be opened) after a release: « En production ✅ », only now.
  async function releaseLive({ release, url, result, detail }) {
    const prs = [];
    for (const n of release.prs || []) prs.push({ number: n, title: (await gh.getPr(n).catch(() => null))?.title || 'Modification' });
    const list = prs.map((p) => `- ${p.title} (#${p.number})`).join('\n');
    const checked = result === 'passed';
    const text = `En production ✅ : ${prs.length === 1 ? 'cette modification est' : `ces ${prs.length} modifications sont`} en ligne.\n\n${list}\n\n${checked ? 'J\'ai vérifié le site en ligne : il marche.' : `Je n'ai pas pu vérifier le site en ligne (${detail || 'vérification sautée'}).`}${url ? ` [Voir le site en ligne](${url})` : ''}`;
    await endRelease(release.issue, text, { state: 'live', prs, ...(release.version ? { version: release.version } : {}), ...(url ? { site: url } : {}), ...(checked ? {} : { unchecked: true }) }, { checking: true });
  }

  // The live site broke after a « Mise en production »: main goes back to what was live before (preprod keeps the
  // changes: nothing is lost), the released changes wait again, and an urgent bug fixes them.
  async function rollbackRelease({ release, sha, detail, runId }) {
    const link = runId ? ` ([détail](https://github.com/${repo}/actions/runs/${runId}))` : '';
    const def = (await gh.getRepo())?.default_branch || 'main';
    const legacy = await gh.getBranch(PROD_BRANCH).catch(() => null);
    const ref = legacy ? PROD_BRANCH : def;
    const prs = release.prs || [];
    // Main is only put back when it is still at the released commit: a delivery merged since would be erased.
    const head = (await gh.getBranch(ref).catch(() => null))?.object?.sha;
    if (head && sha && head !== sha) {
      const body = [AGENT_MARKER,
        `Après la mise en production${release.issue ? ` (#${release.issue})` : ''}, la version en ligne ne marchait plus : ${detail}${link}.`, '',
        `La factory n'a pas remis la version d'avant en ligne : la branche \`${ref}\` a avancé depuis la mise en production (elle est à \`${head}\`, la mise en production était \`${sha}\`), et la remettre en arrière effacerait ce qui a été livré depuis. Répare directement la version en ligne.`, '',
        `Les modifications parties sont : ${prs.map((n) => `#${n}`).join(', ') || 'aucune'} ; l'ancienne version en ligne était \`${release.from}\`. Trouve ce qui casse la version en ligne, corrige-le, et vérifie la version déployée de ta PR avant de la rendre.`].join('\n');
      const bug = await gh.createIssue("Corriger la mise en production : le site en ligne ne marchait plus", body, [L.bug, L.urgent, L.kept]);
      await endRelease(release.issue, `Après cette mise en production, le site en ligne ne marchait plus : ${detail}${link}.\n\nJe n'ai pas pu remettre la version d'avant en ligne : d'autres livraisons sont passées depuis et seraient effacées. La demande #${bug?.number} répare directement le site. Rien à faire de votre côté pour l'instant.`,
        { state: 'broken', fix: bug?.number || null, reason: detail }, { checking: true });
      if (bug?.number) await startRedo(bug.number).catch((e) => log(`correction not started: ${e.message}`));
      return log(`release broke the live site, but ${ref} moved on (${String(head).slice(0, 7)}): not rolled back`);
    }
    await gh.resetRef(ref, release.from);
    try { await gh.dispatch('pages.yml', ref, {}); } catch { /* no GitHub Pages workflow */ }
    for (const n of prs) await gh.addLabels(n, [L.awaitingProd]);
    const titles = [];
    for (const n of prs) titles.push(`- ${(await gh.getPr(n).catch(() => null))?.title || 'Modification'} (#${n})`);
    const body = [AGENT_MARKER,
      `Après la mise en production${release.issue ? ` (#${release.issue})` : ''}, la version en ligne ne marchait plus : ${detail}${link}.`, '',
      "La factory a remis en ligne la version d'avant. Les modifications parties attendent de nouveau :", '', ...titles, '',
      `Trouve laquelle casse la version en ligne (commit \`${sha}\`, l'ancienne version en ligne est \`${release.from}\`), corrige-la, et vérifie la version déployée de ta PR avant de la rendre.`].join('\n');
    const bug = await gh.createIssue("Corriger la mise en production : le site en ligne ne marchait plus", body, [L.bug, L.urgent, L.kept]);
    await endRelease(release.issue, `Après cette mise en production, le site en ligne ne marchait plus : ${detail}${link}.\n\nJ'ai remis la version d'avant en ligne. Les modifications attendent de nouveau (le bouton « Mise en production » les compte), et la demande #${bug?.number} les corrige. Rien à faire de votre côté pour l'instant.`,
      { state: 'undone', fix: bug?.number || null, reason: detail }, { checking: true });
    if (bug?.number) await startRedo(bug.number).catch((e) => log(`correction not started: ${e.message}`));
    log(`release broke the live site: production back to ${String(release.from).slice(0, 7)}`);
  }

  // After a merge, the live site is opened as soon as its new version is deployed (production job of relay.yml).
  // Only for a project its host deploys (Vercel, Netlify, GitHub Pages…): elsewhere there is nothing to open.
  // A host that tells GitHub nothing (Vercel without deployments, as on yoldmewhen2) is still checked when the site's
  // address is known (siteUrl, or the repository's website) and the host builds the project (it comments the PRs).
  async function checkLive(prNumber, releasedSha = null, extra = {}) {
    const envs = ((await gh.recentDeployments?.().catch(() => null)) || []).map((d) => d.environment);
    let url = null;
    if (!envs.some(isLiveEnv)) {
      const repoInfo = await gh.getRepo().catch(() => null);
      const site = config.siteUrl || (/^https:\/\/\S+$/.test(repoInfo?.homepage || '') ? repoInfo.homepage : null);
      const hosted = envs.some((e) => e && e !== 'github-pages') || ((await gh.listComments(prNumber).catch(() => [])) || []).some((c) => c.user?.login === 'vercel[bot]');
      if (!site || !hosted) {
        log(`live check: no live deployment${envs.length ? ` (seen: ${[...new Set(envs)].join(', ')})` : ''}${site ? '' : ', no site address'}`);
        return false;
      }
      url = site;
    }
    const sha = releasedSha || (await gh.getPr(prNumber))?.merge_commit_sha;
    if (!sha) return false;
    const ref = (await gh.getRepo())?.default_branch || 'main';
    const check = { pr: prNumber, sha, ...(url ? { url } : {}), ...extra };
    await gh.dispatch(PROJECT_WORKFLOW, ref, { payload: JSON.stringify({ prodCheck: check }) });
    log(`live check started for #${prNumber} (${sha.slice(0, 7)})${url ? ` on ${url}` : ''}`);
    return check;
  }

  // The factory undid a broken delivery (prodReport): once the undo is live, the issue that redoes it can start.
  async function redoAfterRevert(pr) {
    const n = Number(new RegExp(`${REVERT_REDO}(\\d+)`).exec(pr?.body || '')?.[1]);
    if (n) await startRedo(n);
  }

  // A « Remettre en ligne » card leaves no-pick and starts like any urgent bug (or waits first in line).
  async function startRedo(n) {
    await gh.removeLabel(n, L.noPick);
    const labels = await liveLabels(n);
    await handle({ kind: 'issue', event: 'issues', action: 'opened', number: n, labels, fromOwner: true, fromAgent: false, openedRecently: false });
  }

  // The new version of the live site, once its host reports it deployed (polls up to `attempts` × `delayMs`).
  // A deploy the host cancelled because a newer push started its own (GitHub Pages marks it "error") is not a
  // broken delivery: the newer deploy of the same environment, which contains this commit, decides instead. That
  // newer deploy is created a moment after the cancel, so a lone failure is only believed after a few polls.
  // A failure gives the host's message and, when the host is GitHub Actions, the run to re-run (issue #227). After
  // that re-run, `since` ignores the deploys made before it: the old failure must not answer for the new attempt.
  // `url`: the site's address when the host reports no deployment (checkLive). Its new version is given
  // `blindPolls` polls to go live (Vercel publishes in about a minute); smoke.mjs then retries a failure for 5 minutes.
  async function liveUrl(sha, { attempts = 30, delayMs = 20_000, lonePolls = 3, since = 0, url = null, blindPolls = 6 } = {}) {
    const outcome = async (d) => {
      const statuses = (await gh.deploymentStatuses(d.id)) || [];
      const ok = statuses.find((s) => s.state === 'success');
      if (ok) return ok.environment_url || ok.target_url || config.siteUrl || null;
      const bad = statuses.find((s) => ['failure', 'error'].includes(s.state));
      if (!bad) return undefined;
      const detail = String(bad.description || '').slice(0, 300);
      const runId = Number(/\/actions\/runs\/(\d+)/.exec(`${bad.log_url || ''} ${bad.target_url || ''}`)?.[1]) || null;
      return { failed: true, ...(detail ? { detail } : {}), ...(runId ? { runId } : {}) };
    };
    const fresh = (d) => !since || Date.parse(d.created_at || 0) >= since;
    let lone = 0;
    let seen = false; // a deployment of this commit was reported: the host is followed, never the blind wait
    let failure = { failed: true };
    for (let i = 0; i < attempts; i++) {
      let failedAlone = false; // a failure with no newer deploy that went live or is still deploying
      const live = ((await gh.deployments(sha).catch(() => [])) || []).filter((x) => isLiveEnv(x.environment) && fresh(x));
      if (live.length) seen = true;
      for (const d of live) {
        const result = await outcome(d);
        if (result === undefined) continue;
        if (!result?.failed) return result;
        // Deployment ids only grow: the highest one of the same environment is the newest.
        const newest = ((await gh.recentDeployments?.().catch(() => null)) || [])
          .filter((x) => x.environment === d.environment && Number(x.id) > Number(d.id))
          .sort((a, b) => Number(b.id) - Number(a.id))[0];
        if (!newest) { failedAlone = true; failure = result; continue; }
        const next = await outcome(newest);
        if (next?.failed) { failedAlone = true; failure = next; continue; }
        if (next !== undefined) return next;
      }
      if (url && !seen && i >= blindPolls) return url;
      lone = failedAlone ? lone + 1 : 0;
      if (failedAlone && (lone >= lonePolls || i === attempts - 1)) return failure;
      if (i < attempts - 1) await sleep(delayMs);
    }
    return null;
  }

  // The host did not publish the new version: the old one still runs, nothing is broken. The publication is run
  // once more and the live site checked again; a second failure is only reported, never undone (issue #227).
  async function deployFailed({ pr: prNumber, sha, detail = '', runId = null, retried = false, release = null }) {
    if (release?.issue && await releaseOver(release.issue)) return log(`publication of release #${release.issue} reported late: already ended`);
    const def = (await gh.getRepo())?.default_branch || 'main';
    // After a « Mise en production » on a project of the first version (its host publishes the production branch),
    // main may already be further ahead: the production branch is the one to compare with. Otherwise main is.
    const ref = release && await gh.getBranch?.(PROD_BRANCH).catch(() => null) ? PROD_BRANCH : def;
    // A newer delivery was merged since: re-running this one would publish an older version over it, and the newer
    // one's own live check covers the site (its deploy carries this commit too).
    const head = gh.getBranch ? (await gh.getBranch(ref).catch(() => null))?.object?.sha : sha;
    const newest = !head || head === sha;
    if (!retried && runId && gh.rerunFailed && newest) {
      try {
        const retriedAt = now() - 60_000; // a minute of slack: GitHub's clock, rounded to the second
        await gh.rerunFailed(runId);
        const check = { pr: prNumber, sha, deployRetried: true, retriedAt, ...(release ? { release } : {}) };
        await gh.dispatch(PROJECT_WORKFLOW, def, { payload: JSON.stringify({ prodCheck: check }) });
        // The release's note follows the new attempt: the tick waits for it before checking again (issue #396).
        if (release?.issue) {
          const body = (await gh.getIssue(release.issue).catch(() => null))?.body;
          const st = readWatch(body);
          if (st) await noteWatch(release.issue, { ...st, check, at: now() }, body).catch((e) => log(`release watch: ${e.message}`));
        }
        return log(`live deploy of #${prNumber} failed: run ${runId} re-run`);
      } catch (e) { log(`live deploy re-run failed: ${String(e.message || e).slice(0, 80)}`); }
    }
    const said = detail ? ` Son message : « ${detail} ».` : '';
    await gh.comment(prNumber, say(`Cette version n'a pas été mise en ligne : l'hébergeur refuse de la publier${retried ? ', même après une nouvelle tentative' : ''}.${said} ${newest ? "L'ancienne version reste en ligne et marche : je ne retire rien." : 'Je ne retire rien : une livraison plus récente, qui la contient, est en cours de publication et la mettra en ligne si elle passe.'}`));
    if (release?.issue) {
      await endRelease(release.issue, `Cette mise en production n'a pas été publiée : l'hébergeur refuse de publier la nouvelle version${retried ? ', même après une nouvelle tentative' : ''}.${said} ${newest ? "L'ancienne version reste en ligne et marche." : 'Une livraison plus récente, qui la contient, est en cours de publication.'}`,
        { state: 'unpublished', reason: `L'hébergeur refuse de publier la nouvelle version${detail ? ` (« ${detail} »)` : ''}.`, todo: newest ? "L'ancienne version reste en ligne et marche." : 'Une livraison plus récente, qui la contient, est en cours de publication.' }, { checking: true });
    }
    log(`live deploy of #${prNumber} failed, reported`);
  }

  // The live site does not work after a merge: undo the delivery at once (a PR that goes live on green checks), and
  // open an urgent bug that redoes it properly once the undo is live. Never undoes an undo.
  async function prodReport({ pr: prNumber, sha, url, result, detail = '', runId = null, git, redo: stuckCard = null, release = null }) {
    if (stuckCard) return recheckedRedo(Number(stuckCard), { result, detail });
    // A release the factory already ended (a check the tick started again, reporting after the first one): nothing
    // more (#396). A request closed by hand still has its note: its live site is still looked after.
    if (release?.issue && await releaseOver(release.issue)) return log(`live check of release #${release.issue} reported late: already ended`);
    if (result !== 'failed' && release?.issue) return releaseLive({ release, url, result, detail });
    if (result !== 'failed') return log(`live site ${result} after #${prNumber}: ${detail}`);
    if (release?.from) return rollbackRelease({ release, sha, detail, runId });
    const pr = await gh.getPr(prNumber);
    const link = runId ? ` ([détail](https://github.com/${repo}/actions/runs/${runId}))` : '';
    if (String(pr?.body || '').includes(REVERT_MARKER)) {
      await gh.comment(prNumber, say(`Même après ce retour en arrière, la version en ligne ne marche pas : ${detail}${link}. Le problème ne vient donc sans doute pas de la dernière livraison (hébergeur, base de données…). Je ne retire rien d'autre.`));
      return;
    }
    const branch = `claude/revert-pr-${prNumber}`;
    // An undo already open is done, unless a passing error stopped the run right after opening it (no card marker):
    // then the run goes on from there, without a second undo branch.
    const open = ((await gh.listPulls?.().catch(() => null)) || []).find((p) => !fromFork(p) && p.head?.ref === branch);
    if (open && String(open.body || '').includes(REVERT_REDO)) return log('already undone');
    // A relaunch after an undo that was never opened reuses the card it left behind (issue #227); a card already
    // started (the undo was refused) repairs the live site itself: nothing more to do.
    const found = await findRedo(prNumber);
    if (found && !names(found.labels).includes(L.noPick)) return log(`redo #${found.number} already started`);
    const def = (await gh.getRepo())?.default_branch || 'main';
    const title = `Retirer « ${pr.title} » : la version en ligne ne marchait plus`;
    const why = `Retour à la version d'avant la PR #${prNumber} : après sa mise en ligne, ${detail}.`;
    const issueNumber = prIssue(pr);
    const facts = { prNumber, issueNumber, sha, url, detail, link };
    // The undo is not possible (the revert conflicts, or GitHub refuses to open its PR): nothing was undone, so no card
    // may say it was. The redo card starts at once as a normal urgent fix that repairs the live site directly.
    const cannotUndo = async (msg, { gitFailed = false } = {}) => {
      const blockedBySetting = /not permitted to create or approve pull requests/i.test(msg);
      const reason = /"message"\s*:\s*"([^"]{1,160})/.exec(msg)?.[1] || '';
      const body = redoBody({ ...facts, undone: false });
      const redo = found || await gh.createIssue(`Remettre en ligne « ${pr.title} » sans casser l'appli`, body, [L.bug, L.urgent, L.kept]);
      if (found) await gh.updateIssue(found.number, { body });
      await gh.comment(prNumber, say([
        `Après cette mise en ligne, la version en ligne ne marchait plus : ${detail}${link}.`,
        '',
        gitFailed
          ? `**Je n'ai pas pu la retirer** : le retour en arrière automatique a échoué (sans doute un conflit avec ce qui a été livré depuis). La correction urgente #${redo.number} démarre donc tout de suite pour réparer directement la version en ligne.`
          : `**Je n'ai pas pu la retirer** : GitHub a refusé que la factory ouvre le retour en arrière${blockedBySetting || !reason ? '' : ` (« ${reason} »)`}. La correction urgente #${redo.number} démarre donc tout de suite pour réparer directement la version en ligne.`,
        ...(!gitFailed && (blockedBySetting || !reason) ? ['', `Pour que la factory puisse retirer une livraison la prochaine fois : dans [Settings → Actions → General](https://github.com/${repo}/settings/actions), cochez « Allow GitHub Actions to create and approve pull requests » puis « Save ».`] : []),
      ].join('\n')));
      log(`live site broken after #${prNumber}: undo ${gitFailed ? 'failed' : 'PR refused'} (${msg.slice(0, 120)}), redo #${redo.number} started`);
      await startRedo(redo.number);
    };
    if (!open) {
      try {
        git(['fetch', 'origin', def]);
        git(['checkout', '-B', branch, `origin/${def}`]);
        git(['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'revert', '--no-edit', sha]);
        git(['push', '--force', 'origin', `HEAD:refs/heads/${branch}`]);
      } catch (e) {
        try { git(['revert', '--abort']); } catch { /* no revert in progress */ }
        return cannotUndo(String(e?.message || e), { gitFailed: true });
      }
    }
    // The undo PR is opened first: when GitHub refuses it (the repository does not let workflows open PRs, #231),
    // nothing was undone, so no card may say it was (#227).
    let revert = open;
    try {
      revert ??= await gh.createPr(title, branch, def, [REVERT_MARKER, why].join('\n'));
    } catch (e) {
      return cannotUndo(String(e?.message || e));
    }
    // A relaunch after an undo that was never opened reuses the card it left behind.
    const undoneBody = redoBody({ ...facts, undone: true, revert: revert.number });
    const redo = found || await gh.createIssue(`Remettre en ligne « ${pr.title} » sans casser l'appli`, undoneBody, [L.bug, L.urgent, L.kept, L.noPick]);
    if (found) await gh.updateIssue(found.number, { body: undoneBody });
    await gh.updateIssue(revert.number, { body: [
      REVERT_MARKER,
      `${REVERT_REDO}${redo.number} -->`,
      `${why} Mis en ligne dès que les contrôles sont verts ; la demande #${redo.number} refait ensuite la livraison proprement.`,
    ].join('\n') });
    await gh.addLabels(revert.number, [L.checks]);
    await gh.dispatch(PROJECT_WORKFLOW, def, { payload: JSON.stringify({ checksFor: revert.number }) });
    await gh.comment(prNumber, say(`Après cette mise en ligne, la version en ligne ne marchait plus : ${detail}${link}.\n\nJe la retire tout de suite (PR #${revert.number}), puis la factory la refait en corrigeant le problème (#${redo.number}). Rien à faire de votre côté.`));
    log(`live site broken after #${prNumber}: undo #${revert.number}, redo #${redo.number}`);
  }

  // The card that redoes a delivery: what broke, and how to redo it. `undone`: the live site went back to the old
  // version; otherwise the delivery is still live and is repaired directly.
  function redoBody({ prNumber, issueNumber, sha, url, detail, link, undone, revert = null }) {
    return [
      PROD_BUG_MARKER,
      `${REDO_OF}${prNumber} ${sha} -->`,
      `Après la mise en ligne de la PR #${prNumber}${issueNumber ? ` (demande #${issueNumber})` : ''}, la version en ligne ne marchait plus : ${detail}${link}.`,
      '',
      undone
        ? `La factory retire cette livraison (retour à la version d'avant${revert ? `, PR #${revert}` : ''}). Il faut la refaire : reprends les changements de la PR #${prNumber} (\`git cherry-pick ${sha}\`), trouve pourquoi ils cassaient la version en ligne (\`${url}\`), corrige, et vérifie la version déployée de ta PR avant de la rendre.`
        : `La factory n'a pas pu retirer cette livraison (GitHub a refusé le retour en arrière) : elle est toujours en ligne. Répare directement la version en ligne (\`${url}\`) : trouve pourquoi les changements de la PR #${prNumber} (commit \`${sha}\`) la cassent, corrige, et vérifie la version déployée de ta PR avant de la rendre.`,
    ].join('\n');
  }

  // The open card that redoes the delivery of PR `prNumber`, if any (its marker, or the sentence of older cards).
  async function findRedo(prNumber) {
    const open = (await gh.listOpenIssues?.().catch(() => null)) || [];
    return open.find((i) => !i.pull_request && redoOf(i.body)?.pr === prNumber) || null;
  }

  // Right after a push to main GitHub has not computed mergeability yet ("unknown"): ask again for a while.
  async function settledPr(number, { attempts = 6, delayMs = 5_000 } = {}) {
    let pr = await gh.getPr(number);
    for (let i = 1; i < attempts && pr?.state === 'open' && (!pr.mergeable_state || pr.mergeable_state === 'unknown'); i++) {
      await sleep(delayMs);
      pr = await gh.getPr(number);
    }
    return pr;
  }

  // Issue #372: a site whose host tells GitHub nothing (external production, a silent host) says itself which commit it
  // runs. Read on every tick, it moves refs/factory/live, which the panel reads to show the production gap. A tag that
  // cannot be read removes the ref: the panel then says « version inconnue », never a stale « à jour ».
  async function syncVersionTag() {
    if (!gh.setLiveRef || !gh.getRepo) return;
    const repoInfo = await gh.getRepo();
    // The same rule as the panel's: a project it shows a line for is one the tick reads.
    const site = siteLink(config.siteUrl, repoInfo?.homepage);
    if (!site) return;
    const mode = effectiveProduction(config, config.production ? null : await readDelivery());
    const liveEnvs = mode === 'external' ? [] : ((await gh.liveDeployments()) || []).map((d) => d.environment);
    if (!tagConcerned({ mode, site, liveEnvs })) return;
    const tag = await readSiteTag(site, fetchImpl);
    const sha = (tag && (await gh.resolveCommit(tag))?.sha) || null;
    if (sha !== await gh.getLiveRef()) {
      await gh.setLiveRef(sha);
      log(`version tag: live ${sha ? sha.slice(0, 7) : 'unknown'}`);
    }
    if (!sha) await ensureVersionTagCard();
  }

  // A project concerned whose site has no tag gets one card that adds it, once (remembered in a state ref, so a card
  // closed or abandoned is never reopened by itself). Never before the project is framed, nor during its framing.
  async function ensureVersionTagCard() {
    if (!gh.getState || !gh.createIssue) return;
    if ((await gh.getState('version-tag'))?.card) return;
    if (!(await gh.getContent?.('PRODUCT.md')) && !(await gh.getContent?.('docs/PRODUCT.md'))) return;
    if (((await gh.listIssues({ labels: L.project })) || []).some((i) => !i.pull_request)) return;
    const body = [AGENT_MARKER, VERSION_TAG_MARKER,
      'Le tableau de la factory affiche sous le nom du projet si le site en ligne est à jour (« En ligne : à jour ») ou combien de modifications validées n\'y sont pas encore. Pour ce projet, l\'hébergeur ne le dit pas à GitHub : le site doit le dire lui-même, avec une **étiquette de version** invisible pour les visiteurs.', '',
      'Rien à régler de votre côté : ni serveur, ni clé d\'accès.', '',
      '### For the agent',
      '- The site publishes the commit it was built from, filled in automatically at each publication (never by hand): `<meta name="factory-version" content="<commit sha>">` in the `<head>` of the page at the site address, in the HTML as the server sends it (not added later by JavaScript), or, when that address serves no HTML page, a `factory-version.txt` file at the site root containing only the sha (full, or its first 7 characters or more).',
      '- Use what the host or the build gives (for example `VERCEL_GIT_COMMIT_SHA`, `git rev-parse HEAD` at build time). A tag that would be wrong is worse than none.',
      '- The factory reads it every 5 minutes from GitHub Actions (server side, no CORS needed) and points `refs/factory/live` at that commit.',
      '- Acceptance: after the next publication, the board shows « En ligne : à jour » under the project name.'].join('\n');
    // Remembered first: a failure once the card exists must never open another one at each tick.
    await gh.setState('version-tag', { card: 'opening' });
    let card;
    try { card = await gh.createIssue('Ajouter l\'étiquette de version au site', body, [L.feature, L.kept]); } catch (e) {
      // GitHub may have opened it all the same (the answer was lost): kept if so, otherwise tried again next tick.
      const opened = ((await gh.listIssues({ labels: L.feature, state: 'all' }).catch(() => [])) || []).find((i) => String(i.body || '').includes(VERSION_TAG_MARKER));
      await gh.setState('version-tag', opened ? { card: opened.number } : null).catch(() => {});
      throw e;
    }
    await gh.setState('version-tag', { card: card.number }).catch((e) => log(`version tag: ${e.message}`));
    log(`version tag: card #${card.number} opened`);
    const labels = await liveLabels(card.number);
    await handle({ kind: 'issue', event: 'issues', action: 'opened', number: card.number, labels, fromOwner: true, fromAgent: false, openedRecently: false });
  }

  // Issue #242: every framed project keeps a stack sheet (STACK.md). One without it gets an « Établir la fiche » card,
  // once (a card closed or abandoned is never reopened by itself), as soon as its synced agent instructions have the
  // `stack` stage, and it starts like a bug: at once, or first free place. Never while the framing is under way.
  async function ensureStackSheet() {
    if (!gh.getContent || !gh.createIssue) return;
    // A missing file is null (404); any other error throws and the guard simply tries again at the next tick.
    // The two cheap answers that settle it for good come first: the sheet exists, or its card was already opened.
    const exists = async (path) => Boolean(await gh.getContent(path));
    const sheet = await gh.getContent('STACK.md');
    if (sheet) return ensureDeliveryLine(sheet);
    if (((await gh.listIssues({ labels: L.stack, state: 'all' })) || []).length) return;
    if (!(await exists('PRODUCT.md')) && !(await exists('docs/PRODUCT.md'))) return;
    if (!(await exists('.factory/stages/stack.md'))) return;
    if (((await gh.listIssues({ labels: L.project })) || []).some((i) => !i.pull_request)) return;
    const body = [AGENT_MARKER, 'La factory établit la **fiche stack technique** de ce projet : les technologies, la façon dont les données sont stockées, les bibliothèques et les services nécessaires.', '',
      'Elle s\'affiche ensuite avec le bouton « Stack technique » du panneau, et l\'agent la tient à jour à chaque construction.'].join('\n');
    const card = await gh.createIssue('Établir la fiche stack technique', body, [L.stack, L.kept]);
    log(`stack sheet: card #${card.number} opened`);
    const labels = await liveLabels(card.number);
    await handle({ kind: 'issue', event: 'issues', action: 'opened', number: card.number, labels, fromOwner: true, fromAgent: false, openedRecently: false });
  }

  // A sheet written before the « Mise en production » section (or without a readable first line) gets one card that
  // completes it, once, as soon as the synced agent instructions know the section: the factory then knows by itself
  // whether a merge puts the project in production. Never while the framing is under way.
  async function ensureDeliveryLine(sheet) {
    if (!sheet.content || deliveryOf(Buffer.from(sheet.content, 'base64').toString('utf8'))) return;
    const stage = await gh.getContent('.factory/stages/stack.md');
    if (!stage?.content || !Buffer.from(stage.content, 'base64').toString('utf8').includes(`## ${DELIVERY_SECTION}`)) return;
    if (((await gh.listIssues({ labels: L.stack, state: 'all' })) || []).some((i) => String(i.body || '').includes(DELIVERY_MARKER))) return;
    if (((await gh.listIssues({ labels: L.project })) || []).some((i) => !i.pull_request)) return;
    const body = [AGENT_MARKER, DELIVERY_MARKER, `La factory ajoute à la fiche stack la partie « ${DELIVERY_SECTION} » : automatique ou manuelle.`].join('\n');
    const card = await gh.createIssue('Compléter la fiche stack : la mise en production', body, [L.stack, L.kept]);
    log(`stack sheet: delivery card #${card.number} opened`);
    const labels = await liveLabels(card.number);
    await handle({ kind: 'issue', event: 'issues', action: 'opened', number: card.number, labels, fromOwner: true, fromAgent: false, openedRecently: false });
  }

  // Safety net (issue #227): a « Remettre en ligne » card in no-pick for over an hour with no undo PR open would wait
  // forever. The live site is checked again (prodReport with `redo`): it works, the card is closed as obsolete;
  // it does not, the card starts. A re-check that never reports back within an hour starts the card all the same.
  async function unstickRedos() {
    const stuck = ((await gh.listIssues({ labels: L.noPick })) || []).filter((i) => !i.pull_request && redoOf(i.body)
      && now() - Date.parse(i.created_at || 0) > REDO_STUCK_MS && !names(i.labels).includes(L.running));
    let live = null;
    for (const card of stuck) {
      try {
        const { pr, sha } = redoOf(card.body);
        // Every undo of that delivery, however old (an error here skips the card until the next tick).
        const all = (await gh.pullsByHead(`claude/revert-pr-${pr}`)) || [];
        const undos = all.filter((p) => String(p.body || '').includes(`${REVERT_REDO}${card.number} -->`));
        // Any open undo of that delivery is under way, even one a passing error left without its card marker.
        if (all.some((p) => p.state === 'open')) continue;
        // The undo went live without the factory's own merge (merged by hand): the card redoes it, as planned.
        if (undos.some((p) => p.merged_at)) { await startRedo(card.number); continue; }
        const asked = Number(new RegExp(`${RECHECK_MARKER}(\\d+) -->`).exec(card.body || '')?.[1]) || 0;
        if (live === null) {
          const deploys = gh.recentDeployments ? await gh.recentDeployments() : [];
          live = (deploys || []).some((d) => isLiveEnv(d.environment));
        }
        if (asked && now() - asked > REDO_STUCK_MS || !live || !sha) {
          log(`guard: redo card #${card.number} stuck in no-pick, started`);
          await startUndoneRedo(card);
          continue;
        }
        if (asked) continue; // re-check under way
        await gh.updateIssue(card.number, { body: `${card.body}\n\n${RECHECK_MARKER}${now()} -->` });
        const ref = (await gh.getRepo())?.default_branch || 'main';
        await gh.dispatch(PROJECT_WORKFLOW, ref, { payload: JSON.stringify({ prodCheck: { pr, sha, redo: card.number } }) });
        log(`guard: redo card #${card.number} stuck in no-pick, live site checked again`);
      } catch (e) { log(`guard: redo card #${card.number}: ${String(e.message || e).slice(0, 120)}`); }
    }
  }

  // A stuck card whose undo never went live: its text (older cards) may still say the delivery was removed. The
  // agent is told it is still live, so it repairs it instead of redoing it.
  async function startUndoneRedo(card) {
    if (!String(card.body || '').includes(STILL_LIVE)) {
      await gh.updateIssue(card.number, { body: `${card.body}\n\n${STILL_LIVE} Le retour en arrière n'a pas été mis en ligne : cette livraison est toujours en ligne. Ne refais pas de cherry-pick : répare directement la version en ligne.` });
    }
    await startRedo(card.number);
  }

  // The re-check of a stuck card (unstickRedos): a live site that works means a false alarm, the card is obsolete.
  async function recheckedRedo(n, { result, detail }) {
    const card = await gh.getIssue(n);
    if (!card || card.state !== 'open' || !names(card.labels).includes(L.noPick)) return;
    if (result !== 'passed') return startUndoneRedo(card);
    await gh.comment(n, say(`Obsolète : la version en ligne marche (vérifiée à nouveau : ${detail}). Cette alerte était fausse, il n'y a rien à refaire. En cas de désaccord, écrivez ici : la demande se rouvrira et reprendra là où elle en était.`));
    await gh.removeLabel(n, L.noPick);
    await gh.addLabels(n, [L.obsolete, L.close]);
    await dropCard(n);
  }


  return { mergeDocsPr, mergePr, readDelivery, afterMerge, moveProduction, followMain, holdForApproval, ensurePreprod, syncPreprod, findChangelog, cutChangelog, tagRelease, mergedAt, releaseToProduction, endRelease, releaseChecking, releaseLive, rollbackRelease, checkLive, redoAfterRevert, startRedo, liveUrl, deployFailed, prodReport, redoBody, findRedo, settledPr, syncVersionTag, ensureVersionTagCard, ensureStackSheet, ensureDeliveryLine, unstickRedos, startUndoneRedo, recheckedRedo };
}

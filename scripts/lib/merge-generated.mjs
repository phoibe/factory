// Merges one branch into another on GitHub, settling by itself a conflict that only touches the files the factory
// writes into the project (Pulsar Novae #183, 2026-11-10: `.factory/` had moved on main through the factory's own syncs,
// and on preprod through an agent PR that carried an older copy; « Mise en production » and the hourly « bring main
// into preprod » both failed with a 409, the second one silently). Those files are regenerated from the factory
// anyway: in a conflict the copy of the default branch wins. Any other conflict is left to people (thrown, with the
// files named).

// What the factory installs and regenerates in a project: never the owner's or the agent's work.
export const isGenerated = (path) => path.startsWith('.factory/') && !path.startsWith('.factory/journal/')
  || path.startsWith('.claude/skills/') || path === '.claude/settings.json';

const touched = (files) => new Set((files || []).flatMap((f) => [f.filename, f.previous_filename].filter(Boolean)));

// A conflict GitHub would not settle, with the files both sides changed.
export class MergeConflict extends Error {
  constructor(files) {
    super(`conflit sur ${files.slice(0, 5).join(', ')}${files.length > 5 ? ` (et ${files.length - 5} autres)` : ''}`);
    this.files = files;
  }
}

// `prefer`: the branch whose copy of a generated file wins (the default branch). Returns what mergeBranches returns:
// { sha } when merged, null when there was nothing to merge.
export async function mergeBranchesSettling(gh, base, head, message, { prefer }) {
  try {
    return await gh.mergeBranches(base, head, message);
  } catch (e) {
    if (!/409|conflict/i.test(String(e?.message || e)) || !gh.compare || !gh.createTree || !gh.createGitCommit) throw e;
    const headSide = await gh.compare(base, head);
    const baseSide = await gh.compare(head, base);
    // GitHub lists at most 300 files: past that, nothing is settled blind.
    if ((headSide.files || []).length >= 300 || (baseSide.files || []).length >= 300) throw e;
    const both = [...touched(headSide.files)].filter((p) => touched(baseSide.files).has(p)).sort();
    const human = both.filter((p) => !isGenerated(p));
    if (human.length) throw new MergeConflict(human);
    const baseSha = (await gh.getBranch(base))?.object?.sha;
    const headSha = (await gh.getBranch(head))?.object?.sha;
    if (!baseSha || !headSha) throw e;
    const baseCommit = await gh.getCommit(baseSha);
    // The compare API gives no file mode: read it from the head tree, so that a script keeps its executable bit.
    const headTree = gh.getTree ? await gh.getTree((await gh.getCommit(headSha)).tree.sha).catch(() => null) : null;
    const modes = new Map((headTree?.tree || []).map((t) => [t.path, t.mode]));
    const keepBase = prefer === base;
    // Every change of the head side goes onto the base, except a generated file both sides changed when the base wins.
    const entries = [];
    for (const f of headSide.files || []) {
      if (keepBase && both.includes(f.filename)) continue;
      if (f.previous_filename && f.status === 'renamed') entries.push({ path: f.previous_filename, mode: '100644', type: 'blob', sha: null });
      entries.push(f.status === 'removed'
        ? { path: f.filename, mode: '100644', type: 'blob', sha: null }
        : { path: f.filename, mode: modes.get(f.filename) || '100644', type: 'blob', sha: f.sha });
    }
    const tree = await gh.createTree(baseCommit.tree.sha, entries);
    const commit = await gh.createGitCommit(`${message}\n\nConflit réglé par la factory sur ses propres fichiers (copie de ${prefer}) : ${both.join(', ')}`, tree.sha, [baseSha, headSha]);
    await gh.updateRef(base, commit.sha);
    return { sha: commit.sha, settled: both };
  }
}

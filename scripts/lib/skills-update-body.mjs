// Builds the description of the monthly "skills update" pull request: every changed file, grouped by skill,
// with programs (anything that is not a sheet, an annex page or another tool's settings) flagged apart.

const FOLD_OVER = 20;

const KIND_LABELS = {
  sheet: 'fiche',
  page: 'pages annexes',
  settings: 'réglages pour un autre outil',
  program: 'programmes',
};
const STATUS_LABELS = { A: 'ajouté', M: 'modifié', T: 'modifié', D: 'retiré' };

/** Kind of a file, given its path inside the skill folder. */
export function classifyFile(rel) {
  const name = rel.split('/').pop();
  if (rel === 'SKILL.md') return 'sheet';
  if (/^agents\/[^/]+\.ya?ml$/.test(rel)) return 'settings';
  if (/\.md$/i.test(name) || /^LICENSE/i.test(name)) return 'page';
  return 'program';
}

/** Parses `git diff --name-status --no-renames -z` output (status and path NUL-separated, never quoted). */
export function parseNameStatus(out) {
  const fields = out.split('\0').filter(Boolean);
  const changes = [];
  for (let i = 0; i + 1 < fields.length; i += 2) changes.push({ status: fields[i][0], path: fields[i + 1] });
  return changes;
}

export function skillsUpdateBody({ before, after, changes }) {
  const packs = new Map(after.packs.map((p) => [p.id, p]));
  for (const p of before.packs) if (!packs.has(p.id)) packs.set(p.id, p);
  const packName = (id) => packs.get(id)?.name || id;

  // Skill files only: packs/<pack>/<skill>/<file...>
  const files = [];
  for (const c of changes) {
    const parts = c.path.split('/');
    if (parts[0] !== 'packs' || parts.length < 4) continue;
    const rel = parts.slice(3).join('/');
    files.push({ ...c, pack: parts[1], skill: parts[2], rel, kind: classifyFile(rel) });
  }

  const skillSet = (catalog, packId) =>
    new Set(catalog.packs.find((p) => p.id === packId)?.skills.map((s) => s.id) || []);
  const added = [];
  const removed = [];
  for (const id of packs.keys()) {
    const was = skillSet(before, id);
    const now = skillSet(after, id);
    for (const s of now) if (!was.has(s)) added.push(`${packName(id)} : ${s}`);
    for (const s of was) if (!now.has(s)) removed.push(`${packName(id)} : ${s}`);
  }

  const modified = new Map();
  for (const f of files) {
    if (!skillSet(before, f.pack).has(f.skill) || !skillSet(after, f.pack).has(f.skill)) continue;
    const key = `${packName(f.pack)} : ${f.skill}`;
    if (!modified.has(key)) modified.set(key, new Set());
    modified.get(key).add(f.kind);
  }

  const programs = files.filter((f) => f.kind === 'program');
  const fold = files.length > FOLD_OVER;
  const lines = [];

  if (programs.length) {
    const n = programs.length;
    lines.push(`> ⚠️ Cette mise à jour change ${n} programme${n > 1 ? "s" : ""} : regardez-${n > 1 ? "les" : "le"} avant de fusionner.`, '');
  }
  lines.push('Nouvelle version des skills de la factory.', '', '## Sources', '');
  const oldCommit = new Map(before.packs.map((p) => [p.id, p.commit]));
  for (const p of after.packs) {
    const was = oldCommit.get(p.id);
    if (was && was !== p.commit) {
      lines.push(`- ${p.name} : [voir tout ce que l'auteur a changé depuis la dernière fois](https://github.com/${p.repo}/compare/${was}...${p.commit})`);
    } else if (!was) {
      lines.push(`- ${p.name} : nouvelle source (https://github.com/${p.repo}/tree/${p.commit})`);
    } else {
      lines.push(`- ${p.name} : inchangé`);
    }
  }
  const kept = new Set(after.packs.map((p) => p.id));
  for (const p of before.packs) if (!kept.has(p.id)) lines.push(`- ${p.name} : source retirée`);

  lines.push('', '## Skills', '');
  const group = (title, items) => {
    if (!items.length) return;
    lines.push(`### ${title}`, ...items.sort().map((i) => `- ${i}`), '');
  };
  group('Nouveaux', added);
  group('Retirés', removed);
  const order = Object.keys(KIND_LABELS);
  group(
    'Modifiés',
    [...modified].map(([key, kinds]) => `${key} (${order.filter((k) => kinds.has(k)).map((k) => KIND_LABELS[k]).join(', ')})`),
  );
  if (!added.length && !removed.length && !modified.size) lines.push('Aucun skill modifié (seulement les informations des sources).', '');

  const fileLine = (f) => `- ${STATUS_LABELS[f.status] || f.status} : \`${f.rel}\` (${packName(f.pack)} : ${f.skill})`;
  if (programs.length) {
    lines.push('## ⚠️ Programmes et autres fichiers qui ne sont pas des fiches', '');
    const foldPrograms = programs.length > FOLD_OVER;
    if (foldPrograms) lines.push(`<details><summary>Voir les ${programs.length} fichiers</summary>`, '');
    lines.push(...programs.map(fileLine), '');
    if (foldPrograms) lines.push('</details>', '');
  }

  if (files.length) {
    lines.push('## Détail fichier par fichier', '');
    if (fold) lines.push(`<details><summary>Voir le détail des ${files.length} fichiers</summary>`, '');
    lines.push(...files.map((f) => `- ${STATUS_LABELS[f.status] || f.status} : \`${f.path}\``), '');
    if (fold) lines.push('</details>', '');
  }

  lines.push(
    'Les tests de la factory passent. Fusionnez cette PR pour que vos projets utilisent ces versions à leur prochaine synchro. ' +
      'Fermez-la pour les refuser : vos projets gardent les versions actuelles.',
  );
  return lines.join('\n') + '\n';
}

// CLI: node scripts/lib/skills-update-body.mjs <base-ref>   (compares <base-ref> with HEAD, prints the body)
if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  const { execFileSync } = await import('node:child_process');
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const base = process.argv[2] || 'HEAD~1';
  const body = skillsUpdateBody({
    before: JSON.parse(git('show', `${base}:packs/catalog.json`)),
    after: JSON.parse(git('show', 'HEAD:packs/catalog.json')),
    changes: parseNameStatus(git('diff', '--name-status', '--no-renames', '-z', base, 'HEAD', '--', 'packs')),
  });
  process.stdout.write(body);
}

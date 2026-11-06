// The stack sheet check (issue #242): a PR that adds or removes a library (or changes its main version) must update
// STACK.md in the same PR. Pure helpers; scripts/checks.mjs reads the files of the PR and of the default branch.
export const STACK_FILE = 'STACK.md';

const IGNORED = /(^|\/)(node_modules|\.git|\.factory-src|vendor|dist|build)\//;
export function isManifest(path) {
  if (IGNORED.test(path)) return false;
  return /(^|\/)(package\.json|requirements[^/]*\.txt|pyproject\.toml)$/.test(path);
}

// « ^18.3.1 » → 18, « ~0.9.2 » → 0.9 (a 0.x line breaks at each minor), no digit → none.
function major(spec) {
  const m = /(\d+)(?:\.(\d+))?/.exec(String(spec || ''));
  if (!m) return '';
  return m[1] === '0' && m[2] !== undefined ? `0.${m[2]}` : m[1];
}
const key = (eco, name, spec) => { const v = major(spec); return `${eco}:${name}${v ? `@${v}` : ''}`; };

// A Python requirement « FastAPI[standard]==0.115.12 ; python_version > '3' » → [name, version spec].
function pyRequirement(line) {
  const m = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*([^;#]*)/.exec(line.trim());
  return m ? [m[1].toLowerCase().replace(/_/g, '-'), m[2]] : null;
}

function fromPackage(text, out) {
  const pkg = JSON.parse(text);
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [name, spec] of Object.entries(pkg?.[field] || {})) out.add(key('npm', name, spec));
  }
}
function fromRequirements(text, out) {
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line || line.startsWith('-')) continue;
    const r = pyRequirement(line);
    if (r) out.add(key('py', ...r));
  }
}
// Only the `dependencies = [ … ]` arrays (PEP 621 and its optional groups); good enough for a sheet reminder.
function fromPyproject(text, out) {
  for (const m of text.matchAll(/^\s*[\w-]*dependencies\s*=\s*\[([\s\S]*?)\](?=[ \t]*(?:#.*)?$)/gm)) {
    for (const q of m[1].matchAll(/["']([^"']+)["']/g)) { const r = pyRequirement(q[1]); if (r) out.add(key('py', ...r)); }
  }
}

// Every library the manifests declare, as « npm:name@major » / « py:name@major ».
export function libraries(files) {
  const out = new Set();
  for (const [path, text] of Object.entries(files || {})) {
    if (!isManifest(path) || typeof text !== 'string') continue;
    try {
      if (path.endsWith('package.json')) fromPackage(text, out);
      else if (path.endsWith('.txt')) fromRequirements(text, out);
      else fromPyproject(text, out);
    } catch { /* a broken manifest is the other checks' business */ }
  }
  return out;
}

// base/head: { files: { path: text }, sheet: STACK.md text or null }.
export function stackVerdict({ base, head }) {
  if (base.sheet == null && head.sheet == null) return { status: 'skip', added: [], removed: [] };
  const before = libraries(base.files);
  const after = libraries(head.files);
  const added = [...after].filter((l) => !before.has(l)).sort();
  const removed = [...before].filter((l) => !after.has(l)).sort();
  const libsChanged = added.length + removed.length > 0;
  const sheetUpdated = head.sheet != null && head.sheet !== base.sheet;
  return { status: libsChanged && !sheetUpdated ? 'fail' : 'pass', added, removed };
}

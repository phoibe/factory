// A project's version number, given by the owner at « Mise en production » (Pulsar alignment): the changelog's
// unreleased section becomes « [X.Y.Z] - date », and the factory tags that release. Shared by the panel (the field
// of the dialog) and the relay (the cut, the tag, the notes). The number is always given, never deduced.

// Where a versioned changelog lives, in order: the first one found that has an unreleased section is used.
export const CHANGELOG_PATHS = ['docs/CHANGELOG.md', 'CHANGELOG.md'];
const UNRELEASED = /^## \[(Non publié|Unreleased)\][ \t]*$/;
const VERSION_HEAD = /^## \[(\d+\.\d+\.\d+)\]/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export const isSemver = (v) => SEMVER.test(String(v || ''));
// Field by field: « 0.10.0 » is above « 0.9.0 », which a string compare reverses.
export function semverGreater(a, b) {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

// What the changelog says: null when it has no unreleased section (the project does not version this way).
// `last`: the latest released version (first « ## [a.b.c] » heading), `entries`: items under the unreleased section.
export function readChangelog(text) {
  if (typeof text !== 'string') return null;
  const lines = text.split('\n');
  const at = lines.findIndex((l) => UNRELEASED.test(l));
  if (at < 0) return null;
  let entries = 0;
  for (let i = at + 1; i < lines.length && !/^## \[/.test(lines[i]); i++) if (/^- /.test(lines[i])) entries++;
  const last = lines.map((l) => VERSION_HEAD.exec(l)?.[1]).find(Boolean) || null;
  return { header: lines[at], last, entries };
}

// Why `version` cannot be released from this changelog, in plain French, or null when it can.
// `already`: the cut was made by an earlier attempt (the latest version IS this one): accepted, nothing to cut again.
export function versionProblem(text, version) {
  if (!isSemver(version)) return `« ${version} » n'est pas un numéro de version de la forme 1.2.3.`;
  const log = readChangelog(text);
  if (!log) return 'le CHANGELOG n\'a pas de section « Non publié ».';
  if (log.last === version) return null;
  if (log.last && !semverGreater(version, log.last)) return `${version} n'est pas supérieur à la dernière version (${log.last}).`;
  if (!log.entries) return 'la section « Non publié » du CHANGELOG est vide : rien à publier.';
  return null;
}

// The changelog with its unreleased section cut into « ## [X.Y.Z] - date » (a new, empty unreleased section stays on
// top). Unchanged when that version is already the latest one (an earlier attempt cut it).
export function cutVersion(text, version, date) {
  const log = readChangelog(text);
  if (!log || log.last === version) return text;
  const lines = text.split('\n');
  const at = lines.findIndex((l) => UNRELEASED.test(l));
  lines.splice(at + 1, 0, '', `## [${version}] - ${date}`);
  return lines.join('\n');
}

// The body of the « [X.Y.Z] » section (its heading excluded, up to the next one), for the release notes.
export function sectionOf(text, version) {
  const lines = String(text || '').split('\n');
  const at = lines.findIndex((l) => l.startsWith(`## [${version}]`));
  if (at < 0) return '';
  const out = [];
  for (let i = at + 1; i < lines.length && !/^## \[/.test(lines[i]); i++) out.push(lines[i]);
  return out.join('\n').trim();
}

// The version line of a « Mise en production » request (the panel writes it, the relay reads it).
export const versionLine = (v) => `Version : ${v}`;
export const versionOf = (body) => /^Version : (\S+)\s*$/m.exec(String(body || ''))?.[1] || null;

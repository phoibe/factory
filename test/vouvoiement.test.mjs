import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// What the owner reads is always addressed with « vous ». The instructions written for the agent itself
// (« Tu es l'agent… ») keep « tu », so only the quoted messages and owner-facing files are checked.
const TU = /\b(tu|toi|ton|ta|tes|Tu|Ton)\b|\bt'[a-zéèêàâ]|\b(Réponds|Écris|Clique|Colle|Appuie|Relance|Vérifie|Décris|Dis-moi|Double-clique|[Ff]usionne|Envoie)\b/;

test('files read by the owner never use « tu »', () => {
  const files = ['scripts/factory.sh', 'scripts/lib/labels.mjs', 'scripts/lib/run-title.mjs', 'outils/LISEZMOI.txt',
    'outils/Nouveau projet.command', 'outils/Adopter un projet.command', 'outils/Retirer un projet.command', '.github/workflows/update-skills.yml', '.github/workflows/outils.yml',
    ...readdirSync(new URL('../.github/ISSUE_TEMPLATE', import.meta.url)).map((f) => `.github/ISSUE_TEMPLATE/${f}`)];
  for (const f of files) {
    const bad = read(f).split('\n').filter((l) => TU.test(l) && !/Tu es l'agent|ROUTINE_PROMPT/.test(l));
    assert.deepEqual(bad, [], f);
  }
});

test('messages posted by the factory (relay) never use « tu »', () => {
  const quoted = read('scripts/relay.mjs').split('\n').filter((l) => /say\(|fail\(|\+ ["'`]/.test(l) && TU.test(l));
  assert.deepEqual(quoted, []);
});

test('the quoted messages of the agent templates use « vous »', () => {
  const dir = new URL('../agent/stages/', import.meta.url);
  for (const f of readdirSync(dir)) {
    const text = read(`agent/stages/${f}`);
    const quotes = [...text.matchAll(/« ([^»\n]*(?:« [^»\n]*»[^»\n]*)*)»/g)].map((m) => m[1]);
    const bad = quotes.filter((q) => /\b(Réponds|dis-moi|ta validation|te convient|tu veux|ton choix)\b/.test(q));
    assert.deepEqual(bad, [], f);
  }
  assert.match(read('agent/AGENT.md'), /Répondez « go »/);
});

test('the chat agent is told to address the owner with « vous »', () => {
  const core = read('server/chat/core.py');
  assert.match(core, /Vouvoie-le/);
  assert.doesNotMatch(core, /Tutoie/);
});

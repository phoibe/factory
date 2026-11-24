// Workflow files read as text: guards found by the general review (issue #338).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { SHARED } from '../scripts/stamp-panel.mjs';

const read = (name) => readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8');

test('« Déclarer stable »: an unrelated new issue never cancels a waiting promotion (queue on the job, not the workflow)', () => {
  const yml = read('stable.yml');
  assert.doesNotMatch(yml, /^concurrency:/m, 'a workflow-level group lets every opened issue replace the pending release run');
  assert.match(yml, /^  promote:\n[\s\S]*?^    concurrency:\n      group: .*'factory-stable'.*\n      cancel-in-progress: false/m);
});

test('« Déclarer stable »: the hourly run never takes the owner request\'s pending place (issue #344)', () => {
  const yml = read('stable.yml');
  assert.match(yml, /group: \$\{\{ github\.event_name == 'schedule' && 'factory-stable-hourly' \|\| 'factory-stable' \}\}/);
  assert.match(yml, /if: github\.event_name != 'schedule'\n[\s\S]*?node scripts\/stable\.mjs wait\n\s*git fetch --quiet --tags --force origin main\n\s*git checkout --quiet --detach FETCH_HEAD/,
    'an owner request waits for an hourly run under way, then takes main and the tags it may have published');
  assert.ok(yml.indexOf('stable.mjs wait') < yml.indexOf('scripts/checks.mjs'), 'the wait comes before the tests');
  assert.ok(yml.indexOf('stable.mjs yield') > yml.indexOf('scripts/checks.mjs'), 'the hourly run gives way after its tests');
  assert.match(yml, /^  actions: read$/m, 'reading the workflow runs needs the actions scope');
  assert.match(yml, /run: node scripts\/stable\.mjs yield/, 'the hourly run gives way just before promoting');
  assert.match(yml, /if: github\.event_name != 'schedule' \|\| steps\.yield\.outputs\.ready == 'true'/);
});

test('the panel is published even when the chat server cannot be deployed', () => {
  const yml = read('pages.yml');
  const step = /- name: Chat server\n([\s\S]*?)\n      - uses:/.exec(yml)?.[1] || '';
  assert.match(step, /continue-on-error: true/);
});

test('the test workflow only reads the repository', () => {
  assert.match(read('test.yml'), /^permissions:\n  contents: read/m);
});

test('the panel is published stamped (issue #561)', () => {
  const yml = read('pages.yml');
  assert.match(yml, /node scripts\/stamp-panel\.mjs _site "\$GITHUB_SHA"/);
  assert.doesNotMatch(yml, /cp -r panel|sed -i/);
  const paths = yml.match(/^\s*paths:.*$/m)[0];
  for (const f of ['scripts/stamp-panel.mjs', ...SHARED.filter((s) => !s.startsWith('defaults/'))]) assert.ok(paths.includes(`'${f}'`), f);
});

// Review #556 (D4): a hung job holds a runner for GitHub's 6-hour default. A job that calls a reusable workflow
// (`uses:` on the job) cannot carry the setting.
const jobsOf = (yml) => {
  const body = /^jobs:\n([\s\S]*)/m.exec(yml)?.[1] || '';
  return body.split(/^(?=  [\w-]+:\s*$)/m).filter((b) => /^  [\w-]+:/.test(b)).map((b) => ({ name: /^  ([\w-]+):/.exec(b)[1], body: b }));
};
test('every job that runs steps has a time limit', () => {
  const dir = new URL('../.github/workflows/', import.meta.url);
  const missing = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).flatMap((f) => jobsOf(read(f))
    .filter((j) => !/^    uses:/m.test(j.body) && !/^    timeout-minutes: \S/m.test(j.body)).map((j) => `${f}/${j.name}`));
  assert.deepEqual(missing, []);
});

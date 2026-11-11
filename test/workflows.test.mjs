// Workflow files read as text: guards found by the general review (issue #338).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8');

test('« Déclarer stable »: an unrelated new issue never cancels a waiting promotion (queue on the job, not the workflow)', () => {
  const yml = read('stable.yml');
  assert.doesNotMatch(yml, /^concurrency:/m, 'a workflow-level group lets every opened issue replace the pending release run');
  assert.match(yml, /^  promote:\n[\s\S]*?^    concurrency:\n      group: factory-stable\n      cancel-in-progress: false/m);
});

test('the panel is published even when the chat server cannot be deployed', () => {
  const yml = read('pages.yml');
  const step = /- name: Chat server\n([\s\S]*?)\n      - uses:/.exec(yml)?.[1] || '';
  assert.match(step, /continue-on-error: true/);
});

test('the test workflow only reads the repository', () => {
  assert.match(read('test.yml'), /^permissions:\n  contents: read/m);
});

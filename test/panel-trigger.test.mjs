// A project's own trigger (.github/workflows/factory.yml) is copied once at install and never synced by the
// factory (GitHub forbids its token to write workflow files): the panel brings its label filter up to date (issue #427).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WAKE_LABELS, missingWakeLabels, upgradeTrigger, wakeErrorText, TRIGGER_FILE, TRIGGER_REFUSED, knownTrigger } from '../panel/trigger.mjs';

const factoryTrigger = readFileSync(new URL('../.github/workflows/factory.yml', import.meta.url), 'utf8');

// The trigger installed in Pulsarwheel on 2026-11-06, as read on GitHub on 2026-11-15 (its custom hourly cron kept).
const PULSARWHEEL = `name: Factory
on:
  issues:
    types: [opened, labeled, unlabeled, closed]
  # ⚠️ Toutes les heures (décision de Pierre).
  schedule:
    - cron: '7 * * * *'
  workflow_dispatch:
jobs:
  factory:
    # Cheap filters, so that label changes and the agent's own messages cost no Actions minutes.
    if: >-
      (github.event_name != 'issues' || github.event.action != 'labeled' || github.event.label.name == 'factory:feature' || github.event.label.name == 'factory:bug' || github.event.label.name == 'factory:project' || github.event.label.name == 'factory:question' || github.event.label.name == 'factory:audit') &&
      (github.event_name != 'pull_request' || github.event.action != 'labeled' || github.event.label.name == 'factory:checks') &&
      (github.event_name != 'issue_comment' || !contains(github.event.comment.body, '<!-- factory-agent -->'))
    uses: phoibe/factory/.github/workflows/relay.yml@stable
    secrets: inherit
`;

test('the factory\'s own trigger lets every waking label through, and no other', () => {
  assert.equal(TRIGGER_FILE, '.github/workflows/factory.yml');
  assert.deepEqual(missingWakeLabels(factoryTrigger), []);
  const line = factoryTrigger.split('\n').find((l) => l.includes("github.event_name != 'issues'") && l.includes("!= 'labeled'"));
  assert.deepEqual([...line.matchAll(/github\.event\.label\.name == '([^']+)'/g)].map((m) => m[1]), WAKE_LABELS);
  for (const l of ['factory:kept', 'factory:blocked']) assert.ok(WAKE_LABELS.includes(l));
});

test('an old project trigger drops « Garder » (factory:kept): it is seen as out of date', () => {
  assert.deepEqual(missingWakeLabels(PULSARWHEEL), ['factory:stack', 'factory:kept', 'factory:blocked', 'factory:ui-polish']);
});

test('the upgrade adds only the missing labels and keeps the owner\'s own changes', () => {
  const up = upgradeTrigger(PULSARWHEEL);
  assert.deepEqual(missingWakeLabels(up), []);
  assert.match(up, /github\.event\.label\.name == 'factory:audit' \|\| github\.event\.label\.name == 'factory:stack' \|\| github\.event\.label\.name == 'factory:kept' \|\| github\.event\.label\.name == 'factory:blocked' \|\| github\.event\.label\.name == 'factory:ui-polish'\) &&\n/);
  assert.match(up, /cron: '7 \* \* \* \*'/);
  assert.match(up, /décision de Pierre/);
  assert.equal(up.split('\n').length, PULSARWHEEL.split('\n').length, 'no line added or removed');
  assert.match(up, /github\.event\.label\.name == 'factory:checks'\) &&/, 'the pull request filter is untouched');
  assert.doesNotMatch(up.split('\n').find((l) => l.includes("'factory:checks'")), /factory:kept/);
});

test('a filter written on one line gets the labels in its issues clause, never in the pull request one', () => {
  const one = "    if: (github.event_name != 'issues' || github.event.action != 'labeled' || github.event.label.name == 'factory:feature') && (github.event_name != 'pull_request' || github.event.action != 'labeled' || github.event.label.name == 'factory:checks')\n";
  const up = upgradeTrigger(one);
  assert.match(up, /'factory:feature' \|\| github\.event\.label\.name == 'factory:bug'/);
  assert.match(up, /'factory:ui-polish'\) && \(github\.event_name != 'pull_request' \|\| github\.event\.action != 'labeled' \|\| github\.event\.label\.name == 'factory:checks'\)\n$/);
  assert.deepEqual(missingWakeLabels(up), []);
  assert.deepEqual(missingWakeLabels("if: (github.event_name != 'issues' || github.event.action != 'labeled') && (x || github.event.label.name == 'factory:kept')"), WAKE_LABELS, 'a label in another clause does not count');
});

test('an up-to-date trigger, or one the panel does not recognise, is left alone', () => {
  assert.equal(upgradeTrigger(factoryTrigger), null);
  assert.equal(upgradeTrigger('name: something else\non: push\n'), null);
  assert.deepEqual(missingWakeLabels('name: something else\n'), []);
  assert.equal(upgradeTrigger(null), null);
  assert.equal(knownTrigger(factoryTrigger), true);
  assert.equal(knownTrigger('name: something else\n'), false);
});

test('a refused wake-up says plainly why and what to do', () => {
  assert.match(wakeErrorText({ status: 403 }), /jeton/);
  assert.match(wakeErrorText({ status: 403 }), /Actions/);
  assert.match(wakeErrorText({ status: 404, write: true }), /jeton/);
  assert.match(wakeErrorText({ status: 500 }), /GitHub/);
  assert.match(wakeErrorText(new TypeError('Failed to fetch')), /connexion/);
  assert.match(TRIGGER_REFUSED, /nouveau jeton/);
  for (const t of [TRIGGER_REFUSED, wakeErrorText({ status: 403 }), wakeErrorText({ status: 500 })]) assert.ok(t.length <= 130, `short enough to read at once: ${t}`);
  for (const s of [403, 500]) assert.match(wakeErrorText({ status: s }), /plus tard/);
});

test('« Amélioration UI » cards wake the factory, like a general review (issue #462)', () => {
  assert.ok(WAKE_LABELS.includes('factory:ui-polish'));
  assert.ok(missingWakeLabels(PULSARWHEEL).includes('factory:ui-polish'));
});

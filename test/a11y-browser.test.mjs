import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromiumPath } from '../a11y/browser.mjs';

test('the a11y tests use the cloud Chromium when no path is given, so they never hang on a missing browser', () => {
  assert.equal(chromiumPath({ CHROMIUM_PATH: '/x/chrome' }, () => true), '/x/chrome');
  assert.equal(chromiumPath({}, (p) => p === '/opt/pw-browsers/chromium'), '/opt/pw-browsers/chromium');
  assert.equal(chromiumPath({}, () => false), undefined);
});

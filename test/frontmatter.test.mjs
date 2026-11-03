import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter } from '../scripts/lib/frontmatter.mjs';

test('parses plain name and description', () => {
  const fm = parseFrontmatter('---\nname: tdd\ndescription: Use when writing code.\n---\nbody');
  assert.deepEqual(fm, { name: 'tdd', description: 'Use when writing code.' });
});

test('parses quoted description containing colons', () => {
  const fm = parseFrontmatter('---\nname: impeccable\ndescription: "Use when: design, polish"\nversion: 4.8.0\n---\n');
  assert.equal(fm.description, 'Use when: design, polish');
  assert.equal(fm.version, '4.8.0');
});

test('returns empty object without frontmatter', () => {
  assert.deepEqual(parseFrontmatter('# Title'), {});
});

test('handles CRLF line endings', () => {
  assert.equal(parseFrontmatter('---\r\nname: x\r\n---\r\n').name, 'x');
});

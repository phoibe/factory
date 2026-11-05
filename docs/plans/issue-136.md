# Panel favicon (issue #136)

Goal: show the header factory logo as white-on-blue rounded-square favicon.

1. Test `test/panel-favicon.test.mjs` (links in index.html, favicon.svg reuses header path, PNG apple icon).
2. Add `panel/favicon.svg`, `panel/apple-touch-icon.png` (180x180), two `<link>` tags in `panel/index.html`.
3. Run test suite, review, PR.

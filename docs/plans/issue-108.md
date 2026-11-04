# Issue 108 plan: site link and issues link on one line

**Goal:** In the project view, show the site link and "Voir les demandes sur GitHub" on one line, wrapping on small screens.

**Files:** `panel/index.html` (one `<p class="site-line">` holding both links and a decorative separator), `panel/style.css` (flex wrap row, separator hidden under 600px, no negative margin on the issues link), `test/panel-site-line.test.mjs`.

- [ ] Test: both ids in one `.site-line`; CSS has flex + wrap, `.quiet-link` margin 0, separator hidden on narrow screens.
- [ ] Run it, see it fail (HTML/CSS reverted).
- [ ] Implement the markup and CSS.
- [ ] `npm test`, typecheck, lint, build green; screenshots desktop/phone.

# Issue 65 — « Terminé » column

Goal: show the 10 latest merged requests in a last lane of the board.

1. `panel/lib.mjs`: `doneItems(pulls, limit)` (merged + "Closes #n" only, newest first, max 10), `doneAgo(iso, now)`, `COLUMNS` gets `done`.
2. `panel/app.mjs`: poll closed PRs, draw the « Terminé » lane (✓ Terminé + date, link to the issue, empty text), toast on new arrival.
3. `panel/style.css`: green `--ok` styling; bump cache versions.
4. Tests in `test/panel-lib.test.mjs`.

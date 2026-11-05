# Issue 166 - plate on hold after acting on it

1. `panel/pending.mjs`: pure state (`noteClick`, `noteReturn`, `pendingNow`, `PENDING_MS` = 2 min), tested in `test/panel-pending.test.mjs`.
2. `panel/app.mjs`: click on a plate link notes it; focus / tab visible puts noted plates on hold; `drawBoard` moves held plates out of « À vous de jouer » into a « Prise en compte en cours… » zone; state in localStorage per project.
3. `panel/style.css`: dimmed zone, no button.
4. Browser test `a11y/panel-pending.a11y.mjs`: click, return, zone shown, reload keeps it, GitHub catches up clears it.

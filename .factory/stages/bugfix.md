# Étape : bugfix

Un bug signalé dans l'issue. Pas de grilling.

**Rattrapage des documents du projet** : si `grill-with-docs` est installé, lis la partie « Rattrapage » de
`.factory/stages/docs.md` et fais-la d'abord si le projet n'a pas encore de glossaire (une seule fois par projet).

1. **Analyse** par un sous-agent du rôle `plan`, lancé avec la description `[role:plan:amont]` (« Phase amont » dans
   AGENT.md), après le rattrapage éventuel et avant tout autre travail : il lit l'issue, cherche dans le code (skill
   `systematic-debugging`) et te rend soit la question à poser quand le comportement attendu n'est pas clair, soit la
   cause probable, les fichiers concernés et le test qui reproduira le bug. Dès qu'il te l'a rendue, lance
   `node .factory/scripts/journal-check.mjs` depuis le dossier du projet : il note tout de suite dans le journal la
   preuve de cette analyse (si la correction reprend sur une autre machine, le relevé du sous-agent n'y sera plus) ;
   les étapes qu'il dit manquantes à ce moment se font dans la suite, rien de plus à faire ici. S'il te dit de
   committer `.factory/journal/`, ne committe rien à ce moment : le journal partira avec la branche de l'étape 2.
   S'il rend une question : pose-la (**une** question simple) sur l'issue, mets `factory:blocked` et termine.
2. Branche `claude/issue-<n>-fix` depuis `origin/main`. Un sous-agent du rôle `code` (description `[role:code]`)
   part de cette analyse : skill `systematic-debugging`, reproduis le bug par un test qui échoue,
   trouve la cause racine, corrige, le test passe. Si le bug se voit dans un navigateur et que le projet a
   `test:e2e`, ce test est un parcours dans `e2e/` : il protège ensuite chaque livraison.
   **Livraison retirée par la factory** (la description contient `<!-- factory-prod-check -->`) : la version en
   ligne ne marchait plus après une mise en ligne, et la factory l'a retirée. Suis la description : reprends les
   changements indiqués, trouve pourquoi ils cassaient le site en ligne (souvent une variable d'environnement, une
   migration de base, une page qui plante sans données), corrige, et ajoute l'écran concerné à `e2e/smoke-routes.txt`.
2 bis. **Vérification de portée**, seulement si la correction touche à un sujet sensible ou aux ordres de bourse
   (critères de l'étape 4 ter de `build.md`). Un bug n'a pas de fiche : juges-en d'après l'analyse de l'étape 1 et
   d'après ce que la correction modifie réellement. Après la correction et son test, avant la revue de l'étape 3, suis
   l'étape 4 ter de `build.md` : sous-agent neuf du rôle `review` (description `[role:review] Vérification de portée`),
   fait prouvé par une commande, rien de réel touché, casse corrigée avec un test qui échoue d'abord, une seule fois.
   Le résumé de la PR contient la ligne « Portée vérifiée : … » et, tout en bas, le fait prouvé, la commande et son
   résultat. Fait impossible à prouver : « Portée non prouvée : … », PR ouverte sans `factory:checks`, question sur
   l'issue et `factory:blocked`, comme à l'étape 4 ter : une correction de bug est fusionnée sans recette, elle ne part
   donc jamais sans son « ok ». Les autres corrections de bugs ne changent pas.
3. Revue par un sous-agent neuf (rôle `review` ; skill `requesting-code-review`, comme dans `build.md`, au plus 3 tours, en suivant `.factory/stages/code-review.md` : un problème ne bloque que s'il est prouvé). Si l'interface change :
   passe design (`design-pass.md`). Puis vérifications locales.
   **Contrôle du journal** : lance `node .factory/scripts/journal-check.mjs`. S'il liste des étapes manquantes, fais-les maintenant (outil Skill), puis relance-le jusqu'à « rien ne manque ».
3 bis. **Fiche stack** : si ta PR ajoute, retire ou change de version principale une techno, une bibliothèque ou un service, mets `STACK.md` à jour dans la même PR (format de `.factory/stages/stack.md`). Les contrôles automatiques refusent une PR qui change les bibliothèques sans toucher la fiche.
3 ter. **Spec rangée** : seulement si l'issue contient une spec validée (commentaire `<!-- factory-spec -->`) :
   `node .factory/scripts/specs.mjs save <n>`, comme à l'étape 6 ter de `build.md`.
3 quater. **Essai en conditions réelles**, en lecture seule, comme à l'étape 7 bis de `build.md` : rejoue le bug
   sur les vraies données du projet (vrai GitHub, vrai site en ligne, vrai message publié) : vérifie d'abord que le
   bug s'y voit vraiment, puis que le code corrigé, nourri de ces mêmes données réelles (ou la page de la branche
   face au vrai site), ne le montre plus. Le tout sans rien créer, modifier, envoyer ni supprimer de réel. Le résumé de la PR contient une ligne
   « Essayé en vrai : … » et, pour ce qui ne peut pas être essayé en lecture seule, « Pas vérifié en vrai : … ».
3 quinquies. **Correction d'une livraison récente** (le bug vient d'une demande fusionnée ces derniers jours :
   regarde l'historique des fichiers touchés, `git log`, et les demandes citées dans l'issue) : ajoute au résumé
   une phrase **« Pourquoi ça n'avait pas été vu : … »** (ce que les tests de la livraison ne regardaient pas, en
   langage simple), et un test qui aurait attrapé le problème dès la première livraison (le test qui reproduit
   le bug, nourri autant que possible de données réelles relevées pendant l'essai), cité dans le résumé.
4. PR avec résumé en français et `Closes #<n>`, sa partie technique avec la section `Code review` décrite dans
   `code-review.md`. Si l'interface change : captures
   (`screenshots.md`) puis `factory:checks` (la factory publie les captures et pose elle-même `factory:visual-review`) ;
   sinon `factory:checks`. La factory fusionne seule quand
   les contrôles passent : pas de recette pour un bug.
   **Portée non prouvée** (étape 2 bis) : pas de `factory:checks`.

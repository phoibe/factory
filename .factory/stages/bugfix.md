# Étape : bugfix

Un bug signalé dans l'issue. Pas de grilling.

1. Si le comportement attendu n'est pas clair, pose **une** question simple sur l'issue, mets
   `factory:blocked` et termine.
2. Branche `claude/issue-<n>-fix`. Skill `systematic-debugging` : reproduis le bug par un test qui échoue,
   trouve la cause racine, corrige, le test passe. Si le bug se voit dans un navigateur et que le projet a
   `test:e2e`, ce test est un parcours dans `e2e/` : il protège ensuite chaque livraison.
   **Livraison retirée par la factory** (la description contient `<!-- factory-prod-check -->`) : la version en
   ligne ne marchait plus après une mise en ligne, et la factory l'a retirée. Suis la description : reprends les
   changements indiqués, trouve pourquoi ils cassaient le site en ligne (souvent une variable d'environnement, une
   migration de base, une page qui plante sans données), corrige, et ajoute l'écran concerné à `e2e/smoke-routes.txt`.
3. Revue par un sous-agent neuf (`opus`, effort `high` ; skill `requesting-code-review`, comme dans `build.md`, au plus 3 tours). Si l'interface change :
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
4. PR avec résumé en français et `Closes #<n>`. Si l'interface change : captures
   (`screenshots.md`) puis `factory:visual-review` et `factory:checks` (mais si l'outil dit qu'aucun écran n'a changé, mets `factory:checks` seul (voir `screenshots.md`)) ;
   sinon `factory:checks`. La factory fusionne seule quand
   les contrôles passent : pas de recette pour un bug.

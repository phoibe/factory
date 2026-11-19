# Étape : amélioration UI de l'application

Le propriétaire a cliqué sur « Amélioration UI » dans le tableau : pas une feature, mais une remise à niveau de
**l'interface** de toute l'appli. Jusqu'à 3 tours de critique design, chacun suivi de la correction de tout ce
qu'il a trouvé. Pas de questions, pas de spec à valider : il valide directement les captures avant/après, et son
« ok » vaut recette.

1. **Branche** `claude/issue-<n>-ui` depuis `main`. Lis `PRODUCT.md` et `DESIGN.md`.
2. **Liste tous les écrans** de l'appli (pas seulement ceux d'un diff) : pages, routes, fenêtres, et leurs états
   importants (vide, erreur, chargement, connecté ou non), sur téléphone et sur ordinateur. Lance l'appli en
   local et ouvre chacun dans le navigateur (Playwright).
   **Aucun écran** (outil en ligne de commande, bibliothèque, projet encore vide) : n'ouvre pas de PR. Écris sur
   l'issue un message court et clair (« Ce projet n'a pas encore d'écran : il n'y a rien à améliorer. »), ajoute
   le label `factory:close` à l'issue (sans label de raison : ce n'est ni un doublon ni une demande obsolète), et
   termine. En dehors de ce cas et de celui de l'étape 4, ne ferme jamais cette carte de toi-même.
3. **Estimation de durée** : une fois les écrans listés, publie sur l'issue une estimation au même format que
   l'étape 0 de `build.md` (taille `medium`, ou `large` si l'appli a beaucoup d'écrans, marqueur
   `factory-estimate`). Si tu dépasses le haut de ta fourchette, publie une nouvelle estimation.
4. **Tours de critique, 3 au plus.** Chaque tour :
   - **critique complète** de tous les écrans de la liste : skill `impeccable`, commande `critique`
     (`reference/critique.md`), avec ses deux évaluations indépendantes en sous-agents (`sonnet`, effort `medium`)
     et le détecteur, contre `PRODUCT.md`, `DESIGN.md` et la règle « Textes à l'écran » de
     `.factory/stages/design-pass.md` (rappelle-la à chaque appel). Tu travailles seul : saute les questions de
     fin de critique (« Questions skipped: run autonome de la factory ») ;
   - **note le score** du tour ;
   - **si la critique ne trouve plus aucun problème, arrête-toi là** : pas de tour suivant. Si c'est dès le
     **premier** tour (rien à corriger du tout), n'ouvre pas de PR : écris sur l'issue une phrase claire (« L'interface
     n'a rien montré à corriger : rien n'a changé. »), ajoute `factory:close` à l'issue (sans label de raison) et
     termine ;
   - sinon **corrige tout** ce qu'elle a trouvé (prioritaires, alertes des personas, observations mineures,
     alertes du détecteur), avec les commandes qu'elle suggère (`polish`, `layout`, `typeset`, `clarify`,
     `harden`, `adapt`…), puis relance les tests du projet.
   Les rapports écrits dans `.impeccable/critique/` font partie de la PR.
5. **Périmètre : seulement l'apparence et la clarté des écrans** (mise en page, lisibilité, textes affichés,
   états vide / erreur / chargement, confort sur téléphone). Pas de revue du code, pas de nouvelle fonctionnalité.
   - Un vrai manque fonctionnel révélé par une critique ne se construit pas ici : ouvre une issue, titre et texte en français,
     expliquée simplement (voir « Ouvrir une issue » dans AGENT.md : pas de `factory:kept`, elle ira dans « Idées à trier » ; jamais une idée déjà
     refusée) et cite-la dans la PR.
   - Reste dans `DESIGN.md`. Si une correction l'exige vraiment, change le design validé dans `DESIGN.md` aussi, et
     annonce-le **en tête** du résumé de la PR (il pourra le refuser au moment des captures). Si elle existe, tiens à
     jour sa partie « Mises en page » (étape 3 bis de `design-pass.md`, jamais pour un design repris).
6. **Vérifie** localement (`typecheck`, `lint`, `test`, `build`, `test:a11y`, `test:e2e` : une correction visuelle peut
   casser un parcours ou l'accessibilité), puis `node .factory/scripts/journal-check.mjs` : il doit dire que rien ne
   manque.
7. **Relecture** : un sous-agent neuf (`sonnet`, effort `medium`) relit le diff pour vérifier qu'aucune correction
   n'a cassé un comportement (bouton qui ne fait plus rien, texte utile perdu, écran inaccessible). Corrige ce qu'il
   trouve.
8. **PR** (API REST, voir AGENT.md) : en tête, un résumé en français pour le propriétaire (« Amélioration UI : ce qui
   a changé ») avec, dans cet ordre : les changements du design validé s'il y en a (bien visibles), le nombre de
   tours faits, le score de la première et de la dernière critique, une ligne simple par amélioration (et une ligne
   par texte retiré, pour qu'il puisse le réclamer), les idées ouvertes, et la ligne « Essayé en vrai : … » /
   « Pas vérifié en vrai : … » de l'étape 7 bis de `build.md` (essai en conditions réelles, en lecture seule : par
   exemple la page de la branche comparée au vrai site en ligne). Puis `Closes #<n>`, puis les détails techniques en
   anglais. Pas de spec à ranger.
9. **Captures** : suis `.factory/stages/screenshots.md` sur les écrans modifiés, puis mets `factory:checks`
   sur la PR : la factory publie les captures et pose elle-même `factory:visual-review`.
10. L'issue garde `factory:building`. Poste sur l'issue un court message avec le lien de la PR.

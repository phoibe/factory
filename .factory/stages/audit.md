# Étape : review générale de l'application

Le propriétaire a demandé, depuis le tableau, une review générale : pas une feature, mais une remise à niveau de
toute l'appli. Deux passes, dans cet ordre, chacune suivie de ses corrections. Pas de spec à valider.

1. **Branche** `claude/issue-<n>-review` depuis `main`. Lis `PRODUCT.md` et `DESIGN.md`.
1 bis. **Estimation de durée** : après avoir listé les écrans et parcouru le code, publie sur l'issue une estimation
   du temps restant, au même format que l'étape 0 de `build.md` (taille `large`, marqueur `factory-estimate`). Le
   tableau l'affiche à la place d'une durée de feature, qui serait bien trop courte. Si tu dépasses le haut de ta
   fourchette, publie une nouvelle estimation pour ce qu'il reste.
2. **Passe design sur tous les écrans** : fais la liste de **tous** les écrans de l'appli (pages, routes,
   états importants : vide, erreur, chargement, connecté ou non), pas seulement ceux d'un diff. Puis suis
   `.factory/stages/design-pass.md` sur cette liste : skill `impeccable`, commande `critique` pour chaque
   écran, correction de tout ce qu'il trouve, recritique, au plus 3 tours, avec la règle « Textes à l'écran »
   de `design-pass.md` sur tous les écrans. Reste dans `DESIGN.md` ; si un
   problème demande de changer le design validé, change `DESIGN.md` aussi et signale-le dans la PR.
3. **Revue de code générale** : charge le skill `requesting-code-review` (outil Skill), puis fais relire
   **tout le code** (pas un diff) par des sous-agents neufs, un par grande partie de l'appli si elle est
   grosse. Ils cherchent : bugs, failles de sécurité et données personnelles, erreurs mal gérées, tests
   manquants sur ce qui compte, accessibilité, performances, code mort ou dupliqué, écarts avec
   `PRODUCT.md`. Corrige chaque point (skill `receiving-code-review`) ; pour un bug, écris d'abord le test qui
   échoue. Puis une revue neuve des corrections, au plus 3 tours.
3 bis. **Architecture** : skill `improve-codebase-architecture` (s'il est installé), en autonomie : repère les
   endroits où le code s'est alourdi au fil des features (modules trop bavards, logique dupliquée, parties
   difficiles à tester). Simplifie ici ce qui est petit et sans risque, tests à l'appui ; pour un vrai chantier,
   ouvre une idée (point 4). Saute ses questions et son rapport HTML : tu travailles seul.
3 ter. **Parcours** : si le projet n'a pas encore `test:e2e`, ajoute-le (voir l'étape 4 bis de `build.md`) avec
   un parcours par feature déjà en ligne, d'après les critères d'acceptation des specs validées, et remplis
   `e2e/smoke-routes.txt`.
4. **Hors périmètre** : ce qui demande une vraie nouvelle feature ou un gros chantier ne se fait pas ici.
   Ouvre une issue par sujet, expliquée simplement (voir « Ouvrir une issue » dans AGENT.md : pas de
   `factory:kept`, elles iront dans « Idées à trier » ; et jamais une idée qu'il a déjà refusée), et cite-les dans la PR.
4 bis. **Fiche stack** : vérifie que `STACK.md` est complet et exact (format de `.factory/stages/stack.md`) ; corrige-le, ou écris-le s'il manque.
5. **Vérifie** localement (`typecheck`, `lint`, `test`, `build`, `test:a11y`, `test:e2e`), puis
   `node .factory/scripts/journal-check.mjs` : il doit dire que rien ne manque.
6. **PR** (API REST, voir AGENT.md) : en tête, un résumé en français pour le propriétaire (« Review générale :
   ce qui a été amélioré »), avec la section « Design » de `design-pass.md` (score de la première et de la
   dernière critique), une section « Code » (une ligne simple par problème corrigé) et les issues ouvertes.
   Puis `Closes #<n>`, puis les détails techniques en anglais.
7. **Captures** : si l'apparence a changé et que l'étape screenshots est active, suis
   `.factory/stages/screenshots.md` sur les écrans modifiés, puis mets `factory:visual-review` puis `factory:checks` sur la PR
   (mais si l'outil dit qu'aucun écran n'a changé, mets `factory:checks` seul (voir `screenshots.md`)).
   Sinon, mets `factory:checks`.
8. L'issue garde `factory:building`. Poste sur l'issue un court message avec le lien de la PR.

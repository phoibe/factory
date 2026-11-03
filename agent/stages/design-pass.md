# Passe design : critique puis correction des écrans

À suivre depuis les autres étapes quand un écran est créé ou modifié (et si l'étape « passe design » est
active). But : qu'`impeccable` critique **chaque** écran créé ou modifié et que **tout** ce qu'il trouve
soit corrigé avant les captures.

1. **Liste les écrans** créés ou modifiés par la branche (pages, routes, composants visibles), d'après le
   diff avec `main`. Lance l'appli en local et ouvre chaque écran dans le navigateur (Playwright), sur
   téléphone et sur ordinateur.
2. **Critique** : pour chaque écran, skill `impeccable`, commande `critique`
   (`reference/critique.md`), avec ses deux évaluations indépendantes en sous-agents et le détecteur.
   Elle juge l'écran contre `PRODUCT.md` et `DESIGN.md`. Tu travailles seul : saute les questions de fin de
   critique en écrivant « Questions skipped: run autonome de la factory », et ne t'arrête pas sur elles.
3. **Corrige tout** : chaque problème du rapport (prioritaires, alertes des personas, observations
   mineures, alertes du détecteur), avec les commandes qu'il suggère (`polish`, `layout`, `typeset`,
   `clarify`, `harden`, `adapt`…). Ne corrige que ce qui reste dans le périmètre de la feature et dans
   `DESIGN.md` ; si une correction demande de changer le design validé (nouvelle couleur, nouveau
   composant), fais-la dans `DESIGN.md` aussi et signale-le dans la PR.
4. **Recritique** les écrans corrigés. Recommence 3 à 4 jusqu'à ce qu'il ne reste rien, au plus 3 tours.
   S'il reste des problèmes après le 3ᵉ tour, liste-les dans la PR, en français simple, dans une section
   « Design : points restants ».
5. Relance les tests (une correction visuelle peut casser un test ou l'accessibilité) et ajoute dans la PR
   une section « Design » : le score de la première et de la dernière critique, et en une ligne par point
   ce qui a été corrigé.
6. Les rapports écrits dans `.impeccable/critique/` font partie de la PR.

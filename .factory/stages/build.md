# Étape : build (construction d'une feature)

Le propriétaire a validé la spec (dernier commentaire `<!-- factory-spec -->`). Construis-la jusqu'à une PR.

0. **Estimation de durée.** Avant de commencer, évalue honnêtement la taille de la feature (`small`, `medium` ou `large`)
   et le temps de travail réaliste qu'il te reste, en minutes, sous forme de fourchette (ni marge de sécurité excessive, ni
   vœu pieux ; le haut ne dépasse pas 2,5 fois le bas). Publie-la en commentaire sur l'issue, avec en 2e ligne le marqueur
   `<!-- factory-estimate size=<taille> min=<bas> max=<haut> -->` et une phrase en français pour le propriétaire
   (ex. « Je pense que c'est une petite feature : entre 10 et 20 min »). Le tableau lit ce marqueur.
   **Repères mesurés** (de la spec validée à la PR ouverte, revue et passe design comprises) : une petite feature
   prend 5 à 20 min, une moyenne 15 à 30 min, une grosse 30 à 60 min. Les estimations passées étaient 2 à 3 fois
   trop hautes (« 40 à 90 min » pour des features faites en 10 à 25 min) : pars de ces repères, pas d'un temps humain. Si en cours de route
   tu dépasses le haut de ta fourchette, publie une nouvelle estimation (même format) pour ce qu'il reste à faire.
1. **Branche** `claude/issue-<n>-<mot-clé>` depuis `main`.
2. **Projet vide ?** Si le dépôt n'a pas encore d'application, crée-la selon la stack de `PRODUCT.md` (sans fiche produit, choisis-la avec les critères de `.factory/stages/framing.md`), avec dès le
   départ les scripts npm `typecheck`, `lint`, `test`, `build`, `test:a11y` (Playwright + axe-core sur les
   pages principales) et `test:e2e` (voir l'étape 4 bis). Ces scripts sont ceux que lancent les contrôles automatiques.
3. **Plan** (si l'étape plan est active), **seulement pour une feature moyenne ou grande** (ton estimation de
   l'étape 0) : skill `writing-plans`, plan enregistré dans `docs/plans/issue-<n>.md`. Pas de validation humaine
   du plan : exécute-le toi-même (`executing-plans` ou `subagent-driven-development`). Une petite feature se code
   directement, sans plan écrit ; si elle touche finalement plus de 3 fichiers de code, le verrou te demandera
   le plan avant la PR.
4. **Code en TDD** (si l'étape tdd est active) : skill `test-driven-development`, test qui échoue d'abord :
   lance-le avec la commande de test du projet et vois-le échouer avant d'écrire le code (c'est la preuve TDD).
4 bis. **Parcours rejoués à chaque livraison** : chaque critère d'acceptation de la spec que l'on peut vérifier
   dans un navigateur devient un test de parcours Playwright dans `e2e/` (un fichier par feature, un test par
   critère, nommé en français avec les mots du critère : « je vois le créneau commun quand tout le monde est libre »).
   Lancés par `npm run test:e2e`, ils démarrent l'appli en local avec la base de test, comme `test:a11y`.
   Si le projet n'a pas encore `test:e2e`, ajoute-le dans cette PR (Playwright, `CHROMIUM_PATH` comme pour
   `test:a11y`) : les contrôles automatiques le lancent ensuite à chaque livraison, et une feature ne peut plus
   en casser une autre sans que ça se voie. Ajoute aussi chaque nouvel écran principal, sans connexion, à
   `e2e/smoke-routes.txt` (un chemin par ligne) : la factory ouvre ces écrans sur la preview avant de la
   montrer au propriétaire, puis sur le site en ligne après la mise en ligne. Skill `webapp-testing` s'il est
   installé, pour piloter le navigateur.
5. **Revue de code** (si active) : charge d'abord toi-même le skill `requesting-code-review` (outil Skill),
   puis lance comme il l'explique un **sous-agent** qui n'a pas écrit le code, avec un contexte neuf : il
   relit le diff contre la spec et les standards du dépôt. Corrige ce
   qu'il trouve (skill `receiving-code-review`), puis relance une revue neuve. Au plus 3 tours.
   S'il reste un problème bloquant après le dernier tour : ouvre quand même la PR en brouillon, explique le
   blocage au propriétaire en langage simple sur l'issue, mets `factory:blocked` et termine.
5 bis. **Revue de sécurité**, seulement si la spec est **sensible** (connexion, codes, comptes, données
   personnelles, argent, partage, suppression de données : mêmes critères que `spec.md`) : skill
   `security-review` (outil Skill) sur le diff ; s'il n'existe pas, un sous-agent neuf relit le diff uniquement
   sous l'angle sécurité (accès sans droit, données d'un autre visibles, injection, secrets, force brute).
   Corrige ce qu'il trouve avec un test qui échoue d'abord, et ajoute une ligne « Sécurité » au résumé de la PR.
6. **Passe design** (si active et si l'interface change) : suis `.factory/stages/design-pass.md`
   (critique impeccable de chaque écran créé ou modifié, puis correction de tout ce qu'elle trouve), en
   respectant `DESIGN.md` (pas de nouvelle couleur ou police hors de ce fichier) et la règle
   « Textes à l'écran » de `design-pass.md`.
6 bis. **Fiche stack** : si ta PR ajoute, retire ou change de version principale une techno, une bibliothèque ou un service, mets `STACK.md` à jour dans la même PR (format de `.factory/stages/stack.md`). Les contrôles automatiques refusent une PR qui change les bibliothèques sans toucher la fiche.
7. **Vérifie** localement : `npm run typecheck`, `lint`, `test`, `build` (et `test:e2e`) doivent passer
   (skill `verification-before-completion`). Ne termine pas sur du rouge.
   **Contrôle du journal** : lance `node .factory/scripts/journal-check.mjs`. S'il liste des étapes manquantes, fais-les maintenant (outil Skill), puis relance-le jusqu'à « rien ne manque ».
8. **PR** (via l'API REST, voir AGENT.md) avec en tête un résumé en français pour le propriétaire (ce qui change pour
   lui, et la phrase du glossaire / des décisions si la spec en contient une), puis `Closes #<n>`, puis les détails techniques en anglais.
   **Rien à tester pour lui ?** Si la PR ne change rien à l'écran ni dans l'usage de l'appli (tests, robustesse,
   nettoyage du code, outillage), mets `<!-- factory-nothing-to-test -->` sur une ligne de la description et dis-le
   dans le résumé (« Rien ne change pour vous »). La factory la mettra en ligne dès que les contrôles sont verts,
   sans lui demander de recette. Au moindre changement visible ou d'usage, pas de marqueur.
9. **Captures** : si l'interface change et que l'étape screenshots est active, suis
   `.factory/stages/screenshots.md`, puis mets les labels `factory:visual-review` puis `factory:checks` sur la PR
   (les contrôles tournent pendant que le propriétaire regarde les captures ; son « ok » vaut recette).
   Sinon, mets directement `factory:checks` sur la PR.
10. L'issue garde `factory:building`. Poste sur l'issue un court message avec le lien de la PR.

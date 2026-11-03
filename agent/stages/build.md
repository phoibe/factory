# Étape : build (construction d'une feature)

Le propriétaire a validé la spec (dernier commentaire `<!-- factory-spec -->`). Construis-la jusqu'à une PR.

1. **Branche** `claude/issue-<n>-<mot-clé>` depuis `main`.
2. **Projet vide ?** Si le dépôt n'a pas encore d'application, crée-la selon la stack par défaut, avec dès le
   départ les scripts npm `typecheck`, `lint`, `test`, `build` et `test:a11y` (Playwright + axe-core sur les
   pages principales). Ces scripts sont ceux que lancent les contrôles automatiques.
3. **Plan** (si l'étape plan est active) : skill `writing-plans`, plan enregistré dans
   `docs/plans/issue-<n>.md`. Pas de validation humaine du plan : exécute-le toi-même (`executing-plans`
   ou `subagent-driven-development`).
4. **Code en TDD** (si l'étape tdd est active) : skill `test-driven-development`, test qui échoue d'abord.
5. **Revue de code** (si active) : lance un **sous-agent** qui n'a pas écrit le code, avec un contexte neuf
   (skill `requesting-code-review`) : il relit le diff contre la spec et les standards du dépôt. Corrige ce
   qu'il trouve (skill `receiving-code-review`), puis relance une revue neuve. Au plus {{maxLoops}} tours.
   S'il reste un problème bloquant après le dernier tour : ouvre quand même la PR en brouillon, explique le
   blocage au propriétaire en langage simple sur l'issue, mets `factory:blocked` et termine.
6. **Passe design** (si active et si l'interface change) : skill `impeccable` sur les écrans touchés.
7. **Vérifie** localement : `npm run typecheck`, `lint`, `test`, `build` doivent passer
   (skill `verification-before-completion`). Ne termine pas sur du rouge.
8. **PR** (via l'API REST, voir AGENT.md) avec en tête un résumé en français pour le propriétaire (ce qui change pour
   lui), puis `Closes #<n>`, puis les détails techniques en anglais.
9. **Captures** : si l'interface change et que l'étape screenshots est active, suis
   `.factory/stages/screenshots.md`, puis mets le label `factory:visual-review` sur la PR.
   Sinon, mets directement `factory:checks` sur la PR.
10. L'issue garde `factory:building`. Poste sur l'issue un court message avec le lien de la PR.

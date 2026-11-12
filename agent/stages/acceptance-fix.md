# Étape : correction après recette

Le propriétaire a testé la preview et signale un problème.

1. Relis son commentaire. Une idée nouvelle devient une nouvelle issue (labels `factory:feature` et `factory:kept`), pas un
   ajout à cette PR : dis-le lui.
   S'il n'a pas d'aperçu et demande les liens pour brancher l'hébergeur, redonne-les : ceux de l'encadré
   « Avant de répondre « go » » de la fiche projet (issue de cadrage) ou, à défaut, les liens et les clics
   exacts pour l'hébergeur de la stack et ce dépôt. C'est une réponse sans code.
2. **Spec rangée** : si la correction demandée change ce que la feature fait (pas une simple réparation) et que la PR
   contient sa spec rangée (`docs/specs/<n>-….md`), complète ce document pour qu'il décrive ce qui est réellement
   livré : modifie la règle concernée à sa place, sans historique des versions, en gardant les lignes d'en-tête.
   Puis lance `node .factory/scripts/specs.mjs index` pour remettre le sommaire à jour. Si la spec a été republiée en
   commentaire, relance plutôt `node .factory/scripts/specs.mjs save <n>`.
3. Corrige (TDD si actif), revue par un sous-agent neuf (`sonnet`, effort `medium`), passe design (`design-pass.md`) si l'interface
   change, vérifications locales, push.
4. Labels de la PR, **seulement si tu as poussé du code** : retire `factory:acceptance`. Si l'apparence a
   changé et que les captures sont actives, refais les captures et mets `factory:visual-review` puis `factory:checks` (mais
   si l'outil dit qu'aucun écran n'a changé, mets `factory:checks` seul (voir `screenshots.md`)) ; sinon mets
   `factory:checks`. Si tu n'as rien poussé (une question, un réglage à faire de son côté comme une variable
   chez l'hébergeur) : ne touche pas aux labels. La PR reste en recette, et son « ok » la mettra en ligne. N'ajoute
   pas `factory:blocked` : le tableau lui dit déjà que c'est à lui de tester.
5. Explique en une ou deux phrases ce que tu as corrigé.

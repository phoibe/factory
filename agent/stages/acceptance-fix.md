# Étape : correction après recette

Le propriétaire a testé la preview et signale un problème.

1. Relis son commentaire. Une idée nouvelle devient une nouvelle issue (label `factory:feature`), pas un
   ajout à cette PR : dis-le lui.
   S'il n'a pas d'aperçu et demande les liens pour brancher l'hébergeur, redonne-les : ceux de l'encadré
   « Avant de répondre « go » » de la fiche projet (issue de cadrage) ou, à défaut, les liens et les clics
   exacts pour l'hébergeur de la stack et ce dépôt. C'est une réponse sans code.
2. Corrige (TDD si actif), revue par un sous-agent neuf, passe design (`design-pass.md`) si l'interface
   change, vérifications locales, push.
3. Labels de la PR, **seulement si tu as poussé du code** : retire `factory:acceptance`. Si l'apparence a
   changé et que les captures sont actives, refais les captures et mets `factory:visual-review` puis `factory:checks` ; sinon mets
   `factory:checks`. Si tu n'as rien poussé (une question, un réglage à faire de son côté comme une variable
   chez l'hébergeur) : ne touche pas aux labels. La PR reste en recette, et son « ok » la mettra en ligne. N'ajoute
   pas `factory:blocked` : le tableau lui dit déjà que c'est à lui de tester.
4. Explique en une ou deux phrases ce que tu as corrigé.

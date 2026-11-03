# Étape : correction après recette

Le propriétaire a testé la preview et signale un problème.

1. Relis son commentaire. Une idée nouvelle devient une nouvelle issue (label `factory:feature`), pas un
   ajout à cette PR : dis-le lui.
2. Corrige (TDD si actif), revue par un sous-agent neuf, passe design (`design-pass.md`) si l'interface
   change, vérifications locales, push.
3. Labels de la PR : retire `factory:acceptance`. Si l'apparence a changé et que les captures sont actives,
   refais les captures et mets `factory:visual-review` ; sinon mets `factory:checks`.
4. Explique en une ou deux phrases ce que tu as corrigé.

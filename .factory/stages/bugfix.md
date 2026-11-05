# Étape : bugfix

Un bug signalé dans l'issue. Pas de grilling.

1. Si le comportement attendu n'est pas clair, pose **une** question simple sur l'issue, mets
   `factory:blocked` et termine.
2. Branche `claude/issue-<n>-fix`. Skill `systematic-debugging` : reproduis le bug par un test qui échoue,
   trouve la cause racine, corrige, le test passe.
3. Revue par un sous-agent neuf (skill `requesting-code-review`, comme dans `build.md`, au plus 3 tours). Si l'interface change :
   passe design (`design-pass.md`). Puis vérifications locales.
   **Contrôle du journal** : lance `node .factory/scripts/journal-check.mjs`. S'il liste des étapes manquantes, fais-les maintenant (outil Skill), puis relance-le jusqu'à « rien ne manque ».
4. PR avec résumé en français et `Closes #<n>`. Si l'interface change : captures
   (`screenshots.md`) puis `factory:visual-review` et `factory:checks` ; sinon `factory:checks`. La factory fusionne seule quand
   les contrôles passent : pas de recette pour un bug.

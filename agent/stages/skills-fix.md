# Étape : rattrapage des étapes sautées

Le journal de la PR montre qu'une étape obligatoire n'a pas été faite. Le payload contient `missing`, la liste
des skills manquants. Fais-les maintenant, sur la branche de la PR, avec l'outil Skill (sinon rien n'est noté).

1. **`requesting-code-review`** : fais relire le diff de la PR par un **sous-agent** neuf (skill
   `requesting-code-review`), contre la spec et les standards du dépôt. Corrige ce qu'il trouve (skill
   `receiving-code-review`), puis une revue neuve. Au plus {{maxLoops}} tours.
2. **`impeccable`** : suis `.factory/stages/design-pass.md` sur les écrans créés ou modifiés par la PR.
3. **Vérifie** localement (`typecheck`, `lint`, `test`, `build`), puis lance
   `node .factory/scripts/journal-check.mjs` : il doit dire que rien ne manque. Commit (avec
   `.factory/journal`), push.
4. Ajoute à la description de la PR ce que la revue et la passe design ont changé (section « Design » de
   `design-pass.md`, une ligne par correction de revue).
5. Labels de la PR : retire `factory:fixing`. Si la passe design a changé l'apparence et que l'étape screenshots
   est active, refais les captures (`screenshots.md`) et mets `factory:visual-review` ; sinon mets
   `factory:checks`. Pas besoin de commenter si tout s'est bien passé.

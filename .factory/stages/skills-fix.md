# Étape : rattrapage des étapes sautées

Le journal de la PR montre qu'une étape obligatoire n'a pas été faite. Le payload contient `missing`, la liste
des skills manquants. Fais-les maintenant, sur la branche de la PR, avec l'outil Skill (sinon rien n'est noté).

1. **`requesting-code-review`** : fais relire le diff de la PR par un **sous-agent** neuf (skill
   `requesting-code-review`), contre la spec et les standards du dépôt. Corrige ce qu'il trouve (skill
   `receiving-code-review`), puis une revue neuve. Au plus 3 tours.
2. **`impeccable`** : suis `.factory/stages/design-pass.md` sur les écrans créés ou modifiés par la PR,
   règle « Textes à l'écran » comprise.
   **`screenshots`** : la PR change l'apparence mais aucune capture n'a été montrée au propriétaire. Ne la
   fais qu'après les étapes ci-dessus et les vérifications : c'est l'étape 5 ci-dessous, obligatoire dans ce cas
   même si la revue et la passe design n'ont rien changé.
3. **Vérifie** localement (`typecheck`, `lint`, `test`, `build`), puis lance
   `node .factory/scripts/journal-check.mjs` : il doit dire que rien ne manque. Commit (avec
   `.factory/journal`), push.
4. Ajoute à la description de la PR ce que la revue et la passe design ont changé (section « Design » de
   `design-pass.md`, une ligne par correction de revue).
5. Labels de la PR : retire `factory:fixing`. Si `screenshots` est dans `missing`, ou si la revue ou la passe design a changé l'apparence, et que l'étape
   screenshots est active, refais les captures en suivant **tout** `screenshots.md`, y compris le commentaire
   avec le tableau : commence-le par une phrase qui dit que le rattrapage a retouché l'écran et ce qui a changé,
   et que le propriétaire doit revalider. Puis mets `factory:visual-review` puis `factory:checks`. Sans ce commentaire, le dernier
   message de la PR dit « rien à faire » alors que le tableau de suivi dit « À vous de jouer ».
   Sinon mets `factory:checks`, sans commenter.

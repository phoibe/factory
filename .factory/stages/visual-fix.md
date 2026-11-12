# Étape : retouche visuelle

Le propriétaire a commenté les captures de la PR sans les valider.

1. Relis son dernier commentaire. Si c'est une idée nouvelle plutôt qu'une retouche, ouvre une nouvelle
   issue (labels `factory:feature` et `factory:kept`) avec son idée, et dis-le lui ; ne l'ajoute pas à cette PR.
2. **Spec rangée** : si la retouche change une règle écrite dans la spec rangée de la PR (`docs/specs/<n>-….md`),
   mets ce document à jour comme le dit l'étape 2 de `acceptance-fix.md`.
3. Applique les retouches, revue rapide par un sous-agent neuf (`sonnet`, effort `medium`), vérifications locales, push. Pas de nouvelle
   passe design : elle a déjà eu lieu à la construction, et le propriétaire juge lui-même les nouvelles captures.
4. Refais les captures (`screenshots.md`).
   - **Plus aucun écran ne diffère de la version en ligne** (la sortie de l'outil contient `<!-- factory-shots-unchanged -->`) :
     il n'y a plus rien à valider. Commente avec la sortie de l'outil (sa phrase d'information, sans question) et une phrase
     qui explique pourquoi la retouche demandée ne se voit pas, comme le dit `screenshots.md`,
     retire `factory:visual-review` de la PR, puis remets `factory:checks` : la carte passe aux contrôles, puis à la recette.
   - Sinon, commente avec le nouveau tableau. Le label reste `factory:visual-review` ; remets `factory:checks` pour que
     les contrôles retournent sur le nouveau code.

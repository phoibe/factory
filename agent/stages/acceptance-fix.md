# Étape : correction après recette

Le propriétaire a testé la preview et signale un problème.

1. Relis son commentaire. Une idée nouvelle devient une nouvelle issue, titre et texte en français (labels `factory:feature` et `factory:kept`), pas un
   ajout à cette PR : dis-le lui.
   S'il n'a pas d'aperçu et demande les liens pour brancher l'hébergeur, redonne-les : ceux de l'encadré
   « Avant de répondre « go » » de la fiche projet (issue de cadrage) ou, à défaut, les liens et les clics
   exacts pour l'hébergeur de la stack et ce dépôt. C'est une réponse sans code.
2. **Spec rangée** : si la correction demandée change ce que la feature fait (pas une simple réparation) et que la PR
   contient sa spec rangée (`docs/specs/<n>-….md`), complète ce document pour qu'il décrive ce qui est réellement
   livré : modifie la règle concernée à sa place, sans historique des versions, en gardant les lignes d'en-tête.
   Puis lance `node .factory/scripts/specs.mjs index` pour remettre le sommaire à jour. Si la spec a été republiée en
   commentaire, relance plutôt `node .factory/scripts/specs.mjs save <n>`.
2 bis. **Vérification de portée**, seulement si ta correction modifie du code et que la demande est concernée : la
   description de la PR a une ligne « Portée vérifiée » ou « Portée non prouvée », ou la correction touche elle-même à
   un sujet sensible ou aux ordres de bourse (critères de l'étape 4 ter de `build.md`). Elle se fait pendant l'étape 3,
   après la correction et ses tests, avant la revue et **avant de pousser** : refais-la sur cette correction comme à
   l'étape 4 ter de `build.md` (sous-agent neuf du rôle `review`, description `[role:review] Vérification de portée`),
   puis ajoute ou mets à jour la ligne « Portée vérifiée : … » de la description de la PR et, tout en bas, le fait
   prouvé, la commande et son résultat, sans toucher au reste de la description.
   **Fait impossible à prouver sans toucher à du réel** : une fois l'étape 3 finie (revue par un sous-agent neuf,
   passe design si besoin, vérifications locales), et avant de pousser, mets d'abord `factory:blocked` sur la PR, puis
   retire tous ses labels d'étape présents (`factory:acceptance`, `factory:checks`, `factory:visual-review`) : sinon
   la factory relance d'elle-même les contrôles dès que du code arrive. Pousse, remplace la ligne par « Portée non
   prouvée : … » et demande son accord comme à l'étape 4 ter de `build.md`, mais son message est posté sur la PR et se
   termine par « Répondez « ok » ici, sur la PR, pour que la modification parte vers les contrôles automatiques, ou
   dites-moi ce qu'il faut regarder ou changer. » ; ne mets pas `factory:checks` et termine : l'étape 4 ne
   s'applique pas.
3. Corrige (TDD si actif), revue par un sous-agent neuf (rôle `code`), passe design (`design-pass.md`) si l'interface
   change, vérifications locales, push.
4. Labels de la PR, **seulement si tu as poussé du code** : retire `factory:acceptance`. Si l'apparence a
   changé et que les captures sont actives, refais les captures (voir `screenshots.md`) ; dans tous les cas mets
   `factory:checks` (la factory publie les captures et pose elle-même `factory:visual-review` s'il y en a). Si tu n'as rien poussé (une question, un réglage à faire de son côté comme une variable
   chez l'hébergeur) : ne touche pas aux labels. La PR reste en recette, et son « ok » la mettra en ligne. N'ajoute
   pas `factory:blocked` : le tableau lui dit déjà que c'est à lui de tester.
5. Explique en une ou deux phrases ce que tu as corrigé.

# Guide : la revue de code à tours (un problème ne bloque que s'il est prouvé)

Ce n'est pas une étape à part : `build.md` (étape 5, et par elle le socle d'un nouveau projet), `bugfix.md`
(étape 3), `skills-fix.md` (étape 1) et `audit.md` (la revue des corrections, à la fin de l'étape 3) t'envoient ici.
Ce guide ne vaut que pour ces quatre revues, celles qui ont la limite de 3 tours. Il ne change rien à la
première lecture de tout le code d'une review générale, à la revue de sécurité (tout ce qu'elle trouve reste corrigé)
ni aux relectures légères, sans tours ni escalade (correction de recette, retouche des captures, amélioration UI,
relecture de chaque tâche d'un grand plan).

Le relecteur reste un sous-agent neuf du rôle `review`, qui n'a pas écrit le code. Mets dans sa consigne qu'il lit ce
fichier et suit « Ce que rend le relecteur » ; mets dans celle du sous-agent du rôle `code` qui corrige qu'il suit
« Avant de corriger » et « Les simples remarques ». Ce guide prime sur les skills `requesting-code-review` et
`receiving-code-review` là où ils disent autre chose : leurs niveaux (Critical, Important, Minor) ne décident pas de
ce qui bloque.

## Ce que rend le relecteur

Deux listes : les **problèmes bloquants** et les **simples remarques**.

Un problème n'est bloquant que s'il est **prouvé** par une commande que le relecteur a lancée lui-même : un test qui
échoue, un petit script qui reproduit le défaut, ou une commande qui montre le mauvais comportement. Pour chaque
problème bloquant, il donne trois choses : la commande exacte, ce qu'elle a affiché, et ce qu'elle aurait dû afficher.
Une preuve fait tourner le code, les tests ou un contrôle du projet. Afficher un morceau de code (`cat`, `grep`,
`git diff`) est une lecture, pas une preuve.

Trois cas restent bloquants sans commande, parce qu'ils se constatent à la lecture :

- un problème de **sécurité ou de perte de données** qu'on ne peut pas démontrer sans toucher à du réel : le relecteur
  explique précisément le scénario (qui fait quoi, dans quel ordre, ce qui fuit ou se perd) ;
- un **écart avec la spec** qui se voit à la lecture, par exemple un critère d'acceptation qui n'est pas fait : il
  cite le critère ;
- un **écart avec une règle écrite** du projet ou de la factory : il cite la règle et l'endroit qui ne la respecte
  pas. Exemples : un test désactivé ou supprimé pour obtenir du vert, un service ou un compte ajouté sans l'accord du
  propriétaire, une couleur ou une police qui n'est pas dans `DESIGN.md`.

Tout le reste est une **simple remarque** : un problème sans ses trois éléments, un avis sur la qualité du code
(« ce serait plus propre autrement »). Une simple remarque ne bloque jamais, ne compte pas dans les tours et n'est
jamais remontée au propriétaire.

## Avant de corriger

L'agent qui corrige (skill `receiving-code-review`) ne croit pas le relecteur sur parole :

- **problème prouvé** : il relance lui-même la commande. Le problème est **confirmé** s'il se reproduit et si le
  résultat attendu par le relecteur est bien ce que demande la spec. Sinon il ne corrige rien : le problème devient
  une simple remarque ;
- **cas sans commande** : il vérifie à la lecture que le scénario tient, que le critère de la spec manque vraiment, ou
  que la règle citée n'est vraiment pas respectée. Sinon, simple remarque.

Il corrige les problèmes bloquants confirmés, puis relance les tests. Quand la preuve est un test qui échoue, ce test
reste dans le projet, dans le même commit que la correction : le défaut ne pourra pas revenir sans se voir.

## Les simples remarques

L'agent qui corrige les lit toutes. Il corrige tout de suite celles qui sont simples et qu'il a vérifiées lui-même
(un test oublié, un nom trompeur, un doublon), puis relance les tests, sans nouvelle revue. Les autres sont notées
dans la PR, sans suite.

## Les tours

- Un tour ne compte que si au moins un problème bloquant a été confirmé puis corrigé : une revue neuve (un nouveau
  sous-agent du rôle `review`) repart alors. Au plus 3 tours.
- Une revue sans problème bloquant confirmé termine l'étape, même s'il reste des remarques, y compris quand elle ne
  signale que des problèmes qui ne se reproduisent pas : aucun tour n'est compté.
- Si la revue qui suit le tour 3 a encore un problème bloquant confirmé : ne le corrige pas, escalade comme
  le dit l'étape (message simple sur l'issue, `factory:blocked`). Ce message dit en plus, en mots simples, comment le
  problème a été démontré : ce qui a été essayé, ce qu'on a vu, ce qu'on attendait, sans commande ni code.

## Dans la PR

La partie technique (en anglais) a une section `Code review` :

- `Blocking problems` : chaque problème bloquant confirmé, avec sa commande, ce qu'elle a affiché et ce qu'elle
  aurait dû afficher (pour un cas sans commande : le scénario, le critère de la spec, ou la règle citée et l'endroit),
  puis ce qui l'a corrigé ; `none` s'il n'y en avait pas ;
- `Remarks` : chaque simple remarque, avec `fixed` ou `not fixed`, les problèmes non reproduits compris ; `none` s'il
  n'y en avait pas.

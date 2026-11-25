# 604 · Relecture du code : un problème ne bloque que s'il est prouvé

> Demande [#604](https://github.com/phoibe/factory/issues/604) · 2026-11-25

**En une phrase** : à la relecture du code, un problème ne bloque plus que si le relecteur le prouve par une commande qu'il a lancée (ou s'il fait partie de trois cas qui se constatent à la lecture) ; tout le reste devient une simple remarque, qui ne coûte ni tour de correction ni escalade vers vous.

### Ce que j'ai décidé pour vous

- Une preuve, c'est une commande qui fait tourner le code, les tests ou un contrôle du projet. Afficher un morceau de code ne prouve rien : c'est une lecture, donc une simple remarque, hors cas particuliers.
- Quand la preuve est un test qui échoue, ce test est gardé dans le projet avec la correction : le défaut ne pourra pas revenir sans se voir.
- Si l'agent qui corrige relance la commande et que le problème ne se reproduit pas, ou si le résultat attendu par le relecteur n'est pas ce que demande la spec, il ne corrige rien : le problème devient une simple remarque.
- Un tour ne compte que si au moins un problème bloquant a été confirmé puis corrigé. Une relecture sans problème bloquant confirmé termine l'étape, même s'il reste des remarques.
- Après 3 tours, s'il reste un problème bloquant, l'escalade se passe comme aujourd'hui. Le message vous dit en plus, en mots simples, comment le problème a été démontré.
- La partie technique de chaque PR liste les problèmes prouvés, avec leur commande, et les remarques.
- Aucun contrôle automatique ne vérifie la règle : elle reste une consigne donnée au relecteur et à l'agent qui corrige, comme la règle actuelle.
- pstack n'est pas installé : on reprend seulement l'idée.

### Parcours

Aucun écran ne change. Voici ce qui se passe pendant une relecture du code, étape par étape.

**1. La relecture.** Comme aujourd'hui, un relecteur neuf du rôle « Revue », qui n'a pas écrit le code, relit les changements par rapport à la spec et aux règles du projet. La nouveauté : il range chaque chose qu'il trouve dans l'une de deux listes, les problèmes bloquants et les simples remarques.

**2. Ce qu'il doit donner pour un problème bloquant.** Trois choses : la commande exacte qu'il a lancée, ce qu'elle a affiché, et ce qu'elle aurait dû afficher. La commande peut être un test qui échoue, un petit script qui reproduit le défaut, ou une commande qui montre le mauvais comportement. Sans ces trois choses, ce qu'il signale est une simple remarque, sauf dans les trois cas particuliers décrits plus bas.

**3. La vérification avant de corriger.** L'agent qui corrige ne croit pas le relecteur sur parole : il relance lui-même la commande. Si le problème se reproduit, il est confirmé. Sinon, rien n'est corrigé et le problème devient une simple remarque. Pour les trois cas particuliers, il vérifie à la lecture que le scénario tient, que le critère de la spec manque vraiment, ou que la règle citée n'est vraiment pas respectée.

**4. La correction.** Les problèmes bloquants confirmés sont corrigés, puis les tests sont relancés. Un relecteur neuf repart alors : c'est un tour.

**5. Les simples remarques.** L'agent qui corrige les lit toutes. Il corrige tout de suite celles qui sont simples et qu'il a vérifiées lui-même (un test oublié, un nom trompeur, un doublon), puis relance les tests, sans nouvelle relecture. Les autres sont notées dans la partie technique de la PR, sans suite. Rien ne vous est remonté.

**6. La fin.** Dès qu'une relecture ne trouve plus aucun problème bloquant confirmé, l'étape est terminée. Si un problème bloquant reste après 3 tours, la demande vous est remontée comme aujourd'hui, avec en plus l'explication de la façon dont le problème a été démontré.

### Règles et cas limites

- **Les relectures concernées** sont les quatre qui ont la limite de 3 tours : avant la PR d'une feature (et du socle d'un nouveau projet), avant la PR d'une correction de bug, pendant le rattrapage des étapes sautées, et la relecture des corrections d'une review générale.
- **Trois cas particuliers restent bloquants sans commande**, parce qu'ils se constatent à la lecture :
  - un problème de sécurité ou de perte de données qu'on ne peut pas démontrer sans toucher à du réel, si le relecteur explique précisément le scénario ;
  - un écart avec la spec qui se voit à la lecture, par exemple un critère d'acceptation qui n'est pas fait ;
  - un écart avec une règle écrite du projet ou de la factory, si le relecteur cite la règle et l'endroit qui ne la respecte pas. Exemples : un test désactivé ou supprimé pour obtenir du vert, un service ou un compte ajouté sans votre accord, une couleur ou une police qui n'est pas dans le document de design.
- Un simple avis du relecteur sur la qualité du code (« ce serait plus propre autrement ») reste une simple remarque.
- Une simple remarque ne bloque jamais, ne compte pas dans les 3 tours et ne vous est jamais remontée.
- Limite connue et acceptée : les petites corrections faites pour une remarque ne sont pas relues par un relecteur, seulement couvertes par les tests.
- Si une relecture ne signale que des problèmes qui ne se reproduisent pas, aucun tour n'est compté et l'étape se termine.
- La règle est la même pour tous vos projets. Elle sert sur chacun dès la relecture qui suit sa mise à jour habituelle par la factory ; d'ici là, ses relectures se font comme aujourd'hui.
- Le reste ne change pas : un relecteur neuf du rôle « Revue », 3 tours au plus, puis escalade.

### Hors périmètre

- La première lecture de tout le code pendant une review générale : elle cherche aussi des améliorations qu'aucune commande ne peut démontrer, et la demande #605 la retravaille déjà.
- La revue de sécurité des demandes sensibles : tout ce qu'elle trouve reste corrigé, comme aujourd'hui.
- Les relectures légères, qui n'ont ni tours ni escalade : après une correction de recette, après une retouche des captures, à la fin d'une amélioration UI, et celle de chaque tâche d'une grande demande.
- Un contrôle automatique qui vérifierait que la règle est suivie.
- Installer pstack, ou modifier les skills installés.
- Changer le nombre de tours ou le moteur du relecteur.

### Comment vérifier

Rien ne change à l'écran : il n'y a rien à regarder sur la preview de cette demande. L'effet se constate sur les demandes suivantes, une fois le projet mis à jour.

1. Dans la PR d'une demande construite après la livraison, la partie technique (tout en bas, en anglais comme aujourd'hui) contient le résultat de la relecture : chaque problème bloquant avec sa commande, ce qu'elle a affiché et ce qu'elle aurait dû afficher, puis les simples remarques, ou la mention qu'il n'y en avait pas.
2. Un problème bloquant sans commande y est toujours l'un des trois cas particuliers, avec le scénario expliqué, le critère de la spec, ou la règle citée.
3. Si une demande vous est remontée après 3 tours de relecture, le message vous dit, en mots simples, comment le problème a été démontré.
4. Vous ne recevez plus d'escalade pour un problème de relecture qui n'est ni prouvé, ni l'un des trois cas particuliers.
5. Le tableau de bord, les réglages et les étapes d'une demande sont inchangés.

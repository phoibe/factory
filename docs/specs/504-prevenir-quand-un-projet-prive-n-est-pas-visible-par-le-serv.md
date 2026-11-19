# 504 · Prévenir quand un projet privé n'est pas visible par le serveur de dev

> Demande [#504](https://github.com/phoibe/factory/issues/504) · 2026-11-19

**En une phrase** : le panneau vous prévient clairement quand un projet privé, réglé pour tourner sur le serveur de dev, n'est pas vu par lui (et consomme donc vos minutes GitHub), et l'outil Mac vous le rappelle dès la création du projet.

### Ce que j'ai décidé pour vous
- Le lien mène à la liste de vos clés d'accès sur GitHub : vous cliquez sur « factory runners » puis cochez le projet (GitHub ne permet pas de pointer directement sur une clé précise) ; le message le dit en une phrase.
- Pas d'alerte sur le téléphone pour ce cas : seul le panneau peut voir le projet oublié.
- Les projets publics, et ceux réglés « machines GitHub », ne déclenchent jamais cette alerte.
- L'alerte disparaît d'elle-même au contrôle qui suit le moment où vous cochez le projet (15 minutes au plus).

### Parcours

**Dans le panneau**
1. Un projet privé, réglé sur le serveur de dev, n'apparaît pas dans le dernier contrôle du serveur alors que ce contrôle a eu lieu après sa création.
2. Un **bandeau orange** s'affiche en haut du panneau, quel que soit le projet ouvert : « pulsarmagnetar n'est pas vu par le serveur de dev : ses tâches consomment vos minutes GitHub. » avec un bouton « Ajouter à la clé factory runners » qui ouvre la page des clés sur GitHub, et la phrase d'aide « Cliquez sur factory runners, cochez le projet, puis enregistrez ».
3. Plusieurs projets oubliés : un seul bandeau qui les nomme tous.
4. L'**onglet du projet** concerné porte un petit signal orange.
5. Dans les **réglages du projet**, la ligne « Serveur de dev » ne dit plus « réglage pris en compte au prochain contrôle » indéfiniment : elle affiche le même avertissement, avec le même bouton.

**À la création d'un projet (outil Mac)**
6. « Nouveau projet » et « Adopter un projet » affichent à la fin, quand le projet est privé, un rappel : « Pensez à cocher ce projet dans la clé factory runners, sinon il tournera sur les machines GitHub payantes », avec le lien.

### Règles et cas limites
- Le panneau n'alerte qu'une fois qu'un contrôle du serveur a eu lieu **après** la création du projet : un projet tout neuf ne déclenche pas d'alerte dans ses 15 premières minutes.
- Si le serveur de dev lui-même ne répond plus (aucun contrôle récent), c'est l'alerte habituelle « serveur hors ligne » qui s'affiche, pas celle-ci.
- Rien n'est bloqué ni mis en pause : le projet continue de tourner sur les machines GitHub tant qu'il n'est pas coché.

### Hors périmètre
- Ajouter le projet à la clé automatiquement.
- Une notification sur téléphone ou par e-mail.
- Mettre le projet en pause tant qu'il n'est pas coché.

### Comment vérifier (sur la preview)
- Avec un projet privé réglé sur le serveur de dev mais absent du dernier contrôle : le bandeau orange apparaît en haut, nomme le projet, et son bouton ouvre la page des clés GitHub.
- L'onglet de ce projet porte le signal orange, et ses réglages montrent l'avertissement à la place de « pris en compte au prochain contrôle ».
- Un projet public, ou réglé « machines GitHub », ne fait apparaître aucun bandeau.
- Un projet coché dans la clé (présent dans le contrôle) ne fait apparaître aucun bandeau.

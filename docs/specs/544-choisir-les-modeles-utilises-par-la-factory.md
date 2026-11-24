# 544 · Choisir les modèles utilisés par la factory

> Demande [#544](https://github.com/phoibe/factory/issues/544) · 2026-11-24
>
> Modifiée par la demande n° [#550](https://github.com/phoibe/factory/issues/550)

**En une phrase** : une nouvelle page « Réglages généraux », ouverte depuis la barre du haut du tableau, permet de choisir une fois pour toute la factory le modèle de chacun des 4 rôles (plans, code, revue, tâches simples) et la machine des tâches par défaut.

### Ce que j'ai décidé pour vous
- Pour chaque rôle, une liste déroulante des familles avec leur version du moment, par exemple « Fable (5.2 aujourd'hui) », « Opus (5.5 aujourd'hui) ».
- L'effort demandé à chaque rôle reste celui d'aujourd'hui : élevé pour les plans et la revue, moyen pour le code, faible pour les tâches simples.
- Si un agent échoue deux fois, sa tâche repart sur le modèle du rôle au-dessus (tâches simples → code → revue).
- Un changement de réglage s'applique dès le lancement suivant, sur tous les projets, sans rien relancer.
- Sur téléphone, le bouton « Réglages généraux » se range avec les autres boutons du haut, et la page s'affiche sur une colonne.
- Le document de design est mis à jour avec cette nouvelle page et la nouvelle barre du haut.

### Parcours

**1. Ouvrir les réglages généraux.** Dans la barre du haut, un bouton « Réglages généraux » apparaît avant « Se déconnecter ». Il ouvre une page qui remplace l'écran du projet, avec un lien « ← Retour au projet » en haut. Même présentation que l'onglet Paramètres : blocs encadrés, barre « Enregistrer » en bas.

**2. Bloc « Modèles ».** Quatre lignes, une par rôle, chacune avec une courte explication et une liste déroulante :
- **Plans et organisation** : écrit les plans et organise le développement. Par défaut : Fable.
- **Écriture du code** : écrit le code, fait les petites relectures de chaque tâche et la critique du design. Par défaut : Opus.
- **Revue** : relecture finale du code avant chaque PR, revue de sécurité, synthèse d'une review générale. Par défaut : Fable.
- **Tâches simples** : recherches, lectures et petites écritures mécaniques, captures. Par défaut : Sonnet.

En dessous, une ligne d'explication : l'agent qui pilote chaque lancement tourne sur le modèle réglé dans la routine de chaque projet sur claude.ai, et la factory ne peut pas le changer ; elle explique comment le changer à la main si vous le voulez. Ce pilote confie désormais toujours le plan et l'écriture du code aux agents des rôles ci-dessus, même pour une petite retouche.

**3. Bloc « Machine des tâches ».** Le réglage « Tous les projets » qui était dans l'onglet Paramètres → Avancé, à l'identique.

**4. Enregistrer.** La barre « Enregistrer » enregistre le tout. Le lancement suivant de n'importe quel projet utilise les nouveaux modèles.

**5. Onglet Paramètres d'un projet.** La partie « Tous les projets » disparaît de « Avancé ». Il ne reste que le choix propre au projet (« Comme le réglage de tous les projets (serveur de dev) », « Serveur de dev », « Machines GitHub »), suivi d'un petit lien « Changer le réglage de tous les projets » qui ouvre la page Réglages généraux.

### Règles et cas limites
- Un seul réglage pour toute la factory : pas de choix des modèles projet par projet.
- On choisit une famille, pas une version : c'est toujours sa dernière version qui sert (Opus 6 le jour où il sort, sans rien faire).
- Quand une famille nouvelle apparaît, la mise à jour mensuelle de la factory la repère et l'ajoute à la liste.
- Tant que vous n'avez rien enregistré, ce sont les valeurs par défaut qui servent (Fable / Opus / Fable / Sonnet).
- Si une famille choisie disparaît un jour de la liste, la factory reprend la valeur par défaut du rôle.

### Hors périmètre
- Changer le modèle de la routine depuis le tableau (impossible pour la factory : seulement l'explication).
- Régler l'effort de chaque rôle.
- Des réglages différents d'un projet à l'autre.

### Comment vérifier (sur la preview)
1. La barre du haut montre « Réglages généraux » avant « Se déconnecter » ; un clic ouvre la page, « ← Retour au projet » ramène au projet.
2. La page montre le bloc « Modèles » avec Fable, Opus, Fable, Sonnet par défaut, chaque famille avec sa version du moment, et le bloc « Machine des tâches ».
3. Changez un modèle, enregistrez, rechargez : le choix est conservé.
4. Dans l'onglet Paramètres → Avancé d'un projet, la partie « Tous les projets » a disparu et le lien « Changer le réglage de tous les projets » ouvre la page.
5. Sur téléphone, le bouton est dans la barre du haut et la page tient sur une colonne.

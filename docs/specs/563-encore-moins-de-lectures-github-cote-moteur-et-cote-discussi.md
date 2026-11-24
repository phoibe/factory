# 563 · Encore moins de lectures GitHub, côté moteur et côté discussion

> Demande [#563](https://github.com/phoibe/factory/issues/563) · 2026-11-24

**En une phrase** : l'onglet « Agent », en mode instantané, ne consomme plus de lectures GitHub quand rien n'a changé dans la conversation ; le moteur de la factory, lui, n'est pas modifié, car les chiffres montrent qu'il n'en a pas besoin aujourd'hui.

### Ce que j'ai vérifié avant

La demande disait de ne le faire que si des pauses « limite GitHub » se voient encore. J'ai donc regardé le journal technique de la factory sur ce projet, depuis la dernière amélioration (demande #491, le 18 novembre) :

- Sur 492 déclenchements de la factory, **aucune pause due à la limite GitHub**. Une seule pause, aujourd'hui vers 14 h 30 (6 minutes) : c'était une panne passagère de GitHub, pas la limite.
- Un passage courant coûte 8 à 25 lectures comptées, pour une réserve de 5 000 par heure. Aux heures les plus chargées, il restait presque toujours plus de 4 400 lectures sur 5 000.
- Au pire moment (aujourd'hui, pendant cette panne, une trentaine de passages attendaient leur tour en même temps), il en restait encore 2 530 : la moitié.

### Ce qui change

- **Côté discussion** : aujourd'hui, tant que le tableau de bord est ouvert sur un projet en mode instantané, il relit la liste des conversations et la conversation ouverte toutes les 30 secondes, même quand personne n'écrit. Cela fait jusqu'à 240 lectures par heure, prises sur votre réserve personnelle. Désormais, il demande d'abord à GitHub « est-ce que ça a changé ? » : une réponse « rien de neuf » ne compte pas dans la limite (la même astuce que pour le reste du tableau de bord, demande #399). Le rythme reste le même : un message écrit depuis un autre appareil apparaît toujours en 30 secondes environ.
- **Côté moteur** : rien pour l'instant. Garder en mémoire l'état d'un projet d'un passage à l'autre demanderait un endroit où le ranger, et ferait courir le risque de décider sur une information périmée, pour un gain que personne ne verrait aujourd'hui. Le compteur de lectures reste en place dans le journal technique : si la réserve se met à fondre, on le verra, et il sera temps de rouvrir le sujet.

### Comment vérifier

- Rien ne change à l'écran : dans l'onglet « Agent », vos conversations s'affichent comme avant, et un message envoyé depuis un autre appareil apparaît tout seul en moins d'une minute.
- La PR indiquera le nombre de lectures comptées avant et après, onglet « Agent » ouvert sans rien faire.

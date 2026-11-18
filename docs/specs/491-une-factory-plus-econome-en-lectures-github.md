# 491 · Une factory plus économe en lectures GitHub

> Demande [#491](https://github.com/phoibe/factory/issues/491) · 2026-11-18

**En une phrase** : la factory compte ce qu'elle lit sur GitHub à chaque passage, puis supprime les relectures inutiles, pour ne jamais être ralentie par la limite horaire de GitHub, même sur un projet très actif.

### Ce qui change
- **Mesurer d'abord** : à chaque passage (une nouveauté dans un projet, ou la vérification de fond toutes les 5 minutes), la factory note dans son journal technique combien de lectures GitHub elle a faites, lesquelles, et ce qu'il reste de sa réserve horaire. On sait ainsi, chiffres à l'appui, ce qui coûte le plus.
- **Puis alléger** les postes les plus lourds, par exemple :
  - ne plus relire plusieurs fois, dans un même passage, la même demande, la même PR ou la même liste de PR ouvertes ;
  - pendant la vérification de fond, ne relire en détail que ce qui a bougé depuis la dernière fois, au lieu de tout reparcourir ;
  - demander à GitHub « est-ce que ça a changé ? » quand c'est possible : une réponse « rien de neuf » ne compte pas dans la limite (la même astuce que pour le panneau, demande #399).
- **Comparer avant/après** sur des passages types (nouveau message, vérification de fond sans rien à faire, vérification avec une PR en attente) : un test vérifie que le nombre de lectures a baissé et ne remonte pas plus tard.

### Règles
- La factory réagit exactement comme avant : mêmes étapes, mêmes messages, mêmes délais. Seul le nombre de lectures baisse.
- Une information dont dépend une décision (fusionner, lancer un agent, fermer) est toujours relue fraîche : on n'économise jamais sur ce qui pourrait faire prendre une mauvaise décision.
- Le panneau n'est pas concerné (déjà allégé par #399).

### Hors périmètre
- Changer le rythme de la vérification de fond (toutes les 5 minutes).
- Afficher ces chiffres dans le panneau.

### Comment vérifier
- Rien à faire de votre côté : les cartes avancent comme d'habitude, et la PR indiquera le nombre de lectures avant et après pour chaque passage type.

# 435 · Cartes « Terminé » de même taille

> Demande [#435](https://github.com/phoibe/factory/issues/435) · 2026-11-16

**En une phrase** : toutes les cartes de la colonne « Terminé » ont la même hauteur, sur ordinateur comme sur téléphone.

### Ce que j'ai décidé pour vous
- Un titre trop long est coupé après deux lignes avec « … » ; le titre complet s'affiche au survol de la souris (et reste lisible en ouvrant la demande).

### Ce qui change
- Toutes les cartes « Terminé » prennent la hauteur d'une carte « Mise en production » repliée, partout (ordinateur et téléphone).
- Le contenu des cartes plus courtes reste calé en haut, avec un peu d'espace vide en bas.
- Quand on déplie « N modifications », seule cette carte grandit le temps de la lecture ; elle reprend sa taille normale quand on la replie. Les autres cartes ne bougent pas.

### Comment vérifier
1. Ouvrez le tableau : dans « Terminé », toutes les cartes ont la même hauteur, d'une rangée à l'autre.
2. Une carte au titre très long montre deux lignes terminées par « … » ; en passant la souris dessus, le titre complet apparaît.
3. Dépliez « N modifications » sur une carte « Mise en production » : seule cette carte grandit ; repliez-la, elle reprend sa taille.
4. Sur téléphone, les cartes « Terminé » empilées ont toutes la même hauteur.

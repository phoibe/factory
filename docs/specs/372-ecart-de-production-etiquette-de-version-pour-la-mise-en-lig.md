# 372 · Écart de production : étiquette de version pour la mise en ligne externe et les hébergeurs muets

> Demande [#372](https://github.com/phoibe/factory/issues/372) · 2026-11-13

**En une phrase** : les projets en mise en ligne externe (ex. Pulsar Wheel) et ceux dont l'hébergeur ne prévient pas de la fin de ses publications (ex. yoldmewhen2) affichent eux aussi leur écart de production, grâce à une étiquette de version publiée par le site lui-même.

### Parcours
- Pour chaque projet concerné, l'agent ouvre une petite demande qui ajoute au site une **étiquette de version**, invisible pour les visiteurs, qui dit quelle modification le site contient. Le propriétaire n'a rien à régler : ni serveur, ni clé d'accès.
- Le tableau lit cette étiquette et affiche, sous le nom du projet, le même texte que pour les autres projets (livré par #369) : « En ligne : à jour » ou « En ligne : N modifications d'écart », avec la liste au toucher.

### Règles
- Pour ces projets, seule l'étiquette fait foi : une simple vérification que « le site répond » ne dit jamais qu'une version est en ligne (après une publication ratée, l'ancienne version répond aussi).
- Tant que l'étiquette n'existe pas ou ne se lit pas : « En ligne : version inconnue » en gris, avec au toucher une phrase qui explique pourquoi.
- Aucun bouton « C'est en ligne » : tout est automatique.
- Si l'étiquette montre une version plus ancienne que la dernière validée, les modifications manquantes forment l'écart (publication ratée, remise en arrière…).

### Hors périmètre
- Les projets dont l'hébergeur prévient déjà GitHub (traités par #369).
- Les projets sans site : rien n'est affiché.

### Critères d'acceptation
- Sur Pulsar Wheel, après une mise en ligne, le texte sous le nom passe à « En ligne : à jour ».
- Après une validation pas encore mise en ligne, il affiche « En ligne : 1 modification d'écart » et la liste montre la modification.
- Un projet concerné sans étiquette affiche « En ligne : version inconnue » en gris, avec son explication.

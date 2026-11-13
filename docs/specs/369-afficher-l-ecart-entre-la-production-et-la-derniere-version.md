# 369 · Afficher l'écart entre la production et la dernière version, sur tous les projets

> Demande [#369](https://github.com/phoibe/factory/issues/369) · 2026-11-13

**En une phrase** : chaque projet affiche, sous son nom, si son site en ligne est à jour ou combien de modifications validées n'y sont pas encore, avec leur liste.

Cette demande couvre les projets dont l'hébergeur prévient de la fin de ses publications (Vercel, GitHub Pages…), donc les modes **automatique** et **sur accord** dans la plupart des cas.
Ensuite : #372 (étiquette de version pour la mise en ligne externe, comme Pulsar Wheel, et pour les hébergeurs muets, comme yoldmewhen2).

### Parcours
1. J'ouvre un projet dans le tableau. Sous son nom, sur la ligne « Privé · 2 en parallèle », un petit texte :
   - « En ligne : à jour » quand la dernière modification validée est en ligne ;
   - « En ligne : 3 modifications d'écart » sinon ;
   - « En ligne : publication en cours… » pendant que l'hébergeur publie ;
   - en orange, « En ligne : 2 modifications d'écart · la dernière publication a échoué » si l'hébergeur signale un échec ;
   - en gris, « En ligne : version inconnue » quand on ne peut pas le savoir.
2. Je touche ce texte : la liste des modifications pas encore en ligne s'ouvre, de la plus ancienne à la plus récente, chacune avec son titre (celui de la carte), sa date de validation et un lien vers la demande. Pour « version inconnue », une phrase explique pourquoi.

### Règles
- Une version est en ligne **seulement** quand l'hébergeur dit que sa publication est terminée sans échec. Rien ne se déclare à la main.
- Un échec chez l'hébergeur laisse l'ancienne version en ligne : l'écart reste affiché, en orange.
- Mode **sur accord** : le bouton « Mise en production (2) » ne change pas (il compte ce qui attend votre clic) ; le texte sous le nom montre ce qui est réellement en ligne. S'ils diffèrent, une publication a raté.
- Quand la factory remet en ligne l'ancienne version parce que la nouvelle cassait le site, les modifications retirées réapparaissent dans l'écart jusqu'à ce que leur correction soit en ligne.
- Projet sans site (outil, bibliothèque) : rien n'est affiché.
- Projet en mise en ligne externe ou à hébergeur muet : « En ligne : version inconnue » en attendant #372, qui lui donnera la vraie réponse. Une simple vérification que « le site répond » ne vaut jamais publication réussie.
- Rien de nouveau dans la liste des projets : le point de couleur garde son sens.

### Hors périmètre
- L'étiquette de version sur les sites (c'est #372).
- Toute alerte ou notification : l'écart se voit en ouvrant le projet.

### Critères d'acceptation (sur la preview)
- Un projet à jour affiche « En ligne : à jour ».
- Juste après une validation sur un projet automatique, on voit « publication en cours… », puis « à jour » une fois l'hébergeur fini.
- Sur un projet « sur accord » avec 2 modifications en attente, le texte dit « 2 modifications d'écart » et la liste montre leurs titres, dates et liens.
- Une publication en échec s'affiche en orange avec l'écart.
- Pulsar Wheel affiche « version inconnue » en gris, avec son explication au toucher.
- Un projet sans site n'affiche rien.

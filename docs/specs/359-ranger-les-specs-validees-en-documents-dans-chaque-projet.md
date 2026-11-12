# 359 · Ranger les specs validées en documents dans chaque projet

> Demande [#359](https://github.com/phoibe/factory/issues/359) · 2026-11-12

**En une phrase** : chaque spec validée d'une feature ou d'un bug devient un document rangé dans son projet, à côté du glossaire et des décisions, avec un sommaire qui les liste toutes.

**L'arborescence.** Vous aviez raison de le rappeler : la méthode « avec documents » range le glossaire à la racine du projet et les décisions dans un dossier de documents, un fichier numéroté par décision. Elle ne prévoit pas de place pour les specs (sa variante sans GitHub les met dans un dossier de brouillons, qui n'est pas fait pour être gardé). Je range donc les specs **sur le même modèle que les décisions** : un dossier « specs » juste à côté du dossier des décisions (et de celui des plans), un fichier par demande, nommé de la même façon (numéro puis titre).

### Ce qui se passe, demande après demande
1. **Les questions et la spec** se déroulent comme aujourd'hui, dans le fil de la demande.
2. **Pendant la construction**, l'agent enregistre la spec validée dans le dossier « specs » du projet, dans la demande de la feature elle-même. Le document commence par un lien vers la demande et la date.
3. **Si vous demandez un changement** pendant la construction ou la recette, le document est complété pour décrire ce qui est réellement livré.
4. **À la fusion**, la spec arrive dans le projet en même temps que la feature. Une demande abandonnée ne laisse aucune spec.
5. **Le sommaire** du dossier ajoute une ligne : numéro, titre, une phrase, date.

### Règles décidées
- Seulement la dernière version validée, pas l'historique des versions précédentes.
- Quand une feature plus récente change une ancienne, l'ancienne spec n'est pas réécrite : elle reçoit en tête une ligne « Modifiée par la demande n° … » avec le lien vers la plus récente.
- Concerne les features et les bugs (une tranche d'une feature découpée a sa propre spec). Pas le cadrage d'un projet (sa fiche produit joue ce rôle), ni les revues générales.
- Vaut pour tous les projets de la factory, y compris la factory elle-même.

### Hors périmètre
- Retrouver et ranger les specs des demandes déjà livrées : on commence avec les prochaines.
- Aucun changement du tableau de bord (pas de lien « voir la spec » pour l'instant).

### Ce que vous pourrez vérifier
- Dans la prochaine feature livrée après celle-ci, le projet contient un dossier « specs » avec un fichier « numéro - titre » qui reprend la spec validée, avec le lien vers la demande et la date en tête.
- Le sommaire du dossier liste cette spec avec une phrase et sa date.
- Si une feature modifie une feature déjà rangée, l'ancienne spec porte en tête la ligne « Modifiée par la demande n° … ».
- Une demande abandonnée ne laisse aucune spec dans le projet.

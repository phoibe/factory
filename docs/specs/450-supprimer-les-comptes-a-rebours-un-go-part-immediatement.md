# 450 · Supprimer les comptes à rebours : un « go » part immédiatement

> Demande [#450](https://github.com/phoibe/factory/issues/450) · 2026-11-17

**En une phrase** : un toucher sur « go », « Ok » ou « Jeter » agit tout de suite, sans compte à rebours de 5 secondes.

### Ce que j'ai décidé pour vous
- Après « go » ou « Ok », le bouton affiche aussitôt « Envoi… », puis le message habituel (« « go » envoyé. La construction démarre. »).
- Plus de bouton « Annuler » ni de message « … part dans 5s ».
- « Jeter » écarte l'idée tout de suite, comme « Garder ».

### Ce qui change
- Les boutons « go » et « Ok » (spec, captures, recette) envoient la réponse dès le toucher.
- Le bouton « Jeter » des idées à trier n'attend plus non plus.
- La fiche de design est mise à jour pour ne plus parler du délai d'annulation.

### Comment vérifier
1. Sur une carte de « À vous de jouer », touchez « go » ou « Ok » : la réponse part tout de suite, sans « Annuler (5s) ».
2. Dans « Idées à trier », touchez « Jeter » : l'idée disparaît aussitôt de la liste.

Décision notée : plus aucun compte à rebours sur ces boutons, pour ne pas le reproposer.

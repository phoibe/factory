# 430 · Replier la liste des modifications sur les cartes « Mise en production » terminées

> Demande [#430](https://github.com/phoibe/factory/issues/430) · 2026-11-16

**En une phrase** : sur une carte « Mise en production » terminée, la liste des modifications est repliée derrière un lien « 9 modifications » qui la déplie au clic, pour que les cartes de la colonne « Terminé » gardent une hauteur proche.

### Ce que j'ai décidé pour vous
- La carte repliée montre, dans l'ordre : le titre, l'état (« En ligne ✅ » et l'heure), le lien « N modifications », la version, puis « Voir le site en ligne » s'il existe.
- Le lien dit « 1 modification » ou « N modifications », avec une petite flèche qui pivote quand la liste est ouverte ; un second clic la replie.
- La liste est toujours repliée au chargement du tableau (même avec une seule modification) ; une carte que vous avez ouverte reste ouverte tant que la page ne se recharge pas.
- Seules les cartes terminées changent : une mise en production **en cours** garde sa liste visible, pour voir ce qui part en ligne.
- Une mise en production ratée ou annulée (carte rouge) ne change pas : elle n'affichait déjà pas de liste.

### Ce qui change
- Colonne « Terminé » : une carte « Mise en production » ne s'allonge plus avec le nombre de modifications ; ses voisines de rangée ne s'étirent plus avec un grand vide.
- Ça marche aussi au clavier (Tab puis Entrée) et sur téléphone.

### Comment vérifier
1. Ouvrez le tableau du projet qui a eu la mise en production 0.19.0 (9 modifications).
2. Dans « Terminé », la carte « Mise en production » est à peu près aussi haute que ses voisines et affiche « 9 modifications ».
3. Cliquez sur « 9 modifications » : les 9 lignes apparaissent. Cliquez à nouveau : elles disparaissent.

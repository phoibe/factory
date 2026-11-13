# 370 · Suivre une mise en production depuis le tableau de bord

> Demande [#370](https://github.com/phoibe/factory/issues/370) · 2026-11-13

**En une phrase** : chaque mise en production lancée depuis le tableau de bord devient une carte dans l'onglet « Suivi », qui montre en direct où elle en est, puis son résultat (ce qui est en ligne, ou pourquoi ça n'a pas marché).

### Parcours

1. **Lancer** : vous cliquez sur « Mise en production », puis « Confirmer ». Le petit message temporaire dit désormais « Mise en production lancée : suivez-la dans l'onglet Suivi ».
2. **Pendant** : une carte « Mise en production » apparaît dans « Suivi », avec les cartes en cours. Elle affiche son étape : « Mise en ligne en cours », puis « Vérification du site en ligne ». Pendant ce temps, le bouton « Mise en production » est grisé avec « Mise en production en cours ».
3. **Réussie** : une fois le site en ligne vérifié, la carte passe dans « Terminé » avec « En ligne ✅ », la liste des modifications mises en ligne (leurs titres), le numéro de version s'il y en a un, l'heure, et un lien « Voir le site en ligne ».
4. **Échouée sans rien changer** (GitHub ne répond pas, conflit entre modifications, numéro de version refusé…) : la carte passe en rouge « Pas mise en production », avec la raison en une phrase simple et ce qu'il faut faire (« Recliquez sur « Mise en production » dans quelques minutes », « La factory doit d'abord régler un conflit »…). Le bouton « Mise en production » retrouve aussitôt son compteur.
5. **Annulée** (le site ne marchait plus après la mise en ligne) : la carte passe en rouge « Annulée : le site en ligne ne marchait plus, la version d'avant est revenue », avec un lien vers la carte de la correction urgente. Le bouton retrouve son compteur.

### Règles et cas limites

- « Réussie » seulement après la vérification du site en ligne, jamais avant.
- Une seule mise en production à la fois : le bouton reste grisé jusqu'à la fin de la vérification.
- Tout se lit sur la carte (liste, raison, étape) ; le titre garde, comme les autres cartes, un lien vers le détail sur GitHub.
- Si la version d'avant n'a pas pu être remise (d'autres livraisons sont passées depuis) : carte rouge « Le site en ligne ne marchait plus : une correction urgente est en cours », avec le lien vers cette correction.
- Si rien n'attendait d'être mis en production : la carte passe directement dans « Terminé » avec « Rien à mettre en ligne : le site est déjà à jour ».
- Historique : les mises en production passées restent dans « Terminé », mêlées aux autres demandes finies, par date, avec la même limite d'affichage.
- Les messages déjà écrits par la factory sur GitHub restent les mêmes (la carte les affiche) ; le message « En production ✅ » n'est plus écrit qu'après la vérification du site.

### Hors périmètre

- Pas d'onglet « Historique » séparé, pas de bandeau en haut du tableau.
- Pas de notification (e-mail, téléphone) à la fin d'une mise en production.
- Rien ne change pour les projets dont la mise en production est faite ailleurs que par la factory.

### Critères d'acceptation (sur la preview)

1. Après « Confirmer », le message temporaire renvoie vers l'onglet « Suivi », où une carte « Mise en production » est visible avec son étape.
2. Pendant qu'elle tourne, le bouton « Mise en production » est grisé avec « Mise en production en cours ».
3. Une mise en production réussie finit dans « Terminé » avec « En ligne ✅ », la liste des modifications, l'heure et le lien « Voir le site en ligne ».
4. Une mise en production échouée montre une carte rouge avec la raison et quoi faire, et le bouton retrouve son compteur.
5. Une mise en production annulée montre une carte rouge avec le lien vers la correction urgente.
6. Les anciennes mises en production apparaissent dans « Terminé » parmi les autres demandes, par date.
7. Sur téléphone, la carte et ses détails restent lisibles.

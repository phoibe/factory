# Critique : demandes fermées par l'agent dans « Terminé » (issue #203)
Method: dual-agent (A: revue design · B: détecteur + mesures navigateur)
Écran concerné : Suivi, section « Terminé » (ordinateur et téléphone, clair et sombre), avec livraisons et demandes fermées par l'agent (déjà réglée, en double, obsolète), dont un titre de 119 caractères.
Première critique : 16/24 (6 heuristiques notées, 4 sans objet sur une liste en lecture seule). Dernière critique : non refaite (aucun problème P0, les P1 ont été corrigés directement ; les captures servent de contrôle final).

## Constats et suites
- [P1] Accord : « Fermée » à côté de « Terminé » sur les cartes → corrigé : les cartes disent « Terminée » (le titre de section reste « Terminé »).
- [P1] Compteur qui mélange livraisons et fermetures → gardé tel quel : il compte les cartes visibles dans la section, comme avant ; le distinguer ajouterait un deuxième chiffre.
- [P2] Mention grise sans hiérarchie → corrigé : la raison (« Déjà réglée », « En double », « Obsolète ») est en encre et en gras, « Fermée » et la date restent en gris.
- [P2] Phrase vide sans point final → corrigé : « Rien de livré pour l'instant. »
- [P3] Numéro de demande absent des cartes terminées → hors périmètre (déjà le cas avant).
- Détecteur : aucune alerte sur la section ; alertes existantes ailleurs (police Geist, points animés du chat, bordure de citation) inchangées.
- Mesures : contrastes AA en clair et en sombre (mention grise 6,05:1 / 6,66:1, vert 5,02:1), pas de défilement horizontal à 390 px, titre long affiché en entier. Bordure neutre des cartes fermées volontairement discrète (le texte porte le sens).
- Textes à l'écran : aucun texte explicatif ajouté.

Questions skipped: run autonome de la factory.

# Critique : boutons d'action sur les cartes en attente de GitHub (issue #176)
Écran concerné : Suivi, zone « Prise en compte en cours… » (ordinateur et téléphone, clair et sombre), vérifiée avec trois cartes en attente : une à « Répondre », une à « go », une bloquée.
Méthode : deux évaluations indépendantes (revue design et détecteur + navigateur) à chaque tour.
Première critique : 27/40. Dernière critique : 24/32 (75 %, deux heuristiques sans objet pour cette zone).

## Tour 1, corrigé
- Le message « « go » part dans 5 s » cachait le compte à rebours quand le bouton était en bas de l'écran : le bouton remonte au milieu de l'écran.
- Pendant le compte à rebours, le lecteur d'écran annonçait encore « go » au lieu de « Annuler » : le nom du bouton suit maintenant son état (go, Annuler le go, Envoi du go).
- « Envoi… » était pâle et difficile à lire sur la carte en attente : il est maintenant lisible.

## Tour 1, conservé (décision du propriétaire)
- « go » plein et gris, à la même taille que d'habitude ; boutons juste sous « En attente de GitHub » ; mention « Bloqué » et bord rouge gardés.

## Tour 2, corrigé
- Au survol, la carte bloquée perdait son bord rouge : il reste rouge.
- En sombre, le « go » gris était le bloc le plus clair du tableau : il est plus discret, toujours gris et lisible.

## Détecteur
- Aucune alerte dans la zone d'attente. Les alertes restantes concernent d'autres parties du panneau (police Geist, points animés de la discussion, encart de débogage).
- Contraste AA partout (minimum 5,1:1), boutons d'au moins 44 px, aucun bleu dans la zone, pas de défilement horizontal.

## Points restants (hors périmètre de cette demande)
- « Envoi… » reste affiché jusqu'à ce que GitHub fasse avancer la carte, alors que le message dit déjà « envoyé ». C'est le même comportement dans « À vous de jouer ».
- Quand les 2 minutes d'attente se terminent sans changement, la carte revient dans « À vous de jouer » sans message.
- En clair, le contour en pointillés de la zone d'attente est très pâle (comportement antérieur).

Questions skipped: run autonome de la factory.

## Retouche après les captures (« Les boutons sont trop gros et pas très beaux »)
Critique de la zone retouchée par une revue neuve (code + captures) : 33/40.

Corrigé :
- Boutons pleine largeur et « go » gris plein remplacés par de petits boutons discrets (32 px visibles), côte à côte, tous du même style : fond de carte, filet fin, texte encre. Aucun bleu.
- La zone de toucher reste de 44 px (invisible autour du bouton), vérifiée par le test en haut, en bas, à gauche et à droite de chaque bouton.
- Le « go » garde la même largeur pendant « Annuler (5 s) » et « Envoi… » : rien ne saute.
- Texte des liens et des boutons aligné à la même hauteur.
- Espaces entre boutons assez grands pour que deux zones de toucher ne se chevauchent pas quand la ligne passe à la ligne sur téléphone.
- En sombre, le filet des boutons est un peu plus marqué pour qu'ils ne s'enfoncent pas dans la carte.

Questions skipped: run autonome de la factory.

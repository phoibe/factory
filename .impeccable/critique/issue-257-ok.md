# Critique : bouton « Ok » sur les cartes « Captures à valider » et « Tester » (issue #257)
Écran concerné : Suivi, carte « À vous de jouer » (ordinateur et téléphone, clair et sombre, état du décompte).
Deux évaluations indépendantes (revue design + détecteur/captures ; overlay non injecté : le tableau a besoin de données GitHub simulées).
Première critique : 32/40. Dernière critique (recritique ciblée sur le P1) : 34/40.

Corrigé :
- P1 « Textes à l'écran » : le message « Touchez le bouton pour annuler. » est retiré ; il reste « « ok » part dans 5 s. » (le bouton « Annuler (n s) » dit le reste).
- P1 détecteur : le bouton changeait de largeur pendant le décompte (« Ok » 120 px → « Annuler (4 s) » 162 px) ; il garde maintenant la largeur de « Annuler (5 s) » sur ordinateur.
- Mise en page : sur ordinateur, les boutons d'une ligne étaient éparpillés ; ils sont regroupés à droite.
- DESIGN.md : la règle « un seul bleu » précise désormais « un bouton bleu par ligne de la carte « À vous » ».
- Revue de code : regarder les captures, l'aperçu ou la recette ne fait plus passer la carte en « En attente de GitHub ».

Points restants (non corrigés, choix validés ou hors périmètre) :
- Le bouton bleu n'est pas dans la même colonne d'une ligne à l'autre (ordre « Ok » en premier validé par le propriétaire).
- Espace un peu large dans « Annuler (4 s) » (chiffres à chasse fixe, déjà présent sur « go »).
- Contour pâle des boutons discrets (règle générale du panneau, hors de cette feature).
Questions skipped: run autonome de la factory.

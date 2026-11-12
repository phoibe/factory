# Critique : « Mise en production » en haut sur téléphone (issue #343)
Écrans concernés : haut de la page d'un projet, sur téléphone (projet « sur accord » avec et sans modifications en attente, menu « Plus » ouvert, projet automatique) et sur ordinateur, en clair et en sombre.
Méthode : deux évaluations indépendantes (revue design ; détecteur + navigateur).
Première critique : 27/40. Dernière critique : 27/40 (pas de recritique : le seul point prioritaire est le choix du propriétaire).

- Objectif atteint : le premier « go » reste à la même hauteur avec ou sans modifications en attente, et sur un projet automatique.
- P1 (gardé) : « Nouvelle fonctionnalité » demande deux touchers sur un projet « sur accord ». C'est le choix explicite du propriétaire (la mise en production compte plus pour lui sur téléphone) : rien à changer.
- P2 (hors périmètre) : le bouton grisé quand rien n'attend garde son apparence actuelle ; la spec demande de ne pas la changer.
- P2 (hors périmètre) : les liens du site s'intercalent entre « Nouvelle fonctionnalité » et « Signaler un bug » dans le menu ; la spec exclut tout changement des autres lignes.
- P3 corrigé : la règle du haut de page sur téléphone est notée dans DESIGN.md.
- Mineur corrigé : « Mise en production » a le même poids de texte que « Plus » à côté de lui (il était plus léger).
- Détecteur : 3 alertes, aucune sur le haut de page (police Geist, choisie dans DESIGN.md ; point animé « en train d'écrire » du chat, lié à un vrai état) : faux positifs. L'injection dans le navigateur est bloquée par la politique de sécurité de la page.
- Point restant : sur un très petit téléphone (320 px de large), avec des modifications en attente, « Plus » passe à la ligne ; les projets automatiques font déjà de même à cette largeur.
Questions skipped: run autonome de la factory.

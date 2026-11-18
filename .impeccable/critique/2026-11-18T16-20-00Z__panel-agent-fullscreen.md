# Critique — onglet Agent, bouton plein écran (issue #473)

Method: dual-agent (A: design review · B: detector + browser)
Questions skipped: run autonome de la factory

## Score : 30/40 (première critique, pas de P0 ni de P1) → pas de recritique

| # | Heuristique | Note |
|---|---|---|
| 1 | Visibilité de l'état | 3 |
| 2 | Langage du monde réel | 3 |
| 3 | Contrôle et liberté | 4 |
| 4 | Cohérence | 2 |
| 5 | Prévention des erreurs | 3 |
| 6 | Reconnaître plutôt que se souvenir | 3 |
| 7 | Efficacité | 2 |
| 8 | Esthétique minimaliste | 4 |
| 9 | Récupération d'erreur | 3 |
| 10 | Aide | 3 |

## Détecteur et navigateur (B)
- CLI : 4 alertes, toutes antérieures (image de l'agrandissement sans source, police Geist, deux points animés « Réfléchit… ») ; aucune sur les lignes modifiées.
- Mesures en clair et sombre (1440×900, 1280×620, 701 px) : cadre collé à la barre du haut, au bord gauche et à la liste des projets, zone de saisie visible, aucune barre de défilement. À 700 px le bouton disparaît.
- Anneau de focus du bouton visible (2 px), icône au contraste ≥ 6:1.
- axe-core : 0 violation en largeur normale ; en plein écran, « la page n'a plus de titre principal » → **corrigé** (le nom du projet reste le titre pour les lecteurs d'écran, seulement caché à l'œil).

## Problèmes et suite donnée
- [P2] Bouton « plus haut » que ses voisins → non reproduit : les trois boutons voisins font aussi 44 px de haut (mêmes mesures sur les captures).
- [P2] Icône seule, découvrabilité → conservé tel quel : la spec validée demande une icône à deux flèches avec infobulle, sans texte ; l'espacement avec les boutons voisins (10 px contre 6 px entre eux) la sépare déjà.
- [P2] Échap dans la zone de saisie quitte le plein écran → conservé : la spec demande Échap, et le message en cours reste intact.
- [P3] Anneau de focus rogné en plein écran → vérifié par B : non rogné.
- [P3] Passage sous 700 px en plein écran → les règles sont réservées à l'ordinateur ; vérifié par la relecture (aller-retour 1600 → 500 → 1600).

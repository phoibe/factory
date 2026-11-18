# Critique — onglet Agent (issue #460)

Method: dual-agent (A: design review · B: detector + browser)
Questions skipped: run autonome de la factory

## Score : 31/40 (première critique, pas de P0)

| # | Heuristique | Note |
|---|---|---|
| 1 | Visibilité de l'état | 4 |
| 2 | Langage du monde réel | 3 |
| 3 | Contrôle et liberté | 3 |
| 4 | Cohérence | 3 |
| 5 | Prévention des erreurs | 3 |
| 6 | Reconnaître plutôt que se souvenir | 3 |
| 7 | Efficacité | 3 |
| 8 | Esthétique minimaliste | 3 |
| 9 | Récupération d'erreur | 3 |
| 10 | Aide | 3 |

## Détecteur (B)
- Seule alerte sur une ligne modifiée : taille du « × » de l'image agrandie hors de l'échelle typographique → corrigé (1.125rem).
- `broken-image` : faux positif (l'image agrandie reçoit sa source au clic). `side-tab` (citation), polices Geist, points animés : déjà là avant, hors périmètre.
- axe-core : 0 violation (clair/sombre, ordinateur/téléphone). Contrastes : tous ≥ 4,8:1.

## Problèmes et suite donnée
- [P1] Bloc de commande gris foncé, lourd → corrigé : fond surface 2 + filet d'un pixel.
- [P1] Boutons « Copier » de 32 px → zone de toucher élargie à 44 px (pseudo-élément), taille visible conservée comme les petits boutons des cartes.
- [P2] Intro et exemples d'une conversation vide → déjà là avant cette demande, hors périmètre (non modifiés).
- [P2] Trois encadrés de suite un peu lourds → l'agent est consigné de n'en mettre qu'un ou deux par réponse.
- [P3] Ligne d'actions sur téléphone → existante, hors périmètre.
- Défilement à 1280×620 signalé par B : non reproduit (saisie à 591 px sur 620, test de parcours dédié vert).

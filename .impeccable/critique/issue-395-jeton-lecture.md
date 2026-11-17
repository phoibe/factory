# Critique : carte « Un jeton de lecture pour discuter » (onglet Agent, issue #395)

Deux évaluations indépendantes (sous-agents Sonnet) sur captures ordinateur et téléphone, clair et sombre, plus le détecteur.
Questions skipped: run autonome de la factory.

## Scores
- Évaluation A : 28/40
- Évaluation B : 29/40 (détecteur : rien sur la carte ; alertes existantes hors périmètre : police Geist imposée par DESIGN.md, points animés de la discussion, bordure latérale ligne 230)

## Problèmes relevés et corrections
- [P0/P1] Paragraphe d'aide « Sur GitHub, choisissez « All repositories »… À faire une seule fois. » : retiré ; « (tous les dépôts) » passe dans le libellé du bouton, comme sur la carte de connexion, et le message d'erreur le rappelle si besoin.
- [P1] Carte dans le cadre de la discussion (décalée sur ordinateur, sans surface sur téléphone) : la carte prend le style `card narrow` de la connexion, le cadre de la discussion disparaît.
- [P1/P2] Flèche « ↗ » seule sur sa ligne au téléphone : fin du libellé insécable.
- [P1/P2] Aucun signe pendant la vérification : le bouton affiche « Vérification… », formulaire `aria-busy`.
- [P2] Erreur détachée du champ : déplacée sous le champ, liée par `aria-describedby`, `aria-invalid`, le focus revient au champ.
- [P2] Bouton de validation bleu : exception ajoutée dans DESIGN.md (comme le bouton de connexion).
- [P3] Saisie téléphone : `autocapitalize="off"`, `spellcheck="false"`. Bouton bleu partagé avec la connexion (même règle CSS). Espacements sur l'échelle 8/16/24.

## Gardé volontairement
- La phrase d'explication de la carte : demandée telle quelle par le propriétaire dans la spec.
- Champ masqué et exemple « github_pat_… » : identiques à la carte de connexion (changer les deux sortirait du périmètre).

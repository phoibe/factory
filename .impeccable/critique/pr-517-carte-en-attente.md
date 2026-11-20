# Critique — carte « Prise en compte en cours… » (issue #517)

Method: dual-agent (A: design review · B: detector + browser evidence)

Cible : onglet « Suivi » du panneau, zone « Prise en compte en cours… » (ordinateur 1280×900, téléphone 390×844,
clair et sombre). Mode : Operate. Changements : bouton « Envoyé ✓ » une fois la réponse partie (au lieu de « Envoi… »
jusqu'au changement de colonne) ; ligne du haut « envoyé il y a N min » au lieu du temps passé à l'étape.

## Évaluation A (revue design) — 28/36 (critère 10 « Aide » n/a : l'écran n'a pas à s'expliquer)

| # | Heuristique | Note |
|---|---|---|
| 1 | Visibilité de l'état | 4 |
| 2 | Langage du monde réel | 4 |
| 3 | Contrôle et liberté | 2 (pas d'annulation, voulu par #450) |
| 4 | Cohérence et standards | 3 |
| 5 | Prévention des erreurs | 3 |
| 6 | Reconnaissance plutôt que rappel | 3 |
| 7 | Flexibilité et efficacité | 3 |
| 8 | Design minimaliste | 3 |
| 9 | Récupération d'erreur | 3 |
| 10 | Aide et documentation | n/a |

Spécificité : conforme, jetons existants, aucun texte explicatif ajouté (règle « Textes à l'écran » respectée).

- P2 — La ligne « envoyé il y a … » restait à droite sur téléphone mais passait dessous sur ordinateur (deux
  dispositions). **Corrigé** : elle est toujours sous la ligne du type, sur toutes les largeurs.
- P2 — Hauteur de carte si la ligne manque : **sans objet**, une carte en attente a toujours une heure (réponse vue
  sur GitHub, ou retour sur le panneau après la réponse).
- P3 — Durées longues (« envoyé il y a 1 h 15 ») : tiennent sur leur propre ligne, sans débordement (vérifié par B).
- P3 — Même durée en haut et dans l'avertissement orange après 10 min : les deux viennent de la même heure de réponse,
  elles ne divergent pas. Avertissement inchangé à la demande du propriétaire.
- P3 — Annonce du passage « Envoi… » → « Envoyé ✓ » : le message en bas d'écran (« « ok » envoyé… ») est déjà annoncé.
- Mineur — DESIGN.md ne citait pas ces libellés : **ajouté**.

## Évaluation B (détecteur)

8 signalements, tous déjà présents, aucun sur une ligne modifiée (image de la visionneuse sans source, police Geist,
points animés « en train d'écrire », filet des citations, taille 12 px hors échelle). Injection de l'overlay bloquée
par la politique de sécurité du panneau : contrôles calculés à la place. Contraste de la ligne du haut 5,49 (clair) et
6,31 (sombre) ; « Envoyé ✓ » 6,05 et 6,66 ; nom accessible « ok envoyé pour #3 … » ; aucun débordement à 390, 900 et
1280 px.

## Suite

Aucun P0 ni P1 : pas de recritique.

Questions skipped: run autonome de la factory

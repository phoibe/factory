# Critique — fin de conversation après le tour de l'agent (issue #521)

Method: dual-agent (A: design review · B: detector + browser evidence)

Cible : onglet « Agent » du panneau, conversation dont une carte est créée pendant que l'agent finit son tour
(ordinateur 1280×800). Mode : Operate. Aucun élément nouveau à l'écran : la conversation se range seule dès la fin du
tour, avec le message existant « Demande créée, conversation rangée dans « Terminées » » et l'avis de fin existant.

## Évaluation A (revue design) — 29/36 (critère 10 « Aide » n/a : l'écran n'a pas à s'expliquer)

| # | Heuristique | Note |
|---|---|---|
| 1 | Visibilité de l'état | 2 |
| 2 | Langage du monde réel | 4 |
| 3 | Contrôle et liberté | 2 |
| 4 | Cohérence et standards | 4 |
| 5 | Prévention des erreurs | 3 |
| 6 | Reconnaissance plutôt que rappel | 3 |
| 7 | Flexibilité et efficacité | 4 |
| 8 | Design minimaliste | 4 |
| 9 | Récupération d'erreur | 3 |
| 10 | Aide et documentation | n/a |

Spécificité : conforme, aucun texte explicatif ajouté (règle « Textes à l'écran » respectée).

- P1 — La fin prévue ne se voit pas avant d'arriver. **Non corrigé, hors périmètre** : le propriétaire a demandé
  exactement ce comportement (« avec le même petit message ») ; un nouvel état dans la liste serait une nouvelle
  feature. Listé dans la PR (« Design : points restants »).
- P2 — Un message écrit pendant le tour ne doit pas voir la conversation se fermer sous lui. **Corrigé** : réécrire à
  l'agent garde la conversation ouverte (test e2e ajouté).
- P2 — Le message bref peut passer inaperçu : l'avis de fin doit rester. **Vérifié** : l'avis « Conversation
  terminée… » s'affiche dans la conversation (test e2e ajouté).
- P3 — Fermeture abandonnée en silence si la réponse apporte une nouvelle carte : acceptable, la carte se voit.

## Évaluation B (détecteur) — 4 alertes, aucune liée à ce changement

- `broken-image` (image agrandie sans source au chargement) : faux positif, la source est mise à l'ouverture.
- `overused-font` (Geist) : choix du design validé.
- `pulsing-dot` ×2 (« L'agent réfléchit », bulle d'attente) : signalent un état réellement en cours, avec repli
  « mouvement réduit » ; existants.
- Superposition interactive non injectée : l'état (message bref) est passager et dépend des données de test.

Questions skipped: run autonome de la factory

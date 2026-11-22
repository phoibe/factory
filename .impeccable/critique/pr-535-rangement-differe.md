# Critique — rangement différé d'une conversation, où que soit le propriétaire (issue #535)

Method: dual-agent (A: design review · B: detector)

Cible : onglet « Agent » du panneau. Mode : Operate. Aucun élément nouveau : la conversation dont la demande a été
créée pendant le tour de l'agent se range dans « Terminées » dès la fin du tour, même si le propriétaire est passé à
une autre conversation, a quitté l'onglet ou rechargé la page.

## Évaluation A (revue design) — 24/36 (critère 10 « Aide » n/a)

Spécificité : conforme, aucun texte explicatif ajouté.

- P1 — Message anonyme quand une autre conversation est à l'écran. **Corrigé** : le message nomme alors la
  conversation rangée (« Demande créée, « Titre » rangée dans « Terminées » »), test e2e ajouté.
- P1 — Lien vers la conversation rangée depuis le message. **Non corrigé, hors périmètre** (nouvelle feature).
- P2 — Repère « récemment rangée » dans « Terminées » après un rechargement. **Non corrigé, hors périmètre**.
- P2 — Plusieurs messages à la suite : un seul toast à la fois existe déjà (le suivant remplace le précédent).
- P3 — Rangement qui n'aboutit pas : la conversation reste ouverte et normale, rien à changer.

## Évaluation B (détecteur) — aucune alerte liée à ce changement

`broken-image` (image agrandie, source mise à l'ouverture), `overused-font` (Geist, choix validé), `pulsing-dot` ×2
(indicateurs « l'agent réfléchit »), `side-tab`, `design-system-font-size` : tous existants.

Questions skipped: run autonome de la factory

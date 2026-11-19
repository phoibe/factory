# Critique — carte « Mises en page » du tableau (issue #509)

Method: two isolated sub-agents (A: design review, B: detector + screenshots).

- **Score** : 33/40 (Nielsen, help n/a under the « Textes à l'écran » rule). No recritique (no P0/P1).
- **Changed** : a `factory:layouts` card is named « Mises en page » (kicker « Mises en page · demande #n ») and its step bar
  skips « Questions » and « Spec » (4 steps, « Étape 1/4 · Construction »), like a « Fiche stack » card.
- **Priority issues** : none (P0–P2). P3: none actionable.
- **Detector** : 7 findings, all on lines this branch does not touch (pre-existing: radius 8px app.mjs:3135, Geist font,
  typing dots, img without src filled by JS, neutral quote border). None in scope.
- **Textes à l'écran** : no text added; nothing on the card explains how the screen works.
- **Out of scope, pre-existing** : the time range mixes mono digits and proportional text (both card kinds).

Questions skipped: run autonome de la factory.

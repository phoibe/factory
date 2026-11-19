# Critique — carte de demande affichée directement dans le chat (issue #506)

Cible : onglet « Agent » du panneau, réponse de l'agent suivie de la carte « Créer cette demande » / « Ignorer »
(ordinateur 1280×800 et téléphone 390×844). Mode : Operate.

Le changement ne modifie pas l'apparence : seulement le moment où la carte arrive (tout de suite, sans la question
« Voulez-vous une fiche ? ») et la liste des demandes ouvertes envoyée à l'agent.

## Évaluation A (revue design) — 33/40

- P1 — Phrase de l'agent « Relisez la carte ci-dessous et cliquez si elle vous convient » : texte qui explique l'écran.
  **Gardée** : la spec validée la demande explicitement (« avec une phrase pour vous inviter à la relire et cliquer si
  elle vous convient »), exception prévue par la règle « Textes à l'écran ».
- P2 — Corps de la carte replié derrière « Lire le texte » (carte de #492, hors périmètre).
- P2 — Ligne « Agent · heure · Copier la réponse » placée sous la carte (existant, hors périmètre).
- P2 — Triangle de « Lire le texte » rendu en ▶ plein (police de secours ; existant, hors périmètre).
- P3 — Marges intérieures de la carte plus serrées que DESIGN.md (choix compact du chat, existant).
- P3 — Étiquette Bug / Fonctionnalité sans pastille (acceptable).

## Évaluation B (détecteur)

Aucun signalement sur la carte (`.proposal`) ni sur le chat modifié. Signalements existants hors périmètre : filet
gris des citations dans les bulles, points animés « en train d'écrire », police Geist, image vide de la visionneuse,
arrondi de l'outil de mesure.

## Suite

Aucun P0 ; le seul P1 est voulu par la spec : pas de recritique. Les points P2/P3 portent sur la carte livrée par
#492 et ne sont pas touchés ici.

Questions skipped: run autonome de la factory

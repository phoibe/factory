# 460 · Améliorer la page agent : copier, couleurs, largeur, hauteur, rapidité

> Demande [#460](https://github.com/phoibe/factory/issues/460) · 2026-11-18

**En une phrase** : l'onglet Agent devient plus confortable : commandes et réponses copiables d'un clic, encadrés colorés pour ce qui compte, toute la largeur et toute la hauteur de l'écran utilisées, et une attente plus courte et plus lisible.

### Ce que j'ai décidé pour vous
- Un petit bouton « copier » en haut à droite de chaque bloc de commande, et un sous chaque réponse de l'agent pour la copier en entier ; un bref « Copié ✓ » confirme.
- Vos messages dans une bulle colorée à droite ; ceux de l'agent sans bulle, sur toute la largeur de la conversation.
- Un clic sur une image l'ouvre en grand par-dessus la page ; un clic à côté ou la touche Échap la referme.
- La zone de discussion s'ajuste exactement à la hauteur de l'écran : la zone de saisie reste toujours visible, sur téléphone aussi.

### Parcours
**Ouvrir l'onglet Agent** : la conversation occupe toute la largeur de l'écran (les autres onglets gardent leur largeur actuelle). Les réponses s'étalent nettement plus qu'aujourd'hui, avec une limite de confort de lecture sur très grand écran. La zone de saisie est collée en bas de l'écran, sans avoir à faire défiler la page.

**Envoyer un message** : votre message apparaît à droite dans une bulle colorée. Pendant l'attente, « Réfléchit… » affiche le temps écoulé (« Réfléchit… 0:42 ») et le délai habituel (« d'habitude, environ 1 à 2 min »).

**Lire la réponse** :
- les avertissements (⚠️) sont dans un encadré orange, les réussites (✅) dans un encadré vert, les actions à faire de votre part (➡️) dans un encadré bleu ; le reste du texte garde sa couleur normale ;
- chaque bloc de commande a son bouton « copier » ;
- sous la réponse, un bouton copie toute la réponse ;
- un clic sur une image l'agrandit.

**Rapidité** : l'agent lit moins de consignes et de fichiers avant de répondre ; le démarrage de la machine, lui, reste incompressible.

### Règles et cas limites
- La couleur reste un signal : seules les lignes qui commencent par ⚠️, ✅ ou ➡️ sont colorées, et l'agent est consigné de ne s'en servir que quand ça compte.
- Les encadrés colorés restent lisibles en mode sombre comme en clair.
- Si la copie est refusée par le navigateur, un message court le dit (« Copie impossible ») au lieu de « Copié ✓ ».
- Le temps écoulé repart de zéro à chaque nouveau message et disparaît dès que la réponse arrive.
- La fiche de design est mise à jour : les couleurs d'encadré et la pleine largeur de l'onglet Agent y deviennent des exceptions assumées.

### Hors périmètre
- Un agent qui tourne en permanence pour répondre instantanément (refusé : service en plus, probablement payant).
- Changer la largeur des autres onglets.
- Modifier ou supprimer des messages déjà envoyés.

### Comment vérifier (sur la preview)
1. Sur ordinateur, l'onglet Agent occupe toute la largeur ; la zone de saisie est visible en bas sans défiler, même en réduisant la hauteur de la fenêtre.
2. Sur téléphone, la zone de saisie reste visible, clavier ouvert compris.
3. Posez une question qui demande une commande : le bouton « copier » du bloc fonctionne et affiche « Copié ✓ » ; collez ailleurs pour vérifier.
4. Le bouton sous la réponse copie la réponse entière.
5. Pendant l'attente, le temps écoulé défile à côté de « Réfléchit… » avec le délai habituel.
6. Vos messages sont à droite dans une bulle colorée, ceux de l'agent sans bulle.
7. Une réponse avec ⚠️, ✅ ou ➡️ montre l'encadré orange, vert ou bleu.
8. Un clic sur une image l'agrandit ; Échap ou un clic à côté la referme.

Décision notée pendant les questions : pas de service permanent pour accélérer l'agent.

# 477 · Onglet Agent : ouvrir la dernière conversation en cours par défaut

> Demande [#477](https://github.com/phoibe/factory/issues/477) · 2026-11-18

**En une phrase** : à l'ouverture de l'onglet Agent, la conversation en cours la plus récente s'affiche directement ; s'il n'y en a aucune, une nouvelle conversation s'ouvre comme aujourd'hui.

### Ce que j'ai décidé pour vous
- « La plus récente » = celle qui a eu le dernier message, pas celle créée en dernier.
- Le choix automatique ne se fait qu'à la première ouverture de l'onglet (et après un changement de projet) : si vous passez au tableau puis revenez, vous retrouvez la conversation que vous regardiez, ou votre nouvelle conversation avec son brouillon.
- Sur téléphone aussi, vous arrivez directement dans la conversation ; la flèche retour ramène à la liste (votre « oui » à la question 1).
- Le reste ne change pas : la liste « Terminées », le bouton pour terminer une conversation et le bouton « Nouvelle conversation ».

### Ce qui change
- Ouverture de l'onglet Agent avec au moins une conversation non terminée : la plus récente s'affiche, déjà sélectionnée dans la liste.
- Toutes terminées, ou aucune conversation : une nouvelle conversation vierge s'ouvre, comme aujourd'hui.

### Comment vérifier
1. Avec au moins deux conversations en cours, ouvrez l'onglet Agent : celle qui a reçu le dernier message s'affiche et est surlignée dans la liste.
2. Terminez toutes les conversations, rechargez la page, ouvrez l'onglet Agent : une nouvelle conversation vierge s'affiche.
3. Ouvrez une autre conversation, passez au tableau puis revenez sur l'onglet Agent : vous retrouvez la conversation que vous regardiez.
4. Sur téléphone, ouvrez l'onglet Agent : vous arrivez dans la conversation en cours, et la flèche retour affiche la liste.

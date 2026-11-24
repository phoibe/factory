# 559 · Preuve de la phase amont : la rendre fiable quand deux rôles ont le même modèle

> Demande [#559](https://github.com/phoibe/factory/issues/559) · 2026-11-24

C'est un sujet d'outillage : rien ne change dans les écrans ni dans la façon dont les demandes avancent.

**En une phrase** : la rubrique « Fabrication » ne devine plus quel modèle a préparé les questions et la fiche d'après le modèle du dernier sous-agent lancé ; elle s'appuie sur une trace que le sous-agent chargé de la réflexion laisse lui-même, et reste donc juste même quand deux rôles ont le même modèle.

### Ce que j'ai vérifié

- **Le défaut est réel.** J'ai fait l'essai avec le même modèle pour « Plans et organisation » et « Écriture du code » : un seul sous-agent lancé pour tout autre chose (chercher dans le code, écrire une correction) suffit pour que l'outil annonce « Questions et fiche : faites par … (rôle « Plans et organisation ») » ou « Analyse du bug : faite par … », alors qu'aucune réflexion n'a eu lieu.
- **Il existe déjà avec vos réglages actuels, en plus discret.** « Plans et organisation » et « Revue » sont tous les deux sur Fable : l'outil répond toujours « Plans et organisation », même quand c'est le rôle « Revue » qui a pris le relais.
- **La solution est possible.** Pour chaque sous-agent, l'outil garde déjà un relevé à part de ce que ce sous-agent a fait lui-même : le modèle qui a réellement répondu et les textes qu'il a écrits. La preuve s'appuiera sur ce relevé.

### Ce qui change

1. **Le rôle est annoncé au lancement.** Chaque sous-agent est lancé en disant pour quel rôle il travaille, et le journal note ce rôle en plus du modèle. Un sous-agent lancé pour un autre rôle ne compte plus jamais comme « réflexion », même s'il a le même modèle.
2. **La preuve vient du sous-agent lui-même.** Elle n'est accordée que si le relevé du sous-agent de réflexion montre deux choses : il a réellement tourné sur le modèle choisi pour son rôle, et c'est bien lui qui a écrit le texte publié (les questions, la fiche, ou la fiche projet d'un cadrage).
3. **Pour un bug, même règle.** « Analyse du bug : faite par … » ne s'affiche que si un sous-agent lancé pour cette analyse l'a rendue avant le début de la correction.
4. **La rubrique « Fabrication » garde les mêmes phrases.** Elle dit simplement le bon rôle : « Revue » quand c'est lui qui a pris le relais après un échec, y compris quand les deux rôles ont le même modèle.

### Règles

- Au moindre doute, la rubrique dit qu'elle n'a pas pu vérifier ; elle n'annonce jamais une réflexion qu'elle n'a pas vue.
- Un sous-agent lancé mais qui n'a rien rendu (échec, texte inutilisable) ne compte pas.
- Si l'agent qui pilote réécrit le texte au lieu de publier celui du sous-agent, il n'y a pas de preuve. La ligne de preuve et la signature qu'il ajoute à la fin ne comptent pas comme une réécriture.
- Quand la preuve manque, rien de nouveau pour vous : comme aujourd'hui, l'agent refait faire le travail par le bon sous-agent, et la PR ne s'ouvre pas tant que la fiche n'a pas sa preuve.
- Les demandes déjà en cours gardent la preuve qu'elles ont déjà : rien n'est redemandé ni bloqué. La nouvelle règle vaut pour les questions et les fiches publiées après la livraison.
- La règle est la même sur la factory et sur tous vos projets.

### Hors périmètre

- Les Réglages généraux : vous pouvez toujours choisir le même modèle pour plusieurs rôles, sans avertissement.
- Les autres lignes de la rubrique « Fabrication » (sous-agents, parcours, tests) et les preuves des autres étapes (plan, revue de code, passe design).

### Comment vérifier

- Les contrôles automatiques de la PR sont au vert, avec de nouveaux tests pour ces cas : deux rôles sur le même modèle et un seul sous-agent d'un autre rôle (pas de preuve), le vrai sous-agent de réflexion (preuve), le relais par le rôle « Revue » (la rubrique dit « Revue »), un texte réécrit par l'agent qui pilote (pas de preuve).
- Après la livraison, mettez le même modèle pour « Plans et organisation » et « Écriture du code » dans les Réglages généraux, puis créez une petite demande de test sur un projet : dans sa PR, la rubrique « Fabrication » indique « Questions et fiche : faites par … (rôle « Plans et organisation ») ». Remettez ensuite vos réglages habituels.
- Avec vos réglages habituels, la rubrique « Fabrication » des PR suivantes s'affiche comme avant.

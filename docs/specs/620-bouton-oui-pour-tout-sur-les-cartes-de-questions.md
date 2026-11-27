# 620 · Bouton « Oui pour tout » sur les cartes de questions

> Demande [#620](https://github.com/phoibe/factory/issues/620) · 2026-11-27

**En une phrase** : sur une carte « Questions en cours », un bouton « Oui pour tout » accepte d'une touche toutes les recommandations de l'agent, sans passer par GitHub.

### Ce que j'ai décidé pour vous

- Le bouton s'appelle « Oui pour tout » et envoie la réponse « oui à tout », celle que l'agent propose déjà à la fin de ses questions.
- Il est bleu et placé en premier sur la carte, comme « go » et « Ok » ; « Répondre » reste juste à côté, discret, pour lire les questions ou répondre une par une.
- Il part dès le toucher, sans confirmation ni compte à rebours, comme « go » et « Ok ».
- Il n'apparaît que si le dernier message de l'agent propose lui-même « oui à tout », c'est-à-dire une série de questions avec ses recommandations. Sur un message d'un autre genre (une question ouverte, une alerte…), la carte garde seulement « Répondre ».
- Il apparaît aussi sur les questions du cadrage d'un projet, quand l'agent y propose « oui à tout ».
- Ouvrir les questions avec « Répondre » pour les lire ne fait plus quitter « À vous de jouer » à la carte : elle y reste avec son bouton, comme une carte « go » ou « Ok ». Si vous répondez par écrit sur GitHub, elle passe en attente comme aujourd'hui.

### Ce qui change

Aujourd'hui, une carte « Questions en cours » n'a que « Répondre », qui ouvre GitHub pour y écrire la réponse. Désormais, quand l'agent a posé ses questions, la carte montre « Oui pour tout » puis « Répondre », sur la même ligne, sur ordinateur comme sur téléphone.

Un toucher sur « Oui pour tout » : le bouton affiche « Envoi… », puis « Envoyé ✓ », le message « « oui à tout » envoyé. L'agent reprend avec vos réponses. » s'affiche en bas de l'écran, et la carte passe dans « Prise en compte en cours… » jusqu'à ce que l'agent reparte. Si l'envoi échoue, un message le dit et le bouton redevient utilisable.

Le bouton ne se fie qu'aux messages de l'agent : un message écrit par quelqu'un d'autre ne le fait jamais apparaître.

La fiche de design est mise à jour : « Oui pour tout » y rejoint « go » et « Ok » comme bouton bleu d'une carte « À vous de jouer ».

### Comment vérifier

1. Sur une demande où l'agent vient de poser ses questions (son message se termine par « … ou « oui à tout » »), la carte dans « À vous de jouer » montre « Oui pour tout » en bleu, puis « Répondre ».
2. Touchez « Répondre », lisez les questions sur GitHub sans rien écrire, puis revenez : la carte est toujours dans « À vous de jouer », avec son bouton.
3. Touchez « Oui pour tout » : « Envoi… », puis « Envoyé ✓ » et le message « « oui à tout » envoyé. L'agent reprend avec vos réponses. » ; la carte passe dans « Prise en compte en cours… », et sur GitHub la demande a reçu la réponse « oui à tout ».
4. Sur une carte « Questions en cours » dont le dernier message de l'agent ne propose pas « oui à tout », il n'y a que « Répondre ».
5. Les cartes « go » (spec) et « Ok » (captures, recette) n'ont pas changé.

# 606 · Vérifier la portée d'un changement sensible avant la relecture finale

> Demande [#606](https://github.com/phoibe/factory/issues/606) · 2026-11-25

**En une phrase** : avant la relecture finale d'un changement qui touche à un sujet sensible ou aux ordres de bourse, un agent neuf cherche ce que ce changement peut casser ailleurs dans le projet, le prouve en faisant tourner le vrai code ou un test, et le résumé de la PR vous dit en une ligne « Portée vérifiée : … » ce qui a été vérifié.

### Ce que j'ai décidé pour vous

- « Sujet sensible » veut dire exactement la liste de la revue de sécurité : connexion, codes, comptes, données personnelles, argent, partage, suppression de données. Une demande que vous validez seulement parce qu'elle change le design ou la vision du produit n'est pas concernée.
- L'agent juge si une demande est concernée d'après sa fiche, comme pour la revue de sécurité, et aussi d'après ce que le code modifie réellement.
- La vérification est faite par un agent neuf du rôle « Revue », qui n'a pas écrit le code. Elle se place après l'écriture du code et ses tests, avant la relecture finale. La revue de sécurité reste après, comme aujourd'hui.
- Dans les Réglages généraux, la description du rôle « Revue » devient : « Relecture finale du code avant chaque PR, vérification de portée, revue de sécurité, synthèse d'une review générale. » C'est le seul texte qui change à l'écran.
- Une preuve, c'est une commande qui fait tourner le vrai code ou un test, comme dans la demande #604. Montrer un morceau de code ou affirmer ne prouve rien. Quand la preuve est un test, il est gardé dans le projet.
- Une casse trouvée est corrigée avec un test qui échoue d'abord. La vérification ne se fait qu'une fois : c'est la relecture finale qui relit ensuite cette correction.
- La ligne du résumé est en français simple. Le fait prouvé, la commande lancée et son résultat sont dans la partie technique de la PR, en bas.
- Sur une demande non concernée, rien ne change : pas de vérification, pas de ligne, pas de temps en plus. Sur une demande concernée, comptez 5 à 10 minutes de plus.
- Pas de vérification de portée pendant une review générale, une amélioration UI ou le socle d'un nouveau projet.
- Aucun contrôle automatique ne refuse une PR sans cette ligne : elle reste une consigne, comme la revue de sécurité. Le journal de fabrication de la PR montre l'agent qui a fait la vérification.
- La validation des fiches et la revue de sécurité gardent leurs règles actuelles. pstack n'est pas installé, et aucun réglage n'est ajouté au tableau de bord.

### Parcours

Aucun écran nouveau. Voici ce qui se passe pendant la construction d'une demande concernée, étape par étape.

**1. Le code est écrit et testé**, comme aujourd'hui.

**2. La vérification de portée.** Un agent neuf du rôle « Revue », qui n'a pas écrit le code, cherche ce que le changement peut casser en dehors des fichiers modifiés :
- les autres endroits du projet qui se servent du code touché ;
- les fichiers et les données partagés ;
- les écrans qui affichent la même information ;
- les tâches planifiées qui lisent ce qui a changé.

**3. Le fait qui rend le changement sûr.** L'agent dit quel fait précis rend le changement sûr (par exemple « aucun autre endroit ne donne une valeur vide à ce calcul »), puis le prouve en lançant le vrai code ou un test. Il ne touche jamais à rien de réel pour cela : pas d'ordre envoyé, pas de vraie donnée modifiée.

**4. Si une casse est trouvée.** Elle est corrigée tout de suite, avec un test qui échoue d'abord, avant la relecture finale.

**5. La suite ne change pas** : relecture finale, puis revue de sécurité si la demande est sensible, essai en conditions réelles, PR, contrôles automatiques, captures et recette.

**6. Dans le résumé de la PR**, une ligne en français simple. Exemple : « Portée vérifiée : les trois autres endroits qui utilisent le calcul de quantité lui donnent toujours un nombre positif (prouvé par un test) ; l'écran Historique et la tâche de nuit lisent la même donnée et l'affichent encore correctement. » Si une casse a été trouvée et corrigée, la ligne le dit.

**Pour une correction de bug concernée**, c'est le même parcours : la vérification se fait après la correction et son test, avant la relecture, et la ligne « Portée vérifiée : … » est dans le résumé de la PR.

**Quand le fait ne peut pas être prouvé** sans toucher à du réel (par exemple, il faudrait envoyer un vrai ordre) :
1. l'agent va aussi loin que possible sans rien toucher de réel ;
2. il écrit dans le résumé « Portée non prouvée : … », avec ce qui reste à regarder ;
3. il prépare la PR, puis s'arrête et vous écrit dans la demande pour vous demander votre accord. La carte attend votre réponse, comme pour toute question de l'agent ;
4. rien ne part vers les contrôles automatiques ni vers l'intégration sans votre « ok ». Si vous répondez « ok », la demande reprend là où elle s'était arrêtée. Sinon, dites ce qu'il faut regarder ou changer : l'agent en tient compte.

### Règles et cas limites

- **Les demandes concernées** sont de deux sortes :
  - celles qui touchent à un sujet sensible : connexion, codes, comptes, données personnelles, argent, partage, suppression de données ;
  - celles dont le changement touche aux ordres de bourse, sur n'importe lequel de vos projets (aujourd'hui Pulsar Wheel).
- **Toucher aux ordres de bourse**, c'est modifier ce qui envoie, modifie ou annule un ordre, ou ce qui décide de ce qui est envoyé : les quantités, les prix, le moment, les positions, et les données que ces calculs lisent.
- Une retouche d'affichage ou de texte qui ne touche à rien de cela n'est pas concernée, même sur Pulsar Wheel.
- L'agent en juge sur ce que le changement modifie réellement, pas sur le titre de la demande : une demande d'affichage qui finit par modifier un calcul d'ordre est vérifiée.
- Il n'y a aucun réglage à faire par projet : la règle est la même partout.
- **Corrections de bugs** : une correction de bug qui touche aux mêmes sujets sensibles ou aux ordres de bourse est vérifiée elle aussi. Comme un bug n'a pas de fiche, l'agent en juge d'après l'analyse du bug et d'après ce que la correction modifie. Les autres corrections de bugs ne changent pas.
- **Après une correction demandée en recette** : sur une demande concernée, si la correction modifie le code, la vérification est refaite sur cette correction et la ligne « Portée vérifiée » est mise à jour. Si le fait ne peut alors pas être prouvé, l'agent s'arrête et demande votre accord, comme plus haut.
- La vérification n'est pas refaite après une retouche des captures (apparence seulement), ni après une correction des contrôles automatiques.
- Si rien d'autre dans le projet ne se sert de ce qui a changé, la ligne le dit en une phrase.
- Les lignes « Essayé en vrai » et « Pas vérifié en vrai » du résumé restent comme aujourd'hui : elles parlent de l'essai sur les vraies données, pas de ce qui entoure le changement.
- La règle sert sur chaque projet dès la construction qui suit sa mise à jour habituelle par la factory. D'ici là, ses demandes se construisent comme aujourd'hui.

### Hors périmètre

- Les demandes non concernées : rien n'y est ajouté.
- Une vérification sur toutes les demandes de Pulsar Wheel.
- Un réglage par projet pour désigner un sujet à risque.
- Un contrôle automatique qui refuserait une PR sans la ligne « Portée vérifiée ».
- La review générale, l'amélioration UI et le socle d'un nouveau projet.
- Étendre la revue de sécurité aux corrections de bugs : elle garde ses règles actuelles.
- Installer pstack, ou modifier les skills installés.
- Un nouveau réglage de moteur : la vérification suit le réglage du rôle « Revue ».

### Comment vérifier

Sur la preview de cette demande, un seul texte change :

1. Dans les Réglages généraux, sous le rôle « Revue », vous lisez : « Relecture finale du code avant chaque PR, vérification de portée, revue de sécurité, synthèse d'une review générale. »
2. Le reste du tableau de bord, les réglages de chaque projet et les étapes d'une demande sont inchangés.

Le reste se constate sur les demandes suivantes, une fois le projet mis à jour :

3. Dans la PR d'une demande qui touche à un sujet sensible, le résumé contient une ligne « Portée vérifiée : … », en français simple, qui dit ce qui a été regardé autour du changement.
4. Sur Pulsar Wheel, la PR d'une demande qui change un calcul d'ordre contient cette ligne ; celle d'une simple retouche de texte ne la contient pas.
5. La PR d'une correction de bug qui touche à un sujet sensible ou aux ordres de bourse contient aussi cette ligne.
6. La PR d'une demande non concernée n'a pas cette ligne.
7. Dans une PR qui a la ligne, la partie technique (tout en bas) donne le fait prouvé, la commande lancée et son résultat, et le journal de fabrication montre un agent du rôle « Revue » pour la vérification de portée.
8. Si le fait ne peut pas être prouvé, vous recevez un message qui demande votre accord, le résumé de la PR dit « Portée non prouvée : … », et rien n'est intégré tant que vous n'avez pas répondu « ok ».
9. Après une correction que vous demandez en recette sur une demande concernée, la ligne « Portée vérifiée » du résumé est mise à jour.

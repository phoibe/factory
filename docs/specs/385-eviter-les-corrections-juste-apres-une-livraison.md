# 385 · Éviter les corrections juste après une livraison

> Demande [#385](https://github.com/phoibe/factory/issues/385) · 2026-11-13

**En une phrase** : avant de vous montrer une modification, l'agent l'essaie aussi dans les vraies conditions du projet, en lecture seule, et vous dit franchement ce qu'il n'a pas pu vérifier en vrai, pour qu'il y ait moins de deuxièmes demandes juste après une livraison.

### Ce que montre l'enquête (deux dernières semaines)

| Livraison | Deuxième passage | Pourquoi les tests ne l'ont pas vu |
| --- | --- | --- |
| Numéro de version à la mise en production (#333) | Fausse alerte « fusion hors procédure » à chaque mise en production (#365) | Chaque partie a été testée seule ; personne n'a fait tourner le surveillant sur le vrai commit de version créé par la factory. |
| Écart de production (#369) | #370 et #372 dans l'heure | Testé sur des projets inventés ; les vrais projets (mise en ligne externe, hébergeur qui ne prévient pas) ne se comportent pas comme ça. |
| Captures en thème sombre (#375) | #378 trente minutes après | GitHub abîmait les images **après** l'envoi : seul un coup d'œil au vrai message publié pouvait le voir. |

Point commun : les tests vérifiaient le code sur des exemples fabriqués, jamais le résultat réel.

### Ce qui change pendant la construction (tous les projets)

1. **Essai en conditions réelles** : après les tests habituels et avant de vous présenter la modification, l'agent rejoue le parcours de la demande sur les vraies données du projet (le vrai GitHub, le vrai site en ligne, le vrai message publié), **en lecture seule** : il regarde, il ne modifie, n'envoie ni ne supprime rien de réel.
2. **« Pas vérifié en vrai »** : quand un essai réel est impossible (il faudrait écrire de vraies données, ou un service extérieur intervient), le résumé de la modification le dit en une ligne : « Pas vérifié en vrai : … ». Vous savez ainsi quoi regarder pendant la recette.
3. **Après publication, un coup d'œil au résultat** : quand l'agent publie quelque chose (un message, des captures), il relit ce qui est réellement arrivé, pas ce qu'il a envoyé.
4. **Leçon de chaque deuxième passage** : quand une correction fait suite à une livraison récente, son résumé contient une phrase « Pourquoi ça n'avait pas été vu », et la correction ajoute un test qui aurait attrapé le problème, pour qu'il ne revienne pas.

### Règles et cas limites
- Lecture seule stricte : jamais de vraie écriture pour « essayer » (pas de message de test, pas de modification de production).
- Les constructions prennent quelques minutes de plus : accepté.
- Si l'essai réel montre un problème, l'agent le corrige avant de vous présenter la modification, comme pour un test rouge.

### Hors périmètre
- Pas de compteur des « corrections juste après livraison » au tableau de bord pour l'instant (on jugera à l'usage, on pourra en ajouter un plus tard).
- Rien ne change dans le tableau de bord ni dans vos boutons.

### Critères d'acceptation
- Dans la prochaine modification livrée sur n'importe quel projet, le résumé dit ce qui a été essayé en vrai, ou contient une ligne « Pas vérifié en vrai : … ».
- Dans la prochaine correction qui suit une livraison récente, le résumé contient « Pourquoi ça n'avait pas été vu » et mentionne le test ajouté.
- Aucune donnée réelle n'est créée, modifiée ou supprimée par ces essais.

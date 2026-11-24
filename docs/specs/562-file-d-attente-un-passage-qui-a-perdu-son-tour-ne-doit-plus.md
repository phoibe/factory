# 562 · File d'attente : un passage qui a perdu son tour ne doit plus rien décider

> Demande [#562](https://github.com/phoibe/factory/issues/562) · 2026-11-24

C'est un sujet de robustesse : rien ne change dans les écrans ni dans la façon dont les demandes avancent.

**En une phrase** : un passage de la factory qui a perdu son tour dans la file d'attente s'en aperçoit tout seul et s'arrête aussitôt, sans rien lancer ni rien écrire, pour qu'une demande ne puisse plus être lancée deux fois.

### Ce que j'ai vérifié

- **Comment ça marche aujourd'hui.** Pendant qu'il décide, un passage donne un signe de vie chaque minute. Après 4 minutes sans signe de vie, les passages qui attendent le croient arrêté et l'un d'eux prend sa place.
- **Le défaut est réel.** J'ai fait l'essai sur le mécanisme actuel, dans les deux cas possibles :
  - GitHub prévient le passage qu'un autre a pris sa place : il l'écrit dans son journal, puis continue et lance quand même ;
  - ses signes de vie n'arrivent plus du tout (GitHub très lent) : il ne s'aperçoit de rien et lance aussi, dix minutes plus tard dans mon essai.
- **Ce n'est ni déjà réglé, ni en double.** La review générale #556 corrige un cas voisin (un passage qui attend son tour trop longtemps), pas celui-ci.

### Ce qui change

1. **Le passage sait quand son tour n'est plus sûr.** Il retient l'heure de son dernier signe de vie bien arrivé. S'il n'a pas réussi à en donner un nouveau à temps, il considère son tour comme perdu un peu avant le moment où les autres ont le droit de prendre sa place.
2. **Tour perdu : arrêt immédiat.** Que GitHub lui ait dit qu'un autre a pris sa place, ou qu'il l'ait compris tout seul, il ne fait plus rien à partir de là : aucun lancement d'agent ou de contrôle, aucune fusion, aucune étiquette, aucun message. La vérification est refaite juste avant chacune de ces actions, et en particulier juste avant chaque lancement.
3. **Rien n'est perdu.** Ce qu'il était en train de traiter (votre message, votre « go », la fin d'un contrôle) est repris tout seul un peu plus tard, par le mécanisme qui existe déjà pour les passages interrompus par une panne de GitHub.
4. **Une trace claire.** Le journal du passage dit en une ligne qu'il a perdu son tour et qu'il s'est arrêté sans rien lancer.

### Règles

- **Un passage normal ne change pas** : mêmes décisions, mêmes messages, mêmes délais (un signe de vie par minute, remplacement après 4 minutes sans signe de vie). Une longue décision qui donne bien ses signes de vie n'est jamais arrêtée.
- **Aucune lecture GitHub en plus** : le passage se sert de sa propre horloge et des réponses à ses signes de vie, qu'il reçoit déjà.
- **Un passage arrêté ne touche jamais au tour d'un autre** : il ne rend que le sien, comme aujourd'hui.
- **Rien à moitié fait** : le tour est vérifié avant la toute première marque d'un lancement, pour qu'un passage arrêté ne laisse pas une carte marquée « en cours » sans agent. Si l'arrêt tombe malgré tout au milieu d'un lancement, la carte n'est pas perdue : les réparations automatiques qui existent déjà la font repartir toute seule (au plus tard 2 h 30 après, comme aujourd'hui quand un agent s'arrête sans prévenir), sans que vous ayez à écrire.
- **Limite honnête** : une action déjà partie vers GitHub à l'instant précis où le tour se perd ne peut pas être rattrapée. Le risque passe de « tout le reste du passage » (plusieurs minutes) à « une seule action en cours » (quelques secondes).
- **Reprise** : comme aujourd'hui après une panne, il peut arriver, très rarement, qu'un message automatique s'affiche deux fois. C'est le compromis déjà retenu : mieux vaut un message en double qu'un « go » jamais vu.
- La règle est la même sur la factory et sur tous vos projets.

### Hors périmètre

- Les délais de la file d'attente.
- Le passage qui attend son tour trop longtemps : traité dans la review générale #556.
- La marque « en cours » d'une carte pendant que l'agent travaille : inchangée.
- Le tableau de bord : aucun changement.

### Comment vérifier

- Les contrôles automatiques de la PR sont au vert, avec de nouveaux tests pour ces cas :
  - un passage dont les signes de vie n'arrivent plus s'arrête avant que sa place puisse être prise, et ne lance rien ;
  - un passage prévenu par GitHub qu'un autre a pris sa place s'arrête tout de suite : l'action suivante n'est pas faite ;
  - deux passages dont l'un a perdu son tour : la demande est lancée une seule fois, et ce que traitait le passage arrêté est repris ensuite ;
  - un passage normal, même long de 20 minutes, va au bout, sans lecture GitHub en plus.
- Après la livraison, vos demandes continuent d'avancer normalement : questions, constructions, contrôles, mises en production.
- Vous n'avez rien à essayer à la main : ce cas ne se produit que lorsque GitHub est très lent.

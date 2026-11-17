# 440 · Message de mise en production plus clair et honnête

> Demande [#440](https://github.com/phoibe/factory/issues/440) · 2026-11-16

**En une phrase** : le message de mise en production devient court et honnête, avec une liste en français où chaque modification n'apparaît qu'une seule fois, et la coche verte « En production ✅ » seulement quand le site a vraiment été vérifié.

### Ce que j'ai décidé pour vous
- La même liste corrigée sert aussi dans les deux autres messages (« le site se met à jour… » et « site vérifié ✅ »).
- La phrase sur le « tag » disparaît : le numéro de version est dans la première ligne. Le message d'erreur reste si le numéro de version ne peut pas être posé.
- La carte du tableau, déjà honnête (« En ligne (vérification impossible) »), ne change pas.

### Ce qui change
- **Première ligne** : « Version 0.19.2 envoyée : ces 2 modifications partent en ligne. » (sans numéro de version : « Envoyé : ces 2 modifications partent en ligne. »). La coche « En production ✅ » n'apparaît que si le site a été ouvert et vérifié en ligne.
- **Liste** : une ligne par modification, un seul lien cliquable, avec le titre de la demande d'origine (en français). À défaut de demande d'origine, le titre de la modification sans son préfixe technique (« feat: », « fix: »…). Plus de titre répété ni de lien qui recopie le titre.
- **Site non vérifiable** : la dernière phrase devient « Je ne peux pas vérifier le site moi-même. Pour vous en assurer, ouvrez-le dans quelques minutes : vous devriez y voir ces changements. »

### Comment vérifier
- À la prochaine mise en production d'un projet sans adresse de site (comme Pulsar Wheel) : pas de coche verte, la première ligne donne le numéro de version, chaque modification apparaît une seule fois, en français, et la dernière phrase ne contient ni « tag » ni jargon.
- Sur un projet dont le site est vérifié : le message « site vérifié ✅ » montre la même liste propre.

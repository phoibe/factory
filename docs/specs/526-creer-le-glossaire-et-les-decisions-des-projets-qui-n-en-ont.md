# 526 · Créer le glossaire et les décisions des projets qui n'en ont pas encore

> Demande [#526](https://github.com/phoibe/factory/issues/526) · 2026-11-22

**En une phrase** : chaque projet de la factory reçoit un glossaire et un registre des décisions, créés une fois à partir de ce qui existe déjà s'il n'en a pas, puis tenus à jour à chaque demande.

### Ce que j'ai décidé pour vous
- un projet qui n'a encore ni fiche produit ni feature livrée n'a rien à reconstituer : l'agent attend qu'il y ait de quoi écrire ;
- la factory elle-même a déjà son glossaire : elle n'est pas concernée par le rattrapage ;
- pendant les questions habituelles, l'agent note vos refus dans les décisions au moment où vous les exprimez.

### Ce qui se passe
1. **Premier passage de l'agent sur un projet sans glossaire** (Yoldmewhen2 par exemple), que ce soit pour des questions ou pour une construction : avant de faire son travail habituel, l'agent relit la fiche produit, le design, les specs des features livrées et les échanges passés (demandes ouvertes, terminées et abandonnées). Il en tire :
   - un **glossaire** : les mots du projet, avec vos termes, en français ;
   - un **registre des décisions** : les choix importants déjà faits, et vos refus clairs, une phrase chacun.
2. Ces documents partent dans une **petite mise à jour de documents** à part, que la factory valide seule. Le travail de la demande continue ensuite normalement.
3. **Les fois suivantes**, le glossaire existe : il n'est plus recréé. L'agent le complète pendant les questions, comme aujourd'hui.
4. **Chargement fiable** : l'agent charge directement les deux briques « questions » et « documents », au lieu de la brique qui les regroupe et qui lui était refusée. Les documents s'écrivent donc vraiment pendant les questions.

### Règles et cas limites
- Un refus n'est noté que s'il est clair : vous avez dit non, ou abandonné une idée en disant pourquoi. Une demande abandonnée sans explication n'est pas notée.
- Le rattrapage n'a lieu qu'une fois par projet ; s'il échoue, il sera retenté au passage suivant.
- Les documents sont en français, sans détail technique.

### Hors périmètre
- Aucun changement d'écran sur le tableau de bord.
- Pas de réécriture des glossaires qui existent déjà.

### Comment vérifier
- Au prochain passage de l'agent sur Yoldmewhen2, une petite mise à jour « Glossaire et décisions » apparaît dans ce projet et se fusionne seule ; elle contient un glossaire et des décisions qui reprennent vos choix et refus passés.
- Au passage suivant sur Yoldmewhen2, aucun nouveau rattrapage n'est fait.
- Dans une prochaine demande avec questions, le glossaire ou les décisions sont complétés quand quelque chose de nouveau est décidé.

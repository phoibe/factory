# 516 · Terminer la conversation quand sa demande est créée

> Demande [#516](https://github.com/phoibe/factory/issues/516) · 2026-11-20

**En une phrase** : une conversation avec l'agent se range toute seule dans « Terminées » dès que toutes ses cartes de demande ont été décidées et qu'au moins une demande a été créée.

### Ce que j'ai décidé pour vous
- La conversation reste affichée à l'écran après la création, avec le lien vers la demande sur la carte et la mention « Conversation terminée. Écrivez un message pour la reprendre. » : vous n'êtes pas renvoyé à la liste.
- Un petit message confirme : « Demande créée, conversation rangée dans « Terminées » ».
- Toutes les cartes de la conversation comptent, pas seulement celles de la dernière réponse : tant qu'une carte attend votre choix, la conversation reste ouverte.
- Si vous ignorez toutes les cartes sans en créer aucune, la conversation reste ouverte (comme aujourd'hui).
- Cela marche dans les deux modes du chat (réponse instantanée et réponse par l'agent).

### Ce qui change
- Quand vous cliquez « Créer cette demande » (ou « Ignorer ») sur la dernière carte encore en attente, et qu'au moins une demande a été créée dans la conversation, celle-ci passe en « Terminées ».
- Le bouton « Terminer » reste disponible pour fermer une conversation à la main.
- Si vous écrivez ensuite dans la conversation, elle se rouvre comme aujourd'hui.

### Comment vérifier
1. Dans l'onglet Agent, demandez une feature : une carte apparaît. Cliquez « Créer cette demande » : la demande est créée, la conversation affiche « Conversation terminée » et apparaît dans « Terminées ».
2. Avec une réponse qui propose deux cartes : créez la première, la conversation reste ouverte ; ignorez la seconde, elle passe en « Terminées ».
3. Ignorez une carte sans rien créer : la conversation reste ouverte.
4. Écrivez un message dans une conversation terminée : elle se rouvre.

# 506 · Afficher directement la carte de demande, sans demander « voulez-vous une fiche ? »

> Demande [#506](https://github.com/phoibe/factory/issues/506) · 2026-11-19

**En une phrase** : quand vous signalez dans le chat un manque ou un défaut, l'agent répond puis affiche tout de suite la carte « Créer cette demande » / « Ignorer », sans vous demander d'abord « Voulez-vous que j'en fasse une fiche ? ».

### Ce que j'ai décidé pour vous
- Le changement vaut aux deux endroits où l'agent répond : l'onglet Agent et la discussion du tableau.
- Une seule carte par sujet : si vous cliquez « Ignorer » ou dites non, l'agent ne la repropose pas dans la même conversation.
- Pas de carte pour une simple question (« est-ce que X existe ? ») quand rien ne manque ni ne cloche.
- Avant de proposer la carte, l'agent vérifie toujours qu'aucune demande ouverte ne traite déjà le sujet ; si c'est le cas, il vous le dit au lieu de proposer une carte.
- Rien ne change pour le reste : la carte ne crée rien tant que vous n'avez pas cliqué, les boutons du chat et les demandes explicites (« fais-moi une fiche bug ») marchent comme avant, au plus trois cartes par réponse.

### Ce qui change
L'agent ne pose plus la question « Voulez-vous une fiche ? » : il répond, puis place directement la carte sous sa réponse, avec une phrase pour vous inviter à la relire et cliquer si elle vous convient.

### Comment vérifier
1. Dans l'onglet Agent, écrivez par exemple « ça ne marche pas quand je … » : la réponse arrive avec la carte dessous, sans question en plus.
2. Même essai dans la discussion du tableau : même résultat.
3. Cliquez « Ignorer », puis reparlez du même sujet : pas de nouvelle carte.
4. Posez une simple question sur une fonction qui existe : pas de carte.

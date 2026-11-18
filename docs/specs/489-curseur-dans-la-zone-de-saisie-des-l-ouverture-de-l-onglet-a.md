# 489 · Curseur dans la zone de saisie dès l'ouverture de l'onglet Agent

> Demande [#489](https://github.com/phoibe/factory/issues/489) · 2026-11-18

Pas de questions : la demande était claire.

**En une phrase** : dès qu'on ouvre l'onglet « Agent », le curseur est dans la zone de saisie et on peut taper sa question tout de suite.

### Ce que j'ai décidé pour vous
- Sur ordinateur, le curseur se place dans la zone de saisie à chaque ouverture de l'onglet « Agent » (clic ou touche Entrée sur l'onglet ; avec les flèches du clavier, le curseur reste sur les onglets pour pouvoir passer de l'un à l'autre).
- Sur téléphone, rien ne change : placer le curseur ferait surgir le clavier et cacherait la moitié de l'écran, alors qu'on arrive d'abord sur la liste des conversations. C'est déjà la règle quand on choisit une conversation.
- Si le jeton de lecture n'est pas encore enregistré, le curseur se place dans le champ du jeton, puisque c'est la seule chose à remplir.
- Si une réponse de l'agent est en cours, le curseur se place quand même dans la zone de saisie : vous pouvez préparer votre message suivant.

### Ce qui change
- Ouvrir l'onglet « Agent » sur ordinateur met directement le curseur dans la zone de saisie, sans clic.

### Comment vérifier
1. Sur ordinateur, ouvrez le tableau sur l'onglet du tableau de suivi, puis cliquez sur l'onglet « Agent » : tapez directement une question, elle s'écrit dans la zone de saisie.
2. Revenez sur un autre onglet puis retournez sur « Agent » : le curseur est de nouveau dans la zone de saisie.
3. Sur téléphone, ouvrir l'onglet « Agent » ne fait pas apparaître le clavier.

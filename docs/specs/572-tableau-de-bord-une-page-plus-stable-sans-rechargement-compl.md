# 572 · Tableau de bord : une page plus stable, sans rechargement complet surprise

> Demande [#572](https://github.com/phoibe/factory/issues/572) · 2026-11-24

**En une phrase** : le tableau de bord ne se recharge plus jamais tout seul ; quand une nouvelle version est en ligne, un bandeau discret vous le dit et c'est vous qui rechargez, quand vous voulez.

### Ce que j'ai décidé pour vous

- Le bandeau est placé sous la barre du haut : il se voit donc sur les trois onglets (« Suivi », « Agent », « Paramètres »), dans les « Réglages généraux », sur téléphone, et même quand l'onglet « Agent » est en plein écran.
- Il est de couleur neutre, avec un bouton discret : le bleu reste réservé à ce qui attend votre réponse.
- Il n'a pas de croix : il reste affiché jusqu'à votre clic sur « Recharger ». Il n'y en a jamais qu'un seul, même si plusieurs versions arrivent entre-temps.
- Rien de ce que vous écrivez n'est perdu : tant qu'une saisie est en cours, le bouton ne recharge pas et vous dit quoi faire d'abord.
- Le titre de l'onglet du navigateur n'est plus touché que lorsque le nombre de cartes qui vous attendent change vraiment.
- Le message bref « elle se chargera dès que vous aurez enregistré » disparaît : le bandeau le remplace.

### Ce qui change

- **Plus aucun rechargement automatique.** Le tableau de bord continue de vérifier, toutes les minutes et à votre retour sur l'onglet, si une nouvelle version est en ligne. Mais il ne recharge plus la page de lui-même, que l'onglet soit regardé ou en arrière-plan.
- **Le bandeau.** Dès qu'une nouvelle version est repérée, il apparaît avec le texte « Une nouvelle version du tableau de bord est disponible. » et le bouton « Recharger ». Le reste de la page ne bouge pas : vos cartes, votre onglet, une liste que vous aviez dépliée restent tels quels.
- **Le bouton « Recharger ».** Un clic recharge la page, qui s'ouvre dans la nouvelle version, sans bandeau. Si quelque chose est en cours, la page n'est pas rechargée, le bandeau reste et un message bref vous dit pourquoi :
  - un réglage modifié mais pas enregistré (Paramètres du projet ou Réglages généraux) : « Enregistrez d'abord vos réglages, puis rechargez. » ;
  - un message en cours d'écriture ou des images en attente dans l'onglet « Agent » : « Envoyez ou effacez d'abord votre message, puis rechargez. » ;
  - une réponse de l'agent en train d'arriver : « Attendez la fin de la réponse de l'agent, puis rechargez. ».
- **Si vous rechargez la page vous-même** (touche de rechargement du navigateur), vous obtenez aussi la nouvelle version, et le bandeau n'a plus lieu d'être.
- **Le titre de l'onglet.** Il affiche toujours le nombre de cartes de « À vous de jouer » (« (2) Factory », ou « Factory » quand rien n'attend), mais il n'est réécrit que si ce nombre change. Il ne repasse donc plus par « Factory » sans raison. Seul moment où il le fait encore un court instant : quand vous rechargez vous-même la page.
- Le document de design est complété avec ce bandeau.

### Comment vérifier

1. Laissez le tableau de bord ouvert une journée où la factory livre plusieurs modifications : la page ne se recharge plus toute seule et le titre de l'onglet ne clignote plus.
2. Après une mise en ligne du tableau de bord, le bandeau « Une nouvelle version du tableau de bord est disponible. » apparaît sous la barre du haut en une minute environ (ou dès votre retour sur l'onglet), en couleur neutre, sans croix. Il est visible sur « Suivi », « Agent », « Paramètres », dans les « Réglages généraux » et sur téléphone.
3. Cliquez sur « Recharger » : la page se recharge et le bandeau a disparu.
4. Bandeau affiché, modifiez un réglage sans l'enregistrer puis cliquez sur « Recharger » : la page ne se recharge pas et le message « Enregistrez d'abord vos réglages, puis rechargez. » s'affiche. Enregistrez, recliquez : la page se recharge.
5. Même essai avec un message commencé dans l'onglet « Agent » : rien n'est perdu, le message « Envoyez ou effacez d'abord votre message, puis rechargez. » s'affiche.
6. Regardez le titre de l'onglet du navigateur pendant que le tableau se met à jour : il ne change que lorsqu'une carte arrive dans « À vous de jouer » ou en sort.

# 473 · Onglet Agent : largeur normale par défaut, avec un bouton plein écran

> Demande [#473](https://github.com/phoibe/factory/issues/473) · 2026-11-18
>
> Modifiée par la demande n° [#475](https://github.com/phoibe/factory/issues/475)

**En une phrase** : l'onglet Agent reprend la largeur des autres onglets, et un bouton à deux flèches le passe en vrai plein écran (toute la fenêtre sauf la barre du haut et la liste des projets), puis le ramène.

### Ce que j'ai décidé pour vous
- Pas de bouton sur téléphone : l'écran y est déjà entièrement occupé.
- La hauteur ne change pas : dans les deux modes, la conversation remplit la hauteur restante et la zone de saisie reste toujours visible.
- En plein écran, le cadre colle aux bords de la fenêtre (pas de marge ni de coins arrondis).
- Si vous changez de projet dans la liste de droite en plein écran, vous restez dans l'onglet Agent en plein écran, sur le nouveau projet.

### Ce qui change
- **Par défaut**, l'onglet Agent a la même largeur que Suivi et Paramètres, comme avant. Il s'ouvre toujours ainsi, même après un rechargement de la page (le plein écran n'est pas mémorisé).
- **Un bouton en haut de la conversation**, à côté des autres boutons : une petite icône à deux flèches qui s'écartent, infobulle « Plein écran ».
- **En plein écran**, la conversation prend toute la fenêtre sauf la barre du haut (logo Factory) et la liste des projets à droite. Le haut du projet (nom, boutons « Nouvelle fonctionnalité », « Plus »…, rangée d'onglets) est masqué. La liste des conversations reste à gauche ; les messages restent dans leur colonne de lecture centrée, de la même largeur qu'aujourd'hui.
- **Pour revenir**, on reclique sur le bouton (ses flèches se resserrent, infobulle « Largeur normale ») ou on appuie sur Échap.
- Le reste de la dernière mise à jour (boutons copier, couleurs, temps d'attente, zoom sur les images) ne change pas. La règle « pleine largeur » du design validé est remplacée par celle-ci.

### Comment vérifier
1. Ouvrez un projet, onglet Agent : la conversation a la même largeur que l'onglet Suivi.
2. Cliquez sur le bouton à deux flèches : seuls la barre du haut et la liste des projets restent visibles, la conversation occupe tout le reste, la zone de saisie est visible en bas.
3. Appuyez sur Échap : retour à la largeur normale, avec le nom du projet et les onglets. Refaites-le avec le bouton : même résultat.
4. Passez en plein écran, cliquez sur un autre projet à droite : vous êtes sur son onglet Agent, toujours en plein écran.
5. Passez en plein écran puis rechargez la page : l'onglet Agent revient à la largeur normale.
6. Sur téléphone : pas de bouton, la conversation occupe l'écran comme aujourd'hui.

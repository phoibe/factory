# 591 · Connexion : afficher un message si l'ouverture du projet échoue

> Demande [#591](https://github.com/phoibe/factory/issues/591) · 2026-11-25

Pas de questions : la demande était claire.

**En une phrase** : quand vous vous connectez en collant votre jeton et que l'ouverture du projet échoue ensuite, un petit message d'erreur s'affiche, le même qu'à l'ouverture automatique de la page.

### Ce que j'ai décidé pour vous
- Le message est exactement celui de l'ouverture automatique au chargement de la page (par exemple « Connexion perdue, réessayez. » ou « Une erreur est survenue, réessayez. »), sans nouveau texte.
- Il apparaît en petit message temporaire en bas de l'écran, pas sous le champ du jeton : à ce moment-là, le projet est déjà affiché.
- Votre jeton reste enregistré : vous n'avez pas à le recoller.
- Le reste ne change pas : un jeton refusé par GitHub affiche toujours son message sous le champ de l'écran de connexion, et une coupure pendant la lecture de la liste des projets affiche toujours « Connexion impossible pour l'instant. Nouvel essai dans 15 s. ».

### Ce qui change
Aujourd'hui, une panne pendant l'ouverture du premier projet juste après la connexion passe inaperçue : rien ne s'affiche. Désormais elle est signalée comme au chargement de la page. Ce cas est rare (le tableau des demandes signale déjà lui-même ses coupures avec sa carte « Connexion perdue ») : il s'agit des autres accidents à l'ouverture.

### Comment vérifier
1. Déconnectez-vous, puis collez votre jeton et validez : le projet s'ouvre normalement, sans message, comme avant.
2. La panne elle-même est difficile à provoquer de votre côté : un test automatique la simule et vérifie que le petit message apparaît bien après la connexion, avec le même texte qu'au chargement de la page.

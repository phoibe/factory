# 570 · Review générale : faire relire le code par le moteur « Revue »

> Demande [#570](https://github.com/phoibe/factory/issues/570) · 2026-11-24

**En une phrase** : une cinquième ligne dans les Réglages généraux, « Relectures d'une review générale », vous laisse choisir le moteur qui relit le code partie par partie pendant une review générale, sans toucher au moteur qui écrit le code ; elle est sur Opus au départ.

### Ce que j'ai décidé pour vous

- Ces relectures réfléchissent longuement, comme le rôle « Revue », quel que soit le moteur choisi. C'est la seule chose qui change sans que vous touchiez à rien : elles restent sur Opus, mais réfléchissent plus longuement qu'aujourd'hui, donc une review générale peut durer et coûter un peu plus.
- Si une de ces relectures échoue deux fois de suite, elle repart sur le moteur du réglage « Revue », comme le font déjà les autres agents qui échouent.
- Sur une petite appli relue d'un seul bloc, cette unique relecture suit aussi le nouveau réglage.
- Les phrases d'aide des quatre autres lignes ne changent pas, ni le paragraphe sur l'agent qui pilote.
- Le document de design est mis à jour : le bloc « Modèles » a cinq lignes au lieu de quatre.

### Parcours

**1. Ouvrir les Réglages généraux.** Rien ne change pour y arriver : le bouton « Réglages généraux » de la barre du haut.

**2. Bloc « Modèles ».** Il compte maintenant cinq lignes, dans cet ordre :
- Plans et organisation
- Écriture du code
- Revue
- **Relectures d'une review générale** (nouvelle), avec la phrase d'aide : « Relit le code de chaque partie de l'appli pendant une review générale. La synthèse reste faite par « Revue ». »
- Tâches simples

La nouvelle ligne a la même présentation que les autres : son nom en gras, sa phrase d'aide en gris, puis la même liste de moteurs (Fable, Opus, Sonnet, Haiku, chacun avec sa version du moment). Elle est sur **Opus** tant que vous n'y touchez pas.

**3. Choisir et enregistrer.** Vous choisissez un moteur dans la liste, puis « Enregistrer », comme pour les autres lignes. Le choix vaut pour toutes vos reviews générales, sur tous vos projets.

**4. Lancer une review générale.** Le bouton « Review générale » ne change pas : une simple confirmation, aucun choix à faire. Pour une review particulière, vous changez la ligne dans les Réglages généraux avant de lancer.

### Règles et cas limites

- Le réglage ne porte que sur les relectures partie par partie (une par grande partie de l'appli, lancées en même temps, comme aujourd'hui). La synthèse de ces relectures et la relecture des corrections restent sur le réglage « Revue » ; les corrections restent écrites par « Écriture du code ».
- Rien d'autre ne change de moteur : les petites relectures de chaque tâche pendant une construction, la critique du design et l'amélioration UI restent sur « Écriture du code » ; la relecture finale avant chaque PR et la revue de sécurité restent sur « Revue ».
- Un seul réglage pour toute la factory, pas de choix projet par projet.
- Un changement sert dès le lancement suivant ; il ne touche pas une review générale déjà en train de tourner.
- Sur chaque projet, le nouveau réglage sert dès la review générale qui suit sa mise à jour habituelle par la factory. D'ici là, ses relectures se font comme aujourd'hui.
- Tant que vous n'avez rien enregistré, la ligne est sur Opus. Si le moteur choisi disparaît un jour de la liste, elle revient à Opus.
- Le journal de la PR d'une review générale continue d'indiquer combien d'agents ont tourné sur chaque moteur : c'est là que vous voyez l'effet de votre choix.

### Hors périmètre

- Choisir le moteur à chaque lancement d'une review générale (une fenêtre au moment du clic).
- Un réglage qui commanderait aussi la synthèse et la relecture des corrections.
- Régler le temps de réflexion de chaque ligne.
- Des réglages différents d'un projet à l'autre.

### Comment vérifier (sur la preview)

1. Ouvrez « Réglages généraux » : le bloc « Modèles » montre cinq lignes, et « Relectures d'une review générale » est juste sous « Revue », avec sa phrase d'aide.
2. Sans rien avoir touché, cette ligne est sur Opus. Les quatre autres lignes ont gardé leur moteur.
3. Sa liste propose les mêmes moteurs que les autres lignes, avec leur version du moment.
4. Choisissez Fable sur cette ligne, enregistrez, rechargez la page : le choix est conservé, et les autres lignes n'ont pas bougé. Remettez Opus et enregistrez si vous voulez rester comme aujourd'hui.
5. Sur téléphone, la nouvelle ligne s'affiche comme les autres, sur une colonne.
6. Après la livraison, à la prochaine review générale d'un projet : le journal de sa PR montre les relectures sur le moteur de cette ligne, et la synthèse sur celui de « Revue ».

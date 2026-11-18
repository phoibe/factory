# 466 · Tenir à jour la page de présentation (readme) des projets

> Demande [#466](https://github.com/phoibe/factory/issues/466) · 2026-11-18

**En une phrase** : la page de présentation (readme) de chaque projet est écrite en français, suit les usages recommandés par GitHub, et est tenue à jour à chaque feature livrée pour décrire l'appli telle qu'elle est.

### Ce que j'ai décidé pour vous
- La présentation contient, dans cet ordre : à quoi sert l'appli, l'adresse du site en ligne, une capture de la page d'accueil, ce qu'on peut y faire (les features livrées), puis comment la lancer et la tester, et la licence si le projet en a déjà une.
- Elle reste courte : une page qu'on lit en une minute, pas une documentation.
- Elle est relue à chaque feature livrée et modifiée seulement si quelque chose de visible a changé ; aucune PR n'est bloquée pour ça.
- La présentation de la factory elle-même n'est pas concernée.

### Ce qui change
- **Au démarrage d'un nouveau projet** : l'agent écrit la présentation directement en français, selon le plan ci-dessus (les commandes techniques restent telles quelles).
- **À chaque feature livrée** : l'agent relit la présentation dans la même PR, comme il le fait déjà pour la fiche produit, la fiche technique et le design. Si la feature ajoute ou change quelque chose de visible (une nouvelle possibilité, la page d'accueil qui change d'apparence, l'adresse du site), il la met à jour, capture d'accueil comprise.
- **Projets déjà en route** : à leur prochaine feature livrée, la présentation est remise à niveau d'un coup (traduite en français, complétée selon le plan), sans demande à part de votre côté.
- **Licence** : l'agent n'en ajoute jamais de lui-même ; il la mentionne seulement si le projet en a déjà une (décision notée).

### Hors périmètre
- Choisir ou ajouter une licence.
- La présentation de la factory elle-même.
- Une demande à part pour remettre à niveau les projets existants (cela se fait à leur prochaine feature).

### Comment vérifier
- Sur la prochaine feature livrée d'un projet, la PR contient une présentation en français, avec à quoi sert l'appli, l'adresse du site, une capture de l'accueil, la liste de ce qu'on peut faire, et comment la lancer.
- Sur un projet sans licence, aucune licence n'apparaît.
- Les contrôles automatiques de cette PR passent (un test vérifie que les consignes envoyées aux projets contiennent bien ces règles).

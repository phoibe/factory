# 399 · Panneau plus économe en lectures GitHub

> Demande [#399](https://github.com/phoibe/factory/issues/399) · 2026-11-13

**En une phrase** : le panneau s'ouvre plus vite et consomme moins de lectures GitHub, en se souvenant de la liste de vos projets au lieu de relire la configuration de chaque dépôt à chaque ouverture.

### Ce qui change
- À l'ouverture, le panneau affiche tout de suite la liste de projets qu'il a vue la dernière fois sur cet appareil, puis la vérifie en arrière-plan. Les dépôts dont la configuration n'a pas changé ne sont plus comptés par GitHub dans sa limite horaire.
- Un projet créé, supprimé ou archivé depuis la dernière visite apparaît ou disparaît de la liste quelques secondes après l'ouverture, sans recharger la page.
- Le suivi des modifications à mettre en production garde son rythme actuel : j'ai vérifié, GitHub ne le compte déjà pas quand rien n'a changé. Je m'assure seulement qu'aucune autre lecture de cette partie ne passe à côté de cette économie.
- Rien ne change à l'écran : mêmes projets, mêmes cartes, mêmes boutons.

### Comment vérifier
- Ouvrez le panneau deux fois de suite : la seconde fois, la liste des projets s'affiche immédiatement.
- Tous vos projets sont toujours là, et le bouton « Mise en production » se met à jour comme avant.

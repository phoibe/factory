# 462 · Nouveau bouton « Amélioration UI » : 3 critiques design et corrections

> Demande [#462](https://github.com/phoibe/factory/issues/462) · 2026-11-18

**En une phrase** : un nouveau bouton « Amélioration UI » sur le tableau de chaque projet lance jusqu'à 3 tours de critique design de tous les écrans de l'appli, avec à chaque tour la correction de tout ce qui a été trouvé, puis des captures avant/après à valider.

### Ce que j'ai décidé pour vous
- Le bouton se trouve dans le même menu que « Review générale », sur le tableau de chaque projet.
- Un clic demande une confirmation : « Lancer une amélioration de l'interface ? ».
- La carte créée s'appelle « Amélioration UI » et démarre directement, sans questions ni spec à valider.
- Le résumé de la PR donne la note de la première et de la dernière critique.

### Parcours
1. **Tableau** : vous ouvrez le menu (celui de « Review générale ») et cliquez sur « Amélioration UI ». Une confirmation s'affiche ; vous acceptez.
2. **Carte** : une carte « Amélioration UI » apparaît et passe directement en construction.
3. **Travail de l'agent** :
   - il fait la liste de tous les écrans de l'appli, y compris leurs états vide, erreur et chargement, et la version téléphone ;
   - **tour 1** : critique design complète de tous ces écrans, puis correction de tout ce qu'elle a trouvé ;
   - **tours 2 et 3** : nouvelle critique complète, nouvelles corrections ; si un tour ne trouve plus aucun problème, il s'arrête là.
4. **PR** : vous recevez les captures avant/après de chaque écran modifié, avec en tête du résumé la note de la première et de la dernière critique, le nombre de tours faits et, s'il y en a, les changements du design validé du projet, signalés clairement.
5. **Validation** : votre « ok » sur les captures vaut recette, comme d'habitude.

### Règles et cas limites
- 3 tours au plus ; arrêt anticipé dès qu'une critique ne trouve plus rien.
- Seulement l'apparence et la clarté des écrans : mise en page, lisibilité, textes affichés, états vide / erreur / chargement, confort sur téléphone.
- Le design validé du projet peut être modifié si une correction l'exige ; c'est alors annoncé en haut de la PR, et vous pouvez le refuser au moment des captures.
- Si une critique révèle un vrai manque fonctionnel, l'agent n'y touche pas : il en fait une idée dans « Idées à trier ».
- Un projet sans aucun écran : la demande s'arrête avec un message clair au lieu d'une PR vide.

### Hors périmètre
- Revue du code, de l'architecture ou des parcours (c'est le rôle de « Review générale »).
- Nouvelles fonctionnalités.

### Comment vérifier sur la preview
- Le menu du tableau montre « Amélioration UI » à côté de « Review générale ».
- Un clic affiche la confirmation ; « Annuler » ne crée rien.
- Après confirmation, une carte « Amélioration UI » apparaît et démarre seule.
- Sur un projet, la PR obtenue contient les captures avant/après, les notes de la première et de la dernière critique et le nombre de tours.

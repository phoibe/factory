# 561 · Tableau de bord : après une mise à jour, tout charger dans la même version

> Demande [#561](https://github.com/phoibe/factory/issues/561) · 2026-11-24

**En une phrase** : à chaque publication du tableau de bord, tous ses fichiers sont marqués automatiquement du numéro de cette publication, pour que votre navigateur les charge toujours tous dans la même version, sans aucun numéro à tenir à la main.

### Ce que j'ai constaté

- Le tableau de bord est fait d'une trentaine de fichiers. Votre navigateur garde chacun en mémoire jusqu'à 10 minutes (c'est l'hébergeur qui le veut), sauf si l'adresse du fichier porte un numéro qui a changé.
- Ce numéro est aujourd'hui tenu à la main, fichier par fichier. Résultat : 13 des 23 parties du programme n'en ont aucun, tout comme les données lues au démarrage (catalogue des skills, réglages par défaut), et une partie est appelée tantôt avec, tantôt sans numéro (elle est donc chargée deux fois).
- Conséquence : après une mise à jour, la page se recharge bien toute seule, mais elle peut assembler des fichiers neufs avec des anciens pendant une dizaine de minutes. Au mieux l'affichage est incohérent ; au pire le tableau de bord peut ne pas démarrer du tout, et recharger la page n'y change rien tant que la mémoire du navigateur n'a pas expiré.

### Ce qui change

- À chaque publication, la factory marque elle-même tous les fichiers du tableau de bord avec le numéro de cette publication : le programme et toutes ses parties, l'apparence, et les données lues au démarrage.
- C'est le même numéro que celui qui sert déjà au tableau de bord pour savoir qu'une nouvelle version est en ligne : un seul repère pour tout.
- Les numéros tenus à la main disparaissent. Plus personne n'a à penser à les changer.

### Ce qui se passe après une mise à jour

1. Une nouvelle version du tableau de bord est publiée.
2. Votre tableau de bord ouvert s'en aperçoit et se recharge, exactement comme aujourd'hui.
3. Nouveau : au rechargement, tout arrive dans la nouvelle version, d'un bloc. Plus de mélange entre l'ancien et le neuf.

### Règles

- **Aucun changement visible** : mêmes écrans, mêmes textes, mêmes boutons, sur ordinateur comme sur téléphone. Il n'y a donc pas de captures avant/après à valider.
- **Jamais de mélange après un rechargement** : une fois la page rechargée, tous les fichiers viennent de la même publication.
- **Un oubli ne peut plus passer** : un contrôle automatique refuse une modification si un fichier du tableau de bord échappe au marquage, ou si un numéro tenu à la main réapparaît. Cela vaut aussi pour les fichiers ajoutés plus tard (par exemple par le découpage du tableau de bord, demande #560).
- **La version publiée est essayée pour de vrai** : un test ouvre, dans un vrai navigateur, le tableau de bord tel qu'il sera publié, et vérifie qu'il démarre et que tous ses fichiers sont demandés avec le même numéro.
- **Pas plus lent** : votre navigateur ne retélécharge les fichiers qu'une fois par publication, puis les garde en mémoire comme avant. Les polices d'écriture et les icônes, qui ne changent pas d'une version à l'autre, ne sont pas retéléchargées.
- **Cas limite** : si votre navigateur a gardé l'ancienne page d'entrée elle-même (10 minutes au plus), vous pouvez voir encore un moment l'ancienne version avant qu'elle se recharge. Dans tous les cas, un simple rechargement de la page suffit désormais à tout remettre dans la nouvelle version (aujourd'hui, il faut attendre 10 minutes).
- Les copies de travail du tableau de bord (tests, essais avant publication) continuent de fonctionner sans numéro.
- L'adresse du tableau de bord ne change pas, et vos projets n'ont rien à mettre à jour.

### Hors périmètre

- Quand et comment la page se recharge après une mise à jour (rechargement surprise, bandeau « Nouvelle version disponible ») : c'est la demande #572.
- Le découpage du code du tableau de bord : c'est la demande #560.
- La durée de 10 minutes pendant laquelle le navigateur garde les fichiers : elle est fixée par l'hébergeur.
- Les sites de vos autres projets : seul le tableau de bord de la factory est concerné.

### Comment vérifier

- Les contrôles automatiques de la PR sont au vert, avec les deux nouveaux : « aucun fichier n'échappe au marquage » et « le tableau de bord tel qu'il sera publié démarre, tout dans la même version ».
- Une fois la modification en ligne, votre tableau de bord se recharge tout seul. Faites le tour habituel, tout doit marcher comme avant : les cartes de « Suivi », un message dans « Agent », « Paramètres », « Réglages généraux », et « Sur mon téléphone » (le code à scanner s'affiche).
- Aux mises à jour suivantes : plus d'affichage bizarre qui se répare tout seul dix minutes plus tard. En cas de doute, rechargez la page une fois : tout doit être d'aplomb.

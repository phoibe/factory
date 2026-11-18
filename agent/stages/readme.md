# Guide : la présentation du projet (README)

Ce n'est pas une étape à part : `foundation.md` (nouveau projet) et `build.md` (chaque feature livrée) t'envoient ici.
`README.md`, à la racine, est la page que GitHub affiche en premier sur le dépôt. Elle décrit l'appli **telle
qu'elle est aujourd'hui**, en suivant les usages recommandés par GitHub (à quoi sert le projet, comment l'utiliser,
où le trouver, sous quelle licence).

**Pas pour la factory elle-même** : si le `repo` du payload est le même dépôt que `factory`, ne touche pas à sa
présentation.

## Règles

- **Écrite en français**, vouvoiement, simple, comme la fiche produit. Les commandes, noms de fichiers et blocs de
  code restent tels quels.
- **Courte** : une page qu'on lit en une minute, pas une documentation. Pas de liste de fichiers ni d'explication
  du code.
- **N'invente rien** : chaque phrase se vérifie dans le projet (`PRODUCT.md`, `docs/specs/`, `STACK.md`, le code,
  les scripts de `package.json` ou équivalent, la configuration d'hébergement).
- **Licence** : tu n'ajoutes jamais de licence de toi-même (ni fichier `LICENSE`, ni mention) : c'est un choix
  juridique du propriétaire. Si le projet en a déjà une, la partie « Licence » la nomme en une ligne ; sinon,
  pas de partie « Licence ».

## Modèle

Les titres `##` sont dans cet ordre ; saute seulement une partie qui n'a pas lieu d'être.

```markdown
# <Nom de l'appli>

<Une ou deux phrases : ce qu'elle fait et pour qui.>

## À quoi sert <nom>

<Le besoin qu'elle règle, en 2 à 4 phrases, d'après `PRODUCT.md`.>

## Adresse

<Le lien du site en ligne. Pas encore en ligne : « Pas encore en ligne. » ; pas de site (outil en ligne de commande,
appli à installer) : où la récupérer.>

![Page d'accueil de <nom>](docs/readme/accueil.png)

## Ce que vous pouvez faire

- <Une ligne par possibilité livrée, du point de vue de l'utilisateur (d'après `docs/specs/` et l'appli réelle).>

## Lancer et tester

<Ce qu'il faut installer, puis les commandes exactes pour lancer l'appli en local et lancer les tests.>

## Licence

<Seulement si le projet en a déjà une : son nom, avec un lien vers le fichier.>
```

**Adresse** : prends-la dans les réglages du dépôt (`gh api repos/<repo> --jq .homepage`), sinon dans les
déploiements ou la configuration d'hébergement ; ne l'invente jamais.

**Capture d'écran** de la page d'accueil, sous l'adresse : une image du dépôt (`docs/readme/accueil.png`, lien
relatif pour qu'elle s'affiche sur GitHub). Ne la prends pas à part : c'est la capture « après » de la page
d'accueil (taille ordinateur, thème clair) que l'étape des captures copie pour toi (`screenshots.md`), donc prise
après la passe design et refaite après chaque retouche demandée. Si l'étape des captures est désactivée, ou que
l'appli n'a pas de page d'accueil (outil sans interface), pas de capture.

## Quand la mettre à jour

- **Nouveau projet** : écris-la entière au modèle ci-dessus.
- **Chaque feature livrée** : relis-la dans la même PR. Mets-la à jour seulement si quelque chose de visible a
  changé : une possibilité ajoutée, modifiée ou retirée, la page d'accueil qui change d'apparence (nouvelle
  capture), l'adresse du site, la façon de lancer ou de tester. Sinon, ne la touche pas.
- **Présentation pas encore au modèle** (en anglais, technique, parties manquantes) : à la première feature livrée,
  remets-la entièrement au modèle, d'un coup, sans demander.
- Rien de tout ça ne bloque une PR : aucun contrôle ne vérifie la présentation.

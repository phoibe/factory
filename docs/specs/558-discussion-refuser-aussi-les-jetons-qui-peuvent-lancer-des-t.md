# 558 · Discussion : refuser aussi les jetons qui peuvent lancer des tâches ou changer les réglages

> Demande [#558](https://github.com/phoibe/factory/issues/558) · 2026-11-24

**En une phrase** : la discussion avec l'agent refuse désormais aussi un jeton qui peut lancer des tâches automatiques, changer les réglages, les secrets ou la mise en ligne d'un projet, ou ajouter une clé de connexion à votre compte, ainsi que tout jeton de l'ancien type.

### Ce que j'ai décidé pour vous
- Pour les nouveaux droits repérés, le message de refus reste celui d'aujourd'hui : « Ce jeton peut modifier vos projets : créez-en un en lecture seule avec le bouton ci-dessus. »
- La vérification se fait aux deux mêmes moments qu'aujourd'hui : quand vous collez le jeton, puis à chaque message. Si votre jeton actuel a un droit en trop, l'onglet « Agent » vous en redemande un.
- Si GitHub ne répond pas clairement pendant la vérification, le jeton n'est pas accepté et vous voyez « GitHub ne répond pas, réessayez dans un instant. », comme aujourd'hui.
- Est refusé comme « ancien type » tout jeton qui n'est pas du nouveau type : les jetons « classic », mais aussi ceux fabriqués par d'autres outils. Le type se reconnaît tout de suite, avant le moindre essai.
- Si vous collez par erreur votre jeton complet, le message reste celui d'aujourd'hui (« Ce jeton peut modifier vos projets… »).
- « Toucher à la mise en ligne » couvre le site lui-même et les annonces de mise en ligne faites sur le projet.
- La fiche produit est mise à jour pour dire ce que la discussion refuse désormais.

### Ce qui change
1. **Le type du jeton d'abord.** Un jeton de l'ancien type est refusé avec : « Ce type de jeton n'est pas accepté : créez-en un avec le bouton ci-dessus. » Le jeton créé avec le bouton est toujours du nouveau type : rien ne change pour lui.
2. **De nouveaux essais, toujours vides.** En plus des trois essais d'aujourd'hui (un fichier, une demande, une proposition de modification), un jeton est refusé s'il peut :
   - lancer, relancer ou arrêter des tâches automatiques ;
   - changer les réglages du projet (jusqu'à le supprimer ou y inviter quelqu'un) ;
   - changer ses secrets ou ses variables ;
   - brancher une adresse extérieure qui reçoit tout ce qui se passe sur le projet ;
   - toucher à la mise en ligne du site ;
   - poser une fausse coche verte sur une modification ;
   - ajouter une clé de connexion à votre compte GitHub.

   Chaque essai demande à GitHub quelque chose d'impossible à enregistrer (une clé sans clé, une variable sans nom, une adresse sans adresse…). GitHub le refuse aussitôt à un jeton de lecture ; s'il ne le refuse pas pour cette raison, le jeton est écarté. Rien n'est jamais écrit. Cela fait une dizaine d'essais au lieu de trois, lancés en même temps, donc sans attente visible.
3. **Ce que la vérification ne voit pas** (comme promis) :
   - Le droit de toucher à la mise en ligne du site, et celui de changer les secrets et variables propres à cette mise en ligne, ne se repèrent que si le projet ouvert a un site publié par GitHub (c'est le cas de la factory). Sur un projet sans site, il n'y a rien sur quoi faire l'essai : un jeton qui n'aurait que ce droit en trop y passerait, et serait refusé dès que vous discutez sur un projet qui a un site.
   - Deux sortes de secrets à part ne sont pas vérifiées : ceux réservés aux mises à jour automatiques des dépendances (Dependabot) et ceux des espaces de développement en ligne de GitHub (Codespaces). Je n'ai pas trouvé d'essai dont je sois certain qu'il n'écrit rien. Les tâches habituelles de vos projets ne peuvent pas lire ces secrets.
   - Les droits sans effet sur le code, les tâches, les réglages ou la mise en ligne ne sont pas vérifiés : par exemple classer une alerte de sécurité, ou, sur votre compte, le profil, les favoris et les abonnements.

   Pour le reste, avec le nouveau type de jeton, les droits sont les mêmes sur tous les projets que le jeton couvre : vérifier sur le projet ouvert suffit.

### Comment vérifier
Pendant la préparation, je n'ai pas pu essayer pour de vrai ce que GitHub répond à un jeton qui a réellement ces droits (il aurait fallu en créer) : c'est votre vérification, avec de vrais jetons, qui en fait la preuve. Pour revoir la carte du jeton de lecture : « Se déconnecter », reconnectez-vous, puis ouvrez l'onglet « Agent ».
1. Avec votre jeton de lecture actuel (créé avec le bouton), la discussion marche comme avant, sans rien recoller.
2. Créez un jeton de l'ancien type sur GitHub ([cette page](https://github.com/settings/tokens/new)), sans cocher aucun droit, et collez-le : il est refusé avec « Ce type de jeton n'est pas accepté : créez-en un avec le bouton ci-dessus. »
3. Créez un jeton du nouveau type ([cette page](https://github.com/settings/personal-access-tokens/new)) avec « All repositories », « Contents : Read-only » et, en plus, « Actions : Read and write », puis collez-le : il est refusé avec « Ce jeton peut modifier vos projets… ». Vous pouvez refaire l'essai avec « Administration », « Secrets », « Variables », « Webhooks », « Commit statuses » ou « Pages » (pour « Pages », en étant sur le projet factory, qui a un site), et, côté compte, « Git SSH keys ».
4. Créez un jeton avec le bouton de la carte : il est accepté et la discussion s'ouvre.
5. Supprimez ensuite les jetons d'essai sur GitHub.

<details>
<summary>Notes techniques pour la construction (rien à lire pour vous)</summary>

Faits vérifiés dans la documentation publique de GitHub (schéma REST 2026-03-10), sans aucun appel d'écriture.

- **Type** : nouveau type = préfixe `github_pat_` ; `ghp_` = classic, `gho_`/`ghu_`/`ghs_` = autres outils. N'accepter que `github_pat_`, côté panneau et côté serveur, avant tout appel. En renfort : refuser si la réponse de `GET /user` porte l'en-tête `X-OAuth-Scopes` (lisible depuis le navigateur). Le serveur renvoie un code distinct de `writable`.
- **Essais** (corps `{}`, même règle de lecture des réponses qu'aujourd'hui) ; droit du jeton → appel → champ obligatoire manquant :
  - Actions → `PUT /repos/{repo}/actions/oidc/customization/sub` (`use_default`), ou `POST …/actions/workflows/{fichier existant}/dispatches` (`ref`) ;
  - Administration → `POST /repos/{repo}/keys` (`key`) ;
  - Secrets → `PUT /repos/{repo}/actions/secrets/{nom}` (`encrypted_value`, `key_id`) ;
  - Variables → `POST /repos/{repo}/actions/variables` (`name`, `value`) ;
  - Environments → `POST /repos/{repo}/environments/github-pages/variables` (`name`, `value`) ; sans cet environnement, 404 ;
  - Webhooks → `POST /repos/{repo}/hooks` (pas d'adresse) ;
  - Pages → `POST /repos/{repo}/pages/deployments` (`pages_build_version`, `oidc_token`). Jamais `POST …/pages/builds` : sans corps, il relance vraiment une publication ;
  - Deployments → `POST /repos/{repo}/deployments` (`ref`) ;
  - Commit statuses → `POST /repos/{repo}/statuses/{sha}` (`state`), de préférence avec un vrai `sha` ;
  - Git SSH keys (compte) → `POST /user/keys` (`key`).
- **Non essayés** : secrets Dependabot et Codespaces (`encrypted_value` n'est pas obligatoire dans le schéma : aucune certitude qu'une demande vide soit refusée). Les « check runs » ne sont pas ouverts aux jetons personnels.
- **Limites de GitHub** : une dizaine d'appels d'écriture par message. Si GitHub freine (403 avec `retry-after`, 429), garder le comportement actuel : jeton non accepté, « GitHub ne répond pas… ».
- **Pas vérifié en vrai** : la réponse exacte de GitHub (422 attendu) à un jeton qui a chacun de ces droits.
</details>

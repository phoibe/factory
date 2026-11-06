# Serveur de dev : faire tourner les tâches de vos projets privés sur votre machine

Les tâches automatiques de la factory (tri des demandes, vérification toutes les 5 minutes, contrôles, vérification
des aperçus et de la mise en ligne) d'un **projet privé** tournent sur votre serveur de dev quand ses runners sont
connectés à GitHub, et repassent toutes seules sur les machines GitHub quand il est éteint ou déconnecté. Vous
économisez ainsi votre quota GitHub. Les projets publics restent toujours sur les machines GitHub (gratuites pour eux).

Deux choses à faire :

1. **Une seule fois** : créer la clé d'accès qui permet à la factory de voir si le serveur est connecté et de
   basculer d'une machine à l'autre (5 minutes).
2. **Pour chaque projet privé** : installer ses runners sur le serveur, avec une seule commande (5 minutes la
   première fois, 1 minute pour chaque projet suivant).

Un « runner », c'est un petit programme qui attend sur votre serveur et exécute les tâches du projet. Chaque projet
privé en a **2** sur le serveur, pour qu'une tâche n'attende pas la fin d'une autre.

## 1. Créer la clé d'accès des runners (une seule fois)

1. Ouvrez <https://github.com/settings/personal-access-tokens/new>.
2. **Token name** : `factory runners`. **Expiration** : 1 an (la factory vous prévient une semaine avant la fin).
3. **Repository access** : « Only select repositories », puis cochez vos projets privés (pensez à ajouter les
   nouveaux plus tard ; un projet que la clé ne voit pas reste simplement sur les machines GitHub).
4. **Repository permissions** :
   - **Administration** : Read-only (voir si les runners du serveur sont connectés) ;
   - **Variables** : Read and write (noter dans chaque projet « serveur » ou « GitHub ») ;
   - **Actions** : Read and write (relancer sur GitHub les tâches coincées sur le serveur éteint) ;
   - **Contents** : Read-only (lire le réglage de chaque projet) ;
   - « Metadata » est cochée d'office.
5. **Generate token**, puis copiez la clé.

Ouvrez ensuite <https://github.com/phoibe/factory/settings/secrets/actions>, **New repository secret** :
nom `FACTORY_RUNNERS_TOKEN`, valeur : la clé copiée. C'est tout.

## 2. Installer les runners d'un projet privé

### Ce qu'il vous faut

- Un terminal ouvert sur votre serveur de dev (par exemple depuis votre Mac, comme d'habitude avec Tailscale).
- Votre mot de passe du serveur : la commande peut vous le demander pour installer des logiciels.
- Le nom du projet privé (par exemple `mon-appli`).

Rien à ouvrir ni à régler sur le serveur : il reste derrière Tailscale. Les runners vont eux-mêmes chercher leur
travail chez GitHub.

### La commande

Copiez cette ligne dans le terminal du serveur, remplacez `mon-appli` par le nom de votre projet, puis appuyez sur
Entrée :

```
bash <(curl -fsSL https://raw.githubusercontent.com/phoibe/factory/stable/scripts/dev-server.sh) mon-appli
```

Les outils Mac « Nouveau projet » et « Adopter un projet » vous donnent cette commande déjà remplie à la fin, pour
un projet privé : il suffit de la coller.

Si vous ne mettez pas de nom de projet, la commande vous montre la liste de vos projets privés de la factory et vous
choisissez par numéro.

### Ce que fait la commande

1. **La première fois seulement**, la commande vous demande de vous connecter à GitHub : elle affiche un code.
   Appuyez sur Entrée, ouvrez https://github.com/login/device sur votre Mac ou votre téléphone, tapez le code,
   validez. Ensuite elle installe les logiciels
   dont les tâches ont besoin, y compris ceux des contrôles qui ouvrent un navigateur. Cela prend quelques minutes.
2. Elle regarde les runners que le projet a déjà, et **ajoute seulement ce qui manque** pour arriver à 2.
3. Elle fait démarrer les runners tout seuls à chaque redémarrage du serveur. Les nouveaux runners tournent sous
   un compte à part du serveur, qui n'a pas accès à votre connexion GitHub.
4. Elle affiche « C'est prêt » avec le lien pour vérifier.

### Vérifier que ça marche

Ouvrez la page des runners du projet (remplacez `mon-appli`) :
`https://github.com/phoibe/mon-appli/settings/actions/runners`

Vous devez y voir 2 runners avec un point vert et le mot **« Idle »** : ils sont connectés et attendent du travail.
Quand une tâche tourne, ils affichent « Active ».

Au plus tard 15 minutes après, le panneau (onglet « Paramètres », section « Machine des tâches ») affiche
« Serveur de dev : en ligne » pour ce projet.

## Ce qui se passe ensuite

- Toutes les 15 minutes, la factory demande à GitHub si les runners de chaque projet privé sont connectés (votre
  serveur, derrière Tailscale, n'a rien à ouvrir).
- Serveur éteint ou déconnecté : le projet passe sur les machines GitHub, les tâches coincées sur le serveur sont
  annulées puis relancées sur GitHub, et vous recevez une notification. Il revient sur le serveur, avec une
  notification, dès qu'il est de nouveau connecté : rien ne reste bloqué.
- Serveur allumé mais occupé : les tâches attendent leur tour sur le serveur.
- Sans clé, clé expirée ou refusée : tout reste sur les machines GitHub, et le panneau affiche « clé d'accès
  manquante ». Une clé qui expire alors qu'un projet est sur le serveur ne peut plus le remettre sur GitHub : d'où
  l'alerte une semaine avant l'expiration.

## Questions fréquentes

**Le projet avait déjà un runner sur le serveur.** Il est gardé tel quel et réutilisé. La commande lui ajoute
seulement l'étiquette de la factory et le démarrage automatique, puis installe ce qui manque pour arriver à 2
(un seul runner de plus s'il y en avait un).

**Un runner qui n'est pas sur ce serveur (un ancien, ou sur une autre machine) ?** La commande le laisse tel quel chez
GitHub, mais ne le compte pas : elle installe 2 runners sur le serveur. Vous pouvez le supprimer depuis la page des runners.

**Je ne sais plus si je l'ai déjà lancée.** Relancez-la sans crainte : elle ne change rien si tout est déjà en place,
et le dit (« Rien à ajouter »).

**Un projet public ?** La commande refuse : un projet public n'a jamais de runner sur le serveur. Ses tâches
tournent sur les machines GitHub, gratuites pour lui, et votre serveur n'exécute ainsi jamais le travail proposé par
un inconnu.

**Tailscale est coupé ?** Les runners continuent de travailler tant que le serveur a accès à Internet.

**Un message d'erreur en rouge ?** Il dit en français ce qui manque. Corrigez ce qu'il demande, puis relancez la
même commande.

## Pour la technique

- Le choix est la variable `FACTORY_RUNS_ON` de chaque projet (les étiquettes des runners, en JSON, par défaut
  `["self-hosted"]`), lue par chaque `runs-on` des workflows de la factory. Sans variable : machines GitHub.
- Le réglage général et l'état du dernier contrôle sont sur la branche `factory-runners` de la factory
  (`settings.json`, `status.json`). Les projets y sont désignés par une empreinte, jamais par leur nom.
- Les étiquettes demandées aux runners se changent dans `settings.json` (`"labels": ["self-hosted", "…"]`). La
  commande d'installation donne à chaque runner l'étiquette `factory-dev`.

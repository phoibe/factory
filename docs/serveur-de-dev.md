# Installer les runners sur votre serveur de dev

Ce guide vous explique comment faire tourner les tâches automatiques d'un **projet privé** sur votre serveur de dev,
plutôt que sur les machines GitHub. Vous économisez ainsi votre quota GitHub. Comptez 5 minutes la première fois,
1 minute pour chaque projet suivant.

Un « runner », c'est un petit programme qui attend sur votre serveur et exécute les tâches du projet (tri des
demandes, vérifications, contrôles). Chaque projet privé en a **2** sur le serveur, pour qu'une tâche n'attende pas
la fin d'une autre.

## Ce qu'il vous faut

- Un terminal ouvert sur votre serveur de dev (par exemple depuis votre Mac, comme d'habitude avec Tailscale).
- Votre mot de passe du serveur : la commande peut vous le demander pour installer des logiciels.
- Le nom du projet privé (par exemple `mon-appli`).

Rien à ouvrir ni à régler sur le serveur : il reste derrière Tailscale. Les runners vont eux-mêmes chercher leur
travail chez GitHub.

## La commande

Copiez cette ligne dans le terminal du serveur, remplacez `mon-appli` par le nom de votre projet, puis appuyez sur
Entrée :

```
bash <(curl -fsSL https://raw.githubusercontent.com/phoibe/factory/stable/scripts/dev-server.sh) mon-appli
```

Les outils Mac « Nouveau projet » et « Adopter un projet » vous donnent cette commande déjà remplie à la fin, pour
un projet privé : il suffit de la coller.

Si vous ne mettez pas de nom de projet, la commande vous montre la liste de vos projets privés de la factory et vous
choisissez par numéro.

## Ce qui se passe

1. **La première fois seulement**, la commande vous demande de vous connecter à GitHub : elle affiche un code.
   Appuyez sur Entrée, ouvrez https://github.com/login/device sur votre Mac ou votre téléphone, tapez le code,
   validez. Ensuite elle installe les logiciels
   dont les tâches ont besoin, y compris ceux des contrôles qui ouvrent un navigateur. Cela prend quelques minutes.
2. Elle regarde les runners que le projet a déjà, et **ajoute seulement ce qui manque** pour arriver à 2.
3. Elle fait démarrer les runners tout seuls à chaque redémarrage du serveur. Les nouveaux runners tournent sous
   un compte à part du serveur, qui n'a pas accès à votre connexion GitHub.
4. Elle affiche « C'est prêt » avec le lien pour vérifier.

## Vérifier que ça marche

Ouvrez la page des runners du projet (remplacez `mon-appli`) :
`https://github.com/phoibe/mon-appli/settings/actions/runners`

Vous devez y voir 2 runners avec un point vert et le mot **« Idle »** : ils sont connectés et attendent du travail.
Quand une tâche tourne, ils affichent « Active ».

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

**Le serveur est éteint ou en panne ?** Une fois la bascule automatique en place (demande #271), les tâches
repassent sur les machines GitHub, puis reviennent sur le serveur quand il redémarre : rien ne reste bloqué.

**Tailscale est coupé ?** Les runners continuent de travailler tant que le serveur a accès à Internet.

**Un message d'erreur en rouge ?** Il dit en français ce qui manque. Corrigez ce qu'il demande, puis relancez la
même commande.

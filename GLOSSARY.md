# Software factory

La factory fabrique et suit les projets du propriétaire, de la demande jusqu'à la mise en ligne.

## Machines des tâches automatiques

**Serveur de dev** :
La machine que possède le propriétaire, derrière Tailscale, sur laquelle tournent les tâches automatiques de ses projets privés.
_À éviter_ : serveur perso, runner local

**Machines GitHub** :
Les machines prêtées par GitHub pour les tâches automatiques ; gratuites pour les projets publics, comptées dans le quota pour les projets privés.
_À éviter_ : cloud, runners hébergés

**Secours GitHub** :
L'état d'un projet privé dont les tâches passent sur les machines GitHub parce que le serveur de dev est éteint ou déconnecté.
_À éviter_ : fallback, repli

**Clé d'accès des runners** :
La clé personnelle, limitée aux projets du propriétaire, qui permet à la factory de voir si le serveur de dev est connecté et de basculer les projets.
_À éviter_ : token, jeton

## Mise en production

**Mise en production automatique** :
Le réglage d'un projet dont chaque modification validée part en ligne dès que la factory l'intègre.
_À éviter_ : déploiement continu

**Mise en production sur accord** :
Le réglage d'un projet dont les modifications validées sont intégrées mais n'arrivent sur le site en ligne qu'au clic du propriétaire sur « Mise en production ».
_À éviter_ : approbation, validation de déploiement

**Modifications en attente** :
Les modifications validées et intégrées d'un projet sur accord qui ne sont pas encore sur le site en ligne ; elles partent toutes ensemble.
_À éviter_ : file de déploiement, release

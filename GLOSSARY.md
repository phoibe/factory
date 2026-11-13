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
Le réglage par défaut d'un projet : une modification validée part en ligne dès que la factory l'intègre.
_À éviter_ : déploiement continu, auto-deploy

**Mise en production sur accord** :
Le réglage d'un projet dont le site en ligne ne change que lorsque le propriétaire clique sur « Mise en production » dans le tableau de bord ; toutes les modifications en attente partent alors ensemble.
_À éviter_ : release manuelle, déploiement manuel

**Modifications en attente** :
Les modifications validées et intégrées d'un projet « sur accord » qui ne sont pas encore en ligne ; leur nombre s'affiche sur le bouton « Mise en production ».
_À éviter_ : backlog, file de déploiement

**Écart de production** :
Les modifications validées d'un projet qui ne sont pas encore sur son site en ligne, quel que soit le mode de mise en production ; les modifications en attente d'un projet « sur accord » en sont un cas particulier.
_À éviter_ : retard de déploiement, diff de prod

**Étiquette de version** :
La petite indication, invisible pour les visiteurs, qu'un site publie avec lui-même pour dire quelle modification il contient ; le tableau de bord la lit quand l'hébergeur ne prévient pas de la fin de ses publications.
_À éviter_ : version endpoint, fichier de version

## Tableau de bord

**Liste des projets** :
La colonne toujours ouverte à droite du tableau de bord (en plein écran au toucher du nom du projet sur téléphone) qui range tous les projets par ordre alphabétique et permet d'en ouvrir un.
_À éviter_ : menu déroulant, sélecteur

**Point d'état** :
Le seul point de couleur affiché à côté d'un projet : rouge si une demande est bloquée et attend la réponse du propriétaire, sinon bleu si une carte attend dans « À vous de jouer », sinon gris si une demande est en cours ou en file d'attente ; aucun point sinon.
_À éviter_ : badge, pastille, notification

## Parcours d'une demande

**Taille d'une demande** :
Le classement d'une demande en petite, moyenne ou grande, fait par l'agent dès sa première lecture et affiché sur le tableau ; il décide du parcours suivi (une petite demande claire se construit sans questions ni plan, une moyenne d'une traite à partir d'un plan, une grande tâche par tâche) ; le propriétaire peut le corriger en l'écrivant dans la demande.
_À éviter_ : complexité, size, t-shirt

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

## Demandes

**Taille d'une demande** :
Le classement d'une demande en petite, moyenne ou grande, fait par l'agent dès sa première lecture et affiché sur sa carte (« petite demande #12 ») ; le propriétaire peut le corriger en l'écrivant dans la demande. Il choisit le parcours : une petite demande claire passe sans questions et se construit sans plan, une moyenne suit un plan exécuté d'une traite, une grande un plan exécuté tâche par tâche ; la relecture finale, les tests, les contrôles et les captures restent les mêmes.
_À éviter_ : complexité, story points

**Tâche parallélisable** :
Une tâche du plan d'une grande demande qui ne dépend d'aucune autre tâche encore à faire et ne touche pas les mêmes fichiers ni les mêmes tests qu'elles ; elle peut être construite en même temps que d'autres, au plus trois à la fois. Les autres sont des **tâches séquentielles**, construites après la tâche dont elles dépendent.
_À éviter_ : tâche indépendante, tâche concurrente

## Tableau de bord

**Liste des projets** :
La colonne toujours ouverte à droite du tableau de bord (en plein écran au toucher du nom du projet sur téléphone) qui range tous les projets par ordre alphabétique et permet d'en ouvrir un.
_À éviter_ : menu déroulant, sélecteur

**Point d'état** :
Le seul point de couleur affiché à côté d'un projet : rouge si une demande est bloquée et attend la réponse du propriétaire, sinon bleu si une carte attend dans « À vous de jouer », sinon gris si une demande est en cours ou en file d'attente ; aucun point sinon.
_À éviter_ : badge, pastille, notification

## Design

**Document de design** :
Le document qui décrit l'allure validée d'un projet : son thème et ses mises en page. Toute interface du projet le suit, et la relecture du design juge les écrans à partir de lui.
_À éviter_ : charte, guide de style, design system

**Thème** :
La partie du document de design qui fixe les couleurs, les polices, les formes, les espacements et les composants de base.
_À éviter_ : skin, habillage

**Mise en page** :
La façon de disposer un type d'écran (page de configuration, tableau de bord, liste, détail…) : disposition générale, sommaire ou navigation, largeur, place des libellés et des explications, volets repliables, et ce qui change sur téléphone. Chacune est décrite en mots dans le document de design, avec la liste des écrans réels qui la suivent.
_À éviter_ : layout, gabarit, template

**Design repris** :
Le document de design qu'un projet copie sur un autre projet du propriétaire, le projet de référence (Pulsar Wheel pour Pulsar Novae et Pulsar Magnetar) : thème et mises en page à l'identique, au cadrage ou sur sa demande. Le projet suit ensuite les mises en page de la référence sans jamais les modifier avec les siennes. La copie ne reste pas liée à l'original : elle n'est recopiée que sur sa demande.
_À éviter_ : design hérité, design partagé

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

**Documents du projet** :
Le glossaire et le registre des décisions d'un projet. L'agent les tient à jour pendant les questions ; un projet qui n'en a pas encore les reçoit une fois, reconstitués à partir de sa fiche produit, de son design, de ses features livrées et des échanges passés, au prochain passage de l'agent. Ils arrivent toujours dans une petite mise à jour de documents que la factory valide seule.
_À éviter_ : documentation, docs

**Refus noté** :
Une idée ou un choix que le propriétaire a clairement refusé (il a dit non, ou a abandonné l'idée en disant pourquoi), écrit en une phrase dans le registre des décisions pour ne plus le lui reproposer. Une demande abandonnée sans explication n'en est pas un.
_À éviter_ : idée rejetée, abandon

## Projets publics

**Inconnu** :
Sur un projet public, toute personne qui n'est ni le propriétaire, ni quelqu'un à qui il a donné le droit d'écrire dans le projet, ni un robot de la factory. Il peut ouvrir une demande, proposer une modification ou écrire un message, mais rien de ce qu'il écrit ne dirige la factory.
_À éviter_ : tiers, contributeur extérieur, étranger

**Note de la factory** :
Une indication invisible à l'écran que la factory laisse dans une demande, une modification ou un message pour se souvenir d'où elle en est (une étape passée, une relance prévue, une estimation). Elle ne compte que dans un texte écrit par le propriétaire, par quelqu'un à qui il a donné le droit d'écrire dans le projet, ou par la factory ; celle d'un inconnu est ignorée.
_À éviter_ : marqueur, balise, note technique

**Copie d'une demande** :
La demande que la factory ouvre pour le propriétaire à partir de celle d'un inconnu qu'il veut reprendre : le texte de l'inconnu tel qu'il était à ce moment-là, le message du propriétaire et un lien vers l'originale, qui est alors fermée. C'est dans la copie que la factory travaille, jamais dans l'originale.
_À éviter_ : duplicata, clone, demande recréée

## Tableau de bord

**Liste des projets** :
La colonne toujours ouverte à droite du tableau de bord (en plein écran au toucher du nom du projet sur téléphone) qui range tous les projets par ordre alphabétique et permet d'en ouvrir un.
_À éviter_ : menu déroulant, sélecteur

**Point d'état** :
Le seul point de couleur affiché à côté d'un projet : rouge si une demande est bloquée et attend la réponse du propriétaire, sinon bleu si une carte attend dans « À vous de jouer », sinon gris si une demande est en cours ou en file d'attente ; aucun point sinon.
_À éviter_ : badge, pastille, notification

## Réglages généraux

**Réglages généraux** :
La page à part du tableau de bord, ouverte par le bouton du même nom dans la barre du haut, qui regroupe les réglages valables pour tous les projets à la fois (les modèles par rôle, la machine des tâches par défaut). Elle s'oppose à l'onglet Paramètres, propre à chaque projet.
_À éviter_ : paramètres globaux, configuration générale

**Rôle de modèle** :
L'un des quatre types de travail auxquels la factory attribue un modèle : les plans et l'organisation (dont toute la phase amont d'une demande : son analyse, les questions, les alertes et la fiche, ainsi que le cadrage d'un projet et l'analyse d'un bug), l'écriture du code, la revue, et les tâches simples de lecture et d'écriture.
_À éviter_ : niveau, palier, léger / intermédiaire / puissant

**Famille de modèles** :
Le nom d'une lignée de modèles (Fable, Opus, Sonnet, Haiku) que le propriétaire choisit pour un rôle ; c'est toujours sa version la plus récente qui sert.
_À éviter_ : version, modèle précis

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

## Discussion avec l'agent

**Jeton de lecture** :
Le second jeton GitHub que le propriétaire crée depuis l'onglet « Agent » et confie à la discussion avec l'agent, à la place de son jeton complet. Il ne peut que lire les projets : s'il fuyait, il ne permettrait de rien changer, ni sur un projet (fichiers, demandes, tâches automatiques, réglages, secrets, mise en ligne) ni sur le compte.
_À éviter_ : clé lecture seule, clé de lecture, token de chat

**Jeton complet** :
Le jeton GitHub avec lequel le propriétaire se connecte au tableau de bord et qui permet de modifier ses projets ; il ne quitte jamais son navigateur.
_À éviter_ : jeton principal, token du panneau

**Jeton de l'ancien type** :
Un jeton GitHub de la génération précédente (« classic »), dont les droits sont trop larges et trop peu vérifiables pour servir de jeton de lecture ; la discussion n'en accepte aucun.
_À éviter_ : jeton classique, vieux jeton

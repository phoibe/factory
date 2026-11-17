# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Code JavaScript sans dépendance d'exécution (modules Node.js et JS du navigateur), tests intégrés (`node --test`), GitHub Actions pour les contrôles, la fusion et la file d'attente, GitHub Pages pour le panneau. Le jeton GitHub est gardé dans le navigateur ; la discussion en direct n'envoie au serveur de discussion qu'un second jeton, limité à la lecture. Seuls outils de développement : Playwright et axe-core pour le contrôle d'accessibilité. La discussion en direct du panneau passe par un petit serveur en Python hébergé sur Modal (offre gratuite), qui lit le code sans jamais le modifier.

## Users

Pierre, seul utilisateur, pour le moment (usage personnel uniquement). Il écrit en français, ne lit jamais de code, ne juge que le fonctionnel et l'apparence. Il suit ses projets au bureau sur ordinateur, et surtout sur téléphone pour répondre « go » en quelques secondes.

## Product Purpose

Une fabrique logicielle générale : Pierre écrit une idée en français dans GitHub, un agent IA la transforme en spec qu'il valide, puis en logiciel testé, relu, avec captures et mise en ligne. Il n'intervient qu'à trois moments : valider la spec, valider les captures, faire la recette. Réussite : des logiciels (pas seulement web) fabriqués sans que Pierre lise une ligne de code.

## Positioning

Le panneau montre d'un coup d'œil ce qui attend la réponse de Pierre, et le reste seulement en un clic. Aucun tableau de bord d'entreprise : un outil précis et calme.

## Operating Context

Issues et pull requests GitHub, labels `factory:*` comme machine à états, routines Claude Code dans le cloud, GitHub Actions pour les étapes déterministes (contrôles, fusion, file d'attente de 2 tâches en parallèle), sur le serveur de dev pour les projets privés avec les machines GitHub en secours, skills figés avec une mise à jour proposée chaque mois, branche `stable` promue depuis le panneau, deux outils Mac pour créer ou adopter un projet.

## Capabilities and Constraints

- Panneau web statique sur GitHub Pages : règles de chaque projet et suivi des tâches, thème clair/sombre automatique.
- Mise en production « sur accord » : les modifications validées sont fusionnées sur la branche `preprod` ; le bouton « Mise en production » fusionne `preprod` dans `main`, que l'hébergeur publie comme d'habitude (rien à régler chez lui). Si le site en ligne casse, `main` revient où il était et une demande de correction s'ouvre.
- Trois modes de mise en production par projet : automatique, sur accord, ou externe (faite hors de la factory, comme `git push prod main` sur Pulsar Wheel : la factory s'arrête au merge et le dit). Tant qu'aucun mode n'est choisi, la fiche stack technique (`STACK.md`, partie « Mise en production ») décide : « Manuelle » vaut externe. Une fiche plus ancienne, sans cette partie, est complétée une fois par l'agent.
- Les projets appartiennent au compte personnel (pas à une organisation).
- Pas de compte multiple, pas de service payant, pas d'hébergement hors solutions gratuites.
- Le jeton GitHub du panneau reste dans le navigateur. Le serveur de discussion ne reçoit qu'un jeton de lecture seule, créé une fois depuis l'onglet « Agent » (et emporté par le lien du téléphone) : il ne peut rien modifier, et la discussion refuse tout jeton qui peut écrire, sans jamais se rabattre sur le jeton complet. C'est le panneau qui enregistre les conversations et crée les demandes proposées par l'agent. Le serveur garde seulement son propre jeton Claude dans les secrets de Modal. Aucune donnée d'autres personnes.

## Brand Commitments

Nom « factory » conservé, rien d'autre à garder du look actuel. Ton discret et sérieux, textes courts, en français, **vouvoiement** (le panneau actuel tutoie : à corriger lors du nouveau design).

## Première version

Déjà en place (voir ci-dessus). Prochaines features : à définir au fil de l'eau, une issue à la fois. Première décidée : **refaire le design du panneau** selon `DESIGN.md`.

## Hors sujet

- Les services payants.
- L'hébergement ailleurs que sur les solutions gratuites prévues.
- L'ouverture à d'autres personnes (amis, équipe, public).
- Les applications natives mobile, Mac et PC : pas tout de suite, mais dans le périmètre à terme.

## Accessibilité

Pas de besoin particulier ; bon contraste (AA), gros boutons au pouce (44 px minimum), thème clair/sombre automatique.

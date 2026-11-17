# 401 · Découper le moteur de la factory en parties plus simples

> Demande [#401](https://github.com/phoibe/factory/issues/401) · 2026-11-13

C'est un chantier de fond : rien ne change à l'écran ni dans la façon dont les demandes avancent.

**En une phrase** : le moteur de la factory, aujourd'hui un seul bloc de près de 2 500 lignes, est rangé en parties séparées qui font chacune un seul métier, sans rien changer à ce qu'il fait.

### Ce qui change

Le moteur est découpé en parties séparées, chacune avec son métier :
- **lancements et relances** de l'agent (lancer, relancer après un échec, file d'attente, prendre la demande suivante quand une place se libère) ;
- **fusion et mise en production** (fusionner une PR, mettre en ligne, vérifier le site, revenir en arrière, refaire une demande annulée) ;
- **surveillance et réparations** (cartes bloquées, étiquettes à réparer, pannes, messages en attente, relances des cartes inactives) ;
- **réactions aux évènements** (un message, un « go », un label, la fin d'un run) et le compte rendu de fin de run.

Le point d'entrée reste le même : les automatismes de la factory l'appellent exactement comme avant, et les projets suivis n'ont rien à mettre à jour.

### Règles

- **Aucun changement de comportement** : mêmes messages, mêmes étiquettes, mêmes délais, mêmes relances.
- **Les tests existants restent tous, inchangés dans ce qu'ils vérifient**, et doivent tous passer. Chaque partie séparée reçoit en plus ses propres tests, plus faciles à lire que le gros fichier de tests actuel.
- Le découpage se fait par petites étapes, les tests passant après chacune, pour qu'un éventuel oubli se voie tout de suite.
- Si en chemin je repère un vrai défaut, je ne le corrige pas dans ce chantier : j'ouvre une demande à part.

### Hors périmètre

- Toute nouvelle fonctionnalité ou correction de comportement.
- Le tableau de bord, l'outil de déploiement des agents et les autres scripts de la factory.

### Comment vérifier

- Les contrôles automatiques de la PR sont au vert (tous les tests, anciens et nouveaux).
- Après la mise en ligne, vos demandes continuent d'avancer normalement : questions, constructions, captures, mises en production, relances.
- Le compte rendu de la PR montre que le gros bloc a laissé place à plusieurs parties plus petites.

# Software factory : conception

Source de vérité fonctionnelle. Décidé avec Pierre le 2026-11-03 (grilling). Cahier d'origine :
https://claude.ai/artifact/V9mAkT9jMQ2zLRT2D2kqg2

## Objectif

Outil personnel (un seul utilisateur, Pierre) qui fabrique du logiciel, surtout des applis web,
avec des agents IA. Pierre n'intervient que sur le fonctionnel et ne lit jamais de code.

## Socle

| Rôle (vocabulaire du skill `software-factory` de Matt Pocock) | Choix |
| --- | --- |
| Ticket tracker | GitHub Issues (une issue = une feature ou un bug) |
| Git host | GitHub (une PR = une livraison) |
| Orchestrateur | GitHub Actions (workflows réutilisables de ce repo) + labels `factory:*` comme machine à états |
| Runner des agents | Routines Claude Code (cloud Anthropic, abonnement Max) par défaut ; GitHub Actions + `claude-code-action` en secours ; réglable par projet |
| Runner des contrôles | GitHub Actions |
| Hébergement des applis | Aucun par défaut : choisi avec la stack au cadrage (offre gratuite) ; l'installation n'en branche aucun, la fiche projet dit quoi cliquer |
| Observabilité | aucune dédiée : sessions Claude + pages Actions + panneau |

## Organisation

- `phoibe/factory` (public) : panneau, règles par défaut, instructions d'étapes, packs de skills
  figés, scripts et workflows réutilisables. Une amélioration ici profite à tous les projets.
- `phoibe/factory-template` (public) : modèle léger, « Use this template ». Les projets peuvent être privés.

## Parcours d'une feature (par défaut, modifiable)

1. Pierre ouvre une issue (formulaire « Nouvelle feature »).
2. Grilling dans les commentaires. L'agent écrit la spec et attend le « go » (porte 1).
3. Plan (superpowers), code en TDD, revue par un agent séparé au contexte neuf
   (3 allers-retours max, sinon escalade en langage simple), passe impeccable si UI.
4. Captures avant/après (ordinateur + mobile) si l'interface change ; Pierre valide (porte 2).
   Les contrôles automatiques ne tournent qu'après cet OK.
5. Contrôles automatiques : types, lint, tests, build, accessibilité de base, failles des dépendances. Un projet peut
   y ajouter ses propres contrôles (« Contrôles supplémentaires » du panneau : un nom, une commande, un interrupteur),
   joués après les autres et pour lui seul. Un contrôle qui ne peut tourner que sur la machine du projet sort en 75
   quand elle est absente : la factory attend son retour comme une panne, sans envoyer l'agent.
   Rouge = rien ne fusionne.
6. Preview, recette fonctionnelle de Pierre (porte 3). Refus = commentaire en langage simple ;
   une idée nouvelle devient une nouvelle issue.
7. Merge automatique.

## Parcours d'un bug

Pas de grilling. Test qui reproduit, correction (systematic-debugging), revue, contrôles, merge
automatique. Questions à Pierre seulement si le comportement attendu est flou. Porte 2 si l'UI change.

## Garde-fous

- Features en parallèle par projet : réglable dans le panneau, 2 par défaut ; le reste en file. Une feature occupe sa place pendant que l'agent la construit et la libère dès que sa PR est ouverte (contrôles, captures et recette hors limite).
- Pioche automatique (réglage `autoPick`, désactivé par défaut) : quand des places sont libres et la file vide, la factory démarre une fiche ouverte (`factory:urgent` d'abord, puis bugs, puis la plus ancienne). `factory:no-pick` l'exclut ; les fiches question, projet, release, audit ou en attente du propriétaire ne sont jamais prises. Au plus `maxQuestions` features piochées (réglage « Features en questions en même temps », 1 à 10, 2 par défaut) peuvent attendre les réponses du propriétaire (questions ou validation de spec) ; au-delà, aucune autre feature n'est piochée (les bugs, si). Chacune garde sa place de « Features en parallèle ». Les features lancées par le propriétaire ne comptent pas.
- L'agent ne crée jamais de compte, n'ajoute jamais de service payant ni de clé ; il les demande dans l'issue.
- Skills figés à un commit ; PR mensuelle de mise à jour. Dans un pack, chaque skill s'active séparément.
- Français avec Pierre ; anglais pour le code et les commits.
- Un run n'attend jamais un humain : il se termine, et la réponse de Pierre déclenche un nouveau run.

# Passe design : critique puis correction des écrans

À suivre depuis les autres étapes quand un écran est créé ou modifié (et si l'étape « passe design » est
active). But : qu'`impeccable` critique **chaque** écran créé ou modifié et que **tout** ce qu'il trouve
soit corrigé avant les captures.

## Textes à l'écran

Rappelle cette règle à `impeccable` à **chaque** appel (création d'un écran ou du look, critique,
correction, revue générale), y compris dans les consignes des sous-agents de la critique : un écran bien
fait se passe d'explications sur son fonctionnement.

- **Permis** : les titres, les libellés de boutons et de champs, les messages d'erreur courts qui disent quoi
  faire, et une seule phrase courte sur un écran vide (ex. « Aucune commande pour l'instant »).
- **Interdits** : les paragraphes d'introduction, les textes « Comment ça marche », les sous-titres qui
  décrivent l'écran, les aides sous chaque champ quand le libellé suffit, les tutoriels d'accueil, les
  visites guidées et les bulles « astuce ».
- **À la critique**, tout texte qui explique le fonctionnement de l'écran est un défaut à corriger, jamais une
  amélioration à proposer.
- **Exception** : si le propriétaire demande lui-même, dans l'issue ou dans ses retours sur la PR, une
  page d'aide, un texte explicatif ou une visite guidée, sa demande passe avant la règle.
- **`DESIGN.md`** : la règle y figure, dans « Do's and Don'ts », pour qu'`impeccable` la relise tout seul.
  Si elle n'y est pas et que tu modifies `DESIGN.md`, ajoute-la.

## Mises en page

`DESIGN.md` décrit, à côté du thème (couleurs, polices, formes, espacements, composants), la **mise en page** de
chaque type d'écran, pour qu'un écran nouveau ou un autre projet retrouve l'allure des pages. C'est une partie à
elle, `## Mises en page`, placée après les huit sections du thème, avec une sous-partie `###` par type d'écran
(page de configuration, tableau de bord, liste, détail, discussion, fenêtre…), écrite en mots (pas de schéma ni de
capture dans le document), toujours avec la même grille :

- **Disposition générale** : colonnes, ordre des blocs, ce qui est en haut ;
- **Sommaire ou navigation** : sommaire, onglets, retour, ou « aucun » ;
- **Largeur** : largeur maximale du contenu, centré ou collé ;
- **Libellés et explications** : où sont les libellés (au-dessus, à gauche du champ), où vont les explications ;
- **Volets repliables** : ce qui se replie et ce qui est ouvert par défaut, ou « aucun » ;
- **Sur téléphone** : ce qui change sous la largeur d'un téléphone ;
- **Écrans concernés** : les écrans réels qui suivent ce modèle, par leur nom à l'écran.

Écris-la assez précisément pour qu'un autre projet refasse la même page sans voir l'écran : largeurs chiffrées, ordre
exact des blocs, ce qui est aligné avec quoi. Elle peut servir de **référence** à d'autres projets (Pulsar Wheel pour
Pulsar Novae et Pulsar Magnetar).

Règles :
- Un projet sans aucun écran a une partie qui dit seulement « Aucun écran pour l'instant. » : rien d'inventé.
- Un écran qui mélange deux modèles va sous le plus proche, avec une phrase sur ce qui diffère ; une vraie
  différence devient une nouvelle sous-partie.
- **Partie absente** : un projet dont `DESIGN.md` n'a pas encore cette partie ne la reçoit que sur demande du
  propriétaire (une demande qui la réclame, ou un nouveau projet à sa fondation). Ne la crée jamais en passant,
  dans une autre construction : ce projet suit peut-être le design d'un autre.
- **Design repris** : un projet dont `DESIGN.md` commence par la ligne « Design repris de <projet> (`<dépôt>`) »
  suit la mise en page de ce projet de référence. Sa partie « Mises en page » est la copie à l'identique de celle de
  la référence : ne la modifie jamais avec ce qui est propre à ce projet (ni nouvelle sous-partie, ni nom d'écran,
  ni largeur changée) ; ses écrans la suivent. Elle ne change que quand le propriétaire demande de la recopier à
  nouveau depuis la référence. Pour la recopier : lis le `DESIGN.md` de la référence
  (`gh api repos/<dépôt>/contents/DESIGN.md -H "Accept: application/vnd.github.raw"` ; si la lecture est refusée,
  ajoute d'abord ce dépôt à ta session en lecture avec l'outil `add_repo` s'il existe, sinon bloque-toi en lui
  expliquant quel accès manque) et remplace toute la partie par la sienne. Si la référence n'a pas encore de partie
  « Mises en page », bloque-toi et dis-lui de la demander d'abord dans le projet de référence.
- **Un projet existant qui doit suivre un autre projet** (« Pulsar Novae doit suivre Pulsar Wheel ») : sur sa
  demande, ajoute en tête de `DESIGN.md` la ligne « Design repris de <projet> (`<dépôt>`) » et recopie la partie
  comme ci-dessus.

## Étapes

1. **Liste les écrans** créés ou modifiés par la branche (pages, routes, composants visibles), d'après le
   diff avec `main`. Lance l'appli en local et ouvre chaque écran dans le navigateur (Playwright), sur
   téléphone et sur ordinateur.
2. **Critique** : pour chaque écran, skill `impeccable`, commande `critique`
   (`reference/critique.md`), avec ses deux évaluations indépendantes en sous-agents (`sonnet`, effort `medium`) et le détecteur.
   Elle juge l'écran contre `PRODUCT.md`, `DESIGN.md` et la règle « Textes à l'écran » ci-dessus, et elle juge l'écran
   aussi sur sa mise en page : celle de son type d'écran dans la partie « Mises en page » ci-dessus, pas seulement les
   couleurs et les polices.
   Tu travailles seul : saute les questions de fin de
   critique en écrivant « Questions skipped: run autonome de la factory », et ne t'arrête pas sur elles.
3. **Corrige tout** : chaque problème du rapport (prioritaires, alertes des personas, observations
   mineures, alertes du détecteur), avec les commandes qu'il suggère (`polish`, `layout`, `typeset`,
   `clarify`, `harden`, `adapt`…). Avec `clarify` comme avec les autres, raccourcis ou retire les textes
   explicatifs, n'en ajoute jamais (règle « Textes à l'écran »).
   Ne corrige que ce qui reste dans le périmètre de la feature et dans
   `DESIGN.md` ; si une correction demande de changer le design validé (nouvelle couleur, nouveau
   composant), fais-la dans `DESIGN.md` aussi et signale-le dans la PR.
3 bis. **Mises en page à jour** (seulement si `DESIGN.md` a sa partie « Mises en page ») : vérifie que chaque écran
   créé ou modifié figure dans cette partie (sous son type d'écran, dans « Écrans concernés »). Un écran qui contredit
   une mise en page déjà décrite (autre disposition, autre largeur, libellés ailleurs) est un défaut. C'est l'écran
   qui est corrigé, pas le document. Si le document est en retard (mise en page nouvelle non décrite, écran absent
   de la liste), complète-le toi-même dans la même PR et ajoute au résumé de la PR une ligne
   « Mise en page ajoutée au design : … » (le type d'écran et l'écran, en mots simples).
   **Design repris** : ne complète jamais le document (règle « Design repris » ci-dessus). Un écran dont le type
   n'existe pas dans la référence va sous la mise en page la plus proche, et le résumé de la PR le dit en une ligne :
   « Mise en page absente de <projet de référence> : … », pour qu'il la demande là-bas s'il le veut.
4. **Recritique, une fois au plus**, et seulement si la première critique a trouvé des problèmes prioritaires
   (P0 ou P1) : une seule évaluation suffit pour ce contrôle (pas les deux sous-agents), centrée sur ces
   problèmes. Corrige ce qu'elle trouve encore, sans nouvelle critique. Sans problème prioritaire au départ,
   pas de recritique : les captures que le propriétaire valide servent de contrôle final. S'il reste des
   problèmes, liste-les dans la PR, en français simple, dans une section « Design : points restants ».
5. Relance les tests (une correction visuelle peut casser un test ou l'accessibilité) et ajoute dans la PR
   une section « Design » : le score de la première et de la dernière critique, et en une ligne par point
   ce qui a été corrigé, avec une ligne par texte retiré (ex. « Texte d'introduction de la page Commandes
   retiré »), pour que le propriétaire puisse le réclamer s'il lui manque.
6. Les rapports écrits dans `.impeccable/critique/` font partie de la PR.

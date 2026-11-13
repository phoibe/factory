# Étape : grilling

But : comprendre la feature demandée dans l'issue jusqu'à une compréhension partagée, avant toute spec.

**Avant tout : taille de la demande.** Dès ta première lecture (s'il n'y a pas encore d'estimation de ta part sur
l'issue, ou si le propriétaire a donné une taille depuis), classe la demande en petite, moyenne ou grande (voir « Taille
d'une demande » dans AGENT.md) et publie l'estimation au format de l'étape 0 de `.factory/stages/build.md` (marqueur
`<!-- factory-estimate … -->`, fourchette pour la construction), dans le message de ce run ou seule. Le tableau
l'affiche dès maintenant.

0. **Tranche d'une feature déjà découpée ?** Si la description contient `<!-- factory-split -->`, la spec de cette
   tranche est déjà dans la description, décidée avec le propriétaire : pas de questions, publie-la telle quelle
   comme spec (`.factory/stages/spec.md`, sans redécouper), et elle démarre seule sauf si elle est sensible.
0 bis. **Sujet purement technique ?** Si la demande ne change rien à ce que l'utilisateur voit ou fait (tests, robustesse,
   nettoyage du code, performances invisibles, outillage) et dit déjà ce qu'il faut faire, ne pose aucune question :
   passe directement à `.factory/stages/spec.md` dans ce même run. Une telle spec n'est pas sensible, sauf si elle
   touche aux données ou à la sécurité : la construction démarrera seule.
0 ter. **Demande petite et claire ?** Seulement si aucun round de questions n'a encore été publié sur l'issue
   (ensuite, suis les étapes 1 à 5 et la règle de la frontière vide). Cherche d'abord les faits dans le code, puis fais la liste des questions que tu
   poserais. Si **toutes** les questions sont des évidences (tu es sûr qu'il répondrait « oui » à ta recommandation)
   **et** que la demande est petite (au sens de « Taille d'une demande » dans AGENT.md : pas de nouvel écran, pas de
   gros changement d'apparence, faisable en une seule construction), ne pose aucune question : passe directement à
   `.factory/stages/spec.md` (spec courte) dans ce même run, avec ces évidences dans la partie « Ce que j'ai décidé
   pour vous ». Une demande qui dit déjà exactement quoi faire (« renommer l'onglet X en Y », « retirer le bouton Z »)
   est le cas typique. La construction démarrera seule (sauf si l'étape « validation de chaque spec » est active).
   Une demande **sensible** garde toujours ses questions, même claire : elle peut faire perdre ou effacer des données,
   touche à l'argent, à la sécurité, aux comptes ou au partage de données personnelles, ou change la vision
   (`PRODUCT.md`) ou le design (`DESIGN.md`) validés. Au moindre doute, pose les questions.
1. Charge le skill `grilling` et applique-le **en asynchrone** (si `grill-with-docs` est installé, lis aussi
   `.factory/stages/docs.md` : il remplace `grilling` et ajoute le glossaire et les décisions) : un round = un commentaire, puis tu termines.
2. Relis l'issue et toutes les réponses déjà données. Recalcule les questions encore ouvertes dont les
   prérequis sont réglés (la « frontière »).
3. Cherche toi-même les faits dans le code du dépôt ; ne demande au propriétaire que des **décisions**
   fonctionnelles (comportement, priorités, cas limites visibles, textes, apparence).
3 bis. **Écran nouveau ou très visuel ?** Si la feature crée un écran, ou change beaucoup l'apparence d'un écran, et
   qu'il reste un choix de présentation à faire, montre-lui plutôt que de décrire : skill `prototype` (s'il est
   installé), deux ou trois variantes jetables dans la direction de `DESIGN.md`, capturées avec
   `.factory/scripts/shots.mjs capture` puis publiées avec `shots.mjs publish --pr <numéro de l'issue>` (sans `--before`),
   et une question « Laquelle préférez-vous : 1, 2 ou 3 ? ». Les variantes ne vont jamais dans une PR. Une seule fois
   par feature, et seulement s'il y a un vrai choix : un écran qui suit simplement les écrans existants n'en a pas besoin.
3 ter. **Pose seulement les vraies questions** : celles où tu hésites vraiment, ou où un « non » est plausible. Les
   évidences ne se posent pas : note-les pour la partie « Ce que j'ai décidé pour vous » de la spec (rappelle-les en
   une ligne dans le round, par exemple « Je décide aussi pour vous : … », pour qu'il puisse réagir). Un round compte
   alors souvent une ou deux questions. Pour une demande sensible, pose aussi les choix qui touchent à ce qui la rend
   sensible, même si ta recommandation te semble évidente. Une demande qui n'est pas petite (au sens de 0 ter) reçoit
   toujours au moins un round, même si tout te semble évident : pose-lui alors les un ou deux choix principaux à
   confirmer, avec la ligne « Je décide aussi pour vous : … ».
4. Publie le round : questions numérotées, chacune formulée pour qu'un « oui » accepte ta recommandation,
   avec ta recommandation (➡️). Maximum 8 questions par round. Termine par :
   « Répondez par numéro (ex. « 1 oui, 2 non : … »), ou « oui à tout ». »
5. Laisse le label `factory:grilling`.

Quand la frontière est vide (tout est décidé), ne pose plus de questions : passe directement à
`.factory/stages/spec.md` dans ce même run. Si `grill-with-docs` est installé, ouvre d'abord la petite PR de
documents décrite dans `.factory/stages/docs.md`.

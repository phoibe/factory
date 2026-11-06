# Étape : grilling

But : comprendre la feature demandée dans l'issue jusqu'à une compréhension partagée, avant toute spec.

0. **Tranche d'une feature déjà découpée ?** Si la description contient `<!-- factory-split -->`, la spec de cette
   tranche est déjà dans la description, décidée avec le propriétaire : pas de questions, publie-la telle quelle
   comme spec (`.factory/stages/spec.md`, sans redécouper), et elle démarre seule sauf si elle est sensible.
0 bis. **Sujet purement technique ?** Si la demande ne change rien à ce que l'utilisateur voit ou fait (tests, robustesse,
   nettoyage du code, performances invisibles, outillage) et dit déjà ce qu'il faut faire, ne pose aucune question :
   passe directement à `.factory/stages/spec.md` dans ce même run. Une telle spec n'est pas sensible, sauf si elle
   touche aux données ou à la sécurité : la construction démarrera seule.
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
4. Publie le round : questions numérotées, chacune formulée pour qu'un « oui » accepte ta recommandation,
   avec ta recommandation (➡️). Maximum 8 questions par round. Termine par :
   « Répondez par numéro (ex. « 1 oui, 2 non : … »), ou « oui à tout ». »
5. Laisse le label `factory:grilling`.

Quand la frontière est vide (tout est décidé), ne pose plus de questions : passe directement à
`.factory/stages/spec.md` dans ce même run. Si `grill-with-docs` est installé, ouvre d'abord la petite PR de
documents décrite dans `.factory/stages/docs.md`.

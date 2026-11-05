# Étape : grilling

But : comprendre la feature demandée dans l'issue jusqu'à une compréhension partagée, avant toute spec.

1. Charge le skill `grilling` et applique-le **en asynchrone** (si `grill-with-docs` est installé, lis aussi
   `.factory/stages/docs.md` : il remplace `grilling` et ajoute le glossaire et les décisions) : un round = un commentaire, puis tu termines.
2. Relis l'issue et toutes les réponses déjà données. Recalcule les questions encore ouvertes dont les
   prérequis sont réglés (la « frontière »).
3. Cherche toi-même les faits dans le code du dépôt ; ne demande au propriétaire que des **décisions**
   fonctionnelles (comportement, priorités, cas limites visibles, textes, apparence).
4. Publie le round : questions numérotées, chacune formulée pour qu'un « oui » accepte ta recommandation,
   avec ta recommandation (➡️). Maximum 8 questions par round. Termine par :
   « Répondez par numéro (ex. « 1 oui, 2 non : … »), ou « oui à tout ». »
5. Laisse le label `factory:grilling`.

Quand la frontière est vide (tout est décidé), ne pose plus de questions : passe directement à
`.factory/stages/spec.md` dans ce même run. Si `grill-with-docs` est installé, ouvre d'abord la petite PR de
documents décrite dans `.factory/stages/docs.md`.

# Étape : documents du projet (glossaire et décisions)

À lire seulement par les étapes `grilling`, `framing`, `build` et `bugfix`, et seulement si le skill `grill-with-docs`
est installé (le dossier `.claude/skills/grill-with-docs/` existe). Sinon, ne fais rien de ce qui suit : les questions se
posent avec le skill `grilling`, sans aucun document.

## Pendant les questions

Charge **directement** les skills `grilling` puis `domain-modeling` (outil Skill, deux appels). Ne charge jamais
`grill-with-docs` lui-même : il est réservé au lancement à la main et l'outil te le refuserait (issue #526) ; sa
présence dit seulement que les documents sont activés. Les questions se posent exactement comme d'habitude (un round =
un commentaire).
Les documents s'écrivent **en français**, avec les mots du propriétaire ; un nom technique en anglais n'y figure
que s'il est vraiment nécessaire. Le glossaire ne contient aucun détail d'implémentation.
**Refus du propriétaire** : dès qu'il refuse une idée ou un choix (« non, on n'a pas besoin de… »), note-le aussitôt
dans `docs/adr/` (une phrase : ce qui est refusé et pourquoi), sans attendre la fin des questions.

## Rattrapage (projet sans glossaire)

Une seule fois par projet, **au début** de ton run `grilling`, `build` ou `bugfix`, avant ton travail habituel :

1. **Seulement si** `GLOSSARY.md` n'existe pas sur `{{base}}` **et** que le projet a de quoi écrire (`PRODUCT.md` ou
   `docs/PRODUCT.md`, ou au moins une spec dans `docs/specs/`). Jamais pour la factory elle-même (quand `repo` et
   `factory` du payload sont le même dépôt). Si une PR de documents ouverte (branche `claude/docs-*`) apporte déjà
   `GLOSSARY.md`, elle n'est pas encore fusionnée : ne refais rien.
2. **Relis** la fiche produit, `DESIGN.md`, les specs livrées (`docs/specs/`), puis les demandes du projet et leurs
   échanges : ouvertes, terminées et abandonnées
   (`gh api "R/issues?state=all&per_page=100" --paginate`, celles fermées avec `state_reason` `not_planned` sont les
   abandons ; lis le fil de celles qui comptent).
3. **Écris** (skill `domain-modeling`, outil Skill) :
   - `GLOSSARY.md` : les mots du projet, avec les termes du propriétaire, en français ;
   - `docs/adr/` : les choix importants déjà faits, et ses **refus clairs** seulement (il a dit non, ou il a abandonné
     une idée en disant pourquoi), une phrase chacun. Une demande abandonnée sans explication n'est pas un refus : ne la
     note pas.
4. **Envoie-les** dans la petite PR de documents décrite plus bas (branche `claude/docs-<n>`, n = numéro de l'issue de
   ce run), puis reprends ton travail habituel sur ta branche. Ces documents ne vont jamais dans la PR de la feature.
5. Une phrase dans ton message suivant au propriétaire : « J'ai créé le glossaire et le registre des décisions du
   projet à partir de ce qui existait déjà. » Si quelque chose échoue, n'insiste pas et continue ton travail : le
   rattrapage sera retenté au passage suivant (le glossaire manquera toujours).

## La petite PR de documents (fin des questions, fiche projet publiée, ou rattrapage)

S'il y a quelque chose d'écrit (`GLOSSARY.md`, `docs/adr/*.md`) :

1. Crée la branche `claude/docs-<n>` (n = numéro de l'issue) depuis `{{base}}`, **à part** de toute branche de
   feature. Elle ne contient que ces documents : jamais de code, jamais autre chose.
2. Commit (`docs: glossary and decisions (#<n>)`, en anglais) et pousse.
3. Ouvre une PR vers `{{base}}` (API REST, voir AGENT.md), titre « Glossaire et décisions (#<n>) », **sans**
   `Closes`, sans label `factory:*`. La factory la fusionne toute seule : n'attends rien et ne la fusionne pas.
4. Reviens sur la branche de l'issue si tu y travailles encore.

Rien à écrire ? Ne crée ni branche ni PR.

## La phrase de résumé

Dans la dernière question ou la spec (ou la fiche projet), ajoute une phrase en français, courte, qui dit ce
qui a été ajouté ou précisé : « J'ai ajouté au glossaire : … ; décisions notées : … ». Si rien n'a été écrit,
n'ajoute pas de phrase. Garde-la : tu la reprendras dans le résumé de la PR de la feature (étape build).

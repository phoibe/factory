# Étape : documents du projet (glossaire et décisions)

À lire seulement par les étapes `grilling`, `framing`, `build` et `bugfix`, et seulement si le skill `grill-with-docs`
est installé (le dossier `.claude/skills/grill-with-docs/` existe) **ainsi que** `domain-modeling` (le dossier
`.claude/skills/domain-modeling/` existe). Sinon, ne fais rien de ce qui suit : les questions se
posent avec le skill `grilling`, sans aucun document.

Pendant la phase amont, c'est le sous-agent du rôle `plan` qui charge ces skills et écrit ces documents (« Phase amont »
dans AGENT.md) : place-toi d'abord sur la branche de documents, demande-lui de les écrire, puis fais toi-même le
commit et la petite PR.

## Pendant les questions

Charge **directement** les skills `grilling` puis `domain-modeling` (outil Skill, deux appels). Ne charge jamais
`grill-with-docs` lui-même : il est réservé au lancement à la main et l'outil te le refuserait (issue #526) ; sa
présence dit seulement que les documents sont activés. Les questions se posent exactement comme d'habitude (un round =
un commentaire).
Les documents s'écrivent **en français**, avec les mots du propriétaire ; un nom technique en anglais n'y figure
que s'il est vraiment nécessaire. Le glossaire ne contient aucun détail d'implémentation.
**Refus du propriétaire** : chaque refus d'une idée ou d'un choix (« non, on n'a pas besoin de… ») devient une
décision dans `docs/adr/` (une phrase : ce qui est refusé et pourquoi). Chaque round est un run à part, et rien
n'est gardé entre deux : c'est la PR de documents de la fin des questions qui les écrit, en relisant **tout** le fil de
l'issue, tous rounds compris. N'oublie aucun refus exprimé en cours de route.

## Rattrapage (projet sans glossaire)

Une seule fois par projet, **au début** de ton run `grilling`, `build` ou `bugfix`, avant ton travail habituel :

1. **Seulement si** `GLOSSARY.md` n'existe pas sur `main` **et** que le projet a de quoi écrire (`PRODUCT.md` ou
   `docs/PRODUCT.md`, ou au moins une spec dans `docs/specs/`). Jamais pour la factory elle-même (quand `repo` et
   `factory` du payload sont le même dépôt). Regarde aussi les PR ouvertes (`gh api "R/pulls?state=open"`, puis
   `gh api R/pulls/<numéro>/files` pour celles sur une branche `claude/docs-*`) : si l'une apporte déjà `GLOSSARY.md`,
   ouverte depuis moins d'un jour et sans le message « Je n'ai pas pu fusionner » de la factory, elle va être fusionnée :
   ne refais rien. Plus ancienne ou en échec, elle est coincée : si c'est celle de cette issue (`claude/docs-<n>`),
   refais le rattrapage par-dessus (sa branche, étape 2 de la petite PR plus bas, la factory retente alors la fusion) ; si c'est celle
   d'une autre issue, ajoute-lui le label `factory:close` (la factory la ferme) et refais le rattrapage.
2. **Relis** la fiche produit, `DESIGN.md`, les specs livrées (`docs/specs/`), puis les demandes du projet et leurs
   échanges : ouvertes, terminées et abandonnées
   (`gh api "R/issues?state=all&per_page=100" --paginate --jq '.[] | select(.pull_request == null)'` : les PR
   en sont retirées ; celles fermées avec `state_reason` `not_planned` sont les
   abandons ; lis le fil de celles qui comptent).
3. **Écris**, une fois placé sur la branche de documents (étapes 1 et 2 de la petite PR plus bas), avec le skill
   `domain-modeling` (outil Skill) :
   - `GLOSSARY.md` : les mots du projet, avec les termes du propriétaire, en français ;
   - `docs/adr/` : les choix importants déjà faits, et ses **refus clairs** seulement (il a dit non, ou il a abandonné
     une idée en disant pourquoi), une phrase chacun. Une demande abandonnée sans explication n'est pas un refus : ne la
     note pas.
4. **Envoie-les** (étapes 3 à 5 de la petite PR plus bas : branche `claude/docs-<n>`, n = numéro de l'issue de ce
   run), puis reprends ton travail habituel : ta branche de travail part toujours de `origin/main`, jamais de la
   branche de documents. Ces documents ne vont jamais dans la PR de la feature.
5. Une phrase dans ton message suivant au propriétaire : « J'ai créé le glossaire et le registre des décisions du
   projet à partir de ce qui existait déjà. » Si quelque chose échoue, n'insiste pas et continue ton travail : le
   rattrapage sera retenté au passage suivant (le glossaire manquera toujours).

## La petite PR de documents (fin des questions, fiche projet publiée, ou rattrapage)

S'il y a quelque chose à écrire (`GLOSSARY.md`, `docs/adr/*.md`) :

Une seule branche de documents par issue, `claude/docs-<n>` (n = numéro de l'issue) : le rattrapage et la fin des
questions peuvent s'en servir tour à tour. Elle ne contient que ces documents : jamais de code, jamais autre chose.
Le journal (`.factory/journal/`) ne va jamais sur la branche `claude/docs-<n>` : ne l'ajoute pas au commit de cette
branche, il reste sur ta branche de travail.
Place-toi dessus **avant d'écrire** le moindre document : écrits ailleurs, ils bloqueraient le changement de branche
ou partiraient dans la PR de la feature.

1. Si tu as d'autre travail en cours (une construction relancée), committe-le d'abord sur ta branche de travail, en
   ajoutant tes fichiers par leur nom (jamais `git add -A` ni `git commit -a`). Puis `git fetch origin`.
2. Place-toi sur la branche de documents :
   - **une PR de documents de cette issue est encore ouverte** : `git switch -C claude/docs-<n> origin/claude/docs-<n>`
     (tu complètes ce qu'elle contient déjà) ;
   - **sinon** (pas de branche, ou sa PR fermée ou fusionnée) : `git switch -C claude/docs-<n> origin/main`.
3. Écris ou complète `GLOSSARY.md` et `docs/adr/`, puis commit (`docs: glossary and decisions (#<n>)`, en anglais).
4. Pousse :
   - **PR encore ouverte** : un simple `git push`, pas de nouvelle PR. Relis ensuite la PR : si elle a été
     fusionnée entre-temps, ton commit n'y est pas entré : `git fetch origin`, `git switch -C claude/docs-<n> origin/main`,
     `git cherry-pick <ton commit>`, puis pousse et ouvre une PR comme ci-dessous ;
   - **sinon** : `git push --force-with-lease -u origin claude/docs-<n>` (l'ancienne branche, dont la PR est fermée ou
     fusionnée, est remplacée : c'est la seule branche que tu peux ainsi écraser). Ouvre une PR vers `main` (API
     REST, voir AGENT.md), titre « Glossaire et décisions (#<n>) », **sans** `Closes`, sans label `factory:*`. La
     factory la fusionne toute seule : n'attends rien et ne la fusionne pas.
   Jamais d'autre nom de branche : la factory ne fusionne que `claude/docs-<n>`.
5. Reviens où tu en étais : `git switch claude/issue-<n>-…` si ta branche de travail existe déjà, sinon
   `git switch --detach origin/main` puis crée ta branche de travail depuis `origin/main`. Ne committe jamais
   les documents ailleurs que sur `claude/docs-<n>`. Avant d'ouvrir la PR de la feature, vérifie avec
   `git diff --stat origin/main...HEAD` que ni `GLOSSARY.md` ni `docs/adr/` n'y figurent (sauf une décision que
   la feature elle-même demande).

Rien à écrire ? Ne crée ni branche ni PR.

## La phrase de résumé

Dans la dernière question ou la spec (ou la fiche projet), ajoute une phrase en français, courte, qui dit ce
qui a été ajouté ou précisé : « J'ai ajouté au glossaire : … ; décisions notées : … ». Si rien n'a été écrit,
n'ajoute pas de phrase. Garde-la : tu la reprendras dans le résumé de la PR de la feature (étape build).

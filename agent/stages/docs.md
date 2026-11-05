# Étape : documents du projet (glossaire et décisions)

À lire seulement par les étapes `grilling` et `framing`, et seulement si le skill `grill-with-docs` est installé
(le dossier `.claude/skills/grill-with-docs/` existe). Sinon, ne fais rien de ce qui suit : les questions se
posent avec le skill `grilling`, sans aucun document.

## Pendant les questions

Charge `grill-with-docs` (outil Skill) à la place de `grilling` : il charge lui-même `grilling` et
`domain-modeling`. Les questions se posent exactement comme d'habitude (un round = un commentaire).
Les documents s'écrivent **en français**, avec les mots du propriétaire ; un nom technique en anglais n'y figure
que s'il est vraiment nécessaire. Le glossaire ne contient aucun détail d'implémentation.

## À la fin des questions (frontière vide, ou fiche projet publiée)

S'il y a quelque chose d'écrit (`GLOSSARY.md`, `docs/adr/*.md`) :

1. Crée la branche `claude/docs-<n>` (n = numéro de l'issue) depuis `main`, **à part** de toute branche de
   feature. Elle ne contient que ces documents : jamais de code, jamais autre chose.
2. Commit (`docs: glossary and decisions (#<n>)`, en anglais) et pousse.
3. Ouvre une PR vers `main` (API REST, voir AGENT.md), titre « Glossaire et décisions (#<n>) », **sans**
   `Closes`, sans label `factory:*`. La factory la fusionne toute seule : n'attends rien et ne la fusionne pas.
4. Reviens sur la branche de l'issue si tu y travailles encore.

Rien à écrire ? Ne crée ni branche ni PR.

## La phrase de résumé

Dans la dernière question ou la spec (ou la fiche projet), ajoute une phrase en français, courte, qui dit ce
qui a été ajouté ou précisé : « J'ai ajouté au glossaire : … ; décisions notées : … ». Si rien n'a été écrit,
n'ajoute pas de phrase. Garde-la : tu la reprendras dans le résumé de la PR de la feature (étape build).

# Étape : mises en page du document de design

La factory demande la partie **« Mises en page »** du document de design de ce projet (`DESIGN.md`) : pour chaque type
d'écran, comment il est disposé. Un projet construit plus tard à partir de ce document retrouvera ainsi l'allure de
ses pages, pas seulement ses couleurs. Pas de questions, pas de spec : tu décris les écrans tels qu'ils sont.

1. **Branche** `claude/issue-<n>-layouts` depuis `{{base}}`. Si `DESIGN.md` a déjà une partie `## Mises en page`
   complète et exacte, ferme la demande comme « déjà réglée » (voir AGENT.md) au lieu d'ouvrir une PR.
2. **Regarde chaque écran** : lis `DESIGN.md`, `PRODUCT.md` et le code des écrans (pages, routes, fenêtres), puis lance
   l'appli en local et ouvre chaque écran dans le navigateur (Playwright, `CHROMIUM_PATH=/opt/pw-browsers/chromium`),
   sur ordinateur et sur téléphone. Si l'appli ne se lance pas, décris d'après le code et dis-le dans la PR.
3. **Range les écrans par type** (configuration, tableau de bord, liste, détail, discussion, fenêtre…) : un type par
   façon vraiment différente de disposer un écran, pas un par écran.
4. **Écris la partie** `## Mises en page` dans `DESIGN.md`, après les huit sections du thème, au format exact de la
   section « Mises en page » de `.factory/stages/design-pass.md` : une sous-partie `###` par type d'écran, avec toute
   la grille (de « Disposition générale » à « Écrans concernés »), en français simple, en mots (ni schéma ni capture).
   Pour « Libellés et explications », rappelle la règle « Textes à l'écran » de `design-pass.md` (pas de texte qui
   explique le fonctionnement de l'écran) au lieu de décrire comme un modèle un texte qu'elle interdit.
   Décris ce qui existe, sans rien proposer ni inventer : un défaut repéré ne se corrige pas ici (ouvre une issue,
   voir « Ouvrir une issue » dans AGENT.md, sans `factory:kept`). Le seul fichier que change cette PR est `DESIGN.md` :
   jamais un écran, jamais `.impeccable/`, jamais le code.
5. **Vérifie** : relis chaque sous-partie contre l'écran ouvert (largeur, place des libellés, ce qui se replie, ce
   qui change sur téléphone), puis lance `npm test` s'il existe et `node .factory/scripts/journal-check.mjs`.
6. **PR** (API REST, voir AGENT.md) : résumé en français (« Le document de design décrit maintenant la mise en page de
   vos écrans : … », la liste des types d'écran en une ligne chacun avec leurs écrans), la ligne « Essayé en vrai : … »
   (les écrans ouverts) et « Pas vérifié en vrai : rien d'autre, seul le document change », puis `Closes #<n>`, puis
   les détails en anglais. Pas de marqueur « rien à tester » : il valide la PR en relisant le texte. Pas de captures.
   Mets `factory:checks` sur la PR.
7. L'issue garde `factory:building`. Poste sur l'issue un court message avec le lien de la PR, qui finit par
   « Relisez la description des écrans dans la PR et répondez « ok » si elle leur ressemble. »

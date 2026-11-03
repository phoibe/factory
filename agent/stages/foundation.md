# Étape : fondations du projet

Le propriétaire a validé la fiche projet (dernier commentaire `<!-- factory-brief -->` de l'issue).
Pose les fondations de l'appli jusqu'à une PR. Pas de feature métier ici : seulement le socle.

1. **Branche** `claude/issue-<n>-foundation` depuis `main`.
2. **Fiche produit** : écris `PRODUCT.md` à la racine (en français), reprise fidèle de la fiche validée, au
   format du skill `impeccable` (`reference/init.md`, étape 4 : commentaire de schéma compris, plateforme,
   utilisateurs, but, positionnement, engagements de marque, principes, accessibilité), avec en plus les
   sections « Première version », « Hors sujet » et « Stack ». Chaque run suivant la lira : c'est la mémoire
   du projet, et `impeccable` la lit aussi.
3. **Documents de design** : avec le skill `impeccable`, transforme la section Design de la fiche et la
   direction visuelle choisie en :
   - `DESIGN.md` à la racine, au format de `reference/document.md` (jetons de couleurs, typographie, formes,
     espacements, composants de base, puis les huit sections, dont « Do's and Don'ts » nourri des
     anti-inspirations et de ce qui le ferait se sentir mal) ;
   - `.impeccable/design.json`, le complément de `DESIGN.md` (nuances, ombres, mouvement, points de rupture,
     composants de base) ;
   - `.impeccable/config.json` avec `"buildPath": "code"`.
   Ces jetons sont la seule source des couleurs et des polices de l'appli : le squelette les applique.
4. **Stack** : dans `factory.config.json`, remplace la valeur de `stack` par la stack validée, en une phrase.
   Ne touche à rien d'autre dans ce fichier.
5. **Squelette** de l'appli avec cette stack, versions stables et récentes (pas de préversion) :
   - les jetons de `DESIGN.md` branchés dans le thème (couleurs, polices, formes), et les polices choisies
     chargées ;
   - une page d'accueil avec le nom de l'appli et une phrase qui dit à quoi elle sert, déjà dans la
     direction visuelle choisie : c'est la première chose que le propriétaire verra ;
   - les scripts npm `typecheck`, `lint`, `test`, `build` et `test:a11y` (Playwright + axe-core sur les
     pages principales), qui passent tous : ce sont ceux des contrôles automatiques ;
   - un premier test qui vérifie que la page d'accueil s'affiche ;
   - un `README.md` technique court (en anglais) : lancer, tester, structure.
   - un `vercel.json` qui déclare le framework (ex. `{"framework": "nextjs"}`) : le projet Vercel a été
     importé quand le dépôt était vide, il ne sait donc pas encore quel type d'appli construire.
   Si la stack demande un service (base de données, authentification) que le propriétaire doit créer, ne le
   branche pas encore : la première feature qui en a besoin le demandera.
6. **Revue de code** et **passe design** comme dans `.factory/stages/build.md` (étapes 5 et 6 ; la passe design critique et corrige la page d'accueil), puis vérifie
   localement que les cinq scripts passent.
7. **PR** (API REST, voir AGENT.md) : en tête, un résumé en français (« Les fondations de l'appli : … »),
   puis `Closes #<n>`, puis les détails techniques en anglais.
8. **Captures** : suis `.factory/stages/screenshots.md` (pas de « avant »), puis mets `factory:visual-review`
   sur la PR. Si l'étape screenshots est désactivée, mets directement `factory:checks`.
9. **Issues de la première version** : pour chaque feature listée dans la fiche, ouvre une issue (titre
   « Feature : … », description en deux ou trois phrases tirées de la fiche) avec `<!-- factory-agent -->` en
   tête et le label `factory:feature`. Elles ne démarrent que quand le propriétaire y écrit.
10. L'issue garde `factory:building`. Poste sur l'issue un court message : le lien de la PR, et la liste des
   issues créées en disant qu'il pourra lancer chacune en y écrivant « go » quand les fondations seront en ligne.

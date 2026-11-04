# Étape : fondations du projet

Le propriétaire a validé la fiche projet (dernier commentaire `<!-- factory-brief -->` de l'issue).
Pose les fondations de l'appli jusqu'à une PR. Pas de feature métier ici : seulement le socle.

**Révision d'un projet déjà cadré** (`PRODUCT.md` ou `docs/PRODUCT.md` existe déjà sur `main`) : ne refais
**pas** les fondations. À la place :

1. Branche `claude/issue-<n>-revision` depuis `main`.
2. Mets à jour `PRODUCT.md` à la racine d'après la nouvelle fiche (déplace `docs/PRODUCT.md` s'il existe) ;
   si le design change, mets à jour `DESIGN.md` et `.impeccable/` (étape 3 ci-dessous) ; si la stack
   change, mets à jour `stack` dans `factory.config.json`. Ne touche pas au code de l'appli.
3. Pour chaque changement qui demande du code (nouvelle feature, design à appliquer aux écrans, changement
   de stack), ouvre une issue comme à l'étape 9 ci-dessous ; une feature déjà couverte par une issue
   ouverte n'en a pas besoin, complète plutôt cette issue d'un commentaire.
4. PR comme à l'étape 7 (résumé « La fiche produit mise à jour : … »), sans captures : mets directement
   `factory:checks` sur la PR. Poste sur l'issue le lien de la PR et la liste des issues créées.

**Adoption d'un projet commencé sans la factory** (du code existe mais pas de fiche produit sur `main`) :
ne refais **pas** l'appli et ne change pas son comportement.

1. Branche `claude/issue-<n>-adoption` depuis la branche par défaut.
2. Écris `PRODUCT.md` (étape 2 ci-dessous) d'après la fiche validée, et `stack` dans `factory.config.json`.
3. **Design** : si le look actuel est gardé, skill `impeccable`, commande `document` (`reference/document.md`)
   pour écrire `DESIGN.md` et `.impeccable/design.json` à partir des écrans existants. Si un nouveau look a
   été choisi, écris les documents comme à l'étape 3 ci-dessous et ouvre une issue « Appliquer le nouveau
   design » au lieu de toucher aux écrans ici.
4. **Contrôles** : ajoute seulement ce qui manque pour que les scripts npm `typecheck`, `lint`, `test`,
   `build` et `test:a11y` existent et passent (configuration, un premier test de la page d'accueil), et
   `vercel.json` avec le framework s'il n'y est pas. Si un contrôle échoue à cause du code existant, corrige
   ce qui est petit ; pour le reste, ouvre une issue `factory:bug` par problème et explique-le dans la PR.
5. Issues des **Prochaines features** comme à l'étape 9 ci-dessous.
6. PR comme à l'étape 7 (résumé « L'entrée du projet dans la factory : … »). Sans changement visible, mets
   directement `factory:checks` ; sinon fais les captures (étape 8).

Sinon (premier cadrage d'un projet vide), suis les étapes ci-dessous.

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

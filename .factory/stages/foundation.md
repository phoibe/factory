# Étape : fondations du projet

Le propriétaire a validé la fiche projet (dernier commentaire `<!-- factory-brief -->` de l'issue).
Pose les fondations de l'appli jusqu'à une PR. Pas de feature métier ici : seulement le socle.

**Révision d'un projet déjà cadré** (`PRODUCT.md` ou `docs/PRODUCT.md` existe déjà sur `main`) : ne refais
**pas** les fondations. À la place :

1. Branche `claude/issue-<n>-revision` depuis `main`.
2. Mets à jour `PRODUCT.md` à la racine d'après la nouvelle fiche (déplace `docs/PRODUCT.md` s'il existe) ;
   si le design change, mets à jour `DESIGN.md` et `.impeccable/` (étape 3 ci-dessous), en y ajoutant la
   règle « Textes à l'écran » si elle manque ; si la stack
   change, mets à jour `stack` dans `factory.config.json`. Ne touche pas au code de l'appli.
3. Pour chaque changement qui demande du code (nouvelle feature, design à appliquer aux écrans, changement
   de stack), ouvre une issue comme à l'étape 9 ci-dessous ; une feature déjà couverte par une issue
   ouverte n'en a pas besoin, complète plutôt cette issue d'un commentaire.
4. PR comme à l'étape 7 (résumé « La fiche produit mise à jour : … », avec « Pas vérifié en vrai : rien à essayer, seuls les documents changent »), sans captures : mets directement
   `factory:checks` sur la PR. Poste sur l'issue le lien de la PR et la liste des issues créées.

**Adoption d'un projet commencé sans la factory** (du code existe mais pas de fiche produit sur `main`) :
ne refais **pas** l'appli et ne change pas son comportement.

1. Branche `claude/issue-<n>-adoption` depuis la branche par défaut.
2. Écris `PRODUCT.md` (étape 2 ci-dessous) d'après la fiche validée, et `stack` dans `factory.config.json`.
3. **Design** : si le look actuel est gardé, skill `impeccable`, commande `document` (`reference/document.md`)
   pour écrire `DESIGN.md` et `.impeccable/design.json` à partir des écrans existants, règle
   « Textes à l'écran » comprise. Si un nouveau look a
   été choisi, écris les documents comme à l'étape 3 ci-dessous et ouvre une issue « Appliquer le nouveau
   design » au lieu de toucher aux écrans ici.
4. **Contrôles** : ajoute seulement ce qui manque pour que les scripts npm `typecheck`, `lint`, `test`,
   `build`, `test:a11y` et `test:e2e` existent et passent (configuration, un premier test de la page d'accueil).
   Si la fiche retient un hébergeur et que le dépôt n'y est pas encore déployé, fais comme à l'étape 5
   ci-dessous (puce « l'hébergeur retenu dans la fiche ») ; sinon ne touche pas à l'hébergement.
   Si un contrôle échoue à cause du code existant, corrige ce qui est petit ; pour le reste, ouvre une issue `factory:bug` par problème et explique-le dans la PR.
4 bis. **Fiche stack** : écris `STACK.md` à la racine d'après le code existant, au format de `.factory/stages/stack.md`.
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
     anti-inspirations, de ce qui le ferait se sentir mal et de la règle « Textes à l'écran » de
     `.factory/stages/design-pass.md`, à rappeler aussi à `impeccable`) ;
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
   - les scripts npm `typecheck`, `lint`, `test`, `build`, `test:a11y` (Playwright + axe-core sur les
     pages principales) et `test:e2e` (parcours Playwright dans `e2e/`, voir l'étape 4 bis de `build.md`, avec
     un premier parcours « j'ouvre l'appli et je vois sa page d'accueil »), qui passent tous : ce sont ceux des
     contrôles automatiques ; et `e2e/smoke-routes.txt` avec les écrans principaux ouverts sans connexion ;
   - un premier test qui vérifie que la page d'accueil s'affiche ;
   - un `README.md` technique court (en anglais) : lancer, tester, structure.
   - **l'hébergeur retenu dans la fiche** :
     - s'il ne demande aucun compte (par exemple GitHub Pages), mets-le en place toi-même dans cette PR
       (workflow de déploiement, réglages nécessaires) : le propriétaire n'a rien à faire. Pour GitHub Pages,
       revérifie d'abord que le dépôt est public (`gh api repos/<dépôt> --jq .private`) ; s'il est encore
       privé, ne mets pas Pages en place, ouvre la PR et dis-le-lui (ne change jamais la visibilité toi-même). Puis déploie dans
       l'environnement nommé exactement `github-pages` (celui du modèle officiel) : la factory sait ainsi
       qu'il n'y a pas d'aperçu de PR à attendre. Si un réglage
       t'est refusé (par exemple activer les pages du dépôt), ouvre la PR quand même et donne-lui le clic
       exact avec son lien (« Settings → Pages → Source : GitHub Actions ») ;
     - s'il demande un compte, ajoute seulement la configuration d'hébergement : déclare le
       type d'appli de la stack choisie, si l'hébergeur le demande (un projet importé quand le dépôt était vide
       ne sait pas encore quoi construire). Ne te connecte jamais à son compte.
   Si la stack demande un service (base de données, authentification) que le propriétaire doit créer, ne le
   branche pas encore : la première feature qui en a besoin le demandera.
5 bis. **Fiche stack** : écris `STACK.md` à la racine d'après le squelette, au format de `.factory/stages/stack.md`.
6. **Revue de code** et **passe design** comme dans `.factory/stages/build.md` (étapes 5 et 6 ; la passe design critique et corrige la page d'accueil), puis vérifie
   localement que les six scripts passent. **Contrôle du journal** : lance `node .factory/scripts/journal-check.mjs`. S'il liste des étapes manquantes, fais-les maintenant (outil Skill), puis relance-le jusqu'à « rien ne manque ».
6 bis. **Essai en conditions réelles**, en lecture seule, comme à l'étape 7 bis de `build.md` : ouvre la page
   d'accueil construite et, si l'appli est déjà en ligne, le vrai site, sans rien créer, modifier, envoyer ni
   supprimer de réel.
7. **PR** (API REST, voir AGENT.md) : en tête, un résumé en français (« Les fondations de l'appli : … »), avec la
   ligne « Essayé en vrai : … » et, pour ce qui ne peut pas l'être (l'hébergeur pas encore branché, un service à
   créer), « Pas vérifié en vrai : … » ; puis `Closes #<n>`, puis les détails techniques en anglais.
   **Hébergeur pas encore branché** (il demande un compte et rien ne signale ses déploiements sur le dépôt :
   aucun déploiement GitHub du dépôt (`gh api repos/<dépôt>/deployments`), aucun commentaire de son bot sur
   les PR précédentes) : ne bloque rien, ouvre la PR quand même. Ajoute au
   résumé et à ton message sur la PR que cette PR n'aura pas d'aperçu, en redonnant les liens et les clics de
   l'encadré « Avant de répondre « go » » de la fiche : une fois l'hébergeur branché, les PR suivantes auront
   leur aperçu.
8. **Captures** : suis `.factory/stages/screenshots.md` (pas de « avant »), puis mets `factory:visual-review`
   puis `factory:checks` sur la PR. Si l'étape screenshots est désactivée, mets directement `factory:checks`.
9. **Issues de la première version** : pour chaque feature listée dans la fiche, ouvre une issue (titre
   « Feature : … », description en deux ou trois phrases tirées de la fiche) avec `<!-- factory-agent -->` en
   tête et les labels `factory:feature` et `factory:kept` (il les a validées dans la fiche). Elles démarrent quand il y écrit,
   ou d'elles-mêmes quand une place est libre si la prise automatique est active.
10. L'issue garde `factory:building`. Poste sur l'issue un court message : le lien de la PR, et la liste des
   issues créées en disant qu'il pourra lancer chacune en y écrivant « go » quand les fondations seront en ligne.

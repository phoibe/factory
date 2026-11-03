# Étape : fondations du projet

Le propriétaire a validé la fiche projet (dernier commentaire `<!-- factory-brief -->` de l'issue).
Pose les fondations de l'appli jusqu'à une PR. Pas de feature métier ici : seulement le socle.

1. **Branche** `claude/issue-<n>-foundation` depuis `main`.
2. **Fiche produit** : écris `docs/PRODUCT.md` (en français), reprise fidèle de la fiche validée. Chaque run
   suivant la lira : c'est la mémoire du projet.
3. **Stack** : dans `factory.config.json`, remplace la valeur de `stack` par la stack validée, en une phrase.
   Ne touche à rien d'autre dans ce fichier.
4. **Squelette** de l'appli avec cette stack, versions stables et récentes (pas de préversion) :
   - une page d'accueil sobre avec le nom de l'appli et une phrase qui dit à quoi elle sert ;
   - les scripts npm `typecheck`, `lint`, `test`, `build` et `test:a11y` (Playwright + axe-core sur les
     pages principales), qui passent tous : ce sont ceux des contrôles automatiques ;
   - un premier test qui vérifie que la page d'accueil s'affiche ;
   - un `README.md` technique court (en anglais) : lancer, tester, structure.
   Si la stack demande un service (base de données, authentification) que le propriétaire doit créer, ne le
   branche pas encore : la première feature qui en a besoin le demandera.
5. **Revue de code** et **passe design** comme dans `.factory/stages/build.md` (étapes 5 et 6), puis vérifie
   localement que les cinq scripts passent.
6. **PR** (API REST, voir AGENT.md) : en tête, un résumé en français (« Les fondations de l'appli : … »),
   puis `Closes #<n>`, puis les détails techniques en anglais.
7. **Captures** : suis `.factory/stages/screenshots.md` (pas de « avant »), puis mets `factory:visual-review`
   sur la PR. Si l'étape screenshots est désactivée, mets directement `factory:checks`.
8. **Issues de la première version** : pour chaque feature listée dans la fiche, ouvre une issue (titre
   « Feature : … », description en deux ou trois phrases tirées de la fiche) avec `<!-- factory-agent -->` en
   tête et le label `factory:feature`. Elles ne démarrent que quand le propriétaire y écrit.
9. L'issue garde `factory:building`. Poste sur l'issue un court message : le lien de la PR, et la liste des
   issues créées en disant qu'il pourra lancer chacune en y écrivant « go » quand les fondations seront en ligne.

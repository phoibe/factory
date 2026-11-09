# Étape : fiche stack technique

La factory (ou le propriétaire, avec « Établir la fiche » dans le panneau) demande la **fiche stack** de ce
projet : `STACK.md` à la racine. Le bouton « Stack technique » du panneau l'affiche telle quelle. Pas de questions,
pas de spec : tu l'établis en lisant le projet.

1. **Branche** `claude/issue-<n>-stack` depuis `main`. Si `STACK.md` existe déjà sur `main` et qu'il est complet
   et exact, ferme la demande comme « déjà réglée » (voir AGENT.md) au lieu d'ouvrir une PR. Une fiche sans la partie
   « Mise en production » n'est pas complète : la demande « Compléter la fiche stack : la mise en production » ne
   change que cette partie (et corrige au passage ce qui serait faux).
2. **Lis le projet** : `PRODUCT.md` (stack validée au cadrage), les fichiers de dépendances (`package.json`,
   `requirements*.txt`, `pyproject.toml`…, dans tous les dossiers), la configuration d'hébergement et de
   déploiement (`.github/workflows/`, fichiers de configuration de l'hébergeur, `Dockerfile`…), les variables d'environnement
   attendues (`.env.example`), et le code là où un service externe est appelé. Vérifie chaque techno dans le code :
   n'écris rien que tu n'as pas vu.
3. **Écris `STACK.md`** au modèle ci-dessous (en français, vouvoiement, sans jargon inutile). Les titres `##` sont
   fixes, dans cet ordre ; le panneau les affiche tels quels. Règles :
   - chaque nom est suivi de sa **version principale**, sans les numéros de détail : les deux premiers nombres
     (« FastAPI 0.115 », « Playwright 1.49 »), ou le seul nombre sous lequel la techno se présente (« Node.js 22 ») ;
     « version non indiquée » si tu ne la trouves nulle part. Puis « — » et quelques mots qui disent à quoi il sert ;
   - pas de jargon : « demande » plutôt que « issue », « étiquette » plutôt que « label », « livraison » plutôt que « PR » ;
   - pour chaque partie : le langage, le framework ou « aucun framework », et l'hébergement ;
   - une partie qui n'existe pas dit « Aucun » en une ligne (ne supprime pas le titre) ;
   - **Données** : la base de données (nom, version, hébergeur), ou comment les données sont stockées s'il n'y en a
     pas de classique (fichiers, navigateur, GitHub…) ;
   - **Bibliothèques** : toutes celles des fichiers de dépendances, sous les deux sous-titres ; regroupe celles
     d'une même famille en une ligne si elles sont nombreuses (« <famille> (6 composants) — … ») ;
   - **Services nécessaires** : d'abord à quoi il sert, puis « Gratuit » ou « Payant », « compte nécessaire » ou
     « sans compte », et pour un service gratuit la limite qui compte en une phrase (« gratuit jusqu'à 100 Go de trafic par mois »).
     Vérifie la limite sur le site du service (WebFetch) ; si tu ne peux pas, écris « limite à vérifier ».
   - **Mise en production** : la factory la lit pour savoir où elle s'arrête, donc la **première ligne** suit
     exactement l'une des deux formes ci-dessous, et rien d'autre ne commence par ces mots en gras :
     - `- **Automatique** — <qui publie et quand>` quand un merge sur la branche principale met le projet en ligne
       **tout seul** : hébergeur relié au dépôt qui publie la branche principale, ou workflow déclenché par le push
       sur la branche principale qui déploie. Cite ce qui le prouve (fichier de configuration de l'hébergeur,
       workflow de `.github/workflows/`, hébergeur qui commente les PR).
     - `- **Manuelle** — <le geste, en une phrase>` quand un merge ne déploie rien : commande à lancer à la main
       (`git push prod main`, script de publication), workflow lancé seulement à la main ou sur un tag, procédure
       écrite (`DEPLOY.md`, `docs/`), ou aucun déploiement trouvé. Donne la commande exacte entre accents graves si
       le projet l'écrit, et qui la lance.

     Les lignes suivantes ajoutent ce qui aide à comprendre (étapes de la procédure, retour arrière). Dans le doute,
     écris **Manuelle** et dis pourquoi : annoncer une mise en ligne qui n'a pas lieu est pire que l'inverse.

```markdown
# Stack technique

## Interface
- **<Langage> <version>** — <à quoi il sert>
- **Framework** : <Nom version> — <à quoi il sert> (ou « aucun framework »)
- **Hébergement** : <Service> — <ce qu'il fait>

## Moteur / serveur
- …

## Autres services
- …

## Données
- …

## Bibliothèques
### Pour faire tourner le logiciel
- **<nom> <version>** — <à quoi elle sert>
### Pour la fabrication et les tests
- **<nom> <version>** — <à quoi elle sert>

## Services nécessaires
- **<Service>** — <à quoi il sert>. Gratuit, compte nécessaire. <Limite de l'offre gratuite en une phrase.>

## Mise en production
- **Automatique** — <qui publie le projet à chaque merge> (ou **Manuelle** — <le geste qui le publie, et qui le fait>)
- <précisions utiles : étapes, retour arrière>
```

4. **Vérifie** : relis la fiche contre les fichiers de dépendances (aucune bibliothèque oubliée ni inventée), puis
   lance les tests du projet (`npm test` s'il existe) et `node .factory/scripts/journal-check.mjs`.
5. **PR** (API REST, voir AGENT.md) : résumé en français (« La fiche stack technique du projet : vous la verrez avec
   le bouton « Stack technique » du panneau »), le marqueur `<!-- factory-nothing-to-test -->` sur une ligne (rien ne
   change dans l'appli), `Closes #<n>`, puis les détails en anglais. Mets `factory:checks` sur la PR.
6. L'issue garde `factory:building`. Poste sur l'issue un court message avec le lien de la PR.

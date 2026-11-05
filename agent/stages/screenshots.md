# Sous-étape : captures avant/après (clair et sombre, côte à côte)

1. Liste les routes (URL) dont l'apparence change.
2. **Thème sombre** : cherche dans le code si l'appli a un thème sombre.
   - Thème qui suit le réglage du navigateur (`prefers-color-scheme`) : rien à faire, l'outil le simule tout seul.
   - Thème activé par un bouton ou une option (classe ou attribut posé sur la page) : repère laquelle et ajoute
     `--dark-class <classe>` (ex. `--dark-class dark`) ou `--dark-attr <nom=valeur>` (ex. `--dark-attr data-theme=dark`)
     aux commandes `capture` ci-dessous.
   - Si l'appli semble avoir un thème sombre mais que tu ne trouves pas comment l'activer : ne devine pas, écris-le
     dans le commentaire de la PR.
   - L'outil prend d'abord le clair puis le sombre, et ne garde les captures sombres (suffixe `--sombre`) que si la
     page est réellement différente du clair. Pas de thème sombre : rien de plus n'est publié.
   **Écrans derrière une connexion ou une base de données** : ne saute jamais les captures (le verrou relance
   alors un rattrapage complet, une dizaine de minutes de plus). Lance l'appli avec la base locale qu'utilisent les
   tests (ou une base jetable démarrée sur la machine), crée un compte de démonstration, puis capture les écrans
   connectés en passant le cookie de session à l'outil (`--cookie <nom>=<valeur>` sur les commandes `capture`).
   Fais pareil pour « avant ». N'ajoute pas de page de test dans l'appli pour ça.
3. **Après** : lance l'appli de la branche (`npm run build && npm run start -- -p 3000`, ou `npm run dev`),
   puis `node .factory/scripts/shots.mjs capture --base-url http://localhost:3000 --routes /,/autre --out /tmp/shots/after`
   (avec l'option de l'étape 2 si besoin).
4. **Avant** : `git worktree add /tmp/before main`, installe, lance sur le port 3001, puis la même commande
   (mêmes options) avec `--base-url http://localhost:3001 --out /tmp/shots/before`. Si `main` n'a pas encore d'appli,
   pas de « avant ». Un écran ou un thème sombre absent de « avant » s'affiche « nouvel écran » côté avant.
5. `node .factory/scripts/shots.mjs publish --pr <numéro> --before /tmp/shots/before --after /tmp/shots/after > /tmp/shots.md`
   (sans `--before` s'il n'y en a pas). Le script fabrique **une seule image par écran, taille et thème** (avant à gauche,
   après à droite), la pousse sur `claude/factory-assets` et écrit un tableau : les lignes sombres
   (« accueil · desktop · sombre ») suivent les lignes claires.
6. Commente la PR : `<!-- factory-agent -->`, une phrase par écran sur ce qui change visuellement (en clair puis en
   sombre), le tableau, puis « Répondez « ok » si cela vous convient (clair et sombre), ou dites-moi ce qu'il faut retoucher. »

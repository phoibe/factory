# Sous-étape : captures avant/après (clair et sombre, côte à côte)

1. Liste **tous les écrans principaux** de l'appli (pas seulement ceux que la feature touche) : chaque page, et
   l'état le plus parlant de chacune (connecté ou non). Une feature peut abîmer un écran qu'elle ne touche pas
   (un en-tête partagé, un style commun) : c'est ce que cette capture complète attrape. L'outil ne montre au
   propriétaire que les écrans qui ont changé, et liste les autres en une ligne.
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
3. **Heure fixe de l'appli** : construis et lance chaque appli (« après » comme « avant ») **à travers l'outil, dans
   une seule commande**, en arrière-plan : `node <outil> run -- sh -c 'npm run build && exec npm run start -- -p 3000'`
   (ou `node <outil> run -- npm run dev`), où `<outil>` est le chemin complet de `.factory/scripts/shots.mjs` **dans le
   dossier du projet** (celui de la branche, même pour « avant » : la copie de `main` n'a peut-être pas encore
   l'outil, ou une version sans `run`). La construction et l'appli Node.js tournent alors à la même date et à la même
   heure fixes que le navigateur des captures (l'horloge avance ensuite normalement) : les données d'exemple datées à
   la construction ou au démarrage portent la même heure avant et après (issue #422). Une donnée datée plus tard (à la
   première visite d'une page) peut encore différer de quelques secondes : c'est le rôle du filet de l'étape 4 bis.
   Pour une appli dans un autre langage, fais pareil avec son moyen habituel (variable d'heure de test de l'appli,
   `faketime` s'il est installé), sinon le filet reste là.
   **Si l'heure fixe casse l'appli** (écrans connectés renvoyés vers la page de connexion, erreurs d'un service
   extérieur ou de la base, qui gardent l'heure réelle) : relance les deux applis sans `run`, avant comme après, et
   compte sur le filet. Avant d'y renoncer, crée aussi le compte de démonstration (script ou commande de l'étape 2)
   à travers `node <outil> run -- …` : un compte daté de l'heure réelle peut être refusé par une appli à l'heure fixe.
   Arrête toujours une appli en arrêtant sa commande `run` (elle arrête tout ce qu'elle a lancé), sinon l'ancienne
   garde le port. Regarde toujours qu'avec l'heure fixe les écrans connectés montrent bien l'appli connectée :
   deux pages de connexion identiques donneraient à tort « aucun écran n'a changé ».
   **Après** : une fois l'appli de la branche lancée sur le port 3000 comme ci-dessus, attends qu'elle réponde
   (`curl -sf --retry 60 --retry-delay 5 --retry-connrefused http://localhost:3000 >/dev/null`) et vérifie dans la
   sortie de la tâche qu'elle a bien démarré (pas d'erreur de port déjà pris), puis
   `node .factory/scripts/shots.mjs capture --base-url http://localhost:3000 --routes /,/autre --out /tmp/shots/after`
   (avec l'option de l'étape 2 si besoin).
3 bis. **Capture de la présentation** (`README.md`, voir `.factory/stages/readme.md`) : si la page d'accueil a pu
   changer d'apparence, ou que la présentation n'a pas encore sa capture, copie `/tmp/shots/after/accueil--desktop.png`
   dans `docs/readme/accueil.png`, committe et pousse-la avec la PR. Pas pour la factory elle-même, ni pour une appli
   sans page d'accueil.
4. **Avant** : `git worktree add /tmp/before origin/main`, `cd /tmp/before && npm ci`, puis
   `cd /tmp/before && node <outil> run -- sh -c 'npm run build && exec npm run start -- -p 3001'` (même `<outil>`
   qu'à l'étape 3 ; le `cd` dans la même commande, car il ne passe pas d'une commande à l'autre), attends qu'elle
   réponde sur le port 3001 comme à l'étape 3, puis la même commande `capture` (mêmes options) avec `--base-url http://localhost:3001 --out /tmp/shots/before`. Si `main` n'a pas encore d'appli,
   pas de « avant ». Un écran ou un thème sombre absent de « avant » s'affiche « nouvel écran » côté avant.
   L'outil fige l'écran avant chaque photo (date et heure fixes, animations arrêtées, curseur caché), « avant » comme
   « après » : un écran identique donne la même image et n'est pas montré. Il reste montré au moindre point de
   différence (aucune tolérance) : si un écran que tu n'as pas touché change quand même, vois l'étape 4 bis.
   L'heure ne s'écoule pas pendant la photo : si un écran paraît inachevé ou vide alors que l'appli réelle va bien,
   il attend sans doute que le temps passe ; dis-le aussi dans le commentaire.
4 bis. **Le filet : écarter un écran sans changement visible.** Regarde les captures avant/après de chaque écran que
   la demande ne devait pas toucher et qui a changé quand même (les images qui diffèrent entre `/tmp/shots/before` et
   `/tmp/shots/after`, à ouvrir avec l'outil Read). Si la **seule** différence est une donnée qui change
   d'elle-même (une heure, une date, un tirage au hasard, une donnée venue d'internet), écarte-le : écris un fichier
   JSON `{"<écran>": "<raison>"}` (l'écran est le nom de la route dans les captures, comme `screener`, pour toutes ses
   tailles et thèmes, ou un nom précis comme `screener--mobile--sombre`), par exemple
   `{"screener": "seule l'heure du dernier passage diffère"}`, et ajoute `--set-aside <fichier>` à la commande `publish`.
   L'écran n'est pas montré, mais une ligne sous les captures le cite avec sa raison, pour que le propriétaire puisse le
   réclamer. N'écarte **jamais** un écran que la demande devait changer, un nouvel écran, un écran où une donnée change
   parce que la demande la change volontairement, ni un écran où la différence touche autre chose (texte, mise en page,
   couleurs) : au moindre doute, l'écran est montré. La raison est écrite pour le propriétaire, en français simple.
5. `node .factory/scripts/shots.mjs publish --pr <numéro> --before /tmp/shots/before --after /tmp/shots/after > /tmp/shots.md`
   (sans `--before` s'il n'y en a pas ; avec `--set-aside <fichier>` si tu as écarté des écrans à l'étape 4 bis).
   Le script fabrique **une seule image par écran, taille et thème** (avant à gauche,
   après à droite), la pousse sur `claude/factory-assets` et écrit un tableau qui ne sert qu'à vérifier : les lignes sombres
   (« accueil · desktop · sombre ») suivent les lignes claires.
   **Tu ne publies jamais ce tableau toi-même** : la factory le publie avec son propre robot, à partir des images
   poussées, dès que tu poses `factory:checks` sur la PR (un tableau envoyé depuis ta session peut arriver abîmé sur
   GitHub, issue #378). Ne recopie aucun lien d'image dans tes messages.
6. **Aucun écran n'a changé** (ou tous ceux qui différaient ont été écartés à l'étape 4 bis) : la sortie de l'outil
   contient alors `<!-- factory-shots-unchanged -->` et la phrase
   « J'ai comparé tous les écrans, en clair et en sombre : aucun n'a changé d'apparence. », suivie de la ligne des
   écrans écartés s'il y en a (garde-la telle quelle dans ton commentaire).
   - Si la demande prévoyait justement un changement d'apparence, revérifie d'abord tes captures (bonne page, bon état
     d'écran, bonne option de thème sombre) et refais-les si l'une était mal prise.
   - Si c'est confirmé, commente la PR : `<!-- factory-agent -->`, puis la sortie de l'outil telle quelle (avec ses marques
     cachées), plus, si un changement d'apparence était prévu, une phrase qui explique pourquoi rien ne se voit. On ne
     demande rien au propriétaire : pas de « Répondez « ok » », et pas `factory:visual-review` sur la PR, seulement
     `factory:checks`. La carte passe directement aux contrôles, puis à la suite habituelle (recette ou mise en
     ligne, selon les règles de la factory, qui ne changent pas).
7. **Au moins un écran a changé** : commente la PR, **sans le tableau** : `<!-- factory-agent -->`, une phrase par écran sur ce qui change
   visuellement (en clair puis en sombre) (un écran que la feature ne devait pas toucher et qui a changé : corrige-le
   d'abord, ou explique pourquoi en une phrase), « Les captures suivent juste en dessous, publiées par la factory. »,
   puis « Répondez « ok » si cela vous convient (clair et sombre), ou dites-moi ce qu'il faut retoucher. ».
   Mets ensuite `factory:checks` sur la PR, **jamais `factory:visual-review` toi-même** : la factory publie alors le
   tableau, puis met elle-même la carte en « Captures à valider ». Ainsi la carte n'y entre qu'une fois les captures
   visibles (issue #455) ; poser ce label avant qu'elles le soient, la factory te le retire.

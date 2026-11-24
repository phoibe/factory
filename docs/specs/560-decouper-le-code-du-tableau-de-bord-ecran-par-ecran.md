# 560 · Découper le code du tableau de bord écran par écran

> Demande [#560](https://github.com/phoibe/factory/issues/560) · 2026-11-24

**En une phrase** : le code du tableau de bord, aujourd'hui un seul bloc de près de 3 500 lignes, est rangé en une partie par écran, sans rien changer à ce que vous voyez ni à ce que vous faites.

### Ce qui change

Chaque écran a désormais sa propre partie, qui garde pour elle ce dont elle se souvient :
- **la connexion** (l'écran où vous collez votre jeton) ;
- **la liste des projets** et ses points d'état ;
- **le haut d'un projet** : son nom, l'état du site en ligne, « Mise en production », « Déclarer stable », « Stack technique », « Sur mon téléphone », le nombre d'agents lancés dans la journée ;
- **l'onglet « Suivi »** : les cartes, « go » et « Ok », les idées à trier, « Terminé » ;
- **l'onglet « Agent »** : les conversations, l'envoi des messages et des images, le jeton de lecture ;
- **l'onglet « Paramètres »** ;
- **la page « Réglages généraux »**.

Une petite partie commune garde seulement ce que tous les écrans partagent : qui est connecté, quel projet est ouvert et **quel écran est affiché**. C'est le point important : aujourd'hui, chaque écran doit deviner ce que montrent les autres ; demain, il le demande à un seul endroit. C'est ce qui évite les bugs du genre « un écran ne sait pas qu'un autre est affiché ».

L'adresse du tableau de bord ne change pas, et vos projets n'ont rien à mettre à jour.

### Règles

- **Aucun changement visible** : mêmes écrans, mêmes textes, mêmes boutons au même endroit, mêmes réactions, sur ordinateur comme sur téléphone. Il n'y a donc pas de captures avant/après à valider.
- **Tous les tests existants restent, inchangés dans ce qu'ils vérifient**, et doivent tous passer : les parcours rejoués dans un vrai navigateur (plus de 300 vérifications), les contrôles d'accessibilité et les tests du tableau de bord. La partie commune reçoit en plus ses propres tests.
- **Se déconnecter** (ou un jeton refusé par GitHub) continue de tout effacer d'un coup, pour tous les écrans ; **changer de projet** repart toujours d'écrans propres, comme aujourd'hui.
- Le découpage se fait par petites étapes, les tests passant après chacune, pour qu'un éventuel oubli se voie tout de suite.
- Si en chemin je repère un vrai défaut, je ne le corrige pas dans ce chantier : il devient une idée à trier.
- **Aucune correction perdue** : le découpage part du tableau de bord tel que la review générale (#556) l'aura laissé, c'est pourquoi sa construction attend qu'elle soit fusionnée. Et juste avant la livraison, je vérifie une à une que les modifications du tableau de bord livrées entre-temps par d'autres demandes sont bien toujours là.

### Hors périmètre

- Toute nouvelle fonctionnalité, toute retouche d'apparence, toute correction de comportement.
- Le moteur de la factory et le serveur de discussion.
- La façon dont le navigateur recharge les fichiers après une mise à jour (c'est la demande #561).

### Comment vérifier

- Les contrôles automatiques de la PR sont au vert (tous les tests, anciens et nouveaux).
- Sur la preview puis en ligne, faites le tour habituel, tout doit se passer comme avant : ouvrir un projet, regarder les cartes de « Suivi », envoyer un message dans « Agent », changer un réglage dans « Paramètres » et l'enregistrer, ouvrir puis fermer « Réglages généraux », changer de projet, vous déconnecter et vous reconnecter, et refaire un passage sur téléphone.
- Le compte rendu de la PR montre que le gros bloc a laissé place à une partie par écran.

<details>
<summary>Notes techniques pour la construction (rien à lire pour vous)</summary>

Faits relevés dans le code (sur `main`, avant la fusion de #556).

- **Aujourd'hui** : `panel/app.mjs` fait 3 458 lignes, environ 150 fonctions et 56 écouteurs posés au chargement. La logique pure est déjà dans de petits modules testés (`lib`, `live`, `chat`, `eta`, `pending`, `projects`, `production`, `machine`…) : il reste dans `app.mjs` le dessin des écrans et tout l'état, en variables de module (`token`, `readToken`, `current`, `projects`, `catalog`, `defaults`, `dots`, `known`, puis `live`, `boards`, `chat`, `general`, `machine`, `gap`, `release`, `stackCache`, `sentGo`…).
- **Les couplages entre écrans à rendre explicites** : `show()` ferme les Réglages généraux, sort du plein écran de la discussion et ferme la fenêtre des projets (avec un `typeof placeMenu === 'function'` qui trahit une dépendance à l'ordre du fichier) ; `selectTab()` pilote la discussion (`openChat`, `scheduleChat`, `setChatFull`, `fitChat`) ; `resetSession()` remet à zéro l'état de tous les écrans à la main ; `drawReadTokenCard()` appelle `setChatFull` ; `renderRules()` ouvre `openGeneral`.
- **Cible proposée** (noms au choix du plan) : `app.mjs` reste le seul point d'entrée chargé par `index.html` et ne fait plus que relier les parties (`start()`, navigation). Un module commun (stockage, jetons, `api`, `el`, `toast`, projet ouvert, écran et onglet affichés avec un abonnement « l'écran a changé »), puis un module par écran : liste des projets, haut du projet (écart de production, mise en production, stable, stack, téléphone, lancements du jour), Suivi, Agent, Paramètres, Réglages généraux. Chaque écran garde son état et déclare lui-même sa remise à zéro et sa réaction à un changement d'écran ou de projet ; plus aucun écran ne touche les variables d'un autre.
- **Contrainte des modules** : une variable `let` importée est en lecture seule ; l'état partagé passe par un objet ou des fonctions du module commun.
- **Piège du cache** : un module qui porte de l'état doit être importé partout avec exactement la même adresse (même `?v=N`, ou aucun), sinon le navigateur le charge deux fois et l'état est dédoublé. Monter `app.mjs?v=86` dans `index.html` et ne rien changer d'autre dans ce fichier (un simple changement de numéro n'est pas compté comme un changement visuel). Si #561 est fusionnée avant, suivre son mécanisme.
- **Publication et outils** : `pages.yml` copie `panel/*` (sous-dossiers compris) ; `e2e/fixture.mjs` sert le dossier `panel/` ; `tools/project-checks.mjs build` ne vérifie que les fichiers cités par `index.html`.
- **Tests qui lisent le texte de `app.mjs`** : `test/panel-session.test.mjs` (`resetSession`, `sessionExpired`, `start`, `refreshRuns`, le clic sur « Se déconnecter », une seule occurrence de `boards.clear()`) et `test/panel-live.test.mjs` (lignes 101 et 119 : `live-text`, `flip`). Les repointer vers les nouveaux fichiers en gardant ce qu'ils garantissent : une seule remise à zéro, par laquelle passent déconnexion, jeton expiré et refus au démarrage.
- **Filet de sécurité** : 52 fichiers `e2e/*.e2e.mjs` (328 tests), 5 `a11y/*.a11y.mjs`, 19 `test/panel-*.test.mjs`. Lancer `test:e2e` et `test:a11y` après chaque étape (`CHROMIUM_PATH=/opt/pw-browsers/chromium`, `timeout 300`).
- **Plan** : toutes les tâches touchent `app.mjs`, donc séquentielles (aucune parallélisable). Ordre suggéré : module commun, Réglages généraux, Paramètres, haut du projet, liste des projets, Agent, Suivi, puis le nettoyage du point d'entrée et les tests repointés. Test rouge d'abord : les tests du module commun (quel écran est affiché, remise à zéro déclarée par chaque écran).
- **Avant d'ouvrir la PR** : après `git merge origin/main`, relire `git diff <point de départ>..origin/main -- panel/` et reporter chaque modification de `app.mjs` dans la nouvelle partie concernée. À surveiller : #558, en construction, touche la vérification du jeton de lecture (`checkReadToken`, aujourd'hui dans `app.mjs`).

</details>

# Étape : review générale de l'application

Le propriétaire a demandé, depuis le tableau, une review générale : pas une feature, mais une remise à niveau de
toute l'appli. Deux passes, dans cet ordre, chacune suivie de ses corrections, puis la chasse aux erreurs répétées.
Pas de spec à valider.

1. **Branche** `claude/issue-<n>-review` depuis `main`. Lis `PRODUCT.md` et `DESIGN.md`.
1 bis. **Estimation de durée** : après avoir listé les écrans et parcouru le code, publie sur l'issue une estimation
   du temps restant, au même format que l'étape 0 de `build.md` (taille `large`, marqueur `factory-estimate`). Le
   tableau l'affiche à la place d'une durée de feature, qui serait bien trop courte. Si tu dépasses le haut de ta
   fourchette, publie une nouvelle estimation pour ce qu'il reste. Compte aussi la chasse aux erreurs répétées
   (étape 3 quater) : la lecture de l'historique (bien plus la première fois : 100 modifications) et jusqu'à 5
   protections avec leur preuve allongent nettement la review.
2. **Passe design sur tous les écrans** : fais la liste de **tous** les écrans de l'appli (pages, routes,
   états importants : vide, erreur, chargement, connecté ou non), pas seulement ceux d'un diff. Puis suis
   `.factory/stages/design-pass.md` sur cette liste : skill `impeccable`, une seule critique complète
   (commande `critique`, avec ses deux évaluations) pour chaque écran, correction de tout ce qu'elle trouve, puis
   un seul contrôle léger, et seulement si cette critique a trouvé des problèmes prioritaires (P0/P1), sans
   nouvelle critique ensuite (étape 4 de `design-pass.md`), avec la
   règle « Textes à l'écran » de `design-pass.md` sur tous les écrans. Reste dans `DESIGN.md` ; si un
   problème demande de changer le design validé, change `DESIGN.md` aussi et signale-le dans la PR. Si elle existe, tiens à
   jour sa partie « Mises en page » (étape 3 bis de `design-pass.md`, jamais pour un design repris).
3. **Revue de code générale** : charge le skill `requesting-code-review` (outil Skill), puis fais relire
   **tout le code** (pas un diff) par des sous-agents neufs du rôle `audit` (`model` et `effort` de
   `models.audit`, description `[role:audit] …`), un par grande partie de l'appli si elle est grosse, un seul
   pour une petite appli relue d'un bloc, lui aussi sur le rôle `audit`. Ils cherchent : bugs, failles de
   sécurité et données personnelles, erreurs mal gérées, tests manquants sur ce qui compte, accessibilité,
   performances, code mort ou dupliqué, écarts avec `PRODUCT.md`. Un relecteur qui échoue (pas de réponse, ou
   rapport inutilisable deux fois) repart sur le rôle `review` (description `[role:review] …`). Puis un sous-agent du rôle `review` fait la synthèse de
   leurs rapports (doublons, priorités, ce qui manque). Fais corriger chaque point par des sous-agents du rôle
   `code` (skill `receiving-code-review`) ; pour un bug, le test qui échoue s'écrit d'abord. Puis une revue
   neuve des corrections par un sous-agent du rôle `review`, au plus 3 tours, en suivant
   `.factory/stages/code-review.md` : un problème ne bloque que s'il est prouvé (cette revue des corrections
   seulement, pas les relectures partie par partie ni leur synthèse).
3 bis. **Architecture** : si `improve-codebase-architecture` est installé (le dossier
   `.claude/skills/improve-codebase-architecture/` existe), lis `.claude/skills/improve-codebase-architecture/SKILL.md`
   (outil Read) et suis sa partie « 1. Explore », en autonomie. Ne le charge jamais avec l'outil Skill : il est
   réservé au lancement à la main et l'outil te le refuserait (issue #622). Son appel à `codebase-design` en tête :
   charge ce skill (outil Skill) seulement s'il est installé, sinon ignore cet appel. Le sous-agent que « 1. Explore »
   fait lancer part sur le rôle `plan` comme tout sous-agent (description `[role:plan] Architecture`, `model` et
   `effort` de `models.plan`). Repère les endroits où le code s'est alourdi au fil des features (modules trop
   bavards, logique dupliquée, parties difficiles à tester). Simplifie ici ce qui est petit et sans risque, tests à
   l'appui ; pour un vrai chantier, ouvre une idée (point 4). Saute ses parties « 2. Present candidates as an HTML
   report » et « 3. Grilling loop » (rapport HTML, questions) : tu travailles seul.
3 ter. **Parcours** : si le projet n'a pas encore `test:e2e`, ajoute-le (voir l'étape 4 bis de `build.md`) avec
   un parcours par feature déjà en ligne, d'après les critères d'acceptation des specs validées, et remplis
   `e2e/smoke-routes.txt`.
3 quater. **Chasse aux erreurs répétées** : une fois les corrections des étapes 3 à 3 ter terminées, suis la partie
   « Chasse aux erreurs répétées » plus bas, sur cette même branche et dans cette même PR.
4. **Hors périmètre** : ce qui demande une vraie nouvelle feature ou un gros chantier ne se fait pas ici.
   Ouvre une issue par sujet, titre et texte en français, expliquée simplement (voir « Ouvrir une issue » dans AGENT.md : pas de
   `factory:kept`, elles iront dans « Idées à trier » ; et jamais une idée qu'il a déjà refusée), et cite-les dans la PR.
4 bis. **Fiche stack** : vérifie que `STACK.md` est complet et exact (format de `.factory/stages/stack.md`) ; corrige-le, ou écris-le s'il manque.
5. **Vérifie** localement (`typecheck`, `lint`, `test`, `build`, `test:a11y`, `test:e2e`), puis
   `node .factory/scripts/journal-check.mjs` : il doit dire que rien ne manque.
6. **PR** (API REST, voir AGENT.md) : en tête, un résumé en français pour le propriétaire (« Review générale :
   ce qui a été amélioré »), avec la section « Design » de `design-pass.md` (score de la première et de la
   dernière critique), une section « Code » (une ligne simple par problème corrigé), une section « Erreurs
   répétées » (point 9 de la chasse) et les issues ouvertes,
   et la ligne « Essayé en vrai : … » / « Pas vérifié en vrai : … » de l'étape 7 bis de `build.md` (essai en
   conditions réelles, en lecture seule). Puis `Closes #<n>`, puis les détails techniques en anglais.
7. **Captures** : si l'apparence a changé et que l'étape screenshots est active, suis
   `.factory/stages/screenshots.md` sur les écrans modifiés. Dans tous les cas, mets ensuite `factory:checks` sur la PR :
   s'il y a des captures, la factory les publie et pose elle-même `factory:visual-review`.
8. L'issue garde `factory:building`. Poste sur l'issue un court message avec le lien de la PR et, s'il y a eu une passe design, la ligne
   « Score design : … » (étape 7 de `design-pass.md`).

## Chasse aux erreurs répétées

Le but : trouver dans l'historique récent les erreurs que les agents refont, et poser pour chacune une protection
prouvée au lieu de simplement la noter. Tu pilotes ; les lectures, le tri et le code sont faits par des sous-agents.

1. **Historique à lire.** Liste les modifications livrées par la factory (PR fusionnées dans `main`, branche
   `claude/…` du projet lui-même), de la plus récente à la plus ancienne ; les PR de documents (`claude/docs-…`) ne
   comptent pas :
   `gh api --paginate "R/pulls?state=closed&base=main&per_page=100" --jq '.[] | select(.merged_at != null and (.head.ref | startswith("claude/")) and (.head.ref | startswith("claude/docs-") | not) and .head.repo.full_name == .base.repo.full_name) | "\(.merged_at) #\(.number) \(.head.ref) \(.title)"' | sort -r`.
   La review générale précédente est la PR la plus récente de cette liste dont la branche est exactement
   `claude/issue-<n>-review`, sans rien après `-review` (étape 1), et dont la demande #<n> porte l'étiquette
   `factory:audit`. Garde les modifications fusionnées depuis, 50 au moins et 100 au plus : s'il y en a moins de 50,
   remonte plus loin dans la liste jusqu'à 50 ; s'il y en a plus de 100, garde les 100 plus récentes. Première chasse
   du projet (pas de PR de review générale précédente, ou sa description n'a pas de section « Erreurs répétées ») :
   les 100 dernières. Projet de moins de 50 modifications : toutes. `<date>` est la date de fusion de la plus ancienne
   modification gardée. Relève aussi les bugs ouverts depuis cette date par le propriétaire, par quelqu'un qui a le
   droit d'écrire dans le projet ou par la factory :
   `gh api --paginate "R/issues?labels=factory:bug&state=all&since=<date>&per_page=100" --jq '.[] | select(.pull_request == null and .created_at >= "<date>" and (.author_association == "OWNER" or .author_association == "MEMBER" or .author_association == "COLLABORATOR" or .user.login == "github-actions[bot]" or .user.login == "claude[bot]")) | "#\(.number) \(.created_at) \(.title)"'`.
   Un bug ouvert par une personne extérieure au projet ne compte pas. Relève aussi les retours en arrière : si le clone
   est partiel (`git rev-parse --is-shallow-repository` répond `true`), complète d'abord l'historique avec
   `git fetch --shallow-since=<date> origin main`, puis `git log origin/main --since=<date> --grep='^Revert'`.
   Les retours en arrière de la factory sont aussi les PR `claude/revert-pr-<n>` déjà dans la liste. Ces bugs et ces
   retours en arrière sont ajoutés aux tranches du point 2 : ce sont les sous-agents qui les lisent, pas toi, et les
   bugs ne se lisent qu'avec `thread.mjs`. Relis enfin la partie « Erreurs répétées » du résumé de la review générale
   précédente (`thread.mjs` sur sa PR) : ses familles laissées « à traiter à la prochaine review » sont reprises, avec
   leurs cas.
2. **Lecture par tranches.** Découpe la liste en tranches d'une dizaine de modifications et fais lire chaque tranche, en
   même temps, par un sous-agent neuf du rôle `audit` (`model` et `effort` de `models.audit`, description
   `[role:audit] Historique : …`), avec la même règle d'échec qu'à l'étape 3. Il lit chaque PR et sa demande avec
   `node .factory/scripts/thread.mjs <n>`, jamais autrement (sur un projet public, les messages des personnes
   extérieures au projet restent laissés de côté et ne comptent pas), puis le diff de la PR. Il lit aussi
   les commits de la PR, pas seulement son diff final (`--paginate`, sinon GitHub n'en rend que 30) :
   `gh api --paginate "R/pulls/<n>/commits?per_page=100" --jq '.[] | "\(.sha[0:7]) \(.commit.message | split("\n")[0])"'`,
   puis le diff des commits utiles, par l'API car ils ne sont pas dans l'historique de `main` après une fusion en un
   seul commit : `gh api R/commits/<sha> -H "Accept: application/vnd.github.diff"`. Un commit de correction après le
   premier commit de livraison est la trace d'une correction demandée par la relecture. Il rend chaque erreur trouvée :
   une phrase simple, la modification où elle est apparue (lien), le commit où on la voit, et d'où elle vient. **Compte
   comme une erreur** : une correction demandée par la relecture, une remarque du propriétaire sur les captures ou en
   recette, un bug ouvert après une livraison, un retour en arrière. **Ne compte pas** : une erreur déjà arrêtée par un
   contrôle automatique existant, un simple changement d'avis du propriétaire.
3. **Familles.** Un sous-agent du rôle `review` reçoit ces erreurs, avec les familles reprises au point 1 (et leurs cas)
   et la liste « Pièges connus » actuelle (pour repérer une règle dont l'erreur est revenue), les regroupe en familles
   (la même erreur revenue au moins 2 fois) et vérifie chaque cas passé à sa source. Protège au plus 5 familles par
   review : les plus fréquentes d'abord ; à égalité, celles qui viennent d'une remarque du propriétaire (captures ou
   recette) ou un bug passent avant celles qui viennent de la relecture. Une règle déjà dans les « Pièges connus » dont
   l'erreur est revenue passe en premier et compte parmi les 5 : sa protection est renforcée et prouvée sur ce nouveau
   cas. Une famille qui ne reçoit qu'une consigne écrite compte aussi parmi les 5. Les autres sont listées dans le
   résumé, « à traiter à la prochaine review ».
4. **Protection.** Confie chaque famille à un sous-agent du rôle `code`, qui pose la protection la plus solide possible,
   dans cet ordre : (a) changer la structure du code pour que l'erreur ne puisse plus s'écrire ; (b) un contrôle
   automatique (lint, typecheck, script lancé par les contrôles) dont le message dit quoi faire à la place ; (c) un
   test ; (d) une consigne écrite, en dernier recours et seulement pour ce qui relève du jugement. Si le changement de
   structure est un trop gros chantier, pose maintenant la protection du niveau suivant, prouvée de la même façon, et
   ouvre une idée (étape 4 « Hors périmètre » plus haut, pas de `factory:kept`). Une famille par commit : la
   protection, sa ligne dans les « Pièges connus » et la correction de la même erreur là où elle existe encore dans le
   code d'aujourd'hui. Ne désactive et n'affaiblis jamais un test ou un contrôle existant.
5. **Preuve.** Une protection n'est livrée que si elle aurait refusé un cas passé : rejoue-la sur le code tel qu'il
   était au moment de l'erreur ; récupère d'abord le code du cas : `git fetch origin pull/<n>/head` (ou
   `git fetch origin <sha>`), puis ouvre-le dans un `git worktree` à part ; elle doit le refuser, et accepter le code
   d'aujourd'hui. Preuve faite, supprime ce worktree (`git worktree remove`). Un sous-agent du rôle `review` vérifie
   chaque preuve. Aucun cas rejouable : la protection n'est pas livrée et la famille est listée « non protégée », avec
   la raison. Seule exception, la consigne écrite : sa preuve est la liste d'au moins 2 cas réels, avec leurs liens ;
   elle est livrée et marquée « consigne seulement ».
6. **Liste « Pièges connus ».** Une ligne par règle :
   `- **<la règle en une phrase>** Tenue par : <la protection, ou « consigne seulement »>. Cas : #12, #34.` Elle vit
   dans une partie `## Pièges connus` à la fin du `CLAUDE.md` du projet (crée le fichier s'il manque), jamais dans
   `.factory/` : l'AGENT.md demande à chaque agent de la lire, et la synchro de la factory n'y touche pas. Crée cette
   partie seulement à la première règle posée. Si le projet a déjà une liste « Pièges connus », garde sa place et
   sa forme, et complète-la. Si la liste existante vit ailleurs que dans `CLAUDE.md`, vérifie que `CLAUDE.md` la cite ;
   sinon, ajoute dans `CLAUDE.md` une ligne qui la cite.
7. **Entretien de la liste**, à chaque review générale, même sans nouvelle famille : retire les règles dont l'erreur ne
   peut plus arriver ; remets les protections perdues (un contrôle ou un test cité par la liste qui n'existe plus ou ne
   tourne plus) ; regarde si chaque règle « consigne seulement » peut devenir un contrôle ou un test. Ce que
   l'entretien retire ou remet va dans un commit à part.
8. **Erreurs venues de la factory.** Une famille dont la cause est dans les consignes ou les outils de la factory
   (`.factory/`, skills installés) ne se corrige pas ici : ne touche pas à ces fichiers, signale-la dans le résumé ;
   elle sera traitée par une review générale de la factory elle-même. Sauf pour la factory elle-même (`repo` et
   `factory` du payload sont le même dépôt) : corrige alors la source dans `agent/` ou `scripts/`, jamais `.factory/`.
9. **Résumé « Erreurs répétées »** (dans la PR, étape 6), en français simple. Pour chaque famille protégée : l'erreur en
   une phrase, les modifications où elle est apparue (liens), la protection posée, le cas passé qu'elle aurait refusé
   (ou « consigne seulement » et ses cas). Puis les familles laissées de côté avec leur raison (« à traiter à la
   prochaine review », « non protégée », venue de la factory), ce qui a été retiré ou remis dans la liste, et le lien
   vers la liste « Pièges connus ». Rien trouvé : une seule phrase (« Aucune erreur répétée dans les N dernières
   modifications. »), plus, s'il y en a, ce que l'entretien a retiré ou remis, et le lien vers la liste si elle existe ;
   rien n'est créé.

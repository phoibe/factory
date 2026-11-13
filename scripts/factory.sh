#!/usr/bin/env bash
# Met un projet dans la software factory, sans rien faire à la main (ou presque).
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/phoibe/factory/main/scripts/factory.sh)
#
# Le script pose ses questions (nouveau projet ou projet existant, nom…) puis fait tout.
# Raccourcis possibles : « … factory.sh) nouveau mon-appli », « … adopter mon-appli » ou « … retirer mon-appli ».
#
# Il faut seulement l'outil GitHub `gh` (connecté). Aucun hébergeur n'est branché ici : il est choisi avec la
# stack, au cadrage, et la fiche projet dit alors quoi cliquer.
# Compatible avec le bash de macOS (3.2).
set -euo pipefail

TEMPLATE="${FACTORY_TEMPLATE:-phoibe/factory-template}"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/factory"
TEMPLATE_FILES=".github/workflows/factory.yml .github/workflows/factory-sync.yml .github/ISSUE_TEMPLATE/feature.yml .github/ISSUE_TEMPLATE/bug.yml .github/ISSUE_TEMPLATE/project.yml .github/ISSUE_TEMPLATE/question.yml .github/ISSUE_TEMPLATE/config.yml"

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  ✅ %s\n' "$*"; }
warn() { printf '  ⚠️  %s\n' "$*"; }
die()  { printf '\n❌ %s\n' "$*" >&2; exit 1; }
# Pause between two GitHub polls. FACTORY_SH_NAP overrides it (the tests set 0).
nap()  { sleep "${FACTORY_SH_NAP:-$1}"; }
ask()  { local a; printf '%s ' "$1" >&2; read -r a </dev/tty; printf '%s' "$a"; }

usage() {
  cat <<'EOF'
Utilisation :
  factory.sh                   pose ses questions puis fait tout (le plus simple)
  factory.sh nouveau <nom>     crée un nouveau projet depuis le modèle de la factory
  factory.sh adopter <nom>     fait entrer dans la factory un projet déjà commencé
  factory.sh retirer [nom]     retire un projet de la factory (son dépôt est archivé, rien n'est effacé)
<nom> peut être « mon-appli » (sur votre compte) ou « compte/mon-appli ».
EOF
  exit 1
}

# ---- Prérequis ------------------------------------------------------------------------------------
need_gh() {
  if ! command -v gh >/dev/null 2>&1; then
    command -v brew >/dev/null 2>&1 || die "Il faut d'abord Homebrew (https://brew.sh : une ligne à coller dans le Terminal), puis relance ce script."
    case "$(ask "L'outil GitHub « gh » manque. Je l'installe maintenant ? (O/n)")" in n|N|non) die "Sans « gh », je ne peux rien faire." ;; esac
    brew install gh
  fi
  if ! gh auth status >/dev/null 2>&1; then
    say "Connexion à GitHub (une seule fois)"
    gh auth login --web --git-protocol https </dev/tty
  fi
  OWNER_LOGIN=$(gh api user --jq .login)
  # Clones and pushes go over HTTPS with the gh login, so no SSH key is ever needed.
  gh auth setup-git >/dev/null 2>&1 || true
}

# Number of the project's framing issue, empty when the install stopped before it (adoption to resume).
framing_number() { gh issue list -R "$1" --label factory:project --state all --limit 1 --json number --jq '.[0].number // empty' 2>/dev/null || true; }

full_name() { case "$1" in */*) printf '%s' "$1" ;; *) printf '%s/%s' "$OWNER_LOGIN" "$1" ;; esac; }

# ---- Dépôt ----------------------------------------------------------------------------------------
create_repo() {
  say "1. Création du dépôt $REPO"
  if gh repo view "$REPO" >/dev/null 2>&1; then
    die "Le dépôt $REPO existe déjà. Pour un projet déjà commencé, utilise : factory.sh adopter ${REPO#*/}"
  fi
  local vis; vis=$(ask "Dépôt privé ? (O/n)")
  case "$vis" in n|N|non) vis=--public ;; *) vis=--private ;; esac
  gh repo create "$REPO" "$vis" --template "$TEMPLATE" >/dev/null
  # GitHub copie le modèle en quelques secondes.
  local i=0
  until gh api "repos/$REPO/contents/factory.config.json" >/dev/null 2>&1; do
    i=$((i + 1)); [ "$i" -gt 30 ] && die "Le dépôt a été créé mais le modèle n'y est pas encore copié. Relancez le script dans une minute."
    nap 2
  done
  ok "Dépôt créé : https://github.com/$REPO"
}

install_into_existing() {
  say "1. Installation de la factory dans $REPO"
  gh repo view "$REPO" >/dev/null 2>&1 || die "Je ne trouve pas le dépôt $REPO. Vérifiez son nom (ou utilisez « nouveau » pour en créer un)."
  local branch work f dest
  branch=$(gh repo view "$REPO" --json defaultBranchRef --jq .defaultBranchRef.name)
  work=$(mktemp -d)
  gh repo clone "https://github.com/$REPO.git" "$work/repo" -- --quiet --depth 1 --branch "$branch"
  for f in $TEMPLATE_FILES; do
    dest="$work/repo/$f"; mkdir -p "$(dirname "$dest")"
    gh api -H 'Accept: application/vnd.github.raw' "repos/$TEMPLATE/contents/$f" > "$dest"
  done
  if [ ! -f "$work/repo/factory.config.json" ]; then
    gh api -H 'Accept: application/vnd.github.raw' "repos/$TEMPLATE/contents/factory.config.json" > "$work/repo/factory.config.json"
  fi
  if [ ! -f "$work/repo/CLAUDE.md" ]; then
    gh api -H 'Accept: application/vnd.github.raw' "repos/$TEMPLATE/contents/CLAUDE.md" > "$work/repo/CLAUDE.md"
  elif ! grep -q '.factory/AGENT.md' "$work/repo/CLAUDE.md"; then
    { printf '\n'; gh api -H 'Accept: application/vnd.github.raw' "repos/$TEMPLATE/contents/CLAUDE.md" | sed '1d'; } >> "$work/repo/CLAUDE.md"
  fi
  # Decide here, not inside a subshell: an `exit` there would only leave the subshell, and the
  # « ajoutés » line below would still be printed after « déjà installée ».
  git -C "$work/repo" add -A
  if git -C "$work/repo" diff --cached --quiet; then
    rm -rf "$work"
    ok "La factory était déjà installée sur la branche $branch : rien à ajouter"
    return
  fi
  git -C "$work/repo" -c user.name="$OWNER_LOGIN" -c user.email="$OWNER_LOGIN@users.noreply.github.com" \
    commit --quiet -m "chore: install the software factory"
  local err
  if ! err=$(git -C "$work/repo" push --quiet origin "HEAD:$branch" 2>&1); then
    rm -rf "$work"
    case "$err" in
      *GH006*|*[Pp]rotected\ branch*)
        die "GitHub a refusé l'envoi : la branche $branch de $REPO est protégée. Rien n'a été modifié.
   Sur https://github.com/$REPO/settings/branches (Settings → Branches), modifiez la règle de $branch :
   décochez un instant « Require a pull request before merging », relancez l'outil, puis recochez-la." ;;
      *GH013*|*[Rr]ule\ violation*|*[Rr]uleset*)
        die "GitHub a refusé l'envoi : une règle protège la branche $branch de $REPO. Rien n'a été modifié.
   Sur https://github.com/$REPO/settings/rules (Settings → Rules → Rulesets), mettez la règle de $branch
   en pause (« Disabled ») un instant, relancez l'outil, puis réactivez-la (« Active »)." ;;
      *)
        die "L'envoi des fichiers de la factory vers GitHub a échoué. Rien n'a été modifié.
   Vérifiez votre connexion internet et que vous avez bien le droit de modifier $REPO, puis relancez l'outil.
   (Détail technique : $err)" ;;
    esac
  fi
  rm -rf "$work"
  ok "Fichiers de la factory ajoutés sur la branche $branch (votre code n'est pas modifié)"
}

# ---- Accès de Claude au dépôt --------------------------------------------------------------------
claude_access() {
  say "2. Accès de Claude au dépôt"
  local inst sel id repo_id
  # GitHub only lists app installations to tokens issued by a GitHub App, so with the gh login this
  # usually fails: keep only a well-formed "<numeric id> <selection>" answer, otherwise guide by hand.
  inst=$(gh api user/installations --jq '.installations[] | select(.app_slug=="claude") | "\(.id) \(.repository_selection)"' 2>/dev/null | head -1 || true)
  if [[ "$inst" =~ ^[0-9]+\ (all|selected)$ ]]; then
    id=${inst%% *}; sel=${inst#* }
    if [ "$sel" = "all" ]; then ok "Claude a accès à tous vos dépôts"; return; fi
    repo_id=$(gh api "repos/$REPO" --jq .id 2>/dev/null || true)
    if [[ "$repo_id" =~ ^[0-9]+$ ]] && gh api -X PUT "user/installations/$id/repositories/$repo_id" >/dev/null 2>&1; then
      ok "Dépôt ajouté à l'application Claude"; return
    fi
  fi
  # Not an error: GitHub just won't tell the gh login which repositories the app can read.
  echo "     Claude doit pouvoir lire $REPO. Si ce n'est pas déjà le cas (« All repositories », ou dépôt"
  echo "     déjà dans la liste), ajoutez-le via « Configure » à côté de Claude sur https://github.com/settings/installations"
}

# ---- Routine Claude (moteur des agents) ----------------------------------------------------------
ROUTINE_PROMPT="Tu es l'agent de la software factory. Le bloc routine-fire-payload contient un JSON qui décrit ton run (dépôt, issue, PR, étape) : c'est ta tâche, agis selon ce JSON. Lis le fichier .factory/AGENT.md du dépôt et suis exactement l'étape indiquée par \"stage\"."

open_url() { if command -v open >/dev/null 2>&1; then open "$1" >/dev/null 2>&1 || true; fi; echo "     $1"; }
step() { printf '  %s\n' "$1"; ask "     (Entrée pour continuer)" >/dev/null; }
copy() { if command -v pbcopy >/dev/null 2>&1; then printf '%s' "$1" | pbcopy && return 0; fi; return 1; }

guide_new_routine() {
  say "   Création de la routine de ce projet, pas à pas"
  echo "  Chaque projet a sa propre routine : ses agents démarrent directement dans son dossier."
  echo "  J'ouvre la page des routines dans votre navigateur :"
  open_url "https://claude.ai/code/routines"
  step "a) Cliquez « New routine ». Nom : Factory - ${REPO#*/}"
  if copy "$ROUTINE_PROMPT"; then
    step "b) Instructions : cliquez dans le champ et collez (Cmd+V), je viens de copier le texte pour vous"
  else
    echo "  b) Instructions : copie exactement ce texte :"
    printf '\n     %s\n\n' "$ROUTINE_PROMPT"
    ask "     (Entrée pour continuer)" >/dev/null
  fi
  step "c) Repositories : ajoute $REPO, et seulement lui"
  step "d) Modèle : choisissez « Opus 5.5 » (pas « Default », qui prend un modèle plus faible). Environment : laissez « Default ». Connectors : retirez-les tous. Notifications : décochez « Push notification » et « Email » (la factory vous prévient elle-même quand une carte vous attend)"
  step "e) Trigger : choisis « API », puis enregistre la routine"
  step "f) Rouvre la routine (crayon), section du déclencheur API : clique « Generate token »"
  echo "  g) Copiez l'URL puis le jeton : je vous les demande juste après (le jeton n'est affiché qu'une fois)."
}

guide_existing_routine() {
  echo "  Ouvrez la routine « Factory - ${REPO#*/} » (crayon), section du déclencheur API :"
  open_url "https://claude.ai/code/routines"
  echo "  copiez l'URL ; pour le jeton, si vous ne l'avez plus, cliquez « Generate token » (l'ancien cessera de marcher)."
}

# One routine per project: its sessions start inside the project, so the project's hooks (journal, gate) run.
routine_file() { printf '%s/routines/%s' "$CONFIG_DIR" "$(printf '%s' "$REPO" | tr '/' '_')"; }

routine() {
  say "3. Routine Claude de ce projet (le moteur des agents)"
  local url token file
  file=$(routine_file)
  if [ -f "$file" ] && [ "${ROUTINE_REPLACE:-}" != 1 ]; then
    # A typo saved during an interrupted install must not stick: offer to type them again.
    case "$(ask "  L'URL et le jeton de la routine sont déjà enregistrés sur cet ordinateur. Les garder ? (O/n)")" in
      n|N|non) ;;
      *)
        # shellcheck disable=SC1090
        . "$file"
        url=${FACTORY_ROUTINE_URL:-}; token=${FACTORY_ROUTINE_TOKEN:-} ;;
    esac
  fi
  if [ -z "${url:-}" ] || [ -z "${token:-}" ]; then
    case "$(ask "  Avez-vous déjà créé la routine « Factory - ${REPO#*/} » sur claude.ai ? (o/N)")" in
      o|O|oui) guide_existing_routine ;;
      *) guide_new_routine ;;
    esac
    url=$(ask "  Collez l'URL du déclencheur :")
    printf '  Collez le jeton (il ne s’affiche pas) : ' >&2; read -rs token </dev/tty; echo >&2
    case "$url" in https://*) ;; *) die "Cette URL ne ressemble pas à celle d'une routine (elle commence par https://)." ;; esac
    [ -n "$token" ] || die "Jeton vide."
    mkdir -p "$(dirname "$file")"; umask 077
    # Write beside the old file, then swap: the saved token is only replaced once the new one is complete.
    printf 'FACTORY_ROUTINE_URL=%q\nFACTORY_ROUTINE_TOKEN=%q\n' "$url" "$token" > "$file.new" && mv "$file.new" "$file"
    ok "Gardés sur cet ordinateur ($file) : on ne vous les redemandera plus pour ce projet"
  fi
  printf '%s' "$url"   | gh secret set FACTORY_ROUTINE_URL   -R "$REPO" >/dev/null
  printf '%s' "$token" | gh secret set FACTORY_ROUTINE_TOKEN -R "$REPO" >/dev/null
  ok "Secrets de la routine rangés dans le dépôt"
}

# ---- Alertes téléphone ---------------------------------------------------------------------------
# The relay sends an ntfy alert when a card waits for the owner, only if the project has NTFY_TOPIC.
# The channel is the same for every project: asked once, kept on this computer, then set in each project.
alerts() {
  say "4. Alertes sur votre téléphone"
  local file topic=""
  file="$CONFIG_DIR/ntfy"
  [ -f "$file" ] && topic=$(tr -d '[:space:]' < "$file")
  if [ -z "$topic" ]; then
    echo "  Quand une carte attend votre réponse, la factory peut vous prévenir sur l'application « ntfy »."
    echo "  Indiquez le nom du canal suivi dans votre application ntfy (le même que pour vos autres projets)."
    topic=$(ask "  Nom du canal ntfy (Entrée pour passer) :" | tr -d '[:space:]')
    if [ -z "$topic" ]; then echo "  Pas d'alerte pour ce projet. Relancez le script plus tard pour les ajouter."; return; fi
    mkdir -p "$CONFIG_DIR"; ( umask 077; printf '%s\n' "$topic" > "$file" )
  fi
  printf '%s' "$topic" | gh secret set NTFY_TOPIC -R "$REPO" >/dev/null
  ok "Alertes branchées (canal ntfy gardé sur cet ordinateur, on ne vous le redemandera plus)"
}

# ---- Labels et skills ----------------------------------------------------------------------------
first_sync() {
  say "5. Labels et skills de la factory"
  local i=0 run="" before
  # The last run listed before we dispatch may be an old, green one: remember it to wait for a newer one.
  before=$(gh run list -R "$REPO" --workflow factory-sync.yml --limit 1 --json databaseId --jq '.[0].databaseId // empty' 2>/dev/null || true)
  until gh workflow run factory-sync.yml -R "$REPO" >/dev/null 2>&1; do
    i=$((i + 1)); [ "$i" -gt 15 ] && die "GitHub n'a pas encore activé les workflows du dépôt. Relancez le script dans une minute."
    nap 4
  done
  i=0
  while [ -z "$run" ]; do
    i=$((i + 1)); [ "$i" -gt 15 ] && break
    nap 3
    run=$(gh run list -R "$REPO" --workflow factory-sync.yml --limit 1 --json databaseId --jq '.[0].databaseId // empty' 2>/dev/null || true)
    [ "$run" = "$before" ] && run=""
  done
  if [ -n "$run" ] && gh run watch "$run" -R "$REPO" --exit-status >/dev/null 2>&1; then
    ok "Labels créés et skills installés"
  else
    warn "La synchro n'a pas fini en vert : https://github.com/$REPO/actions"
  fi
}

# ---- Cadrage --------------------------------------------------------------------------------------
framing_issue() {
  say "6. Cadrage"
  # An adopted project often has its host already: framing checks that itself.
  if [ "$MODE" = nouveau ]; then echo "  L'hébergeur sera choisi avec la stack, au cadrage : je vous dirai alors quoi cliquer."; fi
  local body url n
  # Resuming an interrupted install: the framing issue may already be there.
  n=$(framing_number "$REPO")
  if [ -n "$n" ]; then ok "Cadrage déjà ouvert : https://github.com/$REPO/issues/$n"; return; fi
  if [ "$MODE" = nouveau ]; then
    body=$(ask "  Décrivez votre idée d'appli en une ou deux phrases :")
    [ -n "$body" ] || body="(Idée à préciser avec l'agent.)"
  else
    body="Adoption d'un projet commencé sans la factory. L'agent lit d'abord le code pour proposer la fiche produit, puis ne pose que les questions sur ce qu'il n'a pas pu déduire."
    local extra; extra=$(ask "  Si vous voulez, ajoutez ce que vous voulez faire ensuite de ce projet (sinon Entrée) :")
    [ -n "$extra" ] && body="$body

$extra"
  fi
  url=$(gh issue create -R "$REPO" --title "Cadrage : ${REPO#*/}" --label factory:project --body "$body")
  ok "Cadrage lancé : $url"
}

# ---- Serveur de dev (projets privés seulement) ----------------------------------------------------
# A private project runs its automatic tasks on the dev server: remind the owner to add its runners there.
DEV_SERVER_GUIDE="https://github.com/phoibe/factory/blob/stable/docs/serveur-de-dev.md"
dev_server_reminder() {
  [ "$(gh api "repos/$REPO" --jq .private 2>/dev/null || true)" = true ] || return 0
  local cmd="bash <(curl -fsSL https://raw.githubusercontent.com/phoibe/factory/stable/scripts/dev-server.sh) $REPO"
  say "7. Runners sur votre serveur de dev"
  echo "  Ce projet est privé : ses tâches automatiques tourneront sur votre serveur de dev, pour ne pas consommer"
  echo "  votre quota GitHub. Ouvrez un terminal sur le serveur et collez-y cette commande (une seule fois) :"
  printf '\n     %s\n\n' "$cmd"
  if copy "$cmd"; then echo "  Je viens de la copier pour vous : il suffit de la coller (Cmd+V) dans le terminal du serveur."; fi
  echo "  Le guide pas à pas : $DEV_SERVER_GUIDE"
  echo "  Tant que ce n'est pas fait, le projet n'a pas de runner sur le serveur."
}

# Questions posées quand le script est lancé sans arguments.
choose_mode() {
  say "Bienvenue dans la software factory 👋"
  echo "  1) Créer un nouveau projet"
  echo "  2) Faire entrer dans la factory un projet déjà commencé (déjà sur GitHub)"
  echo "  3) Changer l'URL ou le jeton de la routine d'un projet"
  echo "  4) Retirer un projet de la factory"
  local c
  while :; do
    c=$(ask "  Votre choix (1, 2, 3 ou 4) :")
    case "$c" in 1) MODE=nouveau; return ;; 2) MODE=adopter; return ;; 3) MODE=jeton; return ;; 4) MODE=retirer; return ;; esac
    echo "  Répondez 1, 2, 3 ou 4."
  done
}

choose_name() {
  local n
  while :; do
    n=$(ask "  Nom du projet (court, sans espace ni accent, ex. mes-recettes) :")
    n=$(printf '%s' "$n" | tr ' ' '-')
    case "$n" in ''|*[!A-Za-z0-9._-]*) echo "  Lettres, chiffres et tirets seulement." ;; *) NAME=$n; return ;; esac
  done
}

# Liste vos dépôts qui n'ont pas encore la factory, et vous fait choisir par numéro.
choose_existing() {
  local list i=0 c line
  list=$(gh repo list "$OWNER_LOGIN" --limit 100 --no-archived --json nameWithOwner --jq '.[].nameWithOwner' 2>/dev/null || true)
  [ -n "$list" ] || { choose_name; return; }
  say "Quel projet faire entrer dans la factory ?"
  for line in $list; do
    case "${line#*/}" in factory-template) continue ;; esac  # the factory itself can be adopted
    # A project whose install stopped before framing is listed again, to finish it.
    local note=""
    if gh api "repos/$line/contents/factory.config.json" >/dev/null 2>&1; then
      [ -n "$(framing_number "$line")" ] && continue
      note="  (adoption à terminer)"
    fi
    i=$((i + 1)); printf '  %2d) %s%s\n' "$i" "${line#*/}" "$note"
    eval "CHOICE_$i=\$line"
  done
  [ "$i" -gt 0 ] || die "Tous vos dépôts sont déjà dans la factory. Pour un nouveau projet, relancez et choisissez 1."
  while :; do
    c=$(ask "  Numéro du projet (1 à $i) :")
    case "$c" in ''|*[!0-9]*) ;; *) if [ "$c" -ge 1 ] && [ "$c" -le "$i" ]; then eval "NAME=\$CHOICE_$c"; return; fi ;; esac
    echo "  Répondez par un numéro de la liste."
  done
}

# Fait choisir par numéro un projet de la factory (dépôt non archivé qui a factory.config.json) et le range dans REPO.
# « sans-factory » retire de la liste le dépôt de la factory elle-même.
choose_project() {
  local list i=0 c line
  list=$(gh repo list "$OWNER_LOGIN" --limit 100 --no-archived --json nameWithOwner --jq '.[].nameWithOwner' 2>/dev/null || true)
  say "${2:-Quel projet ?}"
  for line in $list; do
    case "${line#*/}" in factory-template) continue ;; factory) [ "${1:-}" = sans-factory ] && continue ;; esac
    gh api "repos/$line/contents/factory.config.json" >/dev/null 2>&1 || continue
    i=$((i + 1)); printf '  %2d) %s\n' "$i" "${line#*/}"
    eval "CHOICE_$i=\$line"
  done
  [ "$i" -gt 0 ] || die "Aucun de vos dépôts n'est dans la factory."
  while :; do
    c=$(ask "  Numéro du projet (1 à $i) :")
    case "$c" in ''|*[!0-9]*) ;; *) if [ "$c" -ge 1 ] && [ "$c" -le "$i" ]; then eval "REPO=\$CHOICE_$c"; return; fi ;; esac
    echo "  Répondez par un numéro de la liste."
  done
}

# Range une nouvelle URL ou un nouveau jeton de routine dans un projet de la factory, choisi par numéro.
update_token() {
  choose_project
  ROUTINE_REPLACE=1 routine
  say "C'est fait : $REPO utilise maintenant cette routine."
}

# Retire un projet de la factory. Le tableau montre chaque dépôt non archivé qui a factory.config.json : archiver le
# dépôt suffit à le faire disparaître, arrête ses workflows (donc ses agents) et se défait dans les réglages du dépôt.
# Rien n'est effacé sur GitHub. Ce que le script ne peut pas faire (routine, hébergeur), il l'ouvre et le dit.
remove_project() {
  if [ -n "${1:-}" ]; then
    REPO=$(full_name "$1")
    gh repo view "$REPO" >/dev/null 2>&1 || die "Je ne trouve pas le dépôt $REPO. Vérifiez son nom."
  else
    choose_project sans-factory "Quel projet retirer de la factory ?"
  fi
  local name=${REPO#*/} site c
  [ "$name" = factory ] && die "Le dépôt de la factory elle-même ne se retire pas : sans lui, plus aucun projet ne marche."
  say "Retirer $name de la factory"
  echo "  Je vais archiver le dépôt $REPO : il disparaît du tableau et plus aucun agent n'y travaille."
  echo "  Rien n'est effacé : le code, les issues et l'historique restent lisibles, et vous pourrez le désarchiver."
  c=$(ask "  Pour confirmer, tapez le nom du projet ($name) :")
  [ "$c" = "$name" ] || { echo "  Ce n'est pas le même nom : rien n'a été fait."; exit 0; }
  site=$(gh api "repos/$REPO/contents/factory.config.json" -H "Accept: application/vnd.github.raw" --jq '.siteUrl // empty' 2>/dev/null || true)
  gh repo archive "$REPO" --yes >/dev/null || die "GitHub a refusé d'archiver $REPO. Réessayez dans une minute."
  ok "Dépôt archivé : il n'apparaît plus dans le tableau"
  rm -f "$(routine_file)"
  ok "Jeton de sa routine oublié sur cet ordinateur"
  say "Deux petites choses à finir vous-même (le script ne peut pas les faire)"
  echo "  1) Supprimez la routine « Factory - $name » : ouvrez-la (crayon), puis « Delete »."
  open_url "https://claude.ai/code/routines"
  ask "     (Entrée pour continuer)" >/dev/null
  echo "  2) Le site en ligne du projet, s'il en a un${site:+ ($site)}, reste en ligne tant que vous ne le supprimez pas chez"
  echo "     son hébergeur (sur Vercel : le projet, puis Settings, tout en bas « Delete Project »). Pareil pour une base"
  echo "     de données (Neon…) si le projet en a une."
  open_url "https://vercel.com/dashboard"
  say "C'est fait : $name ne fait plus partie de la factory."
  echo "  Pour le faire revenir : https://github.com/$REPO/settings, tout en bas « Unarchive this repository »."
  echo "  Pour l'effacer pour de bon (définitif) : même page, « Delete this repository »."
}

main() {
  MODE=${1:-}; NAME=${2:-}
  case "$MODE" in nouveau|adopter|jeton|retirer|'') ;; *) usage ;; esac
  need_gh
  [ -n "$MODE" ] || choose_mode
  if [ "$MODE" = jeton ]; then update_token; exit 0; fi
  if [ "$MODE" = retirer ]; then remove_project "$NAME"; exit 0; fi
  if [ -z "$NAME" ]; then
    if [ "$MODE" = nouveau ]; then choose_name; else choose_existing; fi
  fi
  REPO=$(full_name "$NAME")
  say "Projet : $REPO ($([ "$MODE" = nouveau ] && echo 'nouveau' || echo 'déjà commencé'))"
  case "$(ask "  On y va ? (O/n)")" in n|N|non) echo "  Rien n'a été fait."; exit 0 ;; esac
  if [ "$MODE" = nouveau ]; then create_repo; else install_into_existing; fi
  claude_access
  routine
  alerts
  first_sync
  framing_issue
  dev_server_reminder
  say "C'est prêt 🎉"
  echo "  L'agent vous pose ses questions dans l'issue de cadrage, dans quelques minutes."
  echo "  Tableau de bord : https://phoibe.github.io/factory/"
}

if [ "${FACTORY_SH_TEST:-}" != 1 ]; then main "$@"; fi

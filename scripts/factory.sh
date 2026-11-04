#!/usr/bin/env bash
# Met un projet dans la software factory, sans rien faire à la main (ou presque).
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/phoibe/factory/main/scripts/factory.sh)
#
# Le script pose ses questions (nouveau projet ou projet existant, nom…) puis fait tout.
# Raccourcis possibles : « … factory.sh) nouveau mon-appli » ou « … factory.sh) adopter mon-appli ».
#
# Il faut seulement l'outil GitHub `gh` (connecté) ; Node.js en plus pour brancher Vercel automatiquement.
# Compatible avec le bash de macOS (3.2).
set -euo pipefail

TEMPLATE="${FACTORY_TEMPLATE:-phoibe/factory-template}"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/factory"
ROUTINE_FILE="$CONFIG_DIR/routine"
TEMPLATE_FILES=".github/workflows/factory.yml .github/workflows/factory-sync.yml .github/ISSUE_TEMPLATE/feature.yml .github/ISSUE_TEMPLATE/bug.yml .github/ISSUE_TEMPLATE/project.yml .github/ISSUE_TEMPLATE/question.yml .github/ISSUE_TEMPLATE/config.yml"

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  ✅ %s\n' "$*"; }
warn() { printf '  ⚠️  %s\n' "$*"; }
die()  { printf '\n❌ %s\n' "$*" >&2; exit 1; }
ask()  { local a; printf '%s ' "$1" >&2; read -r a </dev/tty; printf '%s' "$a"; }

usage() {
  cat <<'EOF'
Utilisation :
  factory.sh                   pose ses questions puis fait tout (le plus simple)
  factory.sh nouveau <nom>     crée un nouveau projet depuis le modèle de la factory
  factory.sh adopter <nom>     fait entrer dans la factory un projet déjà commencé
<nom> peut être « mon-appli » (sur ton compte) ou « compte/mon-appli ».
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
    i=$((i + 1)); [ "$i" -gt 30 ] && die "Le dépôt a été créé mais le modèle n'y est pas encore copié. Relance le script dans une minute."
    sleep 2
  done
  ok "Dépôt créé : https://github.com/$REPO"
}

install_into_existing() {
  say "1. Installation de la factory dans $REPO"
  gh repo view "$REPO" >/dev/null 2>&1 || die "Je ne trouve pas le dépôt $REPO. Vérifie son nom (ou utilise « nouveau » pour en créer un)."
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
  (
    cd "$work/repo"
    git add -A
    if git diff --cached --quiet; then echo "  (la factory était déjà installée)"; exit 0; fi
    git -c user.name="$OWNER_LOGIN" -c user.email="$OWNER_LOGIN@users.noreply.github.com" \
      commit --quiet -m "chore: install the software factory"
    git push --quiet origin "HEAD:$branch"
  )
  rm -rf "$work"
  ok "Fichiers de la factory ajoutés sur la branche $branch (ton code n'est pas modifié)"
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
    if [ "$sel" = "all" ]; then ok "Claude a accès à tous tes dépôts"; return; fi
    repo_id=$(gh api "repos/$REPO" --jq .id 2>/dev/null || true)
    if [[ "$repo_id" =~ ^[0-9]+$ ]] && gh api -X PUT "user/installations/$id/repositories/$repo_id" >/dev/null 2>&1; then
      ok "Dépôt ajouté à l'application Claude"; return
    fi
  fi
  # Not an error: GitHub just won't tell the gh login which repositories the app can read.
  echo "     Claude doit pouvoir lire $REPO. Si ce n'est pas déjà le cas (« All repositories », ou dépôt"
  echo "     déjà dans la liste), ajoute-le via « Configure » à côté de Claude sur https://github.com/settings/installations"
}

# ---- Routine Claude (moteur des agents) ----------------------------------------------------------
ROUTINE_PROMPT="Tu es l'agent de la software factory. Le bloc routine-fire-payload contient un JSON qui décrit ton run (dépôt, issue, PR, étape) : c'est ta tâche, agis selon ce JSON. Lis le fichier .factory/AGENT.md du dépôt et suis exactement l'étape indiquée par \"stage\"."

open_url() { if command -v open >/dev/null 2>&1; then open "$1" >/dev/null 2>&1 || true; fi; echo "     $1"; }
step() { printf '  %s\n' "$1"; ask "     (Entrée pour continuer)" >/dev/null; }
copy() { if command -v pbcopy >/dev/null 2>&1; then printf '%s' "$1" | pbcopy && return 0; fi; return 1; }

guide_new_routine() {
  say "   Création de la routine, pas à pas (une seule fois)"
  echo "  J'ouvre la page des routines dans ton navigateur :"
  open_url "https://claude.ai/code/routines"
  step "a) Clique « New routine ». Nom : Factory"
  if copy "$ROUTINE_PROMPT"; then
    step "b) Instructions : clique dans le champ et colle (Cmd+V), je viens de copier le texte pour toi"
  else
    echo "  b) Instructions : copie exactement ce texte :"
    printf '\n     %s\n\n' "$ROUTINE_PROMPT"
    ask "     (Entrée pour continuer)" >/dev/null
  fi
  step "c) Repositories : ajoute $REPO"
  step "d) Environment : laisse « Default ». Connectors : retire-les tous"
  step "e) Trigger : choisis « API », puis enregistre la routine"
  step "f) Rouvre la routine (crayon), section du déclencheur API : clique « Generate token »"
  echo "  g) Copie l'URL puis le jeton : je te les demande juste après (le jeton n'est affiché qu'une fois)."
  ROUTINE_HAS_REPO=1
}

guide_existing_routine() {
  echo "  Ouvre ta routine (crayon), section du déclencheur API :"
  open_url "https://claude.ai/code/routines"
  echo "  copie l'URL ; pour le jeton, si tu ne l'as plus, clique « Generate token » (l'ancien cessera de marcher :"
  echo "  relance ensuite ce script et choisis 3 pour mettre le nouveau jeton dans tous tes projets)."
}

routine() {
  say "3. Routine Claude (le moteur des agents)"
  local url token
  if [ -f "$ROUTINE_FILE" ]; then
    # shellcheck disable=SC1090
    . "$ROUTINE_FILE"
    url=${FACTORY_ROUTINE_URL:-}; token=${FACTORY_ROUTINE_TOKEN:-}
  fi
  if [ -z "${url:-}" ] || [ -z "${token:-}" ]; then
    echo "  Une seule routine Claude sert à tous tes projets."
    case "$(ask "  As-tu déjà une routine pour la factory sur claude.ai ? (o/N)")" in
      o|O|oui) guide_existing_routine ;;
      *) guide_new_routine ;;
    esac
    url=$(ask "  Colle l'URL du déclencheur :")
    printf '  Colle le jeton (il ne s’affiche pas) : ' >&2; read -rs token </dev/tty; echo >&2
    case "$url" in https://*) ;; *) die "Cette URL ne ressemble pas à celle d'une routine (elle commence par https://)." ;; esac
    [ -n "$token" ] || die "Jeton vide."
    mkdir -p "$CONFIG_DIR"; umask 077
    printf 'FACTORY_ROUTINE_URL=%q\nFACTORY_ROUTINE_TOKEN=%q\n' "$url" "$token" > "$ROUTINE_FILE"
    ok "Gardés sur cet ordinateur ($ROUTINE_FILE) : on ne te les redemandera plus"
  fi
  FACTORY_ROUTINE_URL=$url; FACTORY_ROUTINE_TOKEN=$token
  [ "${ROUTINE_SECRETS_ONLY:-}" = 1 ] && return 0
  printf '%s' "$url"   | gh secret set FACTORY_ROUTINE_URL   -R "$REPO" >/dev/null
  printf '%s' "$token" | gh secret set FACTORY_ROUTINE_TOKEN -R "$REPO" >/dev/null
  ok "Secrets de la routine rangés dans le dépôt"
  if [ "${ROUTINE_HAS_REPO:-}" != 1 ]; then
    echo "  👉 Dernier clic : dans ta routine, section « Repositories », ajoute $REPO puis enregistre."
    open_url "https://claude.ai/code/routines"
    ask "     Appuie sur Entrée quand c'est fait." >/dev/null
  fi
}

# ---- Labels et skills ----------------------------------------------------------------------------
first_sync() {
  say "4. Labels et skills de la factory"
  local i=0 run=""
  until gh workflow run factory-sync.yml -R "$REPO" >/dev/null 2>&1; do
    i=$((i + 1)); [ "$i" -gt 15 ] && die "GitHub n'a pas encore activé les workflows du dépôt. Relance le script dans une minute."
    sleep 4
  done
  i=0
  while [ -z "$run" ]; do
    i=$((i + 1)); [ "$i" -gt 15 ] && break
    sleep 3
    run=$(gh run list -R "$REPO" --workflow factory-sync.yml --limit 1 --json databaseId --jq '.[0].databaseId // empty' 2>/dev/null || true)
  done
  if [ -n "$run" ] && gh run watch "$run" -R "$REPO" --exit-status >/dev/null 2>&1; then
    ok "Labels créés et skills installés"
  else
    warn "La synchro n'a pas fini en vert : https://github.com/$REPO/actions"
  fi
}

# ---- Vercel ---------------------------------------------------------------------------------------
vercel_setup() {
  say "5. Vercel (aperçu de chaque PR et mise en ligne)"
  local name=${REPO#*/} work
  if [ "$REPO" = "$OWNER_LOGIN/factory" ]; then ok "Pas besoin de Vercel : le tableau de la factory est publié par GitHub Pages"; return; fi
  if command -v npx >/dev/null 2>&1; then
    work=$(mktemp -d)
    gh repo clone "https://github.com/$REPO.git" "$work/repo" -- --quiet --depth 1 >/dev/null 2>&1 || true
    if ( cd "$work/repo" \
         && { npx --yes vercel@latest whoami >/dev/null 2>&1 || npx --yes vercel@latest login </dev/tty; } \
         && npx --yes vercel@latest link --yes --project "$name" >/dev/null 2>&1 \
         && npx --yes vercel@latest git connect --yes >/dev/null 2>&1 ); then
      rm -rf "$work"
      ok "Projet Vercel « $name » branché sur le dépôt"
      return
    fi
    rm -rf "$work"
  fi
  warn "Je n'ai pas pu brancher Vercel tout seul. Un clic suffit :"
  echo "     https://vercel.com/new/import?s=https://github.com/$REPO  → Deploy (un premier échec est normal si l'appli n'existe pas encore)"
  ask "     Appuie sur Entrée quand c'est fait." >/dev/null
}

# ---- Cadrage --------------------------------------------------------------------------------------
framing_issue() {
  say "6. Cadrage"
  local body url
  if [ "$MODE" = nouveau ]; then
    body=$(ask "  Décris ton idée d'appli en une ou deux phrases :")
    [ -n "$body" ] || body="(Idée à préciser avec l'agent.)"
  else
    body="Adoption d'un projet commencé sans la factory. L'agent lit d'abord le code pour proposer la fiche produit, puis ne pose que les questions sur ce qu'il n'a pas pu déduire."
    local extra; extra=$(ask "  Si tu veux, ajoute ce que tu veux faire ensuite de ce projet (sinon Entrée) :")
    [ -n "$extra" ] && body="$body

$extra"
  fi
  url=$(gh issue create -R "$REPO" --title "Cadrage : ${REPO#*/}" --label factory:project --body "$body")
  ok "Cadrage lancé : $url"
}

# Questions posées quand le script est lancé sans arguments.
choose_mode() {
  say "Bienvenue dans la software factory 👋"
  echo "  1) Créer un nouveau projet"
  echo "  2) Faire entrer dans la factory un projet déjà commencé (déjà sur GitHub)"
  echo "  3) Mettre à jour l'URL et le jeton de la routine dans tous mes projets"
  local c
  while :; do
    c=$(ask "  Ton choix (1, 2 ou 3) :")
    case "$c" in 1) MODE=nouveau; return ;; 2) MODE=adopter; return ;; 3) MODE=jeton; return ;; esac
    echo "  Réponds 1, 2 ou 3."
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

# Liste tes dépôts qui n'ont pas encore la factory, et te fait choisir par numéro.
choose_existing() {
  local list i=0 c line
  list=$(gh repo list "$OWNER_LOGIN" --limit 100 --no-archived --json nameWithOwner --jq '.[].nameWithOwner' 2>/dev/null || true)
  [ -n "$list" ] || { choose_name; return; }
  say "Quel projet faire entrer dans la factory ?"
  for line in $list; do
    case "${line#*/}" in factory-template) continue ;; esac  # the factory itself can be adopted
    gh api "repos/$line/contents/factory.config.json" >/dev/null 2>&1 && continue
    i=$((i + 1)); printf '  %2d) %s\n' "$i" "${line#*/}"
    eval "CHOICE_$i=\$line"
  done
  [ "$i" -gt 0 ] || die "Tous tes dépôts sont déjà dans la factory. Pour un nouveau projet, relance et choisis 1."
  while :; do
    c=$(ask "  Numéro du projet (1 à $i) :")
    case "$c" in ''|*[!0-9]*) ;; *) if [ "$c" -ge 1 ] && [ "$c" -le "$i" ]; then eval "NAME=\$CHOICE_$c"; return; fi ;; esac
    echo "  Réponds par un numéro de la liste."
  done
}

# Range une nouvelle URL ou un nouveau jeton de routine dans tous les projets de la factory.
update_token_everywhere() {
  rm -f "$ROUTINE_FILE"
  local repos line n=0
  repos=$(gh repo list "$OWNER_LOGIN" --limit 100 --no-archived --json nameWithOwner --jq '.[].nameWithOwner' 2>/dev/null || true)
  REPO="(tous tes projets)"; ROUTINE_HAS_REPO=1
  ROUTINE_SECRETS_ONLY=1 routine
  for line in $repos; do
    gh api "repos/$line/contents/factory.config.json" >/dev/null 2>&1 || continue
    printf '%s' "$FACTORY_ROUTINE_URL"   | gh secret set FACTORY_ROUTINE_URL   -R "$line" >/dev/null
    printf '%s' "$FACTORY_ROUTINE_TOKEN" | gh secret set FACTORY_ROUTINE_TOKEN -R "$line" >/dev/null
    ok "$line"; n=$((n + 1))
  done
  say "C'est fait : $n projet(s) mis à jour."
}

main() {
  MODE=${1:-}; NAME=${2:-}
  case "$MODE" in nouveau|adopter|jeton|'') ;; *) usage ;; esac
  need_gh
  [ -n "$MODE" ] || choose_mode
  if [ "$MODE" = jeton ]; then update_token_everywhere; exit 0; fi
  if [ -z "$NAME" ]; then
    if [ "$MODE" = nouveau ]; then choose_name; else choose_existing; fi
  fi
  REPO=$(full_name "$NAME")
  say "Projet : $REPO ($([ "$MODE" = nouveau ] && echo 'nouveau' || echo 'déjà commencé'))"
  case "$(ask "  On y va ? (O/n)")" in n|N|non) echo "  Rien n'a été fait."; exit 0 ;; esac
  if [ "$MODE" = nouveau ]; then create_repo; else install_into_existing; fi
  claude_access
  routine
  first_sync
  vercel_setup
  framing_issue
  say "C'est prêt 🎉"
  echo "  L'agent te pose ses questions dans l'issue de cadrage, dans quelques minutes."
  echo "  Tableau de bord : https://phoibe.github.io/factory/"
}

if [ "${FACTORY_SH_TEST:-}" != 1 ]; then main "$@"; fi

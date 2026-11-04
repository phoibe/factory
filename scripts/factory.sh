#!/usr/bin/env bash
# Met un projet dans la software factory, sans rien faire à la main (ou presque).
#
#   Nouveau projet :        bash <(curl -fsSL https://raw.githubusercontent.com/phoibe/factory/main/scripts/factory.sh) nouveau mon-appli
#   Projet déjà commencé :  bash <(curl -fsSL https://raw.githubusercontent.com/phoibe/factory/main/scripts/factory.sh) adopter mon-appli
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
  factory.sh nouveau <nom>     crée un nouveau projet depuis le modèle de la factory
  factory.sh adopter <nom>     fait entrer dans la factory un projet déjà commencé
<nom> peut être « mon-appli » (sur ton compte) ou « compte/mon-appli ».
EOF
  exit 1
}

# ---- Prérequis ------------------------------------------------------------------------------------
need_gh() {
  if ! command -v gh >/dev/null 2>&1; then
    die "L'outil GitHub « gh » n'est pas installé. Sur Mac : brew install gh   puis relance ce script."
  fi
  if ! gh auth status >/dev/null 2>&1; then
    say "Connexion à GitHub (une seule fois)"
    gh auth login --web --git-protocol https </dev/tty
  fi
  OWNER_LOGIN=$(gh api user --jq .login)
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
  gh repo clone "$REPO" "$work/repo" -- --quiet --depth 1 --branch "$branch"
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
  inst=$(gh api user/installations --jq '.installations[] | select(.app_slug=="claude") | "\(.id) \(.repository_selection)"' 2>/dev/null | head -1 || true)
  if [ -z "$inst" ]; then
    warn "L'application Claude n'est pas encore installée sur ton compte GitHub."
    echo "     Ouvre https://github.com/apps/claude/installations/select_target , choisis « All repositories », Save."
    ask "     Appuie sur Entrée quand c'est fait." >/dev/null
    return
  fi
  id=${inst%% *}; sel=${inst#* }
  if [ "$sel" = "all" ]; then ok "Claude a accès à tous tes dépôts"; return; fi
  repo_id=$(gh api "repos/$REPO" --jq .id)
  if gh api -X PUT "user/installations/$id/repositories/$repo_id" >/dev/null 2>&1; then
    ok "Dépôt ajouté à l'application Claude"
  else
    warn "Je n'ai pas pu ajouter le dépôt à l'application Claude."
    echo "     Ouvre https://github.com/settings/installations/$id et ajoute $REPO (sans retirer les autres), Save."
    ask "     Appuie sur Entrée quand c'est fait." >/dev/null
  fi
}

# ---- Routine Claude (moteur des agents) ----------------------------------------------------------
routine() {
  say "3. Routine Claude (le moteur des agents)"
  local url token
  if [ -f "$ROUTINE_FILE" ]; then
    # shellcheck disable=SC1090
    . "$ROUTINE_FILE"
    url=${FACTORY_ROUTINE_URL:-}; token=${FACTORY_ROUTINE_TOKEN:-}
  fi
  if [ -z "${url:-}" ] || [ -z "${token:-}" ]; then
    echo "  Une seule routine sert à tous tes projets. Ouvre https://claude.ai/code/routines , ouvre ta routine"
    echo "  « Factory » (ou crée-la avec le guide), section du déclencheur API."
    url=$(ask "  Colle l'URL du déclencheur :")
    printf '  Colle le jeton (il ne s’affiche pas) : ' >&2; read -rs token </dev/tty; echo >&2
    case "$url" in https://*) ;; *) die "Cette URL ne ressemble pas à celle d'une routine (elle commence par https://)." ;; esac
    [ -n "$token" ] || die "Jeton vide."
    mkdir -p "$CONFIG_DIR"; umask 077
    printf 'FACTORY_ROUTINE_URL=%q\nFACTORY_ROUTINE_TOKEN=%q\n' "$url" "$token" > "$ROUTINE_FILE"
    ok "Gardés sur cet ordinateur ($ROUTINE_FILE) : on ne te les redemandera plus"
  fi
  printf '%s' "$url"   | gh secret set FACTORY_ROUTINE_URL   -R "$REPO" >/dev/null
  printf '%s' "$token" | gh secret set FACTORY_ROUTINE_TOKEN -R "$REPO" >/dev/null
  ok "Secrets de la routine rangés dans le dépôt"
  echo "  👉 Dernier clic : dans ta routine, section « Repositories », ajoute $REPO puis enregistre."
  echo "     https://claude.ai/code/routines"
  ask "     Appuie sur Entrée quand c'est fait." >/dev/null
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
  if command -v npx >/dev/null 2>&1; then
    work=$(mktemp -d)
    gh repo clone "$REPO" "$work/repo" -- --quiet --depth 1 >/dev/null 2>&1 || true
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

main() {
  [ $# -ge 2 ] || usage
  MODE=$1
  case "$MODE" in nouveau|adopter) ;; *) usage ;; esac
  need_gh
  REPO=$(full_name "$2")
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

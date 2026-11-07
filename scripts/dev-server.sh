#!/usr/bin/env bash
# Prépare le serveur de dev et y ajoute les 2 runners d'un projet privé de la factory.
# À lancer dans un terminal du serveur de dev (Linux), pas sur le Mac :
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/phoibe/factory/stable/scripts/dev-server.sh) mon-appli
#
# Sans nom de projet, le script liste vos projets privés de la factory et vous fait choisir.
# La première fois, il installe ce qu'il faut (GitHub CLI, Node.js, logiciels des contrôles avec navigateur).
# Il peut être relancé autant de fois que voulu : il n'ajoute que ce qui manque, sans doublon.
# Les runners vont chercher leur travail chez GitHub : rien à ouvrir sur le serveur (il reste derrière Tailscale).
set -euo pipefail
# A failure inside « $(…) » stops the script too (bash leaves it running by default).
shopt -s inherit_errexit

# The label every factory workflow targets on the dev server (see docs/adr/0001-serveur-de-dev-avec-secours-github.md).
LABEL=factory-dev
WANTED=2
PLAYWRIGHT_VERSION=1.56.1
NODE_MAJOR=22
SOFTWARE_VERSION=1
DEDICATED_USER=factory-runner

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  ✅ %s\n' "$*"; }
warn() { printf '  ⚠️  %s\n' "$*"; }
die()  { printf '\n❌ %s\n' "$*" >&2; exit 1; }
ask()  { local a; printf '%s ' "$1" >&2; read -r a || die "Pas de réponse : rien n'a été fait. Relancez la commande dans un terminal."; printf '%s' "$a"; }

# Commands that need the administrator: directly as root, otherwise through sudo.
root() { if [ "$(id -u)" = 0 ]; then "$@"; else sudo "$@"; fi; }
# Commands run as the dedicated user that owns the runners (runuser as root: a root-only server may have no sudo).
as_runner() {
  if [ "$(id -u)" = 0 ]; then runuser -u "$RUNNER_USER" -- env HOME="$(getent passwd "$RUNNER_USER" | cut -d: -f6)" "$@"
  else sudo -u "$RUNNER_USER" "$@"; fi
}
# The dedicated user's home is closed to the owner (0750 on Ubuntu): every look inside it goes through root.
exists() { root test -e "$1"; }
# Runs « $2… » inside folder $1, as root (in_dir) or as the dedicated user (in_dir_as_runner).
in_dir() { local d=$1; shift; root bash -c 'cd "$1" && shift && exec "$@"' _ "$d" "$@"; }
in_dir_as_runner() { local d=$1; shift; as_runner bash -c 'cd "$1" && shift && exec "$@"' _ "$d" "$@"; }

check_machine() {
  # A root shell opened with plain « su » lacks the administrator commands (useradd, runuser).
  PATH="$PATH:/usr/sbin:/sbin"
  [ "$(uname -s)" = Linux ] || die "Cette commande se lance sur le serveur de dev (Linux), pas sur ce Mac. Ouvrez un terminal du serveur, puis collez-la de nouveau."
  command -v systemctl >/dev/null 2>&1 || die "Ce serveur n'a pas systemd : les runners ne pourraient pas redémarrer tout seuls. Il faut un serveur Ubuntu ou Debian."
  if [ "$(id -u)" != 0 ] && ! command -v sudo >/dev/null 2>&1; then die "Il faut les droits administrateur (sudo) sur le serveur pour installer les runners."; fi
  case "$(uname -m)" in
    x86_64|amd64) ARCH=x64 ;;
    aarch64|arm64) ARCH=arm64 ;;
    *) die "Le processeur de ce serveur ($(uname -m)) n'est pas pris en charge par les runners GitHub." ;;
  esac
  # Where runners installed by hand before the factory may live, and the services written by hand for them.
  SCAN_DIRS=${DEV_SERVER_SCAN:-/home /root /opt}
  SYSTEMD_DIR=${DEV_SERVER_SYSTEMD:-/etc/systemd/system}
}

# Jobs run project code: never as root nor as the owner (whose home holds his GitHub login), always as a dedicated
# user. A server that already runs runners under its own isolated account (outside the sudo, docker, adm groups and
# the owner's group, often behind firewall rules written for that account) keeps it: new runners join that account
# instead of opening a second one that those rules would not cover.
pick_user() {
  local f d owner me
  me=$(id -un)
  RUNNER_USER=$DEDICATED_USER
  # shellcheck disable=SC2086
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    d=${f%/.runner}
    owner=$(root stat -c %U "$d" 2>/dev/null || true)
    case "$owner" in ''|root|"$me"|"$DEDICATED_USER") continue ;; esac
    if isolated "$owner"; then RUNNER_USER=$owner; break; fi
  done <<EOF
$(root find $SCAN_DIRS -maxdepth 6 -name .runner 2>/dev/null || true)
EOF
  RUNNER_HOME=${DEV_SERVER_ROOT:-/home/$RUNNER_USER/actions-runners}
  if [ "$RUNNER_USER" != "$DEDICATED_USER" ]; then ok "Les runners tournent sous le compte isolé déjà en place sur ce serveur : $RUNNER_USER"; fi
}

# User $1 is in none of the groups that would open the owner's files, the administrator or Docker to the jobs.
isolated() {
  local g me
  me=$(id -un)
  for g in $(id -nG "$1" 2>/dev/null || echo sudo); do
    case "$g" in sudo|wheel|admin|adm|docker|lxd|root|"$me") return 1 ;; esac
  done
}

# ---- GitHub CLI ---------------------------------------------------------------------------------
need_gh() {
  if ! command -v gh >/dev/null 2>&1; then
    say "Installation de l'outil GitHub (une seule fois)"
    root apt-get update -qq
    root apt-get install -y -qq curl ca-certificates gnupg >/dev/null
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | root tee /usr/share/keyrings/githubcli-archive-keyring.gpg >/dev/null
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | root tee /etc/apt/sources.list.d/github-cli.list >/dev/null
    root apt-get update -qq
    root apt-get install -y -qq gh >/dev/null
  fi
  if ! gh auth status >/dev/null 2>&1; then
    say "Connexion à GitHub (une seule fois sur ce serveur)"
    echo "  Notez le code affiché, appuyez sur Entrée, puis ouvrez https://github.com/login/device sur votre Mac"
    echo "  ou votre téléphone et tapez-y ce code."
    gh auth login --web --git-protocol https
  fi
  OWNER_LOGIN=$(gh api user --jq .login)
}

# ---- Projet -------------------------------------------------------------------------------------
choose_project() {
  local list i=0 c line
  list=$(gh repo list "$OWNER_LOGIN" --visibility private --no-archived --limit 100 --json nameWithOwner --jq '.[].nameWithOwner' 2>/dev/null || true)
  say "Pour quel projet privé ajouter les runners ?"
  for line in $list; do
    gh api "repos/$line/contents/factory.config.json" >/dev/null 2>&1 || continue
    i=$((i + 1)); printf '  %2d) %s\n' "$i" "${line#*/}"
    eval "CHOICE_$i=\$line"
  done
  [ "$i" -gt 0 ] || die "Aucun de vos projets privés n'est dans la factory. Les projets publics n'ont pas de runner sur le serveur."
  while :; do
    c=$(ask "  Numéro du projet (1 à $i) :")
    case "$c" in ''|*[!0-9]*) ;; *) if [ "$c" -ge 1 ] && [ "$c" -le "$i" ]; then eval "REPO=\$CHOICE_$c"; return; fi ;; esac
    echo "  Répondez par un numéro de la liste."
  done
}

check_project() {
  local info private admin
  info=$(gh api "repos/$REPO" --jq '"\(.private) \(.permissions.admin) \(.full_name)"' 2>/dev/null) || die "Je ne trouve pas le projet $REPO. Vérifiez son nom (ou lancez la commande sans nom pour choisir dans la liste)."
  read -r private admin REPO <<EOF
$info
EOF
  # From here on REPO has GitHub's own spelling: folders and runner names stay the same whatever was typed.
  [ "$private" = true ] || die "$REPO est un projet public : ses tâches tournent sur les machines GitHub, gratuites pour lui. Pour votre sécurité, un projet public n'a jamais de runner sur le serveur."
  gh api "repos/$REPO/contents/factory.config.json" >/dev/null 2>&1 || die "$REPO n'est pas dans la factory : faites-le d'abord entrer avec l'outil Mac « Adopter un projet »."
  [ "$admin" = true ] || die "Le compte GitHub connecté sur ce serveur n'est pas administrateur de $REPO : il ne peut pas y ajouter de runner. Connectez-vous avec le compte propriétaire du projet (gh auth login), puis relancez."
}

# ---- Logiciels (une fois par serveur) -----------------------------------------------------------
ensure_user() {
  id "$RUNNER_USER" >/dev/null 2>&1 || root useradd --create-home --shell /bin/bash "$RUNNER_USER"
  as_runner mkdir -p "$RUNNER_HOME"
}

install_software() {
  local marker="$RUNNER_HOME/.factory-software-$SOFTWARE_VERSION" major
  if exists "$marker"; then ok "Logiciels du serveur déjà installés"; return; fi
  say "Installation des logiciels du serveur (une seule fois, quelques minutes)"
  root apt-get update -qq
  root apt-get install -y -qq curl git jq tar unzip ca-certificates >/dev/null
  # The system Node.js (the one the administrator sees), not one installed for a single user.
  major=$( (root node --version 2>/dev/null || echo v0) | sed -E 's/^v([0-9]+).*/\1/')
  if [ "$major" -lt "$NODE_MAJOR" ]; then
    curl -fsSL "https://deb.nodesource.com/setup_$NODE_MAJOR.x" | root bash >/dev/null
    root apt-get install -y -qq nodejs >/dev/null
  fi
  # System libraries Chromium needs for the browser checks (accessibility and journey tests).
  root npx -y "playwright@$PLAYWRIGHT_VERSION" install-deps chromium
  as_runner touch "$marker"
  ok "Logiciels installés (Node.js $NODE_MAJOR, Git, bibliothèques du navigateur des contrôles)"
}

# ---- Runners ------------------------------------------------------------------------------------
# One « id name label,label status » line per runner GitHub knows for this project.
list_runners() { gh api "repos/$REPO/actions/runners" --paginate --jq '.runners[] | "\(.id) \(.name) \([.labels[].name] | join(",")) \(.status)"'; }

# A field of the runner configured in folder $1 (empty when its configuration never finished).
runner_field() { root sed -n "s/.*\"$2\": *\"\([^\"]*\)\".*/\1/p" "$1/.runner" 2>/dev/null | head -1 || true; }
runner_name() { runner_field "$1" agentName; }
# The runner in folder $1 belongs to this project.
of_this_project() { [ "$(runner_field "$1" gitHubUrl)" = "https://github.com/$REPO" ]; }

# The folder of this server that holds this project's runner called $1, empty when it is not on this server.
local_dir() {
  local f d
  # shellcheck disable=SC2086
  while IFS= read -r f; do
    d=${f%/.runner}
    if [ "$(runner_name "$d")" = "$1" ] && of_this_project "$d"; then printf '%s' "$d"; return; fi
  done <<EOF
$(root find "$RUNNER_HOME" $SCAN_DIRS -maxdepth 6 -name .runner 2>/dev/null || true)
EOF
}

on_github() { printf '%s\n' "$LINES" | awk -v n="$1" '$2==n { found=1 } END { exit !found }'; }

# Folders this script made for the project (« <slug>-<number> ») that match no runner on GitHub (failed halfway,
# or deleted on GitHub): their service is removed and the folder deleted, so the number can be used again.
clean_leftovers() {
  local dir name suffix
  while IFS= read -r dir; do
    [ -n "$dir" ] || continue
    suffix=${dir##*/"$SLUG"-}
    case "$suffix" in ''|*[!0-9]*) continue ;; esac  # another project whose name starts the same
    name=$(runner_name "$dir")
    if [ -n "$name" ]; then
      of_this_project "$dir" || continue
      on_github "$name" && continue
    fi
    if exists "$dir/.service"; then
      in_dir "$dir" ./svc.sh stop >/dev/null 2>&1 || true
      in_dir "$dir" ./svc.sh uninstall >/dev/null 2>&1 || true
    fi
    root rm -rf "$dir"
    warn "Ancien dossier ${dir##*/} nettoyé (son runner n'existait plus chez GitHub)"
  done <<EOF
$(root find "$RUNNER_HOME" -mindepth 1 -maxdepth 1 -type d -name "$SLUG-*" 2>/dev/null || true)
EOF
}

runner_archive() {
  local version file
  version=$(gh api repos/actions/runner/releases/latest --jq .tag_name)
  version=${version#v}
  file="$RUNNER_HOME/.cache/actions-runner-linux-$ARCH-$version.tar.gz"
  if ! root test -s "$file"; then
    as_runner mkdir -p "$RUNNER_HOME/.cache"
    # Downloaded beside, then renamed: a cut-off download never looks like a complete archive.
    as_runner curl -fsSL -o "$file.part" "https://github.com/actions/runner/releases/download/v$version/actions-runner-linux-$ARCH-$version.tar.gz" \
      && as_runner mv "$file.part" "$file" \
      || die "Le téléchargement du runner a été coupé. Vérifiez la connexion à Internet du serveur, puis relancez la commande."
  fi
  printf '%s' "$file"
}

add_runner() {
  local name=$1 dir=$2 archive token
  archive=$(runner_archive)
  token=$(gh api -X POST "repos/$REPO/actions/runners/registration-token" --jq .token)
  as_runner mkdir -p "$dir"
  as_runner tar -xzf "$archive" -C "$dir"
  # The runner's own system libraries (ICU…), missing on a minimal Debian.
  in_dir "$dir" ./bin/installdependencies.sh >/dev/null
  in_dir_as_runner "$dir" ./config.sh --unattended --url "https://github.com/$REPO" --token "$token" --name "$name" --labels "$LABEL" --replace >/dev/null
  ok "Runner $name ajouté"
}

# The systemd service written by hand (not by svc.sh) that starts the runner of folder $1, empty when there is none.
hand_unit() {
  local u
  for u in $(root grep -lsF -- "$1/" "$SYSTEMD_DIR"/actions.runner.*.service 2>/dev/null || true); do
    if root grep -qsE "^(WorkingDirectory=$1/?\$|ExecStart=$1/run)" "$u"; then basename "$u"; return; fi
  done
}

# The runner in folder $1 starts with the server (a systemd service), and is started now in case it was not.
start_on_boot() {
  local dir=$1 owner unit
  unit=$(hand_unit "$dir")
  if [ -n "$unit" ] && ! exists "$dir/.service"; then
    # Its own service, written by the administrator: kept as it is, and nothing inside the runner's folder (which
    # its jobs can rewrite) is ever run by the administrator.
    root systemctl enable --now "$unit" >/dev/null 2>&1 || true
    ok "Runner $(runner_name "$dir") : il garde son propre démarrage automatique ($unit)"
    return 0
  fi
  if ! exists "$dir/.service"; then
    owner=$(root stat -c %U "$dir")
    if [ "$owner" = root ]; then
      warn "Runner $(runner_name "$dir") installé par l'administrateur : je n'y touche pas, il garde son propre démarrage"
      return 0
    fi
    [ -n "$owner" ] || owner=$RUNNER_USER
    in_dir "$dir" ./svc.sh install "$owner" >/dev/null
    ok "Runner $(runner_name "$dir") : démarrage automatique avec le serveur activé"
    CHANGED=1
  fi
  in_dir "$dir" ./svc.sh start >/dev/null 2>&1 || true
}

ensure_runners() {
  say "Runners de $REPO sur le serveur"
  local host repo_name count=0 id name labels status dir n
  host=$(hostname | tr -c 'A-Za-z0-9-\n' '-')
  repo_name=${REPO#*/}
  SLUG=$(printf '%s' "$REPO" | tr '/' '-')
  CHANGED=0
  LINES=$(list_runners)
  clean_leftovers
  # The list comes on fd 3: the commands inside the loop keep the terminal as their input.
  while read -r id name labels status <&3; do
    [ -n "$id" ] || continue
    dir=$(local_dir "$name")
    if [ -z "$dir" ]; then
      if [ "$status" = online ]; then status="en ligne"; else status="hors ligne"; fi
      warn "Runner $name ($status) pas sur ce serveur : je le laisse chez GitHub, sans le compter"
      continue
    fi
    count=$((count + 1))
    case ",$labels," in
      *",$LABEL,"*) ok "Runner $name déjà là, je le garde" ;;
      *) gh api -X POST "repos/$REPO/actions/runners/$id/labels" -f "labels[]=$LABEL" >/dev/null
         ok "Runner $name déjà là, je le garde (étiquette de la factory ajoutée)"; CHANGED=1 ;;
    esac
    start_on_boot "$dir"
  done 3<<EOF
$LINES
EOF
  n=1
  while [ "$count" -lt "$WANTED" ]; do
    name="$host-$repo_name-$n"
    if on_github "$name" || exists "$RUNNER_HOME/$SLUG-$n"; then n=$((n + 1)); continue; fi
    add_runner "$name" "$RUNNER_HOME/$SLUG-$n"
    start_on_boot "$RUNNER_HOME/$SLUG-$n"
    count=$((count + 1)); CHANGED=1; n=$((n + 1))
  done
  if [ "$CHANGED" -eq 0 ]; then ok "Rien à ajouter : le projet a déjà ses $WANTED runners"; fi
}

main() {
  check_machine
  need_gh
  REPO=${1:-}
  if [ -z "$REPO" ]; then choose_project; else case "$REPO" in */*) ;; *) REPO="$OWNER_LOGIN/$REPO" ;; esac; fi
  check_project
  pick_user
  ensure_user
  install_software
  ensure_runners
  say "C'est prêt 🎉 $WANTED runners prêts pour ${REPO#*/}"
  echo "  Ils apparaissent « Idle » (connectés) dans les réglages du projet : https://github.com/$REPO/settings/actions/runners"
  echo "  Ils redémarrent tout seuls avec le serveur. Pour un autre projet privé, relancez la même commande avec son nom."
}

if [ "${DEV_SERVER_TEST:-}" != 1 ]; then main "$@"; fi

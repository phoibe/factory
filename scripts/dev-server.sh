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
  CACHE_DIR=${DEV_SERVER_CACHE:-/var/cache/factory-runner}
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
# One « id name label,label status busy » line per runner GitHub knows for this project.
list_runners() { gh api "repos/$REPO/actions/runners" --paginate --jq '.runners[] | "\(.id) \(.name) \([.labels[].name] | join(",")) \(.status) \(.busy)"'; }

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

# The runners GitHub lists are kept in RUNNER_LIST, never in LINES: in a terminal, bash rewrites LINES with the
# window height after each command it runs (the list became « 47 » and every runner looked gone).
on_github() { printf '%s\n' "$RUNNER_LIST" | awk -v n="$1" '$2==n { found=1 } END { exit !found }'; }

# Folders this script made for the project (« <slug>-<number> ») that match no runner on GitHub (failed halfway,
# or deleted on GitHub): their service is removed and the folder deleted, so the number can be used again.
clean_leftovers() {
  local dir name suffix
  # The list comes on fd 3: systemctl and rm inside the loop never eat it.
  while IFS= read -r dir <&3; do
    [ -n "$dir" ] || continue
    suffix=${dir##*/"$SLUG"-}
    case "$suffix" in ''|*[!0-9]*) continue ;; esac  # another project whose name starts the same
    name=$(runner_name "$dir")
    if [ -n "$name" ]; then
      of_this_project "$dir" || continue
      on_github "$name" && continue
    fi
    remove_unit "$dir"
    root rm -rf "$dir"
    warn "Ancien dossier ${dir##*/} nettoyé (son runner n'existait plus chez GitHub)"
  done 3<<EOF
$(root find "$RUNNER_HOME" -mindepth 1 -maxdepth 1 -type d -name "$SLUG-*" 2>/dev/null || true)
EOF
}

# The number of runner $1 when this command made it on this server (« <host>-<project>-<number> »), empty otherwise.
own_number() {
  local suffix=${1#"$PREFIX"}
  [ "$suffix" != "$1" ] || return 0
  case "$suffix" in ''|*[!0-9]*) return 0 ;; esac
  printf '%s' "$suffix"
}

# Runners this command made on this server that are offline on GitHub and have no folder here any more (an install
# that failed halfway): deleted on GitHub, so that their number is used again instead of a new one.
prune_dead() {
  local id name labels status busy pruned=0
  while read -r id name labels status busy <&3; do
    [ -n "$id" ] && [ -n "$(own_number "$name")" ] && [ "$status" != online ] || continue
    [ -z "$(local_dir "$name")" ] || continue
    gh api -X DELETE "repos/$REPO/actions/runners/$id" >/dev/null
    warn "Runner $name retiré chez GitHub : hors ligne, il n'avait plus de dossier sur ce serveur"
    pruned=1; CHANGED=1
  done 3<<EOF
$RUNNER_LIST
EOF
  if [ "$pruned" = 1 ]; then RUNNER_LIST=$(list_runners); fi
}

# Unregisters runner $2 (GitHub id $1) of folder $3, stops its service and deletes its folder.
remove_runner() {
  remove_unit "$3"
  gh api -X DELETE "repos/$REPO/actions/runners/$1" >/dev/null
  root rm -rf "$3"
  ok "Runner $2 retiré (numéro en trop)"
  CHANGED=1
}

# The lowest number from 1 to $WANTED that no runner of the project uses, empty when they are all taken.
free_number() {
  local n
  for n in $(seq 1 "$WANTED"); do
    if ! on_github "$PREFIX$n" && ! exists "$RUNNER_HOME/$SLUG-$n"; then printf '%s' "$n"; return; fi
  done
}

# The runner archive, kept in a cache that belongs to the administrator: the dedicated user can read it, never change
# it, since the administrator also runs a program taken from it (installdependencies.sh).
runner_archive() {
  local version file
  version=$(gh api repos/actions/runner/releases/latest --jq .tag_name)
  version=${version#v}
  file="$CACHE_DIR/actions-runner-linux-$ARCH-$version.tar.gz"
  if ! root test -s "$file"; then
    root mkdir -p "$CACHE_DIR"
    root chmod 755 "$CACHE_DIR"
    # Downloaded beside, then renamed: a cut-off download never looks like a complete archive.
    root curl -fsSL -o "$file.part" "https://github.com/actions/runner/releases/download/v$version/actions-runner-linux-$ARCH-$version.tar.gz" \
      && root chmod 644 "$file.part" && root mv "$file.part" "$file" \
      || die "Le téléchargement du runner a été coupé. Vérifiez la connexion à Internet du serveur, puis relancez la commande."
  fi
  printf '%s' "$file"
}

# The runner's own system libraries (ICU…), missing on a minimal Debian. Run by the administrator from his own copy
# of the archive, never from the runner's folder, which the jobs can rewrite.
runner_dependencies() {
  local archive=$1 tmp
  tmp=$(root mktemp -d)
  root tar -xzf "$archive" -C "$tmp"
  in_dir "$tmp" ./bin/installdependencies.sh >/dev/null 2>&1 || warn "Bibliothèques du runner : installation incomplète (sans gravité si le runner démarre)"
  root rm -rf "$tmp"
}

add_runner() {
  local name=$1 dir=$2 archive token
  archive=$(runner_archive)
  runner_dependencies "$archive"
  token=$(gh api -X POST "repos/$REPO/actions/runners/registration-token" --jq .token)
  as_runner mkdir -p "$dir"
  as_runner tar -xzf "$archive" -C "$dir"
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

# The service named in the « .service » file that svc.sh leaves in folder $1 (runners installed by an earlier version
# of this command, or by hand with svc.sh), empty when there is none. Only read, never run.
svc_unit() {
  local u
  u=$(root cat "$1/.service" 2>/dev/null | head -1 || true)
  case "$u" in actions.runner.*.service) ;; *) return 0 ;; esac
  case "$u" in */*|*' '*) return 0 ;; esac
  printf '%s' "$u"
}

# The name svc.sh would give the service of runner $2 of project $1 (systemd caps it at 80 characters).
unit_name() {
  local n="actions.runner.${1//\//-}.$2"
  printf '%s.service' "${n:0:80}"
}

# Writes, as the administrator, the systemd service of the runner in folder $1, owned by user $2: the same service
# svc.sh would write, without running anything of the runner's folder as the administrator.
write_unit() {
  local dir=$1 owner=$2 unit
  unit=$(unit_name "$REPO" "$(runner_name "$dir")")
  printf '[Unit]\nDescription=GitHub Actions Runner (%s)\nAfter=network.target\n\n[Service]\nExecStart=%s/runsvc.sh\nUser=%s\nWorkingDirectory=%s\nKillMode=process\nKillSignal=SIGTERM\nTimeoutStopSec=5min\n\n[Install]\nWantedBy=multi-user.target\n' \
    "${unit#actions.runner.}" "$dir" "$owner" "$dir" | root tee "$SYSTEMD_DIR/$unit" >/dev/null
  root chmod 644 "$SYSTEMD_DIR/$unit"
  root systemctl daemon-reload
  printf '%s' "$unit"
}

# Stops and removes the service of the runner in folder $1, if it has one.
remove_unit() {
  local unit
  unit=$(hand_unit "$1")
  [ -n "$unit" ] || unit=$(svc_unit "$1")
  [ -n "$unit" ] || return 0
  root systemctl disable --now "$unit" >/dev/null 2>&1 || true
  root rm -f "$SYSTEMD_DIR/$unit"
  root systemctl daemon-reload >/dev/null 2>&1 || true
}

# The runner in folder $1 starts with the server (a systemd service), and is started now in case it was not.
# Nothing inside the runner's folder (which its jobs can rewrite) is ever run by the administrator: the service is
# found, or written, and driven by systemctl only.
start_on_boot() {
  local dir=$1 owner unit
  # The service starts runsvc.sh from the runner's root, where svc.sh used to copy it: copied by the runner's own
  # user, like any other file of its folder.
  if ! exists "$dir/runsvc.sh" && exists "$dir/bin/runsvc.sh" && [ "$(root stat -c %U "$dir")" != root ]; then
    in_dir_as_runner "$dir" cp bin/runsvc.sh runsvc.sh
  fi
  unit=$(hand_unit "$dir")
  [ -n "$unit" ] || unit=$(svc_unit "$dir")
  if [ -z "$unit" ]; then
    owner=$(root stat -c %U "$dir")
    if [ "$owner" = root ]; then
      warn "Runner $(runner_name "$dir") installé par l'administrateur : je n'y touche pas, il garde son propre démarrage"
      return 0
    fi
    [ -n "$owner" ] || owner=$RUNNER_USER
    unit=$(write_unit "$dir" "$owner")
    root systemctl enable --now "$unit" >/dev/null
    ok "Runner $(runner_name "$dir") : démarrage automatique avec le serveur activé"
    CHANGED=1
    return 0
  fi
  root systemctl enable --now "$unit" >/dev/null 2>&1 || true
  ok "Runner $(runner_name "$dir") : il garde son démarrage automatique ($unit)"
}

ensure_runners() {
  say "Runners de $REPO sur le serveur"
  local host count=0 id name labels status busy dir n extras=""
  host=$(hostname | tr -c 'A-Za-z0-9-\n' '-')
  PREFIX="$host-${REPO#*/}-"
  SLUG=$(printf '%s' "$REPO" | tr '/' '-')
  CHANGED=0
  RUNNER_LIST=$(list_runners)
  prune_dead
  clean_leftovers
  # The list comes on fd 3: the commands inside the loop keep the terminal as their input.
  while read -r id name labels status busy <&3; do
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
    n=$(own_number "$name")
    if [ -n "$n" ] && [ "$n" -gt "$WANTED" ] && [ "$dir" = "$RUNNER_HOME/$SLUG-$n" ]; then
      extras="$extras$n $id $name ${busy:-false} $dir
"
    fi
  done 3<<EOF
$RUNNER_LIST
EOF
  n=1
  while [ "$count" -lt "$WANTED" ]; do
    name="$PREFIX$n"
    if on_github "$name" || exists "$RUNNER_HOME/$SLUG-$n"; then n=$((n + 1)); continue; fi
    add_runner "$name" "$RUNNER_HOME/$SLUG-$n"
    start_on_boot "$RUNNER_HOME/$SLUG-$n"
    count=$((count + 1)); CHANGED=1; n=$((n + 1))
  done
  # Numbers above $WANTED (left by an earlier install that went wrong): the project keeps runners 1 to $WANTED. Such a
  # runner moves to the lowest free number (the new one is added first), or simply goes when the project has enough.
  # One busy with a job is left alone, so that no work is cut off.
  while read -r n id name busy dir <&4; do
    [ -n "$n" ] || continue
    if [ "$busy" = true ]; then
      warn "Runner $name occupé par une tâche : je le laisse, relancez la commande plus tard pour le retirer"
      continue
    fi
    if [ "$count" -le "$WANTED" ]; then
      n=$(free_number)
      [ -n "$n" ] || continue
      add_runner "$PREFIX$n" "$RUNNER_HOME/$SLUG-$n"
      start_on_boot "$RUNNER_HOME/$SLUG-$n"
      RUNNER_LIST=$(list_runners)
      count=$((count + 1))
    fi
    remove_runner "$id" "$name" "$dir"
    count=$((count - 1))
  done 4<<EOF
$(printf '%s' "$extras" | sort -rn)
EOF
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

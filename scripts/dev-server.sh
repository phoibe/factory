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

# The label every factory workflow targets on the dev server (see docs/adr/0001-serveur-de-dev-avec-secours-github.md).
LABEL=factory-dev
WANTED=2
PLAYWRIGHT_VERSION=1.56.1
NODE_MAJOR=22
SOFTWARE_VERSION=1
DEDICATED_USER=factory-runner

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  ✅ %s\n' "$*"; }
die()  { printf '\n❌ %s\n' "$*" >&2; exit 1; }
ask()  { local a; printf '%s ' "$1" >&2; read -r a; printf '%s' "$a"; }

# Commands that need the administrator: directly as root, otherwise through sudo.
root() { if [ "$(id -u)" = 0 ]; then "$@"; else sudo "$@"; fi; }
# Commands run as the user that owns the runners.
as_runner() { if [ "$(id -un)" = "$RUNNER_USER" ]; then "$@"; else sudo -u "$RUNNER_USER" "$@"; fi; }

check_machine() {
  [ "$(uname -s)" = Linux ] || die "Cette commande se lance sur le serveur de dev (Linux), pas sur ce Mac. Ouvrez un terminal du serveur, puis collez-la de nouveau."
  command -v systemctl >/dev/null 2>&1 || die "Ce serveur n'a pas systemd : les runners ne pourraient pas redémarrer tout seuls. Il faut un serveur Ubuntu ou Debian."
  if [ "$(id -u)" != 0 ] && ! command -v sudo >/dev/null 2>&1; then die "Il faut les droits administrateur (sudo) sur le serveur pour installer les runners."; fi
  case "$(uname -m)" in
    x86_64|amd64) ARCH=x64 ;;
    aarch64|arm64) ARCH=arm64 ;;
    *) die "Le processeur de ce serveur ($(uname -m)) n'est pas pris en charge par les runners GitHub." ;;
  esac
  # The runner refuses to run as root: an administrator session gets a dedicated user.
  if [ "$(id -u)" = 0 ]; then RUNNER_USER=$DEDICATED_USER; else RUNNER_USER=$(id -un); fi
  RUNNER_HOME=${DEV_SERVER_ROOT:-}
  if [ -z "$RUNNER_HOME" ]; then
    if [ "$RUNNER_USER" = "$DEDICATED_USER" ]; then RUNNER_HOME=/home/$DEDICATED_USER/actions-runners; else RUNNER_HOME=$HOME/actions-runners; fi
  fi
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
    echo "  Choisissez « GitHub.com », puis « HTTPS », puis « Login with a web browser » : ouvrez le lien sur votre Mac"
    echo "  ou votre téléphone et tapez le code affiché."
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

check_private() {
  local private
  private=$(gh api "repos/$REPO" --jq .private 2>/dev/null) || die "Je ne trouve pas le projet $REPO. Vérifiez son nom (ou lancez la commande sans nom pour choisir dans la liste)."
  [ "$private" = true ] || die "$REPO est un projet public : ses tâches tournent sur les machines GitHub, gratuites pour lui. Pour votre sécurité, un projet public n'a jamais de runner sur le serveur."
}

# ---- Logiciels (une fois par serveur) -----------------------------------------------------------
install_software() {
  local marker="$RUNNER_HOME/.factory-software-$SOFTWARE_VERSION"
  if [ -f "$marker" ]; then ok "Logiciels du serveur déjà installés"; return; fi
  say "Installation des logiciels du serveur (une seule fois, quelques minutes)"
  if [ "$RUNNER_USER" = "$DEDICATED_USER" ] && ! id "$DEDICATED_USER" >/dev/null 2>&1; then
    root useradd --create-home --shell /bin/bash "$DEDICATED_USER"
  fi
  root apt-get update -qq
  root apt-get install -y -qq curl git jq tar unzip ca-certificates >/dev/null
  local major
  major=$( (node --version 2>/dev/null || echo v0) | sed -E 's/^v([0-9]+).*/\1/')
  if [ "$major" -lt "$NODE_MAJOR" ]; then
    curl -fsSL "https://deb.nodesource.com/setup_$NODE_MAJOR.x" -o /tmp/nodesource-setup.sh
    root bash /tmp/nodesource-setup.sh >/dev/null
    root apt-get install -y -qq nodejs >/dev/null
  fi
  # System libraries Chromium needs for the browser checks (accessibility and journey tests).
  root npx -y "playwright@$PLAYWRIGHT_VERSION" install-deps chromium
  as_runner mkdir -p "$RUNNER_HOME"
  as_runner touch "$marker"
  ok "Logiciels installés (Node.js $NODE_MAJOR, Git, bibliothèques du navigateur des contrôles)"
}

# ---- Runners ------------------------------------------------------------------------------------
# One « id name label,label » line per runner GitHub knows for this project.
list_runners() { gh api "repos/$REPO/actions/runners" --paginate --jq '.runners[] | "\(.id) \(.name) \([.labels[].name] | join(","))"'; }

runner_archive() {
  local version file
  version=$(gh api repos/actions/runner/releases/latest --jq .tag_name)
  version=${version#v}
  file="$RUNNER_HOME/.cache/actions-runner-linux-$ARCH-$version.tar.gz"
  if [ ! -s "$file" ]; then
    as_runner mkdir -p "$RUNNER_HOME/.cache"
    as_runner curl -fsSL -o "$file" "https://github.com/actions/runner/releases/download/v$version/actions-runner-linux-$ARCH-$version.tar.gz"
  fi
  printf '%s' "$file"
}

add_runner() {
  local name=$1 dir=$2 archive token
  archive=$(runner_archive)
  token=$(gh api -X POST "repos/$REPO/actions/runners/registration-token" --jq .token)
  as_runner mkdir -p "$dir"
  as_runner tar -xzf "$archive" -C "$dir"
  (cd "$dir" && as_runner ./config.sh --unattended --url "https://github.com/$REPO" --token "$token" --name "$name" --labels "$LABEL" --replace >/dev/null)
  ok "Runner $name ajouté"
}

# Every runner this script created for the project starts with the server (a systemd service).
start_on_boot() {
  local dir started=0
  for dir in "$RUNNER_HOME/$SLUG"-*; do
    [ -f "$dir/.runner" ] || continue
    [ -f "$dir/.service" ] && continue
    (cd "$dir" && root ./svc.sh install "$RUNNER_USER" >/dev/null && root ./svc.sh start >/dev/null)
    started=$((started + 1))
  done
  [ "$started" -eq 0 ] || ok "Démarrage automatique avec le serveur activé ($started runner(s))"
}

ensure_runners() {
  say "Runners de $REPO sur le serveur"
  local host repo_name lines count=0 added=0 id name labels n
  host=$(hostname | tr -c 'A-Za-z0-9-\n' '-')
  repo_name=${REPO#*/}
  SLUG=$(printf '%s' "$REPO" | tr '/' '-')
  lines=$(list_runners)
  while read -r id name labels; do
    [ -n "$id" ] || continue
    count=$((count + 1))
    case ",$labels," in
      *",$LABEL,"*) ok "Runner $name déjà là, je le garde" ;;
      *) gh api -X POST "repos/$REPO/actions/runners/$id/labels" -f "labels[]=$LABEL" >/dev/null
         ok "Runner $name déjà là, je le garde (étiquette de la factory ajoutée)"; added=$((added + 1)) ;;
    esac
  done <<EOF
$lines
EOF
  n=1
  while [ "$count" -lt "$WANTED" ]; do
    name="$host-$repo_name-$n"
    if printf '%s\n' "$lines" | awk -v n="$name" '$2==n { found=1 } END { exit !found }' || [ -e "$RUNNER_HOME/$SLUG-$n" ]; then
      n=$((n + 1)); continue
    fi
    add_runner "$name" "$RUNNER_HOME/$SLUG-$n"
    count=$((count + 1)); added=$((added + 1)); n=$((n + 1))
  done
  start_on_boot
  if [ "$added" -eq 0 ]; then ok "Rien à ajouter : le projet a déjà ses $WANTED runners"; fi
}

main() {
  check_machine
  need_gh
  REPO=${1:-}
  if [ -z "$REPO" ]; then choose_project; else case "$REPO" in */*) ;; *) REPO="$OWNER_LOGIN/$REPO" ;; esac; fi
  check_private
  install_software
  ensure_runners
  say "C'est prêt 🎉 $WANTED runners prêts pour ${REPO#*/}"
  echo "  Ils apparaissent « Idle » (connectés) dans les réglages du projet : https://github.com/$REPO/settings/actions/runners"
  echo "  Ils redémarrent tout seuls avec le serveur. Pour un autre projet privé, relancez la même commande avec son nom."
}

if [ "${DEV_SERVER_TEST:-}" != 1 ]; then main "$@"; fi

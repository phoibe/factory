# Dev-server runners in one command — Implementation Plan

> **For agentic workers:** executed inline with superpowers:executing-plans.

**Goal:** One copy-paste command, run on the owner's Linux dev server, installs the CI prerequisites once and gives a private factory project its 2 self-hosted runners; the Mac tools remind the owner to run it for private projects.

**Architecture:** A standalone bash script `scripts/dev-server.sh` (downloaded from the `stable` branch, like `factory.sh`) driven by `gh` on the server. It is idempotent: it inspects GitHub's runner list for the project, labels the existing ones, and only creates the runners that are missing, each as a systemd service. `scripts/factory.sh` prints the filled-in command at the end of « nouveau » / « adopter » when the repository is private.

**Tech Stack:** bash (Ubuntu/Debian server, systemd), GitHub CLI, GitHub Actions runner tarball, Playwright `install-deps`.

**Spec:** issue #274 (split from #271), `docs/adr/0001-serveur-de-dev-avec-secours-github.md`.

## Global Constraints

- Runner labels the factory expects: `self-hosted`, `linux`, plus the custom label **`factory-dev`** (the one #271 targets with `runs-on`).
- Exactly **2** runners per private project; existing runners are kept and count toward the 2.
- Public repositories never get a runner: the script refuses them.
- Re-running changes nothing (no duplicate runner, no duplicate label).
- Runners start on boot (`svc.sh install` → systemd).
- No inbound port: nothing to open (runners poll GitHub).
- All text shown to the owner in French, vouvoiement.

## Review Focus

- Running as root: the runner refuses root → the script creates and uses a dedicated `factory-runner` user.
- A runner already registered but offline/without label → label added, not recreated.
- `gh` missing or not logged in on the server → installed / login guided, in French.
- Project name given without owner (`mon-appli`) → expanded with the gh login.
- Unknown repository or no admin right → clear French error, nothing installed.

---

### Task 1: `scripts/dev-server.sh`

**Files:** Create `scripts/dev-server.sh`, `test/fixtures/fake-dev-server-bin/*` (stubs), `test/dev-server.test.mjs`.

- Usage: `dev-server.sh [owner/]repo` ; without argument it lists the owner's private factory projects and asks a number.
- Steps: `need_gh` → `install_software` (apt: curl git jq tar ca-certificates; Node.js 22 via NodeSource when `node` < 22; `npx -y playwright@<version from factory package.json> install-deps chromium`; skipped when the marker `$STATE_DIR/software-<version>` exists) → `check_private` → `ensure_runners`.
- `ensure_runners`: `gh api repos/R/actions/runners` → for each runner missing `factory-dev`, `POST …/runners/<id>/labels`; then create `2 - count` runners named `<host>-<repo>-<n>` (first free n) in `$RUNNER_HOME/<owner>-<repo>-<n>` with `config.sh --unattended --url --token --name --labels factory-dev --replace`, then `sudo ./svc.sh install <user>` and `sudo ./svc.sh start`.
- Test env overrides: `DEV_SERVER_ROOT` (runner home), `DEV_SERVER_STATE`, PATH stubs for `gh`, `sudo`, `apt-get`, `curl`, `tar`, `npx`, `node`, `systemctl`, `hostname`, `id`.
- Tests (names): fresh private project → 2 runners configured with `factory-dev` and services installed; project with 1 existing runner → label added to it, exactly 1 new runner; project with 2 → nothing created; second run → nothing created, software not reinstalled; public project → refused, nothing installed.

### Task 2: reminder in `scripts/factory.sh`

**Files:** Modify `scripts/factory.sh` (new `dev_server_reminder`, called in `main` before « C'est prêt »), `test/fixtures/fake-gh.sh` (answer `.private`), `test/factory-sh.test.mjs`.

- `gh api repos/$REPO --jq .private` = `true` → print the filled command `bash <(curl -fsSL https://raw.githubusercontent.com/phoibe/factory/stable/scripts/dev-server.sh) $REPO` and the guide link; copy it with `pbcopy` when available. Public → nothing.
- Tests: private adoption shows the reminder with `phoibe/mon-appli`; public adoption doesn't.

### Task 3: French guide

**Files:** Create `docs/serveur-de-dev.md`; mention it in `outils/LISEZMOI.txt` and `README.md`; glossary entry « Runner du serveur de dev » if useful.
- Test: guide exists, contains the command, uses vouvoiement (existing vouvoiement test covers docs? check), no `tu`.

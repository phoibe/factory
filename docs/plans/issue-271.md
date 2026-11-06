# Dev server for private projects, GitHub as backup — Implementation Plan

> **For agentic workers:** executed inline (superpowers:executing-plans). Steps use checkbox (`- [ ]`) syntax.

**Goal:** private projects run every factory workflow job on the owner's self-hosted runners, and fall back to
GitHub-hosted machines within 15 minutes when those runners are offline.

**Architecture:** every `runs-on` of the reusable workflows (`relay.yml`, `sync.yml`) reads the caller repository's
variable `FACTORY_RUNS_ON` (JSON labels), falling back to the GitHub image. A new scheduled workflow in the factory
(`runners.yml`, every 15 min, public repo = free) uses the owner's fine-grained key `FACTORY_RUNNERS_TOKEN` to read
each private project's runners, set or delete that variable, cancel and re-run the jobs stuck on a dead server, send
an ntfy alert on each switch, and write a status file on the factory branch `factory-runners`. The panel reads that
file and edits the general setting (`settings.json` on the same branch) and the project setting (`machine` in
`factory.config.json`).

**Tech Stack:** Node 22 ESM without dependencies, `node --test`, GitHub Actions, static panel.

**Spec:** issue #271, comment `<!-- factory-spec -->` (version 1).

## Global Constraints

- Public projects: always GitHub machines, whatever the setting (the variable is deleted).
- No key (missing, expired, refused): every project stays on GitHub; panel « Serveur de dev : clé d'accès manquante ».
- Server online but busy: no switch. Private project without runners = offline.
- Check every 15 minutes from the factory. Alerts through the existing ntfy `NTFY_TOPIC`.
- Panel copy in French, vouvoiement, DESIGN.md tokens only.
- Private project names never written in clear on the public factory branch (status keyed by a SHA-256 hash).

## Review Focus

- Invalid/unknown `machine` value in a project config → warning, follows the general setting.
- Status file missing (never checked) → panel says « pas encore vérifié », never crashes.
- Key refused (401) on the first call → status `refused`, nothing else attempted, alert once.
- A run stuck on a dead runner that does not cancel at once → force-cancel, re-run carried to the next check.
- Runner labels compared case-insensitively; a runner missing one label does not count.

---

### Task 1: Pure decisions (`scripts/lib/runners.mjs`)

**Files:** Create `scripts/lib/runners.mjs`; Test `test/runners.test.mjs`.

**Produces:**
- `MACHINES = ['dev-server', 'github']`, `DEFAULT_LABELS = ['self-hosted']`, `RUNS_ON_VAR = 'FACTORY_RUNS_ON'`
- `readSettings(raw) -> { machine, labels }` (defaults dev-server / DEFAULT_LABELS)
- `onlineRunners(runners, labels) -> number`
- `decideMachine({ isPrivate, project, general, key, online }) -> { machine, reason }` reasons: `public`, `setting`, `no-key`, `online`, `offline`
- `runsOnValue(labels) -> string` (JSON)
- `stuckJobs(jobs) -> jobs` (queued/in_progress/waiting with a `self-hosted` label)
- `alertsFor(prev, next) -> string[]` (offline ↔ online switches, key lost)
- `repoKey(fullName) -> Promise<string>` (sha256 hex, 16 chars)

- [ ] Tests first (each reason, labels case-insensitive, alerts only on transitions, never on first observation); see them fail; implement; pass.

### Task 2: Checker (`scripts/runners.mjs`) + workflow `runners.yml`

**Consumes:** Task 1. **Produces:** `checkRunners({ key, gh, keyGh, now, fetchImpl, topic, log }) -> status`.

- [ ] Tests with a fake GitHub (`request(method, path, body)`): no key → status `missing`, no call with a key; public repo → variable deleted; private + online → variable set; switch to offline → stuck run cancelled, re-run, alert sent; status written only when it changed.
- [ ] `.github/workflows/runners.yml`: `*/15` schedule + dispatch, `ubuntu-24.04`, `contents: write`.

### Task 3: Workflows read `FACTORY_RUNS_ON`

- [ ] Test in `test/relay-workflow.test.mjs`: every `runs-on` of `relay.yml` and `sync.yml` is `${{ vars.FACTORY_RUNS_ON && fromJSON(vars.FACTORY_RUNS_ON) || '<image>' }}`.

### Task 4: Config + panel

- [ ] `config-core.mjs`: `machine` ∈ `default | dev-server | github` (tests in `test/config.test.mjs`).
- [ ] `panel/machine.mjs`: `machineLine({ status, hash, isPrivate, general, project })` → text of the status line (tests).
- [ ] `panel/app.mjs`: fieldset « Machine des tâches » (status, general setting, project setting), saved by « Enregistrer »; dispatch `runners.yml` after a change. E2E in `e2e/machine.e2e.mjs`.

### Task 5: Docs

- [ ] `docs/serveur-de-dev.md` (French guide: key creation link, exact permissions, secret name), STACK/PRODUCT lines.

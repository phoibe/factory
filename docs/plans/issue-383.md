# Automatic relaunch of a failed agent launch — Implementation Plan (issue #383)

> **For agentic workers:** executed inline with executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** when starting the agent fails for a passing reason, the factory retries alone (2 min, 10 min, then every
30 min), tells the owner once at the 3rd failure, blocks the card after 3 h; a configuration failure keeps today's message.

**Architecture:** `fireAgent` tags its errors `transient` (network, 408/425/429/5xx from the routine, network/5xx on the
Actions dispatch) or not (secrets missing, factory not installed, other 4xx). A new `launch()` wraps every call site:
on a transient failure it saves the launch (stage, pr, extra, and the follow-up actions `then` that the call site used to
run after a successful start) in an invisible marker at the end of the card's description, plus the label
`factory:relaunch`. The guard (`heal`, every tick) retries due launches oldest first and stops at the first failure,
pushing the others to the same next time. The first retry, 2 min later, is started by the decide/report job itself
after the lock (like `retrySoon` for checks). An owner message on a waiting card relaunches it at once.
The question chat gets one retry after 30 s, then a clear message. The panel shows « Relance prévue à HH:MM ».

**Tech Stack:** Node.js ESM, `node --test`, Playwright e2e.

**Spec:** issue #383, spec version 1 (saved to `docs/specs/` by `specs.mjs save 383`).

## Global Constraints

- Schedule: first retry 2 min after the failure, second 10 min after that, then every 30 min; blocked 3 h after the first failure.
- Told once, at the 3rd failure in a row: « Le service de Claude ne répond pas en ce moment, je réessaie tout seul, rien à faire de votre côté. »
- Question chat: one retry about 30 s later, then « Le service de Claude est saturé, réessayez dans quelques minutes. »
- Card mention: « Relance prévue à HH:MM ».
- No relaunch for configuration failures (routine secrets missing, factory not installed): message unchanged.
- No new dependency.

## Review Focus

- A marker whose JSON contains `-->` (follow-up comments carry `<!-- factory-agent -->`): must not break the hidden comment → `<`/`>` escaped.
- While a launch waits, the queue, auto-pick, idle-relaunch, waiters and conflict guard must not start other launches for that card (or new ones during the outage).
- Owner message « fermer » on a waiting card still closes it (drop wins over relaunch).
- A card closed/blocked meanwhile: the retry drops its marker instead of firing.
- Rate limit of GitHub itself stays re-thrown (unchanged).

---

### Task 1: marker and schedule helpers

**Files:** Create `panel/relaunch.mjs` (pure, shared with the panel), `scripts/lib/relaunch.mjs`; Test `test/relaunch.test.mjs`.

**Interfaces (produces):**
- `panel/relaunch.mjs`: `RELAUNCH_MARKER`, `readRelaunch(body) -> state|null`, `writeRelaunch(body, state|null) -> body`, `relaunchLine(state, tz?) -> 'Relance prévue à HH:MM' | null`.
- `scripts/lib/relaunch.mjs`: `RELAUNCH_RETRIES_MS = [2 min, 10 min]`, `RELAUNCH_SLOW_MS = 30 min`, `RELAUNCH_GIVE_UP_MS = 3 h`, `RELAUNCH_TOLD`, `QUESTION_RETRY_MS = 30 s`, `QUESTION_BUSY`, `isTransientStatus(status)`, `relaunchStep(state|null, { launch, now }) -> { state, action: 'wait'|'block', tell, firstInMs }`.

- [ ] Tests: round trip with a body holding `-->`; failures 1/2/3/4 give next = +2/+10/+30/+30 min, tell only at 3; ≥3 h since first failure → block; statuses 429/500/529/408 transient, 401/404/400 not.
- [ ] Run, see red; implement; green; commit.

### Task 2: relay — transient errors, `launch()`, waiting cards, retries

**Files:** Modify `scripts/relay.mjs`, `scripts/lib/labels.mjs` (label `factory:relaunch`); Test `test/relay.test.mjs`.

- [ ] Tests: routine 529 on an owner « go » → no comment, label + marker, labels untouched, `outputs.relaunchInMs = 120000`; tick after 2 min retries, on success runs the saved follow-up (spec-review → building) and clears marker and label; third failure tells once; 3 h → blocked with message; two waiting cards: oldest fails → the younger is not tried and its next moves; owner message on a waiting card fires the saved launch; 401 keeps today's message; question 529 twice → busy message after one retry; fix-checks / dequeue / autoPick / waiters / update-branch call sites save their follow-ups.
- [ ] Implement: `fireAgent` errors with `.transient`; `launch()`/`afterLaunch()`/`waitRelaunch()`/`retryLaunches()`; `fireOrBlock` takes `then`; skip cards with the label in dequeue/autoPick/relaunchIdle/wakeWaiters/unstickConflicts; `relaunchSoon()` called in `main` after decide/report.
- [ ] Update older tests that used 429 as a « config » failure to 401. Green; commit.

### Task 3: panel mention and e2e

**Files:** Modify `panel/app.mjs` (status line on the card), `e2e/relaunch.e2e.mjs` (new).

- [ ] e2e « je vois Relance prévue à … sur une carte dont le lancement a échoué »: a card with the marker in its body shows the mention.
- [ ] Implement; `npm run test:e2e`; commit.

### Task 4: docs

- [ ] `GLOSSARY.md` entries « Relance automatique » and « Échec de réglage » if missing; `specs.mjs save 383`.

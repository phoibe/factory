# Chat: concurrent saves never erase an exchange, agent confined to the project — Implementation Plan

> Executed inline (executing-plans) by the factory agent; no human validation of the plan.

**Goal:** Two exchanges saved at nearly the same time both survive, and the chat agent can read only the project and the conversation's images.

**Architecture:** `save()` re-reads the latest `chats/<id>.json`, appends this exchange to it and writes with the sha it just read; GitHub refuses a stale write (409/422) and the save starts again, a few times with a small pause. The `claude -p` process runs with `--restricted --permission-mode dontAsk`, which confines Read/Grep/Glob to the working directories (project copy + `--add-dir` image folder).

**Tech Stack:** Python 3.12, FastAPI, httpx, Claude Code CLI (pinned in `app.py`), unittest.

**Spec:** issue #214, comment `<!-- factory-spec -->` version 1.

## Global Constraints

- Issues created by an answer are never created twice (they are created before the save; retries only rewrite the file).
- A failed save is still reported as `saved: false` (« réponse non enregistrée »), never as an error.
- « Terminer » unchanged (panel edits `index.json` only).

## Review Focus

- Another device's exchange saved between the arrival read and our save → kept (test).
- Another save between our read and our write → 409, retry from latest (test).
- Every retry refused → `saved: false`, issue created once (test).
- Agent asked for `/etc/passwd`, or a project symlink to it → refused (manual check with the real CLI; args test).
- Deployed CLI too old for `--restricted` → pinned version forces an image rebuild.

---

### Task 1: Merge saves

**Files:** Modify `server/chat/service.py` (`save`), Test `server/chat/test_service.py`

- [x] Fake GitHub with versioned shas, refusing stale writes; tests `test_a_message_saved_from_another_device_during_the_answer_is_kept`, `test_two_saves_that_cross_start_again_from_the_latest_conversation`, `test_a_save_refused_every_time_says_not_saved_without_creating_the_issue_twice`
- [x] Run, see them fail
- [x] `async def save(gh, base, mine, text, at, created) -> conv` with `SAVE_TRIES = 5`, `SAVE_PAUSE = 0.4`
- [x] Run, green

### Task 2: Confine the agent

**Files:** Modify `server/chat/service.py` (claude args), `server/chat/core.py` (SYSTEM), `server/chat/app.py` (pin CLI `2.1.318`), Test `server/chat/test_service.py`

- [x] Test `test_the_agent_can_only_read_the_project_and_the_images` (args: `--restricted`, `--permission-mode dontAsk`, no `--allowedTools`)
- [x] Run, see it fail
- [x] Change the flags, pin the CLI, add the prompt sentence
- [x] Run, green; manual check with the real CLI (`/etc/*` and symlink refused, project and image folder readable)

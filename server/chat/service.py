"""The chat server's web API (FastAPI). Run by app.py on Modal; runnable locally for tests.

POST /chat        {repo, conversation: id|null, message, images: [paths]}  ->  NDJSON stream of events
GET  /health      wakes the server up when the panel opens the « Discussion » tab

The caller proves who it is with its GitHub token (the panel's): only the factory's owner, only on his own
repositories. The same token reads the project and writes the conversation, so the server keeps no GitHub secret.
"""
import asyncio
import base64
import json
import os
import random
import string
import time
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from core import (
    BRANCH, SYSTEM, add_exchange, build_prompt, check_access, events_from_line, extract_issues,
    new_conversation, upsert_index, visible_text,
)

ATTACHMENTS = "factory-attachments"
FETCH_EVERY = 30  # seconds: a project copy fresher than this is not fetched again
MAX_IMAGES = 4
BRANCH_README = "# Discussions\n\nConversations du chat du tableau de suivi avec l'agent. Ne pas fusionner.\n"
VERCEL_OFF = '{ "git": { "deploymentEnabled": false } }\n'


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def new_id():
    return time.strftime("%Y%m%d-%H%M%S", time.gmtime()) + "-" + "".join(random.choices(string.ascii_lowercase + string.digits, k=5))


class GitHub:
    def __init__(self, token, repo, api, transport=None):
        self.repo = repo
        self.client = httpx.AsyncClient(base_url=api, timeout=30, transport=transport, headers={
            "authorization": f"Bearer {token}", "accept": "application/vnd.github+json", "user-agent": "factory-chat"})

    async def close(self):
        await self.client.aclose()

    async def get(self, path, raw=False, **params):
        headers = {"accept": "application/vnd.github.raw"} if raw else {}
        r = await self.client.get(path.replace("{repo}", self.repo), params=params, headers=headers)
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return r.content if raw else r.json()

    async def send(self, method, path, body):
        r = await self.client.request(method, path.replace("{repo}", self.repo), json=body)
        r.raise_for_status()
        return r.json() if r.content else None

    async def ensure_branch(self, name, files):
        if await self.get(f"/repos/{{repo}}/branches/{name}"):
            return
        tree = await self.send("POST", "/repos/{repo}/git/trees", {"tree": [
            {"path": p, "mode": "100644", "type": "blob", "content": c} for p, c in files.items()]})
        commit = await self.send("POST", "/repos/{repo}/git/commits", {"message": f"chore(factory): {name} branch", "tree": tree["sha"], "parents": []})
        try:
            await self.send("POST", "/repos/{repo}/git/refs", {"ref": f"refs/heads/{name}", "sha": commit["sha"]})
        except httpx.HTTPStatusError as e:
            if e.response.status_code != 422:  # 422: created meanwhile
                raise

    async def read_json(self, path, default):
        meta = await self.get(f"/repos/{{repo}}/contents/{path}", ref=BRANCH)
        if not meta:
            return default, None
        return json.loads(base64.b64decode(meta["content"]).decode()), meta["sha"]

    async def write_json(self, path, data, sha, message):
        body = {"message": message, "branch": BRANCH, "content": base64.b64encode((json.dumps(data, ensure_ascii=False, indent=1) + "\n").encode()).decode()}
        if sha:
            body["sha"] = sha
        return await self.send("PUT", f"/repos/{{repo}}/contents/{path}", body)


def create_app(owner, github_api="https://api.github.com", claude_bin="claude", repos_dir="/repos", model="sonnet",
               origins=None, on_repo_change=None, git_url="https://github.com/{repo}.git", transport=None):
    app = FastAPI()
    app.add_middleware(CORSMiddleware, allow_origins=origins or [f"https://{owner.lower()}.github.io"],
                       allow_methods=["GET", "POST"], allow_headers=["authorization", "content-type"])
    fetched = {}
    locks = {}

    @app.get("/health")
    async def health():
        return {"ok": True}

    async def run(*args, cwd=None):
        proc = await asyncio.create_subprocess_exec(*args, cwd=cwd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        out, err = await proc.communicate()
        if proc.returncode:
            raise RuntimeError(err.decode(errors="replace")[-500:])
        return out.decode()

    async def project_copy(repo, token):
        """An up-to-date read-only copy of the project's default branch, kept between messages."""
        path = os.path.join(repos_dir, repo)
        lock = locks.setdefault(repo, asyncio.Lock())
        async with lock:
            if time.time() - fetched.get(repo, 0) < FETCH_EVERY and os.path.isdir(path):
                return path
            auth = base64.b64encode(f"x-access-token:{token}".encode()).decode()
            git = ["git", "-c", f"http.extraHeader=Authorization: Basic {auth}"]
            url = git_url.format(repo=repo)
            if os.path.isdir(os.path.join(path, ".git")):
                await run(*git, "fetch", "--depth", "1", "origin", "HEAD", cwd=path)
                await run("git", "reset", "--hard", "-q", "FETCH_HEAD", cwd=path)
                await run("git", "clean", "-fdq", cwd=path)
            else:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                await run(*git, "clone", "--depth", "1", "-q", url, path)
            fetched[repo] = time.time()
            if on_repo_change:
                on_repo_change()
            return path

    @app.post("/chat")
    async def chat(request: Request):
        token = (request.headers.get("authorization") or "").removeprefix("Bearer ").strip()
        body = await request.json()
        repo = str(body.get("repo") or "")
        message = str(body.get("message") or "").strip()
        images = [str(p) for p in body.get("images") or []][:MAX_IMAGES]
        if not token:
            return JSONResponse({"error": "Jeton manquant."}, 401)
        if not message and not images:
            return JSONResponse({"error": "Message vide."}, 400)
        if any(not p.startswith("attachments/") or ".." in p for p in images):
            return JSONResponse({"error": "Image inconnue."}, 400)
        gh = GitHub(token, repo if "/" in repo else "x/x", github_api, transport)
        try:
            me = await gh.get("/user")
        except httpx.HTTPStatusError:
            me = None
        refused = check_access(owner, (me or {}).get("login"), repo)
        if refused:
            await gh.close()
            return JSONResponse({"error": refused}, 403)
        return StreamingResponse(answer(gh, token, repo, body.get("conversation"), message, images), media_type="application/x-ndjson")

    async def answer(gh, token, repo, cid, message, images):
        def ev(obj):
            return json.dumps(obj, ensure_ascii=False) + "\n"

        proc = None
        try:
            yield ev({"type": "status", "text": "Ouvre le projet…"})
            conv = None
            if cid:
                conv, _ = await gh.read_json(f"chats/{cid}.json", None)
            conv = conv or new_conversation(new_id(), message, now_iso())
            cwd = await project_copy(repo, token)
            files = []
            folder = os.path.join("/tmp/chat", conv["id"])
            os.makedirs(folder, exist_ok=True)
            for p in images:
                data = await gh.get(f"/repos/{{repo}}/contents/{p}", raw=True, ref=ATTACHMENTS)
                if data:
                    f = os.path.join(folder, os.path.basename(p))
                    with open(f, "wb") as out:
                        out.write(data)
                    files.append(f)
            yield ev({"type": "status", "text": "Réfléchit…"})
            # The prompt goes through stdin: a long conversation does not fit in a command-line argument.
            proc = await asyncio.create_subprocess_exec(
                claude_bin, "-p",
                "--output-format", "stream-json", "--verbose", "--include-partial-messages",
                "--model", model, "--tools", "Read,Grep,Glob", "--allowedTools", "Read,Grep,Glob",
                "--add-dir", folder, "--setting-sources", "user", "--strict-mcp-config", "--no-session-persistence",
                "--append-system-prompt", SYSTEM.format(repo=repo),
                cwd=cwd, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
                limit=16 * 1024 * 1024)
            try:
                proc.stdin.write(build_prompt(conv, message, files).encode())
                await proc.stdin.drain()
                proc.stdin.close()
            except (BrokenPipeError, ConnectionResetError):
                pass  # claude exited early: its own error is read below
            draft, shown, final, failed = "", "", None, False
            async for raw in proc.stdout:
                for e in events_from_line(raw.decode(errors="replace")):
                    if e["type"] == "delta":
                        draft += e["text"]
                        now = visible_text(draft)
                        if now != shown:
                            yield ev({"type": "draft", "text": now}) if not now.startswith(shown) else ev({"type": "delta", "text": now[len(shown):]})
                            shown = now
                    elif e["type"] == "reset":
                        draft, shown = "", ""
                        yield ev({"type": "reset"})
                    elif e["type"] == "status":
                        yield ev(e)
                    elif e["type"] == "result":
                        final, failed = e["text"], e["error"]
            await proc.wait()
            if final is None or failed:
                err = (await proc.stderr.read()).decode(errors="replace")[-300:]
                raise RuntimeError(final or err or "pas de réponse")
            text, wanted = extract_issues(final)
            created = []
            for issue in wanted:
                label = "factory:bug" if issue["kind"] == "bug" else "factory:feature"
                body = f"{issue['body']}\n\n_Demandé depuis le chat du tableau de suivi._"
                if issue["kind"] != "bug":
                    # The agent marker makes the factory leave a new feature in the list instead of starting it
                    # at once: it is picked later by the queue rules. A bug still starts right away.
                    body = f"<!-- factory-agent -->\n{body}"
                made = await gh.send("POST", "/repos/{repo}/issues", {
                    "title": issue["title"], "labels": [label], "body": body})
                created.append({**issue, "url": made["html_url"], "number": made["number"]})
            add_exchange(conv, {"text": message, "images": images}, text, now_iso(), created)
            yield ev({"type": "answer", "text": text, "issues": [{"title": i["title"], "url": i["url"], "kind": i["kind"]} for i in created]})
            # The answer is given and the issues exist: a failed save must not make the panel offer to send the
            # message again (that would create the issues twice). It is reported as « not saved » instead.
            saved = True
            try:
                await save(gh, conv)
            except Exception:
                saved = False
            yield ev({"type": "done", "saved": saved, "conversation": {"id": conv["id"], "title": conv["title"], "updated": conv["updated"], "state": "open"}})
        except Exception as e:  # the panel shows it and offers to send again
            yield ev({"type": "error", "message": str(e)[:300]})
        finally:
            # The panel left (or the answer failed): the agent must not go on running on the owner's subscription.
            try:
                if proc is not None and proc.returncode is None:
                    proc.kill()
                    await proc.wait()
            except ProcessLookupError:
                pass
            finally:
                await gh.close()

    async def save(gh, conv):
        await gh.ensure_branch(BRANCH, {"README.md": BRANCH_README, "vercel.json": VERCEL_OFF})
        _, sha = await gh.read_json(f"chats/{conv['id']}.json", None)
        await gh.write_json(f"chats/{conv['id']}.json", conv, sha, f"chore(factory): chat {conv['id']}")
        for attempt in range(3):  # the panel may have changed the index meanwhile (« Terminer »)
            index, sha = await gh.read_json("index.json", [])
            try:
                await gh.write_json("index.json", upsert_index(index, conv), sha, "chore(factory): chat index")
                return
            except httpx.HTTPStatusError as e:
                if e.response.status_code not in (409, 422) or attempt == 2:
                    raise

    return app

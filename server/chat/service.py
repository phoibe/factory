"""The chat server's web API (FastAPI). Run by app.py on Modal; runnable locally for tests.

POST /chat        {repo, conversation: id|null, message, images: [paths]}  ->  NDJSON stream of events
GET  /health      wakes the server up when the panel opens the « Agent » tab

The caller proves who it is with a read-only GitHub token (the panel's second token): only the factory's owner,
only on his own repositories. The server never writes to GitHub: the panel saves the conversation and creates the
issues the agent proposes with the owner's full token, which never leaves the browser. A token that can write is
refused, so a leak of what the server receives can change nothing.
"""
import asyncio
import base64
import json
import os
import random
import re
import shutil
import tempfile
import string
import time
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from core import (
    BRANCH, CID_RE, SYSTEM, build_prompt, check_access, events_from_line, extract_issues, new_conversation, visible_text,
)

ATTACHMENTS = "factory-attachments"
FETCH_EVERY = 30  # seconds: a project copy fresher than this is not fetched again
MAX_IMAGES = 4
MAX_MESSAGE = 20000  # characters
CLAUDE_TIMEOUT = 180  # seconds for one answer
IMAGE_RE = re.compile(r"attachments/chat/[\w-]+\.(?:png|jpe?g|gif|webp)", re.ASCII)  # same rule as the panel
# Writes with an empty body: GitHub refuses a read-only token (403) before reading the body, and answers a token that
# can write with a 422 (invalid body), so nothing is ever written. Files, issues, pull requests: same list as the panel.
WRITE_PROBES = (("PUT", "contents/.factory-write-probe"), ("POST", "issues"), ("POST", "pulls"))


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

    async def can_write(self):
        """True when the token may change the project's files, issues or pull requests."""
        answers = await asyncio.gather(*(self.client.request(m, f"/repos/{self.repo}/{p}", json={}) for m, p in WRITE_PROBES))
        if any(r.status_code >= 500 or r.status_code == 429 for r in answers):
            raise httpx.TransportError("github")
        return any(r.status_code not in (401, 403, 404) for r in answers)

    async def read_json(self, path, default):
        meta = await self.get(f"/repos/{{repo}}/contents/{path}", ref=BRANCH)
        if not meta:
            return default, None
        if meta.get("content"):
            return json.loads(base64.b64decode(meta["content"]).decode()), meta["sha"]
        # Over 1 MB the contents API sends no content: ask for the raw file instead.
        raw = await self.get(f"/repos/{{repo}}/contents/{path}", raw=True, ref=BRANCH)
        return json.loads(raw.decode()), meta["sha"]


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

    def claude_env():
        """Only what claude needs: the server's other secrets never reach the agent."""
        keep = ("PATH", "HOME", "CLAUDE_CODE_OAUTH_TOKEN", "LANG")
        return {k: os.environ[k] for k in keep if k in os.environ}

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
        if not token:
            return JSONResponse({"error": "Jeton manquant."}, 401)
        try:
            body = json.loads(await request.body())
        except ValueError:
            body = None
        if not isinstance(body, dict):
            return JSONResponse({"error": "Requête invalide."}, 400)
        repo = str(body.get("repo") or "")
        message = str(body.get("message") or "").strip()
        images = [str(p) for p in body.get("images") or []][:MAX_IMAGES] if isinstance(body.get("images") or [], list) else []
        if len(message) > MAX_MESSAGE:
            return JSONResponse({"error": f"Message trop long (au plus {MAX_MESSAGE} caractères)."}, 413)
        if not message and not images:
            return JSONResponse({"error": "Message vide."}, 400)
        if any(not IMAGE_RE.fullmatch(p) for p in images):
            return JSONResponse({"error": "Image inconnue."}, 400)
        gh = GitHub(token, repo if "/" in repo else "x/x", github_api, transport)
        try:
            try:
                me = await gh.get("/user")
            except httpx.HTTPStatusError as e:
                r = e.response
                limited = r.status_code == 403 and (r.headers.get("x-ratelimit-remaining") == "0" or "retry-after" in r.headers)
                if r.status_code >= 500 or r.status_code == 429 or limited:
                    raise httpx.TransportError("github") from e
                if r.status_code == 401:
                    await gh.close()
                    return JSONResponse({"error": "Jeton refusé par GitHub."}, 401)
                me = None
            refused = check_access(owner, (me or {}).get("login"), repo)
            if not refused and await gh.can_write():
                await gh.close()
                return JSONResponse({"error": "Ce jeton peut modifier vos projets : la discussion n'accepte qu'un jeton de lecture.", "code": "writable"}, 403)
        except httpx.HTTPError:
            await gh.close()
            return JSONResponse({"error": "GitHub ne répond pas, réessayez dans un instant."}, 503)
        if refused:
            await gh.close()
            return JSONResponse({"error": refused}, 403)
        return StreamingResponse(answer(gh, token, repo, body.get("conversation"), message, images), media_type="application/x-ndjson")

    async def answer(gh, token, repo, cid, message, images):
        def ev(obj):
            return json.dumps(obj, ensure_ascii=False) + "\n"

        proc = None
        folder = None
        try:
            yield ev({"type": "status", "text": "Ouvre le projet…"})
            conv = None
            if cid and not CID_RE.match(str(cid)):
                raise ValueError("Conversation inconnue.")
            if cid:
                conv, _ = await gh.read_json(f"chats/{cid}.json", None)
            cid = str(cid) if cid else new_id()
            conv = conv or new_conversation(cid, message, now_iso())
            conv["id"] = cid  # the stored JSON's own id is never trusted
            cwd = await project_copy(repo, token)
            files = []
            # One folder per message: two messages of one conversation may run at once.
            os.makedirs("/tmp/chat", exist_ok=True)
            folder = tempfile.mkdtemp(prefix=f"{cid}-", dir="/tmp/chat")
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
                # Read-only tools, confined to the project and this message's images: --restricted keeps the file
                # tools inside the working directories (no /etc, no other project, no /proc with the agent's token)
                # and dontAsk refuses anything else instead of waiting for an approval nobody can give.
                "--model", model, "--tools", "Read,Grep,Glob", "--restricted", "--permission-mode", "dontAsk",
                "--add-dir", folder, "--strict-mcp-config",
                # Project and local settings (and their hooks) come from the copied repository: ignored.
                "--setting-sources", "user", "--no-session-persistence",
                "--append-system-prompt", SYSTEM.format(repo=repo),
                cwd=cwd, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
                env=claude_env(), limit=16 * 1024 * 1024)
            try:
                proc.stdin.write(build_prompt(conv, message, files).encode())
                await proc.stdin.drain()
                proc.stdin.close()
            except (BrokenPipeError, ConnectionResetError):
                pass  # claude exited early: its own error is read below
            draft, shown, final, failed = "", "", None, False
            deadline = asyncio.get_running_loop().time() + CLAUDE_TIMEOUT
            while True:
                try:
                    raw = await asyncio.wait_for(proc.stdout.readline(), max(deadline - asyncio.get_running_loop().time(), 0))
                except asyncio.TimeoutError:
                    raise RuntimeError("L'agent met trop de temps à répondre, réessayez.")
                if not raw:
                    break
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
            # The panel creates the issues and saves the exchange with the owner's full token: the server never writes.
            yield ev({"type": "answer", "text": text, "issues": wanted, "conversation": {"id": cid, "title": conv["title"]}})
            yield ev({"type": "done"})
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
                if folder:
                    shutil.rmtree(folder, ignore_errors=True)
                await gh.close()

    return app

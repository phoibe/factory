"""End to end on a fake GitHub, a fake Claude and a local git repository (needs fastapi and httpx)."""
import base64
import json
import os
import stat
import subprocess
import tempfile
import threading
import time
import unittest

try:
    import httpx
    from fastapi.testclient import TestClient
    import service
    from service import create_app
except ImportError:  # pragma: no cover
    httpx = None

FAKE_CLAUDE = r'''#!/usr/bin/env python3
import json, os, sys, time
args = sys.argv
prompt = sys.stdin.read()  # the prompt travels on stdin: a long conversation does not fit in an argument
assert len(args[args.index("-p") + 1]) < 200, "the prompt must not be an argument"
open(args[0] + ".prompt", "w").write(prompt)
open(args[0] + ".args", "w").write(json.dumps(args[1:]))
open(args[0] + ".env", "w").write(json.dumps(dict(os.environ)))
if "LENT" in prompt:
    time.sleep(30)
if "ATTENDS" in prompt:  # a long answer, logged next to git's commands
    open(args[0] + ".log", "a").write("claude start\n")
    time.sleep(1.5)
    open(args[0] + ".log", "a").write("claude end\n")
if "BAVARD" in prompt:  # more on stderr than the server buffers (2 x 16 MB) before the answer
    sys.stderr.write("avertissement\n" * 3000000)
    sys.stderr.flush()
    if "PANNE" in prompt:
        sys.stderr.write("la vraie erreur\n")
        sys.exit(1)
def out(o): print(json.dumps(o), flush=True)
out({"type": "system", "subtype": "init"})
out({"type": "stream_event", "event": {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "Je regarde"}}})
out({"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "Grep", "input": {}}]}})
answer = 'Non, pas encore.\n<creer-issue type="feature" titre="Exporter mes données">Il veut exporter.</creer-issue>'
for chunk in ("Non, pas ", "encore.\n<creer-", 'issue type="feature" titre="Exporter mes données">Il veut exporter.</creer-issue>'):
    out({"type": "stream_event", "event": {"type": "content_block_delta", "delta": {"type": "text_delta", "text": chunk}}})
out({"type": "result", "result": answer, "is_error": False})
'''


class FakeGitHub:
    def __init__(self):
        self.files = {}
        self.issues = []
        self.branches = set()
        self.shas = {}
        self.user_status = None  # status answered on GET /user instead of the login
        self.user_headers = {}
        self.user_error = None  # exception raised on GET /user
        self.big = set()  # files whose contents API answer has an empty content (over 1 MB)
        self.raw_calls = 0
        self.writes = []
        self.probe_limited = False  # every write that is not the write probe
        self.issue_queries = []  # the server never lists the issues: the read-only token may not see them


    def __call__(self, request):
        path, method = request.url.path, request.method
        if path == "/user":
            if self.user_error:
                raise self.user_error
            if self.user_status:
                return httpx.Response(self.user_status, json={}, headers=self.user_headers)
            return httpx.Response(200, json={"login": "phoibe" if "good" in request.headers["authorization"] else "intrus"},
                                  headers=self.user_headers)
        if method != "GET" and json.loads(request.content or b"null") == {}:
            # A write probe: GitHub refuses a read-only token before looking at the (empty) body; a writer gets a 422.
            auth = request.headers["authorization"]
            writer = "writer" in auth or ("issues" in auth and path.endswith("/issues"))
            if writer and self.probe_limited:  # GitHub's rate limit is a 403 too
                return httpx.Response(403, json={}, headers={"x-ratelimit-remaining": "0"})
            return httpx.Response(422 if writer else 403, json={})
        if method != "GET":
            self.writes.append((method, path))
        if path.endswith("/issues") and method == "GET":
            self.issue_queries.append(dict(request.url.params))
        if "/branches/" in path:
            return httpx.Response(200 if path.rsplit("/", 1)[1] in self.branches else 404, json={})
        if "/contents/" in path:
            name = path.split("/contents/", 1)[1]
            if name not in self.files:
                return httpx.Response(404, json={})
            if request.headers.get("accept") == "application/vnd.github.raw":
                self.raw_calls += 1
                return httpx.Response(200, content=self.files[name])
            if name in self.big:
                return httpx.Response(200, json={"content": "", "encoding": "none", "sha": self.sha(name)})
            meta = {"content": base64.b64encode(self.files[name]).decode(), "sha": self.sha(name)}
            return httpx.Response(200, json=meta)
        return httpx.Response(404, json={})

    def sha(self, name):
        return f"v{self.shas.get(name, 0)}"


@unittest.skipIf(httpx is None, "fastapi/httpx not installed")
class ServiceTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        src = os.path.join(self.tmp, "src")
        subprocess.run(["git", "init", "-q", "-b", "main", src], check=True)
        with open(os.path.join(src, "README.md"), "w") as f:
            f.write("habitudes")
        subprocess.run(["git", "-C", src, "add", "."], check=True)
        subprocess.run(["git", "-C", src, "-c", "user.email=a@b", "-c", "user.name=a", "commit", "-qm", "init"], check=True)
        self.claude = os.path.join(self.tmp, "claude")
        with open(self.claude, "w") as f:
            f.write(FAKE_CLAUDE)
        os.chmod(self.claude, os.stat(self.claude).st_mode | stat.S_IEXEC)
        self.gh = FakeGitHub()
        self.gh.files["attachments/chat/1-a.jpg"] = b"JPEG"
        app = create_app("phoibe", claude_bin=self.claude, repos_dir=os.path.join(self.tmp, "repos"),
                         git_url=src, transport=httpx.MockTransport(self.gh))
        self.client = TestClient(app)

    def post(self, token, body):
        r = self.client.post("/chat", json=body, headers={"authorization": f"Bearer {token}"})
        return r, [json.loads(l) for l in r.text.splitlines() if l.strip()] if r.status_code == 200 else []

    def test_only_the_owner(self):
        r, _ = self.post("bad", {"repo": "phoibe/habitudes", "message": "Salut"})
        self.assertEqual(r.status_code, 403)
        r, _ = self.post("good", {"repo": "autre/x", "message": "Salut"})
        self.assertEqual(r.status_code, 403)

    def test_a_message_streams_the_answer_and_hands_the_issues_to_the_panel(self):
        r, events = self.post("good", {"repo": "phoibe/habitudes", "message": "Je peux exporter ?", "images": ["attachments/chat/1-a.jpg"],
                                       "openRequests": [{"number": 7, "title": "Exporter en PDF"}, {"number": "x", "title": "Bizarre"},
                                                        {"number": 8, "title": "T" * 500}, "pas un objet"]})
        self.assertEqual(r.status_code, 200, r.text)
        kinds = [e["type"] for e in events]
        self.assertIn("reset", kinds)
        self.assertEqual(kinds[-1], "done", events)
        streamed = "".join(e["text"] for e in events[kinds.index("reset"):] if e["type"] == "delta")
        self.assertEqual(streamed.strip(), "Non, pas encore.")  # never the block
        answer = next(e for e in events if e["type"] == "answer")
        self.assertEqual(answer["text"], "Non, pas encore.")
        # The panel creates the issues with the owner's full token: the server only says which ones.
        self.assertEqual(answer["issues"], [{"kind": "feature", "title": "Exporter mes données", "body": "Il veut exporter."}])
        self.assertTrue(answer["conversation"]["id"])
        self.assertEqual(answer["conversation"]["title"], "Je peux exporter ?")
        prompt = open(self.claude + ".prompt").read()
        self.assertIn("Je peux exporter ?", prompt)
        self.assertIn("1-a.jpg", prompt)
        # Issue #506: the panel sends the open requests (the read-only token may not list issues on a private project).
        self.assertIn("n° 7 : Exporter en PDF", prompt)
        self.assertNotIn("Bizarre", prompt)
        self.assertNotIn("T" * 151, prompt)
        self.assertEqual(self.gh.issue_queries, [])

    def test_without_the_open_requests_the_agent_is_told_the_list_is_missing(self):
        for value in (None, "nimporte", 3):
            r, events = self.post("good", {"repo": "phoibe/habitudes", "message": "Je peux exporter ?", "openRequests": value})
            self.assertEqual(events[-1]["type"], "done", events)
            self.assertIn("indisponible", open(self.claude + ".prompt").read())

    def test_the_server_never_writes_to_github(self):
        r, events = self.post("good", {"repo": "phoibe/habitudes", "message": "Je peux exporter ?"})
        self.assertEqual(events[-1]["type"], "done", events)
        self.assertEqual(self.gh.issues, [])
        self.assertEqual(self.gh.writes, [])
        self.assertFalse(any(k.startswith("chats/") or k == "index.json" for k in self.gh.files))

    def test_a_token_that_can_write_is_refused(self):
        r, _ = self.post("goodwriter", {"repo": "phoibe/habitudes", "message": "Salut"})
        self.assertEqual(r.status_code, 403)
        self.assertEqual(r.json()["code"], "writable")
        self.assertFalse(os.path.exists(self.claude + ".prompt"))  # the agent never ran

    def test_a_token_that_can_only_open_issues_is_refused_too(self):
        r, _ = self.post("goodissues", {"repo": "phoibe/habitudes", "message": "Salut"})
        self.assertEqual(r.status_code, 403)
        self.assertEqual(r.json()["code"], "writable")

    def test_a_classic_token_with_a_scope_beyond_reading_is_refused_even_when_the_probes_say_read_only(self):
        # delete_repo, workflow, admin:* do not open contents, issues or pulls: only the token's scopes show them.
        for scopes in ("delete_repo, workflow", "read:user, admin:repo_hook", "repo", "public_repo"):
            self.gh.user_headers = {"x-oauth-scopes": scopes}
            r, _ = self.post("good", {"repo": "phoibe/habitudes", "message": "Salut"})
            self.assertEqual(r.status_code, 403, scopes)
            self.assertEqual(r.json()["code"], "writable", scopes)
        self.assertFalse(os.path.exists(self.claude + ".prompt"))  # the agent never ran

    def test_a_read_only_classic_token_or_a_token_without_scopes_is_accepted(self):
        # Fine-grained tokens send no x-oauth-scopes header (the default fake): the probes decide alone.
        for scopes in ("", "read:user", "read:org, read:user", "user:email", "read:user,user:email"):
            self.gh.user_headers = {"x-oauth-scopes": scopes}
            r, events = self.post("good", {"repo": "phoibe/habitudes", "message": "Salut"})
            self.assertEqual(r.status_code, 200, scopes)
            self.assertEqual(events[-1]["type"], "done", (scopes, events))

    def test_a_rate_limited_write_probe_is_github_down_not_a_read_only_token(self):
        self.gh.probe_limited = True
        r, _ = self.post("goodwriter", {"repo": "phoibe/habitudes", "message": "Salut"})
        self.assertEqual(r.status_code, 503)
        self.assertFalse(os.path.exists(self.claude + ".prompt"))

    def test_the_next_message_carries_the_stored_conversation(self):
        cid = "20261113-101010-abcde"
        self.gh.files[f"chats/{cid}.json"] = json.dumps({"id": cid, "title": "Début", "messages": [
            {"who": "me", "text": "Début", "at": ""}, {"who": "agent", "text": "Non, pas encore.", "at": ""}]}).encode()
        r, events = self.post("good", {"repo": "phoibe/habitudes", "conversation": cid, "message": "Et en CSV ?"})
        self.assertEqual(events[-1]["type"], "done", events)
        self.assertIn("[Toi] Non, pas encore.", open(self.claude + ".prompt").read())
        answer = next(e for e in events if e["type"] == "answer")
        self.assertEqual(answer["conversation"], {"id": cid, "title": "Début"})

    def test_a_stored_conversation_without_a_title_still_gets_one(self):
        cid = "20261113-101010-abcde"
        for stored in ({"id": cid, "messages": [{"text": "Début"}]}, ["pas", "un", "objet"]):
            self.gh.files[f"chats/{cid}.json"] = json.dumps(stored).encode()
            r, events = self.post("good", {"repo": "phoibe/habitudes", "conversation": cid, "message": "Et en CSV ?"})
            self.assertEqual(events[-1]["type"], "done", events[-2:])
            answer = next(e for e in events if e["type"] == "answer")
            self.assertEqual(answer["conversation"], {"id": cid, "title": "Et en CSV ?"}, stored)

    def test_a_very_long_conversation_still_gets_an_answer(self):
        cid = self.start_conversation()
        conv = json.loads(self.gh.files[f"chats/{cid}.json"])
        conv["messages"] = [{"who": "me", "text": "x" * 20000, "at": ""} for _ in range(30)]  # ~600 KB of history
        self.gh.files[f"chats/{cid}.json"] = json.dumps(conv).encode()
        r, events = self.post("good", {"repo": "phoibe/habitudes", "conversation": cid, "message": "Et ensuite ?"})
        self.assertEqual(events[-1]["type"], "done", events)
        self.assertLess(len(open(self.claude + ".prompt").read()), 70000)  # only the recent messages are sent

    def start_conversation(self):
        """A stored conversation, as the panel saves it after a first answer."""
        cid = "20261113-101010-abcde"
        self.gh.files[f"chats/{cid}.json"] = json.dumps({"id": cid, "title": "Début", "messages": [
            {"who": "me", "text": "Début", "at": ""}, {"who": "agent", "text": "Non, pas encore.", "at": ""}]}).encode()
        return cid

    def test_the_agent_can_only_read_the_project_and_the_images(self):
        self.post("good", {"repo": "phoibe/habitudes", "message": "Lis /etc/passwd"})
        args = json.loads(open(self.claude + ".args").read())
        self.assertIn("--restricted", args)  # file tools confined to the project and the --add-dir image folder
        self.assertEqual(args[args.index("--permission-mode") + 1], "dontAsk")  # anything else is refused
        self.assertNotIn("--allowedTools", args)  # a blanket allow lets Read open any file on the machine
        self.assertEqual(args[args.index("--add-dir") + 1].split("/")[-2], "chat")

    def args_and_env(self):
        return json.loads(open(self.claude + ".args").read()), json.loads(open(self.claude + ".env").read())

    def test_project_settings_and_the_environment_stay_out_of_the_agent(self):
        os.environ["GITHUB_SECRET_FAKE"] = "s3cret"
        self.addCleanup(os.environ.pop, "GITHUB_SECRET_FAKE", None)
        self.post("good", {"repo": "phoibe/habitudes", "message": "Salut"})
        args, env = self.args_and_env()
        self.assertEqual(args[args.index("--setting-sources") + 1], "user")
        self.assertNotIn("GITHUB_SECRET_FAKE", env)
        self.assertLessEqual(set(env) - {"PATH", "HOME", "LANG", "CLAUDE_CODE_OAUTH_TOKEN", "LC_CTYPE"}, set())

    def test_an_oversized_message_is_refused(self):
        r, _ = self.post("good", {"repo": "phoibe/habitudes", "message": "x" * 20001})
        self.assertEqual(r.status_code, 413)
        self.assertIn("error", r.json())

    def test_a_body_that_is_not_a_json_object_is_a_400(self):
        h = {"authorization": "Bearer good"}
        self.assertEqual(self.client.post("/chat", content=b"pas du json", headers=h).status_code, 400)
        self.assertEqual(self.client.post("/chat", json=[1, 2], headers=h).status_code, 400)

    def test_a_conversation_over_one_mb_is_still_read(self):
        cid = self.start_conversation()
        self.gh.big.add(f"chats/{cid}.json")
        r, events = self.post("good", {"repo": "phoibe/habitudes", "conversation": cid, "message": "Suite"})
        self.assertEqual(events[-1]["type"], "done", events)
        self.assertGreater(self.gh.raw_calls, 0)
        self.assertIn("[Toi] Non, pas encore.", open(self.claude + ".prompt").read())

    def test_github_not_answering_is_a_503_not_a_403_or_500(self):
        for status in (500, 502, 429):
            self.gh.user_status = status
            r, _ = self.post("good", {"repo": "phoibe/habitudes", "message": "Salut"})
            self.assertEqual(r.status_code, 503, status)
            self.assertEqual(r.json()["error"], "GitHub ne répond pas, réessayez dans un instant.")
        self.gh.user_status = None
        self.gh.user_error = httpx.ConnectTimeout("lent")
        r, _ = self.post("good", {"repo": "phoibe/habitudes", "message": "Salut"})
        self.assertEqual(r.status_code, 503)

    def test_a_stalled_copy_of_the_project_ends_with_a_message_instead_of_hanging_the_chat(self):
        hang = os.path.join(self.tmp, "git-hang")
        with open(hang, "w") as f:
            f.write("#!/bin/sh\nsleep 30\n")
        os.chmod(hang, os.stat(hang).st_mode | stat.S_IEXEC)
        app = create_app("phoibe", claude_bin=self.claude, repos_dir=os.path.join(self.tmp, "repos-hang"), git_bin=hang,
                         git_timeout=0.5, clone_timeout=0.5, transport=httpx.MockTransport(self.gh))
        started = time.monotonic()
        r = TestClient(app).post("/chat", json={"repo": "phoibe/habitudes", "message": "Salut"}, headers={"authorization": "Bearer good"})
        events = [json.loads(l) for l in r.text.splitlines() if l.strip()]
        self.assertLess(time.monotonic() - started, 10)
        self.assertIn({"type": "error", "message": "GitHub ne répond pas, réessayez dans un instant."}, events)

    def test_the_first_copy_has_more_time_than_an_update(self):
        slow = os.path.join(self.tmp, "git-slow")
        with open(slow, "w") as f:
            f.write('#!/bin/sh\nsleep 0.6\nfor last; do :; done\nmkdir -p "$last/.git"\n')
        os.chmod(slow, os.stat(slow).st_mode | stat.S_IEXEC)
        repos = os.path.join(self.tmp, "repos-slow")
        app = create_app("phoibe", claude_bin=self.claude, repos_dir=repos, git_bin=slow, git_timeout=0.2, clone_timeout=3,
                         transport=httpx.MockTransport(self.gh))
        r = TestClient(app).post("/chat", json={"repo": "phoibe/habitudes", "message": "Salut"}, headers={"authorization": "Bearer good"})
        self.assertNotIn({"type": "error", "message": "GitHub ne répond pas, réessayez dans un instant."},
                         [json.loads(l) for l in r.text.splitlines() if l.strip()])
        self.assertTrue(os.path.isdir(os.path.join(repos, "phoibe/habitudes", ".git")))

    def test_a_failed_copy_leaves_no_half_made_project_behind(self):
        broken = os.path.join(self.tmp, "git-broken")
        with open(broken, "w") as f:
            f.write('#!/bin/sh\nfor last; do :; done\nmkdir -p "$last/.git"\necho "fatal: early EOF" >&2\nexit 128\n')
        os.chmod(broken, os.stat(broken).st_mode | stat.S_IEXEC)
        repos = os.path.join(self.tmp, "repos-broken")
        app = create_app("phoibe", claude_bin=self.claude, repos_dir=repos, git_bin=broken, transport=httpx.MockTransport(self.gh))
        r = TestClient(app).post("/chat", json={"repo": "phoibe/habitudes", "message": "Salut"}, headers={"authorization": "Bearer good"})
        self.assertIn("error", [json.loads(l)["type"] for l in r.text.splitlines() if l.strip()])
        self.assertFalse(os.path.exists(os.path.join(repos, "phoibe/habitudes")))

    def test_a_rate_limited_403_is_a_503_but_a_401_is_a_bad_token(self):
        self.gh.user_status = 403
        r, _ = self.post("good", {"repo": "phoibe/habitudes", "message": "Salut"})
        self.assertEqual(r.status_code, 403)  # a plain 403 is not a rate limit
        self.gh.user_status, self.gh.user_headers = 403, {"x-ratelimit-remaining": "0"}
        r, _ = self.post("good", {"repo": "phoibe/habitudes", "message": "Salut"})
        self.assertEqual(r.status_code, 503)
        self.gh.user_headers = {}
        self.gh.user_status = 401
        r, _ = self.post("good", {"repo": "phoibe/habitudes", "message": "Salut"})
        self.assertEqual(r.status_code, 401)

    def test_image_paths_follow_the_panel_rule(self):
        for bad in ("attachments/x.jpg", "attachments/chat/a b.jpg", "attachments/chat/a.svg", "attachments/chat/sub/a.png", "attachments/chat/a.jpg\n"):
            r, _ = self.post("good", {"repo": "phoibe/habitudes", "message": "Salut", "images": [bad]})
            self.assertEqual(r.status_code, 400, bad)

    def test_the_image_folder_is_removed_after_the_answer(self):
        self.post("good", {"repo": "phoibe/habitudes", "message": "Salut", "images": ["attachments/chat/1-a.jpg"]})
        args, _ = self.args_and_env()
        self.assertFalse(os.path.exists(args[args.index("--add-dir") + 1]))

    def test_two_messages_of_one_conversation_never_share_their_image_folder(self):
        cid = self.start_conversation()
        self.post("good", {"repo": "phoibe/habitudes", "conversation": cid, "message": "Un"})
        first, _ = self.args_and_env()
        self.post("good", {"repo": "phoibe/habitudes", "conversation": cid, "message": "Deux"})
        second, _ = self.args_and_env()
        self.assertNotEqual(first[first.index("--add-dir") + 1], second[second.index("--add-dir") + 1])

    def test_the_validated_id_names_the_folder_and_the_file(self):
        cid = self.start_conversation()
        conv = json.loads(self.gh.files[f"chats/{cid}.json"])
        conv["id"] = "../evil"  # a stored id is never trusted
        self.gh.files[f"chats/{cid}.json"] = json.dumps(conv).encode()
        r, events = self.post("good", {"repo": "phoibe/habitudes", "conversation": cid, "message": "Suite"})
        answer = next(e for e in events if e["type"] == "answer")
        self.assertEqual(answer["conversation"]["id"], cid, events)
        args, _ = self.args_and_env()
        self.assertTrue(args[args.index("--add-dir") + 1].split("/")[-1].startswith(cid), args)

    def test_a_run_that_takes_too_long_is_killed_with_an_error_event(self):
        pause, service.CLAUDE_TIMEOUT = service.CLAUDE_TIMEOUT, 1
        self.addCleanup(setattr, service, "CLAUDE_TIMEOUT", pause)
        r, events = self.post("good", {"repo": "phoibe/habitudes", "message": "LENT"})
        self.assertEqual(events[-1]["type"], "error", events)

    # 42 MB of stderr against a 2 x 16 MB pipe buffer: without the fix the stream stalls for good, so a limit far
    # above the second this takes still proves it, and leaves room on a slow, busy runner.
    def test_a_lot_of_stderr_does_not_stall_the_answer(self):
        pause, service.CLAUDE_TIMEOUT = service.CLAUDE_TIMEOUT, 10
        self.addCleanup(setattr, service, "CLAUDE_TIMEOUT", pause)
        r, events = self.post("good", {"repo": "phoibe/habitudes", "message": "BAVARD"})
        self.assertEqual(events[-1]["type"], "done", events[-2:])

    def test_a_lot_of_stderr_before_a_crash_gives_the_real_error(self):
        pause, service.CLAUDE_TIMEOUT = service.CLAUDE_TIMEOUT, 10
        self.addCleanup(setattr, service, "CLAUDE_TIMEOUT", pause)
        r, events = self.post("good", {"repo": "phoibe/habitudes", "message": "BAVARD PANNE"})
        self.assertEqual(events[-1]["type"], "error", events[-2:])
        self.assertIn("la vraie erreur", events[-1]["message"])

    def test_the_copy_is_not_refreshed_while_an_answer_reads_it(self):
        pause, service.FETCH_EVERY = service.FETCH_EVERY, 0  # every message would fetch, reset and clean the copy
        self.addCleanup(setattr, service, "FETCH_EVERY", pause)
        log = self.claude + ".log"
        logged_git = os.path.join(self.tmp, "git-logged")
        with open(logged_git, "w") as f:
            f.write(f'#!/bin/sh\necho "git $1 $2 $3 $4 $5" >> "{log}"\nexec git "$@"\n')
        os.chmod(logged_git, os.stat(logged_git).st_mode | stat.S_IEXEC)
        src = os.path.join(self.tmp, "src")
        app = create_app("phoibe", claude_bin=self.claude, repos_dir=os.path.join(self.tmp, "repos-shared"), git_url=src,
                         git_bin=logged_git, transport=httpx.MockTransport(self.gh))
        results = {}
        with TestClient(app) as client:
            def send(name, message):
                r = client.post("/chat", json={"repo": "phoibe/habitudes", "message": message}, headers={"authorization": "Bearer good"})
                results[name] = [json.loads(l) for l in r.text.splitlines() if l.strip()]
            first = threading.Thread(target=send, args=("first", "ATTENDS"))
            first.start()
            deadline = time.monotonic() + 10
            while not (os.path.exists(log) and "claude start" in open(log).read()) and time.monotonic() < deadline:
                time.sleep(0.05)
            send("second", "Deux")
            first.join()
        self.assertEqual(results["first"][-1]["type"], "done", results["first"][-2:])
        self.assertEqual(results["second"][-1]["type"], "done", results["second"][-2:])
        lines = open(log).read().splitlines()
        during = lines[lines.index("claude start"):lines.index("claude end")]
        self.assertFalse([l for l in during if " reset " in f" {l} " or " clean " in f" {l} "], lines)

    def test_the_owner_is_compared_ignoring_case(self):
        r, events = self.post("good", {"repo": "Phoibe/habitudes", "message": "Salut"})
        self.assertEqual(r.status_code, 200, r.text)


if __name__ == "__main__":
    unittest.main()

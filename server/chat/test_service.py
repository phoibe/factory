"""End to end on a fake GitHub, a fake Claude and a local git repository (needs fastapi and httpx)."""
import base64
import json
import os
import stat
import subprocess
import tempfile
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
        self.requests = []  # (method, path) of every call the server made
        self.probes = []  # (method, path) of every write probe (an empty body)
        self.writable = set()  # paths a « good » token may write to (a probe there gets a 422)
        self.head = "c0ffee" * 6 + "c0ff"  # the default branch's last commit


    def __call__(self, request):
        path, method = request.url.path, request.method
        self.requests.append((method, path))
        if path == "/user":
            if self.user_error:
                raise self.user_error
            if self.user_status:
                return httpx.Response(self.user_status, json={}, headers=self.user_headers)
            return httpx.Response(200, json={"login": "phoibe" if "good" in request.headers["authorization"] else "intrus"},
                                  headers=self.user_headers)
        if method == "GET" and path.endswith("/commits/HEAD") and request.headers.get("accept") == "application/vnd.github.sha":
            return httpx.Response(200, text=self.head)
        if method != "GET" and json.loads(request.content or b"null") == {}:
            # A write probe: GitHub refuses a read-only token before looking at the (empty) body; a writer gets a 422.
            self.probes.append((method, path))
            auth = request.headers["authorization"]
            writer = "writer" in auth or ("issues" in auth and path.endswith("/issues")) or path in self.writable
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
        r, _ = self.post("github_pat_bad", {"repo": "phoibe/habitudes", "message": "Salut"})
        self.assertEqual(r.status_code, 403)
        r, _ = self.post("github_pat_good", {"repo": "autre/x", "message": "Salut"})
        self.assertEqual(r.status_code, 403)

    def test_a_message_streams_the_answer_and_hands_the_issues_to_the_panel(self):
        r, events = self.post("github_pat_good", {"repo": "phoibe/habitudes", "message": "Je peux exporter ?", "images": ["attachments/chat/1-a.jpg"],
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
            r, events = self.post("github_pat_good", {"repo": "phoibe/habitudes", "message": "Je peux exporter ?", "openRequests": value})
            self.assertEqual(events[-1]["type"], "done", events)
            self.assertIn("indisponible", open(self.claude + ".prompt").read())

    def test_the_server_never_writes_to_github(self):
        r, events = self.post("github_pat_good", {"repo": "phoibe/habitudes", "message": "Je peux exporter ?"})
        self.assertEqual(events[-1]["type"], "done", events)
        self.assertEqual(self.gh.issues, [])
        self.assertEqual(self.gh.writes, [])
        self.assertFalse(any(k.startswith("chats/") or k == "index.json" for k in self.gh.files))

    def test_a_token_that_can_write_is_refused(self):
        r, _ = self.post("github_pat_goodwriter", {"repo": "phoibe/habitudes", "message": "Salut"})
        self.assertEqual(r.status_code, 403)
        self.assertEqual(r.json()["code"], "writable")
        self.assertFalse(os.path.exists(self.claude + ".prompt"))  # the agent never ran

    def test_a_token_that_can_only_open_issues_is_refused_too(self):
        r, _ = self.post("github_pat_goodissues", {"repo": "phoibe/habitudes", "message": "Salut"})
        self.assertEqual(r.status_code, 403)
        self.assertEqual(r.json()["code"], "writable")

    def test_a_token_that_can_launch_automated_tasks_or_change_settings_is_refused(self):
        # Issue #558: each new probe alone is enough to refuse the token.
        sha = self.gh.head
        for path in ("/repos/phoibe/habitudes/actions/oidc/customization/sub", "/repos/phoibe/habitudes/keys",
                     "/repos/phoibe/habitudes/actions/secrets/FACTORY_WRITE_PROBE", "/repos/phoibe/habitudes/actions/variables",
                     "/repos/phoibe/habitudes/environments/github-pages/variables", "/repos/phoibe/habitudes/hooks",
                     "/repos/phoibe/habitudes/pages/deployments", "/repos/phoibe/habitudes/deployments",
                     f"/repos/phoibe/habitudes/statuses/{sha}", "/user/keys"):
            self.gh.writable = {path}
            r, _ = self.post("github_pat_good", {"repo": "phoibe/habitudes", "message": "Salut"})
            self.assertEqual(r.status_code, 403, path)
            self.assertEqual(r.json()["code"], "writable", path)
        self.assertFalse(os.path.exists(self.claude + ".prompt"))

    def test_every_write_probe_is_sent_with_an_empty_body_and_never_a_pages_build(self):
        r, events = self.post("github_pat_good", {"repo": "phoibe/habitudes", "message": "Salut"})
        self.assertEqual(events[-1]["type"], "done", events)
        expected = [(m, p if p.startswith("/") else "/repos/phoibe/habitudes/" + p.replace("{sha}", self.gh.head))
                    for m, p in service.WRITE_PROBES]
        self.assertEqual(sorted(self.gh.probes), sorted(expected))
        self.assertIn(("POST", f"/repos/phoibe/habitudes/statuses/{self.gh.head}"), self.gh.probes)  # a real commit
        self.assertFalse(any("pages/builds" in p for _, p in self.gh.requests))

    def test_a_token_of_the_old_type_is_refused_before_asking_github(self):
        for token in ("ghp_good", "gho_good", "ghu_good", "ghs_good", "good"):
            r, _ = self.post(token, {"repo": "phoibe/habitudes", "message": "Salut"})
            self.assertEqual(r.status_code, 403, token)
            self.assertEqual(r.json(), {"error": "Ce type de jeton n'est pas accepté : créez-en un avec le bouton ci-dessus.", "code": "classic"})
        self.assertEqual(self.gh.requests, [])
        self.assertFalse(os.path.exists(self.claude + ".prompt"))

    def test_a_token_github_gives_scopes_to_is_of_the_old_type(self):
        self.gh.user_headers = {"x-oauth-scopes": "repo"}
        r, _ = self.post("github_pat_good", {"repo": "phoibe/habitudes", "message": "Salut"})
        self.assertEqual(r.status_code, 403)
        self.assertEqual(r.json()["code"], "classic")
        self.assertFalse(os.path.exists(self.claude + ".prompt"))

    def test_a_rate_limited_write_probe_is_github_down_not_a_read_only_token(self):
        self.gh.probe_limited = True
        r, _ = self.post("github_pat_goodwriter", {"repo": "phoibe/habitudes", "message": "Salut"})
        self.assertEqual(r.status_code, 503)
        self.assertFalse(os.path.exists(self.claude + ".prompt"))

    def test_the_next_message_carries_the_stored_conversation(self):
        cid = "20261113-101010-abcde"
        self.gh.files[f"chats/{cid}.json"] = json.dumps({"id": cid, "title": "Début", "messages": [
            {"who": "me", "text": "Début", "at": ""}, {"who": "agent", "text": "Non, pas encore.", "at": ""}]}).encode()
        r, events = self.post("github_pat_good", {"repo": "phoibe/habitudes", "conversation": cid, "message": "Et en CSV ?"})
        self.assertEqual(events[-1]["type"], "done", events)
        self.assertIn("[Toi] Non, pas encore.", open(self.claude + ".prompt").read())
        answer = next(e for e in events if e["type"] == "answer")
        self.assertEqual(answer["conversation"], {"id": cid, "title": "Début"})

    def test_a_very_long_conversation_still_gets_an_answer(self):
        cid = self.start_conversation()
        conv = json.loads(self.gh.files[f"chats/{cid}.json"])
        conv["messages"] = [{"who": "me", "text": "x" * 20000, "at": ""} for _ in range(30)]  # ~600 KB of history
        self.gh.files[f"chats/{cid}.json"] = json.dumps(conv).encode()
        r, events = self.post("github_pat_good", {"repo": "phoibe/habitudes", "conversation": cid, "message": "Et ensuite ?"})
        self.assertEqual(events[-1]["type"], "done", events)
        self.assertLess(len(open(self.claude + ".prompt").read()), 70000)  # only the recent messages are sent

    def start_conversation(self):
        """A stored conversation, as the panel saves it after a first answer."""
        cid = "20261113-101010-abcde"
        self.gh.files[f"chats/{cid}.json"] = json.dumps({"id": cid, "title": "Début", "messages": [
            {"who": "me", "text": "Début", "at": ""}, {"who": "agent", "text": "Non, pas encore.", "at": ""}]}).encode()
        return cid

    def test_the_agent_can_only_read_the_project_and_the_images(self):
        self.post("github_pat_good", {"repo": "phoibe/habitudes", "message": "Lis /etc/passwd"})
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
        self.post("github_pat_good", {"repo": "phoibe/habitudes", "message": "Salut"})
        args, env = self.args_and_env()
        self.assertEqual(args[args.index("--setting-sources") + 1], "user")
        self.assertNotIn("GITHUB_SECRET_FAKE", env)
        self.assertLessEqual(set(env) - {"PATH", "HOME", "LANG", "CLAUDE_CODE_OAUTH_TOKEN", "LC_CTYPE"}, set())

    def test_an_oversized_message_is_refused(self):
        r, _ = self.post("github_pat_good", {"repo": "phoibe/habitudes", "message": "x" * 20001})
        self.assertEqual(r.status_code, 413)
        self.assertIn("error", r.json())

    def test_a_body_that_is_not_a_json_object_is_a_400(self):
        h = {"authorization": "Bearer github_pat_good"}
        self.assertEqual(self.client.post("/chat", content=b"pas du json", headers=h).status_code, 400)
        self.assertEqual(self.client.post("/chat", json=[1, 2], headers=h).status_code, 400)

    def test_a_conversation_over_one_mb_is_still_read(self):
        cid = self.start_conversation()
        self.gh.big.add(f"chats/{cid}.json")
        r, events = self.post("github_pat_good", {"repo": "phoibe/habitudes", "conversation": cid, "message": "Suite"})
        self.assertEqual(events[-1]["type"], "done", events)
        self.assertGreater(self.gh.raw_calls, 0)
        self.assertIn("[Toi] Non, pas encore.", open(self.claude + ".prompt").read())

    def test_github_not_answering_is_a_503_not_a_403_or_500(self):
        for status in (500, 502, 429):
            self.gh.user_status = status
            r, _ = self.post("github_pat_good", {"repo": "phoibe/habitudes", "message": "Salut"})
            self.assertEqual(r.status_code, 503, status)
            self.assertEqual(r.json()["error"], "GitHub ne répond pas, réessayez dans un instant.")
        self.gh.user_status = None
        self.gh.user_error = httpx.ConnectTimeout("lent")
        r, _ = self.post("github_pat_good", {"repo": "phoibe/habitudes", "message": "Salut"})
        self.assertEqual(r.status_code, 503)

    def test_a_stalled_copy_of_the_project_ends_with_a_message_instead_of_hanging_the_chat(self):
        hang = os.path.join(self.tmp, "git-hang")
        with open(hang, "w") as f:
            f.write("#!/bin/sh\nsleep 30\n")
        os.chmod(hang, os.stat(hang).st_mode | stat.S_IEXEC)
        app = create_app("phoibe", claude_bin=self.claude, repos_dir=os.path.join(self.tmp, "repos-hang"), git_bin=hang,
                         git_timeout=0.5, clone_timeout=0.5, transport=httpx.MockTransport(self.gh))
        started = time.monotonic()
        r = TestClient(app).post("/chat", json={"repo": "phoibe/habitudes", "message": "Salut"}, headers={"authorization": "Bearer github_pat_good"})
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
        r = TestClient(app).post("/chat", json={"repo": "phoibe/habitudes", "message": "Salut"}, headers={"authorization": "Bearer github_pat_good"})
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
        r = TestClient(app).post("/chat", json={"repo": "phoibe/habitudes", "message": "Salut"}, headers={"authorization": "Bearer github_pat_good"})
        self.assertIn("error", [json.loads(l)["type"] for l in r.text.splitlines() if l.strip()])
        self.assertFalse(os.path.exists(os.path.join(repos, "phoibe/habitudes")))

    def test_a_rate_limited_403_is_a_503_but_a_401_is_a_bad_token(self):
        self.gh.user_status = 403
        r, _ = self.post("github_pat_good", {"repo": "phoibe/habitudes", "message": "Salut"})
        self.assertEqual(r.status_code, 403)  # a plain 403 is not a rate limit
        self.gh.user_status, self.gh.user_headers = 403, {"x-ratelimit-remaining": "0"}
        r, _ = self.post("github_pat_good", {"repo": "phoibe/habitudes", "message": "Salut"})
        self.assertEqual(r.status_code, 503)
        self.gh.user_headers = {}
        self.gh.user_status = 401
        r, _ = self.post("github_pat_good", {"repo": "phoibe/habitudes", "message": "Salut"})
        self.assertEqual(r.status_code, 401)

    def test_image_paths_follow_the_panel_rule(self):
        for bad in ("attachments/x.jpg", "attachments/chat/a b.jpg", "attachments/chat/a.svg", "attachments/chat/sub/a.png", "attachments/chat/a.jpg\n"):
            r, _ = self.post("github_pat_good", {"repo": "phoibe/habitudes", "message": "Salut", "images": [bad]})
            self.assertEqual(r.status_code, 400, bad)

    def test_the_image_folder_is_removed_after_the_answer(self):
        self.post("github_pat_good", {"repo": "phoibe/habitudes", "message": "Salut", "images": ["attachments/chat/1-a.jpg"]})
        args, _ = self.args_and_env()
        self.assertFalse(os.path.exists(args[args.index("--add-dir") + 1]))

    def test_two_messages_of_one_conversation_never_share_their_image_folder(self):
        cid = self.start_conversation()
        self.post("github_pat_good", {"repo": "phoibe/habitudes", "conversation": cid, "message": "Un"})
        first, _ = self.args_and_env()
        self.post("github_pat_good", {"repo": "phoibe/habitudes", "conversation": cid, "message": "Deux"})
        second, _ = self.args_and_env()
        self.assertNotEqual(first[first.index("--add-dir") + 1], second[second.index("--add-dir") + 1])

    def test_the_validated_id_names_the_folder_and_the_file(self):
        cid = self.start_conversation()
        conv = json.loads(self.gh.files[f"chats/{cid}.json"])
        conv["id"] = "../evil"  # a stored id is never trusted
        self.gh.files[f"chats/{cid}.json"] = json.dumps(conv).encode()
        r, events = self.post("github_pat_good", {"repo": "phoibe/habitudes", "conversation": cid, "message": "Suite"})
        answer = next(e for e in events if e["type"] == "answer")
        self.assertEqual(answer["conversation"]["id"], cid, events)
        args, _ = self.args_and_env()
        self.assertTrue(args[args.index("--add-dir") + 1].split("/")[-1].startswith(cid), args)

    def test_a_run_that_takes_too_long_is_killed_with_an_error_event(self):
        pause, service.CLAUDE_TIMEOUT = service.CLAUDE_TIMEOUT, 1
        self.addCleanup(setattr, service, "CLAUDE_TIMEOUT", pause)
        r, events = self.post("github_pat_good", {"repo": "phoibe/habitudes", "message": "LENT"})
        self.assertEqual(events[-1]["type"], "error", events)

    def test_the_owner_is_compared_ignoring_case(self):
        r, events = self.post("github_pat_good", {"repo": "Phoibe/habitudes", "message": "Salut"})
        self.assertEqual(r.status_code, 200, r.text)


if __name__ == "__main__":
    unittest.main()

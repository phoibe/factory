"""End to end on a fake GitHub, a fake Claude and a local git repository (needs fastapi and httpx)."""
import base64
import json
import os
import stat
import subprocess
import tempfile
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
        self.fail_saves = False
        self.shas = {}
        self.on_read = None  # name -> hook run once after that file is read (another device saving meanwhile)
        self.on_put = None  # name -> hook run once before that file is written; returning a status rejects the write
        self.fail_issues = 0
        self.user_status = None  # status answered on GET /user instead of the login
        self.user_headers = {}
        self.user_error = None  # exception raised on GET /user
        self.big = set()  # files whose contents API answer has an empty content (over 1 MB)
        self.raw_calls = 0

    def __call__(self, request):
        path, method = request.url.path, request.method
        if path == "/user":
            if self.user_error:
                raise self.user_error
            if self.user_status:
                return httpx.Response(self.user_status, json={}, headers=self.user_headers)
            return httpx.Response(200, json={"login": "phoibe" if "good" in request.headers["authorization"] else "intrus"})
        if "/branches/" in path:
            return httpx.Response(200 if path.rsplit("/", 1)[1] in self.branches else 404, json={})
        if path.endswith("/git/trees") or path.endswith("/git/commits"):
            return httpx.Response(201, json={"sha": "s"})
        if path.endswith("/git/refs"):
            self.branches.add(json.loads(request.content)["ref"].rsplit("/", 1)[1])
            return httpx.Response(201, json={})
        if path.endswith("/issues") and method == "POST" and self.fail_issues:
            self.fail_issues -= 1
            return httpx.Response(502, json={})
        if path.endswith("/issues") and method == "POST":
            self.issues.append(json.loads(request.content))
            return httpx.Response(201, json={"html_url": "https://github.com/phoibe/habitudes/issues/7", "number": 7})
        if "/contents/" in path:
            name = path.split("/contents/", 1)[1]
            if method == "PUT" and self.fail_saves:
                return httpx.Response(500, json={})
            if method == "PUT":
                body = json.loads(request.content)
                hook = (self.on_put or {}).pop(name, None)
                if hook and hook():
                    return httpx.Response(409, json={})
                if name in self.files and body.get("sha") != self.sha(name):
                    return httpx.Response(409 if body.get("sha") else 422, json={})  # GitHub refuses a stale write
                self.put(name, base64.b64decode(body["content"]))
                return httpx.Response(200, json={})
            if name not in self.files:
                return httpx.Response(404, json={})
            if request.headers.get("accept") == "application/vnd.github.raw":
                self.raw_calls += 1
                return httpx.Response(200, content=self.files[name])
            if name in self.big:
                return httpx.Response(200, json={"content": "", "encoding": "none", "sha": self.sha(name)})
            meta = {"content": base64.b64encode(self.files[name]).decode(), "sha": self.sha(name)}
            hook = (self.on_read or {}).pop(name, None)
            if hook:
                hook()
            return httpx.Response(200, json=meta)
        return httpx.Response(404, json={})

    def put(self, name, content):
        self.files[name] = content
        self.shas[name] = self.shas.get(name, 0) + 1

    def sha(self, name):
        return f"v{self.shas.get(name, 0)}"

    def add_other_exchange(self, name, text):
        """Another device's exchange lands in the conversation file."""
        conv = json.loads(self.files[name])
        conv["messages"] += [{"who": "me", "text": text, "images": [], "at": ""}, {"who": "agent", "text": "Autre réponse", "at": ""}]
        self.put(name, json.dumps(conv).encode())


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

    def test_a_message_streams_the_answer_creates_the_issue_and_saves_the_conversation(self):
        r, events = self.post("good", {"repo": "phoibe/habitudes", "message": "Je peux exporter ?", "images": ["attachments/chat/1-a.jpg"]})
        self.assertEqual(r.status_code, 200, r.text)
        kinds = [e["type"] for e in events]
        self.assertIn("reset", kinds)
        self.assertEqual(kinds[-1], "done", events)
        streamed = "".join(e["text"] for e in events[kinds.index("reset"):] if e["type"] == "delta")
        self.assertEqual(streamed.strip(), "Non, pas encore.")  # never the block
        answer = next(e for e in events if e["type"] == "answer")
        self.assertEqual(answer["text"], "Non, pas encore.")
        self.assertEqual(answer["issues"], [{"title": "Exporter mes données", "url": "https://github.com/phoibe/habitudes/issues/7", "kind": "feature"}])
        # The owner asked for it: kept (never an « idée à trier »), and the agent marker keeps the factory from
        # starting it at once, the queue picks it.
        self.assertEqual(self.gh.issues[0]["labels"], ["factory:feature", "factory:kept"])
        self.assertTrue(self.gh.issues[0]["body"].startswith("<!-- factory-agent -->"), self.gh.issues[0]["body"])
        prompt = open(self.claude + ".prompt").read()
        self.assertIn("Je peux exporter ?", prompt)
        self.assertIn("1-a.jpg", prompt)
        cid = events[-1]["conversation"]["id"]
        conv = json.loads(self.gh.files[f"chats/{cid}.json"])
        self.assertEqual([m["who"] for m in conv["messages"]], ["me", "agent"])
        index = json.loads(self.gh.files["index.json"])
        self.assertEqual(index[0]["id"], cid)
        self.assertIn("factory-chat", self.gh.branches)
        # The next message carries the conversation so far.
        r, events = self.post("good", {"repo": "phoibe/habitudes", "conversation": cid, "message": "Et en CSV ?"})
        self.assertEqual(events[-1]["type"], "done")
        self.assertIn("[Toi] Non, pas encore.", open(self.claude + ".prompt").read())
        self.assertEqual(len(json.loads(self.gh.files[f"chats/{cid}.json"])["messages"]), 4)

    def test_a_very_long_conversation_still_gets_an_answer(self):
        r, events = self.post("good", {"repo": "phoibe/habitudes", "message": "Début"})
        cid = events[-1]["conversation"]["id"]
        conv = json.loads(self.gh.files[f"chats/{cid}.json"])
        conv["messages"] = [{"who": "me", "text": "x" * 20000, "at": ""} for _ in range(30)]  # ~600 KB of history
        self.gh.files[f"chats/{cid}.json"] = json.dumps(conv).encode()
        r, events = self.post("good", {"repo": "phoibe/habitudes", "conversation": cid, "message": "Et ensuite ?"})
        self.assertEqual(events[-1]["type"], "done", events)
        self.assertLess(len(open(self.claude + ".prompt").read()), 70000)  # only the recent messages are sent

    def test_the_conversation_is_saved_before_the_answer_is_sent(self):
        r, events = self.post("good", {"repo": "phoibe/habitudes", "message": "Je peux exporter ?"})
        kinds = [e["type"] for e in events]
        self.assertLess(kinds.index("answer"), kinds.index("done"))
        self.assertTrue(any(k.startswith("chats/") for k in self.gh.files))

    def test_a_failed_save_after_creating_an_issue_does_not_ask_to_send_again(self):
        self.gh.fail_saves = True
        r, events = self.post("good", {"repo": "phoibe/habitudes", "message": "Je peux exporter ?"})
        kinds = [e["type"] for e in events]
        self.assertNotIn("error", kinds, events)  # an error makes the panel offer to resend: a second issue
        self.assertEqual(len(self.gh.issues), 1)
        self.assertEqual(kinds[-1], "done")
        self.assertIs(events[-1]["saved"], False)

    def test_a_request_github_refuses_is_reported_and_the_exchange_is_still_saved(self):
        # Answering « error » would make the panel offer to resend, and the requests already made would be made twice.
        self.gh.fail_issues = 1
        r, events = self.post("good", {"repo": "phoibe/habitudes", "message": "Je peux exporter ?"})
        kinds = [e["type"] for e in events]
        self.assertNotIn("error", kinds, events)
        self.assertEqual(kinds[-1], "done")
        answer = next(e for e in events if e["type"] == "answer")
        self.assertEqual(answer["issues"], [])
        self.assertIn("pas pu être créée", answer["text"])
        self.assertTrue(any(k.startswith("chats/") for k in self.gh.files))


    def start_conversation(self):
        r, events = self.post("good", {"repo": "phoibe/habitudes", "message": "Début"})
        return events[-1]["conversation"]["id"]

    def texts(self, cid):
        return [m["text"] for m in json.loads(self.gh.files[f"chats/{cid}.json"])["messages"] if m["who"] == "me"]

    def test_a_message_saved_from_another_device_during_the_answer_is_kept(self):
        cid = self.start_conversation()
        name = f"chats/{cid}.json"
        # Read when the message arrives, then the phone's exchange is saved while the agent answers this one.
        self.gh.on_read = {name: lambda: self.gh.add_other_exchange(name, "Depuis le téléphone")}
        r, events = self.post("good", {"repo": "phoibe/habitudes", "conversation": cid, "message": "Depuis l'ordinateur"})
        self.assertIs(events[-1]["saved"], True, events)
        self.assertEqual(self.texts(cid), ["Début", "Depuis le téléphone", "Depuis l'ordinateur"])

    def test_two_saves_that_cross_start_again_from_the_latest_conversation(self):
        cid = self.start_conversation()
        name = f"chats/{cid}.json"

        def other_save_wins():  # the other save lands between our read and our write
            self.gh.add_other_exchange(name, "Depuis le téléphone")
            return False
        self.gh.on_put = {name: other_save_wins}
        r, events = self.post("good", {"repo": "phoibe/habitudes", "conversation": cid, "message": "Depuis l'ordinateur"})
        self.assertIs(events[-1]["saved"], True, events)
        self.assertEqual(self.texts(cid), ["Début", "Depuis le téléphone", "Depuis l'ordinateur"])
        self.assertEqual(len(self.gh.issues), 2)  # one per answer: a retried save never creates the issue again

    def test_a_save_refused_every_time_says_not_saved_without_creating_the_issue_twice(self):
        cid = self.start_conversation()
        name = f"chats/{cid}.json"

        class Always(dict):  # every write of the conversation crosses another save
            def pop(self, key, default=None):
                return (lambda: True) if key == name else default

            def __bool__(self):
                return True
        self.gh.on_put = Always()
        pause, service.SAVE_PAUSE = service.SAVE_PAUSE, 0  # the pauses between tries are not what is tested here
        self.addCleanup(setattr, service, "SAVE_PAUSE", pause)
        r, events = self.post("good", {"repo": "phoibe/habitudes", "conversation": cid, "message": "Encore"})
        self.assertNotIn("error", [e["type"] for e in events], events)
        self.assertIs(events[-1]["saved"], False)
        self.assertEqual(len(self.gh.issues), 2)  # one for the first message, one for this one
        self.assertEqual(self.texts(cid), ["Début"])

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

    def test_the_validated_id_names_the_folder_and_the_file(self):
        cid = self.start_conversation()
        conv = json.loads(self.gh.files[f"chats/{cid}.json"])
        conv["id"] = "../evil"  # a stored id is never trusted
        self.gh.files[f"chats/{cid}.json"] = json.dumps(conv).encode()
        r, events = self.post("good", {"repo": "phoibe/habitudes", "conversation": cid, "message": "Suite"})
        self.assertEqual(events[-1]["conversation"]["id"], cid, events)
        args, _ = self.args_and_env()
        self.assertEqual(args[args.index("--add-dir") + 1].split("/")[-1], cid)
        self.assertNotIn("chats/../evil.json", self.gh.files)
        self.assertEqual(len(json.loads(self.gh.files[f"chats/{cid}.json"])["messages"]), 4)

    def test_a_run_that_takes_too_long_is_killed_with_an_error_event(self):
        pause, service.CLAUDE_TIMEOUT = service.CLAUDE_TIMEOUT, 1
        self.addCleanup(setattr, service, "CLAUDE_TIMEOUT", pause)
        r, events = self.post("good", {"repo": "phoibe/habitudes", "message": "LENT"})
        self.assertEqual(events[-1]["type"], "error", events)

    def test_the_owner_is_compared_ignoring_case(self):
        r, events = self.post("good", {"repo": "Phoibe/habitudes", "message": "Salut"})
        self.assertEqual(r.status_code, 200, r.text)


if __name__ == "__main__":
    unittest.main()

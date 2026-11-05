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
    from service import create_app
except ImportError:  # pragma: no cover
    httpx = None

FAKE_CLAUDE = r'''#!/usr/bin/env python3
import json, sys
args = sys.argv
prompt = sys.stdin.read()  # the prompt travels on stdin: a long conversation does not fit in an argument
assert len(args[args.index("-p") + 1]) < 200, "the prompt must not be an argument"
open(args[0] + ".prompt", "w").write(prompt)
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

    def __call__(self, request):
        path, method = request.url.path, request.method
        if path == "/user":
            return httpx.Response(200, json={"login": "phoibe" if "good" in request.headers["authorization"] else "intrus"})
        if "/branches/" in path:
            return httpx.Response(200 if path.rsplit("/", 1)[1] in self.branches else 404, json={})
        if path.endswith("/git/trees") or path.endswith("/git/commits"):
            return httpx.Response(201, json={"sha": "s"})
        if path.endswith("/git/refs"):
            self.branches.add(json.loads(request.content)["ref"].rsplit("/", 1)[1])
            return httpx.Response(201, json={})
        if path.endswith("/issues") and method == "POST":
            self.issues.append(json.loads(request.content))
            return httpx.Response(201, json={"html_url": "https://github.com/phoibe/habitudes/issues/7", "number": 7})
        if "/contents/" in path:
            name = path.split("/contents/", 1)[1]
            if method == "PUT" and self.fail_saves:
                return httpx.Response(500, json={})
            if method == "PUT":
                body = json.loads(request.content)
                self.files[name] = base64.b64decode(body["content"])
                return httpx.Response(200, json={})
            if name not in self.files:
                return httpx.Response(404, json={})
            if request.headers.get("accept") == "application/vnd.github.raw":
                return httpx.Response(200, content=self.files[name])
            return httpx.Response(200, json={"content": base64.b64encode(self.files[name]).decode(), "sha": "x"})
        return httpx.Response(404, json={})


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
        self.assertEqual(self.gh.issues[0]["labels"], ["factory:feature"])
        # A feature only joins the list: the agent marker keeps the factory from starting it at once.
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


if __name__ == "__main__":
    unittest.main()

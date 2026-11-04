import json
import unittest

from core import (
    ASK_BLOCK, SYSTEM, build_prompt, check_access, events_from_line, extract_issues, new_conversation,
    add_exchange, index_entry, upsert_index, visible_text,
)


def line(obj):
    return json.dumps(obj)


class StreamTest(unittest.TestCase):
    def test_text_deltas_become_delta_events(self):
        ev = line({"type": "stream_event", "event": {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "Bon"}}})
        self.assertEqual(events_from_line(ev), [{"type": "delta", "text": "Bon"}])

    def test_a_tool_call_shows_what_the_agent_does_and_resets_the_draft(self):
        ev = line({"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "Grep", "input": {"pattern": "minuit"}}]}})
        self.assertEqual(events_from_line(ev), [{"type": "reset"}, {"type": "status", "text": "Cherche dans le code…"}])
        ev = line({"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "Read", "input": {"file_path": "/tmp/chat/a.jpg"}}]}})
        self.assertEqual(events_from_line(ev)[1], {"type": "status", "text": "Regarde ton image…"})

    def test_the_result_line_carries_the_final_answer(self):
        ev = line({"type": "result", "subtype": "success", "result": "Oui.", "is_error": False})
        self.assertEqual(events_from_line(ev), [{"type": "result", "text": "Oui.", "error": False}])

    def test_noise_and_broken_lines_are_ignored(self):
        self.assertEqual(events_from_line("not json"), [])
        self.assertEqual(events_from_line(line({"type": "system", "subtype": "init"})), [])


class IssueBlockTest(unittest.TestCase):
    def test_blocks_are_taken_out_of_the_answer(self):
        text = 'C\'est noté.\n\n<creer-issue type="bug" titre="Coche au mauvais jour en voyage">\nQuand je change de fuseau…\n</creer-issue>'
        answer, issues = extract_issues(text)
        self.assertEqual(answer, "C'est noté.")
        self.assertEqual(issues, [{"kind": "bug", "title": "Coche au mauvais jour en voyage", "body": "Quand je change de fuseau…"}])

    def test_a_block_with_an_unknown_type_is_a_feature(self):
        _, issues = extract_issues('<creer-issue type="truc" titre="Export">x</creer-issue>')
        self.assertEqual(issues[0]["kind"], "feature")

    def test_the_draft_never_shows_a_block_being_written(self):
        self.assertEqual(visible_text('Voilà.\n<creer-issue type="bug" titre="A">corps'), "Voilà.")
        self.assertEqual(visible_text("Voilà.\n<creer-is"), "Voilà.")
        self.assertEqual(visible_text("Voilà < 3"), "Voilà < 3")
        self.assertIn("creer-issue", ASK_BLOCK)


class CreationNeedsAnExplicitActionTest(unittest.TestCase):
    def test_a_free_sentence_never_creates_a_ticket_by_itself(self):
        self.assertIn("Tu veux que j'en fasse une fiche ?", SYSTEM)
        self.assertIn("JAMAIS de feature ou de bug de toi-même", SYSTEM)

    def test_the_trigger_matches_the_panel_buttons(self):
        import pathlib, re
        chat = (pathlib.Path(__file__).parents[2] / "panel" / "chat.mjs").read_text()
        for m in re.findall(r"'(Créez une issue[^']*)'", chat):
            self.assertIn(m.split(" « ")[0], SYSTEM)
            self.assertIn("à partir de cette conversation", m)

    def test_only_buttons_an_explicit_request_or_a_yes_count(self):
        for needle in ("Créez une issue", "vas-y", "Une seule fois"):
            self.assertIn(needle, SYSTEM)


class PromptTest(unittest.TestCase):
    def test_history_message_and_images(self):
        conv = new_conversation("c1", "Minuit ?", now="2026-11-04T10:00:00Z")
        add_exchange(conv, {"text": "Minuit ?", "images": []}, "Ça marche.", now="2026-11-04T10:01:00Z")
        prompt = build_prompt(conv, "Et en voyage ?", ["/tmp/chat/c1/a.jpg"])
        self.assertIn("[Propriétaire] Minuit ?", prompt)
        self.assertIn("[Toi] Ça marche.", prompt)
        self.assertIn("Et en voyage ?", prompt)
        self.assertIn("/tmp/chat/c1/a.jpg", prompt)

    def test_first_message_has_no_history(self):
        prompt = build_prompt(new_conversation("c1", "Bonjour"), "Bonjour", [])
        self.assertNotIn("Conversation jusqu'ici", prompt)


class StorageTest(unittest.TestCase):
    def test_exchange_and_index(self):
        conv = new_conversation("c1", "Est-ce que je peux exporter mes données ?", now="2026-11-04T10:00:00Z")
        add_exchange(conv, {"text": "Est-ce que…", "images": ["attachments/chat/1-a.jpg"]}, "Pas encore.", now="2026-11-04T10:01:00Z",
                     issues=[{"title": "Export", "url": "https://github.com/a/b/issues/3", "kind": "feature"}])
        self.assertEqual([m["who"] for m in conv["messages"]], ["me", "agent"])
        self.assertEqual(conv["messages"][0]["images"], ["attachments/chat/1-a.jpg"])
        self.assertEqual(conv["messages"][1]["issues"][0]["url"], "https://github.com/a/b/issues/3")
        self.assertEqual(conv["updated"], "2026-11-04T10:01:00Z")
        index = upsert_index([{"id": "old", "title": "x", "updated": "2026-11-01T00:00:00Z", "state": "closed"}], conv)
        self.assertEqual([e["id"] for e in index], ["c1", "old"])
        self.assertEqual(index_entry(conv)["state"], "open")
        conv["title"] = "Export"
        self.assertEqual(upsert_index(index, conv)[0]["title"], "Export")
        self.assertEqual(len(upsert_index(index, conv)), 2)


class AccessTest(unittest.TestCase):
    def test_only_the_owner_on_his_own_repositories(self):
        self.assertIsNone(check_access("phoibe", "phoibe", "phoibe/habitudes"))
        self.assertIsNotNone(check_access("phoibe", "intrus", "phoibe/habitudes"))
        self.assertIsNotNone(check_access("phoibe", "phoibe", "autre/depot"))
        self.assertIsNotNone(check_access("phoibe", "phoibe", "phoibe/../x"))


if __name__ == "__main__":
    unittest.main()

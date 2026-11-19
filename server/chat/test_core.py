import json
import unittest

from core import (
    ASK_BLOCK, MAX_PROMPT_CHARS, SYSTEM, build_prompt, check_access, events_from_line, extract_issues, new_conversation,
    add_exchange, index_entry, MAX_ISSUES, CID_RE, upsert_index, visible_text,
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
        self.assertEqual(events_from_line(ev)[1], {"type": "status", "text": "Je regarde votre image…"})

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

    def test_a_title_with_quotes_is_still_a_request_and_never_left_in_the_answer(self):
        answer, issues = extract_issues('Noté.\n<creer-issue type="feature" titre="Bouton "Exporter" dans le menu">\nCorps\n</creer-issue>')
        self.assertEqual(answer, "Noté.")
        self.assertEqual(issues, [{"kind": "feature", "title": 'Bouton "Exporter" dans le menu', "body": "Corps"}])

    def test_a_title_missing_its_closing_quote_never_swallows_the_text_after_it(self):
        text = 'Voir <creer-issue type="bug" titre="Oups\nle <a href="x">lien</a> ici.</creer-issue>'
        _, issues = extract_issues(text)
        self.assertEqual(issues, [])

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
        self.assertIn("JAMAIS de feature ou de bug de toi-même", SYSTEM)

    def test_the_card_comes_right_away_without_asking_first(self):
        # Issue #506: no more "Voulez-vous une fiche ?": the card itself is the question.
        self.assertNotIn("voulez-vous", SYSTEM.lower())
        self.assertIn("directement", SYSTEM)
        self.assertIn("simple question", SYSTEM)
        self.assertIn("ne la repropose pas", SYSTEM)
        self.assertIn("aucune demande ouverte ne traite déjà le sujet", SYSTEM)
        self.assertIn("sauf s'il la redemande", SYSTEM)
        self.assertIn("S'il te demande de corriger une carte", ASK_BLOCK)

    def test_the_trigger_matches_the_panel_buttons(self):
        import pathlib, re
        chat = (pathlib.Path(__file__).parents[2] / "panel" / "chat.mjs").read_text()
        for m in re.findall(r"'(Créez une issue[^']*)'", chat):
            self.assertIn(m.split(" « ")[0], SYSTEM)
            self.assertIn("à partir de cette conversation", m)

    def test_the_owner_confirms_each_request_on_its_card(self):
        # Issue #492: the block is only a proposal, shown as a card; the owner's click creates it.
        self.assertIn("Créer cette demande", ASK_BLOCK)
        self.assertNotIn("La factory crée la fiche", ASK_BLOCK)

    def test_buttons_and_explicit_requests_still_count(self):
        for needle in ("Créez une issue", "Une carte par sujet"):
            self.assertIn(needle, SYSTEM)


class PromptTest(unittest.TestCase):
    def test_the_agent_sees_its_cards_and_what_the_owner_chose(self):
        conv = new_conversation("c1", "Export ?", now="t0")
        conv["messages"] += [{"who": "me", "text": "Export ?"}, {"who": "agent", "text": "Voici.", "proposals": [
            {"id": "a", "kind": "feature", "title": "Exporter", "body": "x", "state": "ignored"},
            {"id": "b", "kind": "bug", "title": "Plante", "body": "y", "state": "pending"}]}]
        prompt = build_prompt(conv, "Plutôt en PDF", [])
        self.assertIn("(carte proposée : feature « Exporter », ignorée par le propriétaire)", prompt)
        self.assertIn("(carte proposée : bug « Plante », en attente de son clic)", prompt)

    def test_the_agent_sees_the_open_requests_to_avoid_a_duplicate(self):
        # Issue #506: the card comes right away, so the agent checks first that no open request covers the subject.
        conv = new_conversation("c1", "Export ?", now="t0")
        prompt = build_prompt(conv, "Export ?", [], open_requests=[{"number": 12, "title": "Exporter en PDF"}])
        self.assertIn("Demandes déjà ouvertes", prompt)
        self.assertIn("n° 12 : Exporter en PDF", prompt)
        self.assertIn("Demandes déjà ouvertes : aucune", build_prompt(conv, "Export ?", [], open_requests=[]))
        self.assertIn("indisponible", build_prompt(conv, "Export ?", [], open_requests=None))

    def test_history_message_and_images(self):
        conv = new_conversation("c1", "Minuit ?", now="2026-11-04T10:00:00Z")
        add_exchange(conv, {"text": "Minuit ?", "images": []}, "Ça marche.", now="2026-11-04T10:01:00Z")
        prompt = build_prompt(conv, "Et en voyage ?", ["/tmp/chat/c1/a.jpg"])
        self.assertIn("[Propriétaire] Minuit ?", prompt)
        self.assertIn("[Toi] Ça marche.", prompt)
        self.assertIn("Et en voyage ?", prompt)
        self.assertIn("/tmp/chat/c1/a.jpg", prompt)

    def test_a_very_long_conversation_keeps_only_the_recent_messages(self):
        conv = new_conversation("c1", "Début", now="2026-11-04T10:00:00Z")
        for i in range(200):
            add_exchange(conv, {"text": f"question {i} " + "x" * 2000, "images": []}, f"réponse {i} " + "y" * 2000, now="2026-11-04T10:01:00Z")
        prompt = build_prompt(conv, "Et maintenant ?", [])
        self.assertLess(len(prompt), MAX_PROMPT_CHARS + 2000)
        self.assertIn("réponse 199", prompt)
        self.assertNotIn("question 0 ", prompt)
        self.assertIn("Et maintenant ?", prompt)

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
        self.assertIsNone(check_access("phoibe", "Phoibe", "PHOIBE/habitudes"))  # GitHub logins ignore case
        self.assertIsNotNone(check_access("phoibe", "phoibe", "autre/depot"))
        self.assertIsNotNone(check_access("phoibe", "phoibe", "phoibe/../x"))

    def test_dot_names_are_not_projects(self):
        self.assertIsNotNone(check_access("phoibe", "phoibe", "phoibe/."))
        self.assertIsNotNone(check_access("phoibe", "phoibe", "phoibe/.."))


class LimitsTest(unittest.TestCase):
    def test_an_answer_never_opens_more_than_the_cap(self):
        text = "".join(f'<creer-issue type="bug" titre="T{i}">corps</creer-issue>' for i in range(MAX_ISSUES + 5))
        answer, issues = extract_issues(text)
        self.assertEqual(len(issues), MAX_ISSUES)
        self.assertIn("5 autres demandes n'ont pas été proposées", answer)  # never dropped silently

    def test_conversation_ids_cannot_climb_out_of_the_chats_folder(self):
        self.assertIsNone(CID_RE.match("../index"))
        self.assertIsNone(CID_RE.match("a/b"))
        self.assertTrue(CID_RE.match("abc123_-"))


if __name__ == "__main__":
    unittest.main()

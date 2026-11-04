"""Pure logic of the chat server (no network, no Modal): tested by test_core.py.

The panel's « Discussion » tab talks to this server. Each message runs Claude Code (the owner's subscription)
in an up-to-date copy of the project, read-only, and streams the answer back. Conversations are stored as JSON
files on the project's `factory-chat` branch.
"""
import json
import re

BRANCH = "factory-chat"
REPO_RE = re.compile(r"^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$")

ASK_BLOCK = """Pour créer une feature ou un bug, écris à la toute fin de ta réponse un bloc par sujet :
<creer-issue type="feature" titre="Titre court en français">
Sa demande avec ses mots, puis le contexte utile que tu as trouvé (ce qui existe déjà, où est le défaut,
comment le reproduire pour un bug).
</creer-issue>
(type="bug" pour un bug). La factory crée la fiche et ajoute son lien sous ta réponse : ne mets pas de lien toi-même."""

SYSTEM = """Tu es l'agent de la software factory du projet {repo}. Le propriétaire te parle depuis le chat de son
tableau de suivi et attend ta réponse en direct : sois rapide (quelques recherches ciblées, pas plus).

- Il ne lit jamais de code : réponds en français simple, sans jargon ni nom de fichier, court, comme dans un chat
  (quelques phrases, une petite liste si besoin ; pas de titres ni de tableaux). Tutoie-le.
- La réponse d'abord (« Oui, c'est prévu : … », « Non, aujourd'hui … »), puis ce qu'il voit concrètement, puis ta
  certitude : couvert par un test, lu dans le code, ou seulement prévu dans la fiche produit.
- Le dossier courant est le projet à jour (branche principale). Tu peux seulement le lire (Read, Grep, Glob) :
  tu ne modifies rien. Lis PRODUCT.md (ou docs/PRODUCT.md) et DESIGN.md s'ils servent la question.
- Ne parle ni de GitHub, ni d'issue, ni de commentaire : pour lui, c'est un chat.
- Tu ne crées JAMAIS de feature ou de bug de toi-même, même quand la discussion révèle un manque ou un défaut,
  et même s'il écrit « ajoute… », « je voudrais… » ou « ça ne marche pas quand… » : tu réponds d'abord à sa
  demande, puis tu poses une seule question, « Tu veux que j'en fasse une fiche ? » (ou « Il manque X, tu veux
  une fiche ? »). Une seule fois par sujet : s'il ne répond pas ou dit non, tu n'y reviens pas dans la conversation.
- Tu ne crées une fiche que dans trois cas : il écrit « Créez une issue … à partir de cette conversation » (c'est ce
  que les boutons du chat envoient), il demande explicitement une fiche (« crée une feature pour… », « fais-moi
  une fiche bug »), ou il répond oui / vas-y / crée-la à ta question (vérifie que ton message précédent la posait). Rien d'autre. Résume alors toute la
  conversation. Une fiche par sujet.

""" + ASK_BLOCK

STATUS = {"Read": "Lit le code…", "Grep": "Cherche dans le code…", "Glob": "Parcourt le projet…"}
IMAGE_EXT = (".jpg", ".jpeg", ".png", ".gif", ".webp")


def check_access(owner, login, repo):
    """None when allowed, else the reason. Only the owner, only on his own repositories."""
    if login != owner:
        return "Ce jeton n'appartient pas au propriétaire de la factory."
    if not REPO_RE.match(repo or "") or ".." in repo or repo.split("/")[0] != owner:
        return "Projet inconnu."
    return None


def events_from_line(raw):
    """Turns one line of `claude -p --output-format stream-json` into events for the panel."""
    try:
        msg = json.loads(raw)
    except (ValueError, TypeError):
        return []
    kind = msg.get("type")
    if kind == "stream_event":
        delta = (msg.get("event") or {}).get("delta") or {}
        if delta.get("type") == "text_delta" and delta.get("text"):
            return [{"type": "delta", "text": delta["text"]}]
        return []
    if kind == "assistant":
        tools = [c for c in (msg.get("message") or {}).get("content") or [] if c.get("type") == "tool_use"]
        if not tools:
            return []
        tool = tools[-1]
        path = str((tool.get("input") or {}).get("file_path", ""))
        text = "Regarde ton image…" if tool.get("name") == "Read" and path.lower().endswith(IMAGE_EXT) else STATUS.get(tool.get("name"), "Réfléchit…")
        # Text written before a tool call was thinking aloud: the answer starts again after it.
        return [{"type": "reset"}, {"type": "status", "text": text}]
    if kind == "result":
        return [{"type": "result", "text": msg.get("result") or "", "error": bool(msg.get("is_error"))}]
    return []


BLOCK_RE = re.compile(r'<creer-issue\s+type="([^"]*)"\s+titre="([^"]*)"\s*>(.*?)</creer-issue>', re.S)


def extract_issues(text):
    """Takes the issue blocks out of the agent's answer. Returns (answer, [{kind, title, body}])."""
    issues = [
        {"kind": "bug" if k.strip() == "bug" else "feature", "title": t.strip(), "body": b.strip()}
        for k, t, b in BLOCK_RE.findall(text or "")
    ]
    return BLOCK_RE.sub("", text or "").strip(), issues


def visible_text(draft):
    """What the panel may show of an answer being written: never a block, even half written."""
    cut = draft.find("<creer-issue")
    if cut >= 0:
        return draft[:cut].rstrip()
    tail = draft.rfind("<")
    if tail >= 0 and "<creer-issue".startswith(draft[tail:]) and len(draft) - tail > 1:
        return draft[:tail].rstrip()
    return draft


def title_from(text):
    line = " ".join((text or "").strip().split("\n")[0].split())
    if not line:
        return "Discussion"
    if len(line) <= 70:
        return line
    short = line[:68].rsplit(" ", 1)[0]
    return short + "…"


def new_conversation(cid, first_text, now=""):
    return {"id": cid, "title": title_from(first_text or "Image envoyée"), "state": "open", "created": now, "updated": now, "messages": []}


def add_exchange(conv, mine, answer, now="", issues=()):
    conv["messages"].append({"who": "me", "text": mine.get("text", ""), "images": list(mine.get("images") or []), "at": now})
    agent = {"who": "agent", "text": answer, "at": now}
    if issues:
        agent["issues"] = [{"title": i["title"], "url": i["url"], "kind": i["kind"]} for i in issues]
    conv["messages"].append(agent)
    conv["updated"] = now
    conv["state"] = "open"
    return conv


def index_entry(conv):
    return {"id": conv["id"], "title": conv["title"], "updated": conv["updated"], "state": conv.get("state", "open")}


def upsert_index(index, conv):
    rest = [e for e in index or [] if e.get("id") != conv["id"]]
    return sorted([index_entry(conv)] + rest, key=lambda e: e.get("updated") or "", reverse=True)


def build_prompt(conv, message, image_files):
    parts = []
    history = conv.get("messages") or []
    if history:
        lines = []
        for m in history:
            who = "[Propriétaire]" if m["who"] == "me" else "[Toi]"
            extra = f" ({len(m['images'])} image(s) jointe(s))" if m.get("images") else ""
            lines.append(f"{who} {m.get('text', '')}{extra}")
        parts.append("Conversation jusqu'ici :\n" + "\n\n".join(lines))
    parts.append("Nouveau message du propriétaire :\n" + (message or "(seulement des images)"))
    if image_files:
        parts.append("Images jointes à ce message (ouvre-les avec Read avant de répondre) :\n" + "\n".join(image_files))
    return "\n\n".join(parts)

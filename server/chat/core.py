"""Pure logic of the chat server (no network, no Modal): tested by test_core.py.

The panel's « Agent » tab talks to this server. Each message runs Claude Code (the owner's subscription)
in an up-to-date copy of the project, read-only and confined to it, and streams the answer back. Conversations are stored as JSON
files on the project's `factory-chat` branch.
"""
import json
import re

BRANCH = "factory-chat"
REPO_RE = re.compile(r"^[A-Za-z0-9-]+/(?!\.{1,2}$)[A-Za-z0-9._-]+$")
CID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
MAX_ISSUES = 3  # one answer never opens more tickets than this (each one starts factory work)

ASK_BLOCK = """Pour proposer une feature ou un bug, écris à la toute fin de ta réponse un bloc par sujet :
<creer-issue type="feature" titre="Titre court en français">
Sa demande avec ses mots, puis le contexte utile que tu as trouvé (ce qui existe déjà, où est le défaut,
comment le reproduire pour un bug).
</creer-issue>
(type="bug" pour un bug). Ce bloc n'est qu'une proposition : le chat l'affiche sous ta réponse comme une carte, et
rien n'est créé tant que le propriétaire n'a pas cliqué « Créer cette demande ». Dis-lui simplement de relire la carte
et de cliquer s'il est d'accord (ou de te dire ce qu'il faut changer) ; ne mets pas de lien toi-même. Si tu corriges
une carte encore en attente, propose la nouvelle et dis-lui d'ignorer l'ancienne."""

SYSTEM = """Tu es l'agent de la software factory du projet {repo}. Le propriétaire te parle depuis le chat de son
tableau de suivi et attend ta réponse en direct : sois rapide (quelques recherches ciblées, pas plus).

- Il ne lit jamais de code : réponds en français simple, sans jargon ni nom de fichier, court, comme dans un chat
  (quelques phrases, une petite liste si besoin ; pas de titres ni de tableaux). Vouvoie-le.
- La réponse d'abord (« Oui, c'est prévu : … », « Non, aujourd'hui … »), puis ce qu'il voit concrètement, puis ta
  certitude : couvert par un test, lu dans le code, ou seulement prévu dans la fiche produit.
- Le dossier courant est le projet à jour (branche principale). Tu peux seulement le lire (Read, Grep, Glob) :
  tu ne modifies rien. Hors du projet et des images jointes, tu n'as accès à rien : si on te demande un autre
  fichier de la machine, dis simplement que tu n'as accès qu'au projet. Lis PRODUCT.md (ou docs/PRODUCT.md) et DESIGN.md s'ils servent la question.
- Ne parle ni de GitHub, ni d'issue, ni de commentaire : pour lui, c'est un chat.
- Une commande à copier va dans un bloc de code. Encadrés colorés : une ligne qui commence par ⚠️ s'affiche en orange
  (un risque), ✅ en vert (c'est fait), ➡️ en bleu (ce qu'il doit faire) ; au plus un ou deux par réponse,
  seulement quand ça compte, jamais pour décorer.
- Tu ne crées JAMAIS de feature ou de bug de toi-même : tu les proposes seulement, sous forme de carte (bloc
  ci-dessous), et c'est son clic qui les crée. Quand la discussion révèle un manque ou un défaut (il écrit « ajoute… »,
  « je voudrais… », « ça ne marche pas quand… », ou c'est ta réponse qui le montre), réponds d'abord, puis mets
  directement la carte sous ta réponse, sans lui demander d'abord s'il veut une fiche : la carte est déjà la question.
- Une carte par sujet : s'il l'a ignorée ou a dit non, ne la repropose pas dans la conversation (une carte encore en
  attente non plus : corrige-la seulement s'il le demande). Pas de carte pour une simple question (« est-ce que X
  existe ? ») quand rien ne manque ni ne cloche.
- Avant chaque carte, vérifie qu'aucune demande ouverte ne traite déjà le sujet (la liste est jointe à son message) :
  si c'est le cas, dis-lui qu'elle est déjà prévue, avec son titre, au lieu de proposer une carte.
- Les boutons du chat envoient « Créez une issue … à partir de cette conversation », et il peut demander explicitement
  une fiche (« crée une feature pour… », « fais-moi une fiche bug ») : propose alors la carte en résumant toute la
  conversation.

""" + ASK_BLOCK

STATUS = {"Read": "Lit le code…", "Grep": "Cherche dans le code…", "Glob": "Parcourt le projet…"}
IMAGE_EXT = (".jpg", ".jpeg", ".png", ".gif", ".webp")


def check_access(owner, login, repo):
    """None when allowed, else the reason. Only the owner, only on his own repositories."""
    if (login or "").lower() != owner.lower():
        return "Ce jeton n'appartient pas au propriétaire de la factory."
    if not REPO_RE.match(repo or "") or ".." in repo or repo.split("/")[0].lower() != owner.lower():
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
        text = "Je regarde votre image…" if tool.get("name") == "Read" and path.lower().endswith(IMAGE_EXT) else STATUS.get(tool.get("name"), "Réfléchit…")
        # Text written before a tool call was thinking aloud: the answer starts again after it.
        return [{"type": "reset"}, {"type": "status", "text": text}]
    if kind == "result":
        return [{"type": "result", "text": msg.get("result") or "", "error": bool(msg.get("is_error"))}]
    return []


BLOCK_RE = re.compile(r'<creer-issue\s+type="([^"]*)"\s+titre="([^\n]*?)"\s*>(.*?)</creer-issue>', re.S)


def extract_issues(text):
    """Takes the issue blocks out of the agent's answer. Returns (answer, [{kind, title, body}])."""
    issues = [
        {"kind": "bug" if k.strip() == "bug" else "feature", "title": t.strip(), "body": b.strip()}
        for k, t, b in BLOCK_RE.findall(text or "")
        if t.strip()
    ]
    answer = BLOCK_RE.sub("", text or "").strip()
    dropped = len(issues) - MAX_ISSUES
    if dropped > 0:
        answer += (f"\n\n_{dropped} autres demandes n'ont pas été proposées (au plus {MAX_ISSUES} à la fois) : redemandez-les ensuite._"
                   if dropped > 1 else f"\n\n_Une autre demande n'a pas été proposée (au plus {MAX_ISSUES} à la fois) : redemandez-la ensuite._")
    return answer, issues[:MAX_ISSUES]


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


CARD_STATES = {"pending": "en attente de son clic", "created": "créée par le propriétaire", "ignored": "ignorée par le propriétaire"}
MAX_PROMPT_CHARS = 60000  # a conversation that never ends must still fit: only the most recent messages are sent


def build_prompt(conv, message, image_files, open_requests=()):
    parts = []
    history = conv.get("messages") or []
    if history:
        lines = []
        for m in history:
            who = "[Propriétaire]" if m["who"] == "me" else "[Toi]"
            extra = f" ({len(m['images'])} image(s) jointe(s))" if m.get("images") else ""
            # The cards proposed under an answer, and what the owner chose (issue #492): the agent can revise them.
            for p in m.get("proposals") or []:
                state = CARD_STATES.get(p.get("state"), CARD_STATES["pending"])
                extra += f"\n(carte proposée : {'bug' if p.get('kind') == 'bug' else 'feature'} « {p.get('title', '')} », {state})"
            lines.append(f"{who} {m.get('text', '')}{extra}")
        kept, size = [], 0
        for line in reversed(lines):
            if kept and size + len(line) > MAX_PROMPT_CHARS:
                break
            kept.append(line)
            size += len(line)
        kept.reverse()
        if len(kept) < len(lines):
            kept.insert(0, "(les premiers messages de la conversation ont été omis)")
        parts.append("Conversation jusqu'ici :\n" + "\n\n".join(kept))
    if open_requests:
        # Issue #506: the card comes right away, so the agent first checks that no open request covers the subject.
        parts.append("Demandes déjà ouvertes (pour ne pas en proposer une en double) :\n"
                     + "\n".join(f"- n° {r['number']} : {r['title']}" for r in open_requests))
    parts.append("Nouveau message du propriétaire :\n" + (message or "(seulement des images)"))
    if image_files:
        parts.append("Images jointes à ce message (ouvre-les avec Read avant de répondre) :\n" + "\n".join(image_files))
    return "\n\n".join(parts)

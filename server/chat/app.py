"""The factory's chat server on Modal. Deployed by .github/workflows/pages.yml (`modal deploy app.py`).

Secrets (Modal secret `factory-chat`, written by the workflow from the factory repository's secrets):
CLAUDE_CODE_OAUTH_TOKEN (the owner's Claude subscription, from `claude setup-token`) and OWNER (GitHub login).
The server runs only while the panel's « Discussion » tab is in use: it sleeps after 10 minutes without a message.
"""
import os

import modal

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("git", "curl", "ca-certificates", "ripgrep")
    .run_commands(
        "curl -fsSL https://deb.nodesource.com/setup_22.x | bash -",
        "apt-get install -y nodejs",
        "npm install -g @anthropic-ai/claude-code",
    )
    .pip_install("fastapi[standard]==0.115.12", "httpx==0.28.1")
    .add_local_python_source("core", "service")
)

app = modal.App("factory-chat")
repos = modal.Volume.from_name("factory-chat-repos", create_if_missing=True)


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("factory-chat")],
    volumes={"/repos": repos},
    timeout=600,
    scaledown_window=600,
    max_containers=1,
)
@modal.concurrent(max_inputs=8)
@modal.asgi_app()
def web():
    from service import create_app

    return create_app(
        owner=os.environ["OWNER"],
        model=os.environ.get("CHAT_MODEL", "sonnet"),
        on_repo_change=repos.commit,
    )

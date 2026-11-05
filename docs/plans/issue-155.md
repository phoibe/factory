# Issue 155 - grill-with-docs by default

1. Catalog: `grill-with-docs` and `domain-modeling` default on.
2. Sync migration `docs-grilling`: existing projects get them on once (marker in `.factory/migrations.json`), later opt-outs kept.
3. New stage `docs.md`; `grilling`, `framing`, `spec`, `build` stages point to it. Off => plain `grilling`.
4. Relay: a PR on branch `claude/docs-*` touching only GLOSSARY.md / docs/adr is merged automatically.

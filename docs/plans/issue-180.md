# Neutral stack choice at framing — Implementation Plan

> **For agentic workers:** executed inline with superpowers:executing-plans.

**Goal:** Agent instructions never steer the stack toward a named product; framing compares 2–3 genuinely different stacks and the host is chosen with the stack.

**Architecture:** Instruction-only change in `agent/stages/*.md` (source of the generated `.factory/stages/`), guarded by a content test.

**Tech Stack:** Markdown instructions, `node --test`.

**Spec:** issue #180, comment `<!-- factory-spec -->` version 1.

## Global Constraints
- French, plain language, vouvoiement towards the owner (existing vouvoiement test).
- No product names in stack criteria; only kinds: « une base de données gérée », « des composants d'interface tout faits », « une authentification toute prête ».
- 2 to 3 stacks, differing on the core way of building the app; per stack: apport, point faible, comptes à créer, hébergement, maîtrise (« très bonne », « bonne », « moyenne »); then ➡️ recommendation in two sentences.
- Host chosen with the stack, same criteria (adapté, gratuit, robuste), no bonus for Vercel; previews work with any host reporting deployments to GitHub.
- Adoption keeps the existing stack.
- Out of scope: hosting hookup at project creation (#181).

## Review Focus
- A product name slipping back as an "example" in any stage → test scans all stage files for a list of well-known product/framework names.
- foundation still forcing `vercel.json` when another host is chosen → test asserts the hosting config step is conditional.
- Fiche projet missing hosting/accounts info for a non-Vercel host → test asserts the brief mentions where to create/click.
- Adoption rule lost while rewriting → test asserts it.
- Generated `.factory/` copy drifts → regenerated via `node scripts/sync.mjs` if it applies to this repo.

### Task 1: Content test + instruction rewrite

**Files:** Create `test/stack-neutral.test.mjs`; Modify `agent/stages/framing.md` (« Choisir la stack », fiche projet), `agent/stages/foundation.md` (adoption step 4, skeleton step 5), `agent/stages/resume.md`, `agent/stages/acceptance-fix.md`.

- [ ] Write tests: no stage file contains `Neon|shadcn|nextjs|Next.js|Supabase|Clerk|Prisma|Tailwind|Firebase`; « Vercel » appears in no stage except as a neutral mention in framing's hosting rule (« aucun bonus »); framing requires « deux ou trois stacks », « pièce maîtresse », the five per-stack points, « très bonne », ➡️; hosting chosen « avec la stack »; adoption keeps stack; foundation hosting config only « si l'hébergeur choisi le demande ».
- [ ] Run `npm test`, see them fail.
- [ ] Rewrite the passages.
- [ ] Run `npm test`, all pass. Commit.

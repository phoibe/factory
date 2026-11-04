# Issue 42 - Better time estimates on board cards

> For agentic workers: use executing-plans; steps use checkboxes.

**Goal:** Cards show a time range given by the agent at build start, say "plus long que prévu" on overrun, and fall back to per-size history.
**Architecture:** The build agent posts a comment containing `<!-- factory-estimate size=small|medium|large min=N max=M -->`. The panel reads the latest such comment per issue (`parseEstimate`), and `estimate()` returns ranges (`nextLow/nextHigh/totalLow/totalHigh`, `overrun`). Fallback = median of past building stays of the same size, widened to a range.
**Tech Stack:** plain ES modules, `node --test`.
**Spec:** issue #42 comment `<!-- factory-spec -->`.

## Global Constraints
- Cards only; French copy: "entre X et Y min", "plus long que prévu".
- Never display negative or absurd values; range ratio max/min <= 2.5 (agent values outside are clamped).

## Review Focus
- Overrun (done > max) shows "plus long que prévu", never "2 min".
- Malformed / inverted (min>max) / negative estimate comment is ignored or normalised.
- Several estimate comments: latest wins; an estimate older than the current build stay is ignored.
- No history for a size -> defaults.

### Task 1: parsing + ranges in `panel/eta.mjs`
- [ ] Tests in `test/panel-eta.test.mjs`: parseEstimate (latest wins, invalid ignored, clamp), stageMinutes by size, estimate range + overrun, etaText/timeLine range.
- [ ] Run `node --test test/panel-eta.test.mjs test/panel-live.test.mjs`, see them fail.
- [ ] Implement `parseEstimate(comments) -> {size,min,max,at}|null`, `stageMinutes(events, now, sizes?)`, ranged `estimate(item, events, minutes, now, agentEstimate?)`, and ranged text in `etaText` and `timeLine` (`panel/live.mjs`).
- [ ] Wire `panel/app.mjs` (collect estimates from fetched comments, pass sizes and estimate).
- [ ] Run all tests, commit.

### Task 2: agent instructions
- [ ] `agent/stages/build.md`: post the estimate comment at start and a new one whenever the work exceeds the previous high end; sync `.factory/stages/build.md` via `node scripts/sync.mjs` if possible.

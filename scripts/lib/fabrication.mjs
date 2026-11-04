// The logic lives in agent/scripts/fabrication.mjs, which the sync ships to each project so the agent can
// check its own journal before opening a PR (agent/scripts/journal-check.mjs).
export * from '../../agent/scripts/fabrication.mjs';

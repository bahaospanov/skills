// Follow-up prompts that continue the user's turn rather than start one, so the turn keeps what the user typed in it:
// the mods that send one at the end of a turn (scripts/check-continuations.mjs keeps this list to them), a background
// task the agent started reporting back, and the engine following up a UI action. A plugin's name is the engine's
// stamp, so only these can extend a turn.
export const CONTINUATION_PLUGINS: readonly string[] = ['git-cleanup', 'lean-comments', 'lean-docs']
export const CONTINUATION_ORIGINS: readonly string[] = ['task-notification', 'auto-continuation']

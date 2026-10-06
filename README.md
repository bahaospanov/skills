# bahaospanov

Bakhtiyar Ospanov's agent skills, and Claude Code mods: plugins built on function hooks.

## Skills

For any agent the [skills CLI](https://github.com/vercel-labs/skills) supports:

```sh
npx skills add bahaospanov/skills --skill <skill>
```

Or in Claude Code, all of them as one plugin, invoked as `/bahaospanov-skills:<skill>`:

```
/plugin marketplace add bahaospanov/skills
/plugin install bahaospanov-skills@bahaospanov
```

| Skill | Purpose |
| --- | --- |
| [deploy-to-prod](skills/deploy-to-prod/SKILL.md) | Integration branch to production: squash iterative commits, cut waves around migrations and one-time steps, ship wave by wave with a runbook issue. Invoke by hand |
| [prototype-stages](skills/prototype-stages/SKILL.md) | [mattpocock/skills `prototype`](https://github.com/mattpocock/skills/tree/main/skills/engineering/prototype) (MIT), its UI branch reworked: whole flows, options grouped by stage in a one-click panel |
| [scheme](skills/scheme/SKILL.md) | ASCII schematic of a code change: control flow, data flow, before/after, or layers |

## Mods

Early access; the API changes between releases.

One mod per purpose.

| Mod | Purpose |
| --- | --- |
| [git-gates](#git-gates) | Git work is authorized and tidy |
| [git-cleanup](#git-cleanup) | Merged work is cleaned up once it shipped |
| [lean-docs](#lean-docs) | Docs worth keeping |
| [lean-comments](#lean-comments) | Comments worth keeping |
| [lean-scripts](#lean-scripts) | Scripts worth keeping |

Haiku reviews are gated in code first, so a call that cannot fail the review
costs no model call. End-of-turn checks read the git diff of repos the turn
touched, Bash edits included, and send at most two follow-up prompts a session.

### git-gates

Pushing is a deploy, so the agent needs the user's word in the current turn: the
prompt that opened it or one typed while it ran. If a consent check itself fails,
the call is blocked.

| Check | Runs on | Needs | Then |
| --- | --- | --- | --- |
| consent | git commit, push; PR/MR merge | commit, push, ship, deploy, pr, mr, tag or release typed in the current turn (a message typed while it runs or a background task's report does not withdraw it); merge needs "merge"; a protected branch must be named | Call denied |
| grants | Later commits in the session | A message asking for a commit per task, or the grant tool after an authorizing message | Commits spend the grant; pushes never |
| messages | A git commit | Conventional Commits subject, no reviewer pre-answers, a last line with the issue or ticket (#87, #BLK-23) when your messages or the branch name one; then Haiku: a body only when the cause is subtle | Commit denied |
| descriptions | Setting an MR/PR description | Fixed-label blocks at column 0 | Call denied |
| landed branch | A git push | The branch's pushed head already sits in a protected branch, and the message names no new MR | Push denied |
| every commit works | A git push of 2 to 15 commits no remote has | Sonnet: no commit removes something a later one stops using, or uses something a later one adds; skipped when the message says the order is fine | Push denied |

Protected branches come from a repo's own push policy file.
Integration branches are the protected ones; with no policy, the remote's default branch and any of dev, develop, main, master that exist.
Deleting a branch on origin needs no keyword when origin's head of it already sits in an integration branch.
A bare `#87` counts only in a repo with a remote; with no issue tracker, nothing is asked.
Issues you typed bind only commits in the session's repo and its worktrees; a branch ending in its issue number (`perf/mobile-lcp-89`) lets the message end with that one instead.

### git-cleanup

Merged is not shipped: a branch is cleaned up and its issue filled in only once
the pipeline holding the merge has passed. Closing the issue is left to you.

| Check | Runs on | Needs | Then |
| --- | --- | --- | --- |
| merged first | Removing a worktree or branch, local or on origin | The branch sits in an integration branch, a merged PR/MR has it as source branch, or the current turn's message says it merged (or to abandon it) | Call denied |
| pipeline first | Removing a worktree or branch, local or on origin; rewriting an issue's body (checklist ticks, How to test) | The work (the branch, or the newest integration commit naming the issue) landed and a pipeline holding it passed; skipped when the message says not to wait | Call denied while it runs or after it failed |
| stale work | The end of a turn | A branch the session committed to or pushed that sits in an integration branch, its worktree clean, no pipeline holding it still running or failed | Follow-up prompt to remove the worktree and the branch, local and on origin, once checked |

Integration branches are found as git-gates finds them.
A branch sits in an integration branch when its head does, or when every commit of it has a copy there (a rebase merge).
Pipelines are read with `gh` on GitHub and, on GitLab, with the `gitlab_token` option: a `read_api` token, asked when the plugin is enabled, kept in the keychain on macOS and in `~/.claude/.credentials.json` elsewhere. With no token or no pipeline holding the work, the pipeline check holds nothing back and a log line says why; merged first still applies, and on GitLab sees a squash merge only with the token.

### lean-docs

| Check | Runs on | Flags | Then |
| --- | --- | --- | --- |
| docs-review | A doc grown in a git checkout | Haiku: text nobody reads after the task (runbooks, setup pages, narration) | Claude gets the reason |
| docs-no-repeat-code | A doc line being written | Identifiers that already appear together in one code file | Write denied |
| limit-docs | The end of a turn | New or grown docs, prose outweighing code, doc lines repeating code | Follow-up prompt |

No check reads a skill's folder, the one holding `SKILL.md`, or anything under it: a skill is read again on every use.

### lean-comments

No comments by default: keep the ones that record a measured number, a trap or
an invariant, cut the ones that restate the code or narrate the change.

| Check | Runs on | Flags | Then |
| --- | --- | --- | --- |
| limit-edits | A Write or Edit | More than 3 added comment lines, or a comment-heavy region around the edit | Claude gets the guidance |
| limit-turns | The end of a turn | More than 3 new comment lines per file in the turn's diff | Follow-up prompt |

### lean-scripts

| Check | Runs on | Flags | Then |
| --- | --- | --- | --- |
| scripts-review | A script written or grown in a git checkout | Haiku: scripts you could just type again when needed | Claude gets the reason |

## Install mods

Mods load only with function hooks enabled, so export this in your shell profile first:

```sh
export CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1
```

Without it Claude Code skips the mods silently. Then, in Claude Code:

```
/plugin marketplace add bahaospanov/skills
/plugin install <mod>@bahaospanov
```

## Develop

One folder per mod. `tsconfig.json` and `types/` are shared. An installed mod
carries only its own folder, so code two mods share is copied into each one's
`hooks/shared/`.

```sh
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir ./<mod> --debug
```

Saving a file under `<mod>/hooks/` reloads the mod. Repeat `--plugin-dir` to
load several.

## Check

```sh
npm run typecheck                 # tsc over every mod and its tests
npm run check:shared              # hooks/shared/ copies are identical across mods
claude plugin validate ./<mod>    # what the engine sees the module hook and call
claude plugin test ./<mod>        # the mod's tests/
```

## Types

`types/` is written by `/plugin-types types`, run inside a session started as
above. Regenerate, never edit, when:

- Claude Code updates (`head -1 types/claude-code.d.ts` vs `claude --version`)
- a plugin that adds to `$` is enabled or disabled
- an MCP server is connected or disconnected

Commit the result; `git diff types/` shows what the update changed.

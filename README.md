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

Pick one: installing both leaves every skill twice.

### User-invoked

Reachable only when you type them (Claude Code: `disable-model-invocation: true`; Codex: `policy.allow_implicit_invocation: false` in `agents/openai.yaml`).

- **[presentation](skills/presentation/SKILL.md)**: Phone-sized slides of what changed for a product's users, one changed place per slide: its page URL and desktop before/after shots with the change outlined, rendered as 4:5 PNGs with a caption to post in a chat; release builds its release album with it.
- **[release](skills/release/SKILL.md)**: Integration branch to production: fold fixup commits into their parent, cut waves around migrations and one-time steps, ship wave by wave with a runbook issue, then tag a SemVer release, note the shipped issues for you to close, and build a phone-sized release album.
- **[setup-triage-labels](skills/setup-triage-labels/SKILL.md)**: A repo's issue labels from one base set (type, priority, shipped to dev and production) and when each changes as work ships, in step with the playbook and release, written to `docs/agents/triage-labels.md` with the recipes that list and relabel by them; the project's own labels sit under it and survive every re-run. Replaces the label instructions other setups left, such as [mattpocock/skills `setup-matt-pocock-skills`](https://github.com/mattpocock/skills/tree/main/skills/engineering/setup-matt-pocock-skills)' triage roles, whose setup flow it adapts (MIT), and brings the tracker's labels in line.

### Model-invoked

Model- or user-reachable.

- **[playbook](skills/playbook/SKILL.md)**: How a change goes from issue to merged branch, in parts: issues, branches, commits, merge requests, cleanup. A project states its facts (base branch, issue number format, deviations) in a `### Playbook` block of its AGENTS.md. Its MR description is [mattpocock/skills `pr`](https://github.com/mattpocock/skills/tree/main/skills/engineering/pr) (MIT), whose Summary visuals come from Dex Horthy's [HumanLayer `show-me`](https://github.com/humanlayer/skills/tree/main/plugins/show-me/skills/show-me) (MIT).
- **[prototype-stages](skills/prototype-stages/SKILL.md)**: [mattpocock/skills `prototype`](https://github.com/mattpocock/skills/tree/main/skills/engineering/prototype) (MIT), its UI branch reworked: whole flows, options grouped by stage in a one-click panel.
- **[scheme](skills/scheme/SKILL.md)**: ASCII schematic of a code change: control flow, data flow, before/after, or layers.

## Mods

Early access; the API changes between releases.

One mod per purpose. Why each one and each of its rules exists: [STORY.md](STORY.md).

| Mod | Purpose |
| --- | --- |
| [git-gates](#git-gates) | Git work happens on the user's word |
| [git-tidy](#git-tidy) | Git history stays tidy |
| [lean-docs](#lean-docs) | Docs worth keeping |
| [lean-comments](#lean-comments) | Comments worth keeping |
| [lean-scripts](#lean-scripts) | Scripts worth keeping |
| [lean-tests](#lean-tests) | Tests worth keeping |
| [herdr-rules](#herdr-rules) | A Herdr pane counts down before it closes |
| [traffic-light](#traffic-light) | The band says whether the session's work is done |

Haiku reviews are gated in code first, so a call that cannot fail the review
costs no model call. End-of-turn checks read the git diff of repos the turn
touched, Bash edits included, and show at most two one-line notices a session;
the report reaches Claude with your next message and is acted on when you ask.

### git-gates

Pushing is a deploy, so the agent needs the user's word in the current turn: the
prompt that opened it or one typed while it ran. If a consent check itself fails,
the call is blocked.

| Check | Runs on | Needs | Then |
| --- | --- | --- | --- |
| consent | git commit, push, with or without git's own options (`git -C dir push`); opening a PR/MR; PR/MR merge | commit, push, ship, deploy, pr, mr, tag or release typed in the current turn (a message typed while it runs or a background task's report does not withdraw it); a push needs one of them other than commit; opening needs pr, mr, pull request, merge request or ship; merge needs "merge", and "merge request" is not it; a protected branch must be named. A negated keyword ("don't push") does not count, and a no to the act itself refuses it, standing grant included, unless the turn also asks for it | Call denied |
| grants | Later commits in the session | A message asking for a commit per task, or the grant tool after an authorizing message | Commits spend the grant; pushes never |
Protected branches come from a repo's own push policy file.
Integration branches are the protected ones; with no policy, the remote's default branch and any of dev, develop, main, master that exist.
Deleting a branch on origin needs no keyword, merged or not, unless it is an integration branch or the same command pushes something else. A "don't push" in the turn still refuses it. Worktree removal and local branch deletes are never gated.

### git-tidy

The rules' text lives in the [playbook](skills/playbook/SKILL.md).

| Check | Runs on | Needs | Then |
| --- | --- | --- | --- |
| messages | A git commit | Conventional Commits subject, no Co-Authored-By trailer naming Claude or Anthropic (in the message or a `--trailer` flag) and no "Generated with Claude Code" line | Commit denied |
| message advice | A git commit | No reviewer pre-answers ("no X changed"); then Haiku: a body only when the cause is subtle | Commit runs; the user gets the advice |
| fresh base | Opening an MR/PR: `gh pr create`, `glab mr create`, a GitLab API POST to `merge_requests` | The source branch, as origin has it, contains the target's latest commit, fetched first; skipped when the message says not to rebase | Call denied |

### lean-docs

| Check | Runs on | Flags | Then |
| --- | --- | --- | --- |
| docs-review | A doc grown in a git checkout | Haiku: text nobody reads after the task (runbooks, setup pages, narration) | Claude gets the reason |
| docs-no-repeat-code | A doc line being written | Identifiers that already appear together in one code file | Claude gets the hint; the write goes ahead |
| limit-docs | The end of a turn | New or grown docs, prose outweighing code, doc lines repeating code | A one-line notice; say "trim docs" to act on it |

No check reads a skill's folder, the one holding `SKILL.md`, or anything under it: a skill is read again on every use.

Media and marketing work is out of scope too: a file its own checkout ignores (a local `reels/` or `renders/` folder) or one under a folder holding a `.lean-skip` file.

### lean-comments

No comments by default: keep the ones that record a measured number, a trap or
an invariant, cut the ones that restate the code or narrate the change.

| Check | Runs on | Flags | Then |
| --- | --- | --- | --- |
| limit-edits | A Write or Edit | More than 3 added comment lines, or a comment-heavy region around an edit that adds comments | Claude gets the guidance |
| limit-turns | The end of a turn | More than 3 new comment lines per file in the turn's diff | A one-line notice; say "trim comments" to act on it |

No check reads a file installed under `~/.agents/skills`, `~/.claude/skills` or `~/.claude/plugins`: it is someone else's code. A link from there into a checkout is followed, and the file is checked.

Media and marketing work is out of scope too: a file its own checkout ignores (a local `reels/` or `renders/` folder) or one under a folder holding a `.lean-skip` file.

### lean-scripts

| Check | Runs on | Flags | Then |
| --- | --- | --- | --- |
| scripts-review | A script written or grown in a git checkout | Haiku: scripts you could just type again when needed | Claude gets the reason |

A script is a shell file, a file in a `scripts`, `bin`, `tools` or `ops` folder, or one starting with a shebang. A skill's folder is skipped: the skill runs its scripts on every use.

Media and marketing work is out of scope too: a file its own checkout ignores (a local `reels/` or `renders/` folder) or one under a folder holding a `.lean-skip` file.

### lean-tests

A test pins behaviour. Copy a component always shows is content: asserting it
types the copy a second time, and the test fails only when the wording changed
on purpose.

| Check | Runs on | Flags | Then |
| --- | --- | --- | --- |
| static-text | A UI test written or edited in a git checkout whose new lines check literal text: `getByText('…')`, a role's `name: '…'`, `toHaveTextContent('…')`, `toHaveText`, a snapshot | Haiku: assertions of text the component shows whatever its props, state, data or a user action | Claude gets the reason |

A UI test is a `.test` or `.spec` file in JSX or TSX, or one using Testing Library, Playwright or Vue Test Utils. Haiku reads it with the component beside it (`Card.test.tsx` → `Card.tsx`, or one folder up from `__tests__/`).

Media and marketing work is out of scope too: a file its own checkout ignores (a local `reels/` or `renders/` folder) or one under a folder holding a `.lean-skip` file.

### herdr-rules

A Herdr subtask closing its own pane shows it first, so whoever watches can stop it.

| Part | What it does |
| --- | --- |
| `close_pane_later` tool | Closes this session's Herdr pane, or `pane`, after `seconds` (default 60) and returns at once; `note` is shown beside the countdown |
| The band | `⏻ Closing this pane in 42s · <note> [ ✋ Keep open ] [ ❌ Close now ]` above the prompt, a draining bar under it |
| Cancel | A message typed into the session, ✋ Keep open or `/keep-open`; ❌ Close now closes the pane at once |

It runs `herdr pane close`, so the session needs `herdr` on its PATH and a Herdr pane (`HERDR_PANE_ID`).

### traffic-light

A band above the prompt says whether you can leave the session.

| Light | When |
| --- | --- |
| 🟢 safe to leave | The session has started no work yet; or the PR is merged into dev, develop, main or master, or the commit pushed straight to one of them, and every GitHub Actions run of that push passed; a run a newer push cancelled is judged by the newer one |
| 🟡 waiting on PR | The PR is open, failing checks included, or merged with its pipeline still running; **waiting on pipeline** while a commit pushed straight to an integration branch has runs going, or none yet in its first three minutes |
| 🔴 working | Claude is asking you, a turn is running where the light would be green, the repo holds uncommitted or unpushed work, a feature branch has no PR, it closed unmerged or merged elsewhere, the pipeline failed, or work began after the PR merged or the commit was pushed |

Work starts with the session's first edit in a git checkout, commit, push, branch, worktree, issue or PR. The repo is the one Claude last edited a file in. A feature branch is judged by its own PR; on an integration branch, or once the worktree is gone, by the PR a `gh pr` command last printed, and with none, by the integration branch's pushed head. A turn that changes nothing, such as a question, ends green again. A turn that edits a file git does not ignore, or creates a commit, branch, worktree, issue or PR, leaves that merged PR or pushed commit unable to turn the light green: green waits for the new work's PR or push. The light refreshes after git and gh commands, and every 30 seconds while yellow. `/traffic-light` prints it; `/traffic-light demo` shows each color.

It runs `git` and `gh`, so the session needs both on its PATH and `gh` signed in.

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
npm run check:continuations       # every mod sending follow-up prompts is named where git-gates reads them
npm run check:version             # every plugin.json carries package.json's version
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

# bahaospanov

## 1.30.0

### Minor Changes

- ed91aec: - **git-gates**: Russian spellings of the consent words count as the English ones: закоммить, запушь, задеплой, тегни, зарелизь, пр, мр, смержи; "не пушь" says no. Past forms such as запушил do not count, as "pushed" does not.

## 1.29.0

### Minor Changes

- 5d2ad15: - **git-cleanup**, **issue-first**: removed; the playbook's CLEANUP and ISSUES parts hold their rules as text. Uninstall them; the marketplace's `renames` drops them from your settings.
  - **git-tidy**: checks commit messages and an MR's base only. The push checks are gone (landed branch, every commit works, one commit per change, one feature per MR); the playbook's BRANCHES and COMMITS parts hold their rules.
  - **bahaospanov-skills**: CLEANUP.md no longer leaves cleanup to git-cleanup in Claude Code; BRANCHES.md says a merged branch takes no more pushes.
- c328248: - **herdr-rules**: mod **close-countdown** renamed **herdr-rules**; install `herdr-rules@bahaospanov` in its place. Its tool is now `mcp__herdr-rules__close_pane_later`.
  - **bahaospanov-skills**: the playbook's Herdr subtask closes its pane with herdr-rules' `close_pane_later`.
- 0b30855: - **bahaospanov-skills**: the playbook's MR part becomes its own model-invoked skill, `mr`, which Claude loads when opening an MR or PR or writing its description; the playbook points to it for that step.
- 6ea78ad: - **bahaospanov-skills**: the playbook's MR.md gathers the Evidence in steps: the test that pins the change runs on the base for the Before, then on the branch for the After. A part is read again when its step comes, so an MR description is written from MR.md just read.
- dbdccb2: - **bahaospanov-skills**: `presentation` is user-invoked: run it as `/presentation`.
- 63c4cd4: - **bahaospanov-skills**: `setup-triage-labels` writes the label recipes into `docs/agents/triage-labels.md`, for GitLab REST or GitHub `gh`: the untriaged list (open, no `priority::`, child Tasks left out), the on-dev-waiting-for-release list, the triage relabel and the `shipped::dev` add, and on GitLab the label ids a GraphQL work item takes. Recipes in other docs keep their mechanics and lose their labels: one that sets them takes `$LABELS` and points at the file, one that lists or relabels by a label gives way to the file's. Provisioning ends with the list recipes run read-only against the tracker.

### Patch Changes

- 3aaf1a9: - **git-gates**: deleting a branch on origin needs no keyword, merged or not, including after a rebase or squash merge. An integration branch, a command that also pushes something else, and a "don't push" in the turn still go through consent.
- 3824a11: - **bahaospanov-skills**: `setup-triage-labels` creates only the base set and the project's labels, and its label file lists no others.
- 0b04ba7: - **bahaospanov-skills**: `setup-triage-labels`' label file closes an issue only once it carries `shipped::prod`; `shipped::dev` leaves it open.
- f4ee800: - **bahaospanov-skills**: CLAUDE.md keeps unfinished work off `main` until a release and runs the plugins from a local checkout meanwhile.

## 1.28.0

### Minor Changes

- fd86a06: - **bahaospanov-skills**: new user-invoked skill `setup-triage-labels`: writes a repo's `docs/agents/triage-labels.md` from one base set of issue labels (`type::`, `priority::`, `shipped::dev`, `shipped::prod`) and when each changes, from the issue draft through triage, the playbook's cleanup and a release. The project's own labels sit in a section every re-run keeps. Label instructions other setups left, such as `setup-matt-pocock-skills`' five triage roles, are replaced or removed, and the tracker's labels are created, updated or deleted to match.

## 1.27.1

### Patch Changes

- dd8f58e: - **traffic-light**: a session that has started no work is green, "no work started", instead of red for having no PR. Work pushed straight to an integration branch with no PR is judged by its pushed head: 🟡 "waiting on pipeline" while its runs go, or none started in the first three minutes, then green once they passed or none ran; new work after it waits for the next push.

## 1.27.0

### Minor Changes

- 287418a: - **lean-tests**: new mod. static-text runs after a UI test is written or edited: when its new lines check literal text, Haiku judges whether that text is copy the component always shows, whatever its props, state, data or a user action, and Claude gets the reason to delete those assertions instead of updating them.

## 1.26.0

### Minor Changes

- 430d482: - **traffic-light**: green no longer outlasts new work. While a turn runs the light shows 🔴 where it would be green, and a turn that changed nothing ends green again; once a turn that began green edits a file git does not ignore, or creates a commit, branch, worktree, issue or PR, the merged PR stops counting and green waits for the new work's PR.

## 1.25.2

### Patch Changes

- 8b0fb92: - **traffic-light**: the band's headline is in normal case, `● working` in place of `● WORKING`.

## 1.25.1

### Patch Changes

- e2c37ca: - **traffic-light**: the red light reads 🔴 working in place of needs you.

## 1.25.0

### Minor Changes

- 17a8c54: - **traffic-light**: new mod. A band above the prompt says whether the session's work is done: 🟢 safe to leave once its PR is merged into an integration branch and that push's pipeline passed, 🟡 while it waits on the PR or the pipeline, 🔴 when Claude is asking you or the work is not in a merged PR yet.

## 1.24.0

### Minor Changes

- 8ce9617: - **bahaospanov-skills**: a Herdr subtask closes its pane with close-countdown's `close_pane_later` when that mod is installed, so the pane counts down where the person can keep it open or close it now; the sleep-then-close shell line stays the fallback.

## 1.23.0

### Minor Changes

- 76f3b1b: - **close-countdown**: new mod. A Herdr pane counts down before it closes: the agent calls `close_pane_later` in place of a sleep-then-close shell line, and a band above the prompt shows the seconds left with ✋ Keep open and ❌ Close now buttons. A typed message or `/keep-open` cancels it too.

### Patch Changes

- 28e112f: - **git-gates**, **git-tidy**, **git-cleanup**, **issue-first**, **lean-docs**, **lean-comments**, **lean-scripts**: tests type-check against Claude Code 2.1.309's types; no behaviour change.

## 1.22.0

### Minor Changes

- a4df33c: - **bahaospanov-skills**: a Herdr subtask that started subtasks of its own hands them to its parent before closing. Its report lists the ones still running, and it tells each of them to send its report to the parent instead.

## 1.21.0

### Minor Changes

- 598c99b: - **bahaospanov-skills**: the playbook's CLEANUP part has a Herdr subtask section. After cleanup, an agent that another agent started in a Herdr pane writes a report with its status and transcript path, sends its parent one line pointing at it, and closes its own pane a minute later.

## 1.20.0

### Minor Changes

- 70f1351: - **bahaospanov-skills**: the playbook's MR part writes the description again: Summary, Evidence and Merge Danger, adapted from mattpocock/skills `pr`, whose Summary visuals come from Dex Horthy's HumanLayer `show-me`; credits in the skill's frontmatter and `CREDITS.md`. Screenshots go in Evidence. It replaces the switched-off `### Label` format.

### Patch Changes

- ae20ce7: - **bahaospanov-skills**: the playbook's MR screenshots mark what changed: a dashed red outline on the before, a solid accent one on the after, a label for a change with no look of its own, the shot cropped to the marks.

## 1.19.2

### Patch Changes

- 300f8f7: - **git-cleanup**: merged, clean work whose pipeline passed is removed at the end of the turn by git-cleanup itself (worktree, local and origin branch, a lagging local base fast-forwarded), with one line saying what went. The worktree the session works in stays.
  - **bahaospanov-skills**: the playbook's CLEANUP part removes merged work without asking and reports it in one line.

## 1.19.1

### Patch Changes

- 4f090fe: - **lean-docs**, **lean-comments**: an over-budget turn gets a one-line notice instead of a follow-up prompt; the report reaches Claude with the user's next message and is acted on when the user asks ("trim docs", "trim comments").
  - **git-gates**, **git-tidy**: the follow-up mod list is empty, since no mod sends one now.

## 1.19.0

### Minor Changes

- d4501ce: - **git-tidy**: a body that pre-answers a reviewer and a body Haiku rejects no longer block the commit: it runs, the user sees the advice, and the model is told to relay it and amend only if asked. The Conventional Commits subject and Claude credit still deny.
  - **lean-docs**: docs-no-repeat-code no longer blocks the write; Claude gets the hint after it.
- a92eebc: - **git-gates**: consent holes closed.
  - `git -C <dir>`, `git -c <key=value>` and git's other own options before `commit` or `push` no longer hide the command from consent and the push reviews.
  - A negated keyword ("don't commit", "no need to push") no longer authorizes. An explicit no to the act itself ("commit, don't push") refuses it even when other keywords or a standing grant would allow it, unless the turn also says yes to it.
  - Opening a PR or MR (`gh pr create`, `glab mr create`, a GitLab API POST) now needs "pr", "mr", "pull request", "merge request" or "ship" in the current turn.
  - "merge request" no longer authorizes merging.
  - "commit" no longer authorizes a push: pushing needs push, ship, deploy, pr, mr, tag or release.
  - **git-cleanup**, **issue-first**: the same `git -C` fix, in their copy of the shared `git-commands.ts`. In git-cleanup, deleting a branch with `git -C <dir> push --delete` is now checked like any other deletion.
- 6415f99: - **git-tidy**: new mod, the team half of git-gates: commit message checks and the Haiku body review, fresh base, landed branch, every commit works, one commit per change and one feature per MR, unchanged. A project that enabled git-gates for these checks enables git-tidy too.
  - **git-gates**: consent only: commit, push, MR opening and merge on the user's word, grants and protected branches.
- 0328527: - **issue-first**: owns every issue-number check. A commit missing the issue the user named, or the one its branch names, still runs, and the user gets a suggestion to end the subject with it, as git-gates did. A `feat` commit names its issue at the end of its subject or in its branch; a number in the body no longer counts.
  - **git-gates**: no longer checks issue numbers; that moved to issue-first.
  - **git-cleanup**: the shared issue-refs copy drops the code issue-first now keeps.
- 102ed90: - **bahaospanov-skills**: new model-invoked skill `playbook`: how a change goes from issue to merged branch, in parts (issues, branches, commits, merge requests, cleanup); a project states its facts in a `### Playbook` block of its AGENTS.md. It replaces `mr-style`, whose labels now live in its MR part.
  - **git-gates**: vertical commits. One commit per change counts a later commit matching an earlier one's API contract change in another app as a follow-up, and every commit works suggests squashing such a pair. Refusals name the playbook part holding their rule.
  - **issue-first**: the refusal points to the playbook's ISSUES part for the procedure.
- a4e4939: - **git-gates**, **git-cleanup**: Russian words no longer count as consent, a merge or a branch let go; only English ones do.
  - **lean-scripts**: a script is a shell file, a file in a `scripts`, `bin`, `tools` or `ops` folder, or a file starting with a shebang; the `src/`/`app/` layout guess is gone. The review's examples no longer come from one project.
  - **bahaospanov-skills**: **release** labels the runbook with the label step 1 found, not a fixed `type::release`.
- 757338e: - **bahaospanov-skills**: **release** notes and labels the shipped issues and the runbook and leaves them open: closing is the user's. `scripts/issue-close.sh` is now `scripts/issue-note.sh`, without `--keep-open`.

### Patch Changes

- 937b22d: - **issue-first**: a version at the end of a branch name (`feat/react-19`) no longer counts as the feature's issue. A slug's number names one after two or more words (`feat/catalog-menu-107`), and a bare lowercase `word-number` is not read as a tracker key.
  - **git-cleanup**, **git-tidy**: the same shared branch parsing.
- 6c4fc9d: - **git-cleanup**: merged, clean work gets a one-line notice instead of a follow-up prompt; the cleanup commands reach Claude with the user's next message and run when the user asks.
  - **git-gates**, **git-tidy**: git-cleanup leaves the follow-up mod list, since it sends none.
- 741a170: - **git-gates**, **git-tidy**: the mods whose follow-up prompts continue the user's turn live in one shared list, and `npm run check:continuations` fails when a mod sending follow-ups is missing from it or a listed one sends none.
- 6781bea: - **lean-comments**: the comment-heavy region signal fires only when the edit adds comments of its own, and no longer asks Claude to prune comments it did not write.
- 6fecbbf: - **lean-comments**: the comment guidance sends reasoning to the commit message or the project's decision log, no longer to `docs/decisions.md` or a runbook, which lean-docs rejects.
- 64667ba: - **lean-comments**: the edit guidance states "No comments by default." itself instead of quoting a CLAUDE.md line that no longer exists.
- 5a32b77: - **lean-scripts**: a script in a skill's folder, the one holding `SKILL.md`, is no longer reviewed: the skill runs it on every use.
- b3b1a56: - **lean-docs**, **lean-comments**: the end-of-turn checks (limit-docs, limit-turns) skip files under a `.lean-skip` folder, as the per-edit checks already did.
- dfd27b5: - **git-cleanup**: a GitLab pipeline parked at `manual` or `skipped` no longer holds cleanup back; it is logged instead. It never finishes, so it held cleanup forever.
- 0a7e886: - **bahaospanov-skills**: the description format in the playbook's MR part, mr-style's labels, is commented out for now; it is temporary. Rebasing, checks and screenshots still apply.
- 65b502a: - **git-gates**: the settings-twin parity log is gone; the settings guards it compared against were removed long ago.
- 909ca97: - **git-cleanup**: a squash-merged branch waits for the pipeline holding the commit the merge landed as, read from the forge; it used to skip the pipeline check.
- 350c941: - **bahaospanov-skills**: STORY.md records how the mods came about, the tests a rule passes before it becomes a mod, and a ledger of every rule with the incident behind it.
- 46d4b14: - **git-cleanup**: removing the worktree of an unmerged branch is no longer refused: the branch, and its commits, stay. Removing the branch itself still needs it merged.

## 1.18.0

### Minor Changes

- ea7245c: - **bahaospanov-skills**: `presentation` builds one slide per changed place: the page URL and the clicks that open it, a before shot from a site that still lacks the change above the after shot, dashed red on what went away and solid accent on what is new. Shots come from a 1440-wide desktop browser instead of a phone. `scripts/shoot.mjs` now reads a before/after `shots.json` (format and traps in `SHOTS.md`): steps that open menus and filters, elements to outline, and a crop around them. Up to eight slides; with no before site left, a slide shows the after alone.
  - **bahaospanov-skills**: `release` shoots the album's before shots from production ahead of wave 1's promote and hands them to `presentation`, so the release album shows each change before and after.

## 1.17.0

### Minor Changes

- 676dd34: - **bahaospanov-skills**: new model-invoked skill `presentation`: phone-sized slides of what changed for a product's users, to post in a chat, for a release or any other what's-new post. Changes, label (a version or occasion), site and folder come from a calling skill, else the user, else the commits and closed issues since the last tag. `release` now builds its release album by calling it with the shipped changes and the version; its `REPORT.md` and `scripts/report/` moved into the new skill.

### Patch Changes

- 5b3faf9: - **bahaospanov-skills**: `scripts/link-skills.sh` finds the repo in a shell that exports `CDPATH`; before, `cd` printed the directory, the repo path came out doubled, and nothing was linked.

## 1.16.0

### Minor Changes

- 9dd0e5e: - **bahaospanov-skills**: new model-invoked skill `mr-style`: the fixed `### Label` blocks an MR or PR description is built from, what each label holds, and its shape rules.
  - **git-gates**: no longer checks MR/PR descriptions; that format now lives in the `mr-style` skill, and setting a description is never denied.

## 1.15.0

### Minor Changes

- 1a7fd74: - **git-gates**: a commit message without the issue the user mentioned no longer blocks the commit. It runs, the user sees the suggestion as a transcript line, and the model is told to relay it rather than file an issue or rewrite the commit. Other commit-message rules still deny. Claude Code's attachment labels (`[Image #2]`, `[Pasted text #1 …]`) no longer count as mentioned issues.
  - **git-cleanup**, **issue-first**: the same attachment-label fix, in their copy of the shared `issue-refs.ts`.
- 160d3aa: - **lean-comments**, **lean-docs**, **lean-scripts**: media and marketing work skips every per-edit check (limit-edits, docs-review, docs-no-repeat-code, scripts-review): a file its own checkout ignores, such as a local `reels/` folder, or one under a folder holding a `.lean-skip` file. It is checked from the file's own checkout, so a worktree under a repo's ignored `.worktrees/` is still checked. Turn reports already leave ignored files out.

## 1.14.0

### Minor Changes

- 68d20f2: - **git-gates**: new check, one feature per MR. A push of a branch whose commits name two or more issues, or that Sonnet finds carrying more than one feature that could ship alone, is held: the agent shows the user the features, recommends a branch and MR for each, and asks. Any answer, or the user saying "one MR" or "keep them together", lets the branch through for the session.

## 1.13.0

### Minor Changes

- 8dc0eee: - **issue-first**: new mod. A `feat` commit that names no issue, in its message or its branch, is refused: Claude looks for the open issue the work belongs to, or drafts one and creates it only once the user agrees. The user typing "no issue" in the turn lets the commit through.

## 1.12.0

### Minor Changes

- b0b9070: - **git-gates**: new check, one commit per change. A push to a feature branch is held while a later commit of the branch only fixes, reworks or extends lines an earlier one added (a `fixup!`/`squash!`/`amend!` subject without asking; otherwise Sonnet). The agent leaves the commits alone, shows the user the reason, recommends folding and asks; once the user answers, the same commits go through. It reads the whole branch since its integration branch, so pushing after every commit does not slip past it; a push straight to an integration branch is not reviewed. "keep the commits" in the message skips it.

## 1.11.0

### Minor Changes

- e229dab: - **git-cleanup**: the stale-work follow-up also fast-forwards the local integration branch the work landed in when it is behind origin: `git merge --ff-only` where it is checked out, else `git fetch origin <base>:<base>`.

## 1.10.0

### Minor Changes

- dfd41df: - **git-gates**: new check, fresh base: opening an MR/PR (`gh pr create`, `glab mr create`, a GitLab API POST to `merge_requests`) fetches the target and is denied when origin's source branch does not contain its latest commit; saying "no rebase" steps it aside.

## 1.9.0

### Minor Changes

- a0ab38c: - **git-gates**: a commit crediting Claude is denied, without asking Haiku: a Co-Authored-By trailer naming Claude or Anthropic (in the message or a `--trailer` flag), or a "Generated with Claude Code" line.

## 1.8.1

### Patch Changes

- 5726c55: - **bahaospanov-skills**: **release** puts the album in the runbook's description, a `## Release album` section, instead of a comment; `gitlab-issue-images.sh` now appends to the description.

## 1.8.0

### Minor Changes

- 11dcf2e: - **bahaospanov-skills**: **release** close-out posts the release album to the runbook as one note, caption then images, with the new `scripts/gitlab-issue-images.sh`; on GitHub the images go on the release entry and the comment links them, since the API has no issue uploads.

## 1.7.0

### Minor Changes

- c8de3d0: - **bahaospanov-skills**: **release** step 11 is now close-out, on the user's "release" once production works: a SemVer tag from the shipped commits (`scripts/next-version.sh`: breaking → major, `feat` → minor, else patch; first `v1.0.0`) with a release entry listing the shipped issues; each shipped issue labelled `shipped::prod`, noted and closed, or noted and left open when work remains (`scripts/issue-close.sh`); the release album with the version on every slide; the runbook labelled `type::release`, dated and closed.

### Patch Changes

- 3966435: - **lean-docs**: changeset notes (`.changeset/*.md`) skip docs-review, docs-no-repeat-code and the limit-docs prose budget. `changeset version` folds them into CHANGELOG.md and deletes them, so "will anyone read this again?" is always no by design; docs-review flagged every one.

## 1.6.0

### Minor Changes

- a2cb381: - **bahaospanov-skills**: **release** step 11 builds a release album once the user confirms the last wave on production: 4:5 phone-sized PNGs (1080×1350) of the changes users can see, one per slide, plus a caption ready to paste. `REPORT.md` sets what goes in and the format; `scripts/report/` holds `shoot.mjs` (production screenshots at phone size), `render.mjs` (one PNG per slide) and an `album.html` template.

## 1.5.0

### Minor Changes

- e31bb44: - **bahaospanov-skills**: **release** ships scripts for the bookkeeping a run repeats. `gitlab-pipeline-watch.sh` prints job changes and exits with the pipeline's result, for a background watch; GitHub uses `gh run watch`. `issue-tick.sh` ticks runbook items by text on GitLab or GitHub, writing nothing when a text matches no open item. `gitlab-file-var-line.sh` sets one `NAME=value` line in a CI File variable without printing it: it proves the edit touches only that line, keeps the variable's attributes, and reads it back byte for byte. TRACKERS.md lists them beside the recipes; step 10 points to them.

## 1.4.1

### Patch Changes

- 2aa43f8: - **bahaospanov-skills**: **release** asks for "push" before the force push and "deploy" per wave, the words git-gates lets a push through on; "go" was blocked. Promotion resolves the tip to its full SHA, checks the fast-forward with `merge-base --is-ancestor`, and pushes a quoted literal `"<sha>:refs/heads/<target>"`, so a mistyped short SHA or a zsh `:r` modifier cannot mangle the refspec.

## 1.4.0

### Minor Changes

- 0e3dd70: - **bahaospanov-skills**: **release** drives a live view when the docs, the agent's memory or the user name one: a page the user watches the run on. Step 1 finds it and its contract; `LIVEVIEW.md` says when to write (one batch per state change, real clock times), that ticks on the page are data and never consent, and that a failed write leaves the run going.

## 1.3.0

### Minor Changes

- f4b3cd9: - **bahaospanov-skills**: **release** folds instead of squashing. Every commit ships as it is; a shared issue ref no longer groups commits. A commit folds into its parent only when it is not a step of its own: autosquash or patch wording, or a rework that only changes lines the parent added. A fold keeps the parent's message. The plan rewrites history only for a fold, a drop or a move; otherwise it says `history untouched`, skips the rewrite and force push, and promotes the original tip SHAs, each checked by its own pipeline. After a rewrite, step 8 lists the open MRs and branches to rebase onto the new source.

## 1.2.0

### Minor Changes

- 23d2a91: - **bahaospanov-skills**: **release** surfaces feature flags. Discover finds where each tier's flag values live and whether a flag is read at build time or at runtime; Collect lists every flag gating code in the range with what it gates, its probed prod value and its kind; the plan shows a `FLAG` line at its timing (build-time → before promote, else a rebuild) and asks whether to enable it; the runbook carries a line per flag to set, and how-to-test items behind a flag wait for it.

## 1.1.0

### Minor Changes

- 79e09ce: - **bahaospanov-skills**: skill **deploy-to-prod** renamed **release**; invoke it as `/release`. `/deploy-to-prod` is gone.

## 1.0.2

### Patch Changes

- 4801f6a: - **lean-comments**: the diff base survives a HEAD move only when the command authored history and the new HEAD descends from the old one, or amends it; `git reset --hard origin/dev && git cherry-pick -n <sha>` no longer blames the session for every commit dev gained.
  - **lean-docs**: the same diff-base fix as lean-comments.

## 1.0.1

### Patch Changes

- 6c17732: - **lean-comments**: files installed under `~/.agents/skills`, `~/.claude/skills` or `~/.claude/plugins` skip both comment checks; a link from there into a checkout is still checked.

## 1.0.0

### Major Changes

- One version for every plugin in this repo: git-gates, git-cleanup, lean-docs, lean-comments, lean-scripts and the bahaospanov-skills bundle all move to 1.0.0 together, with one `vX.Y.Z` tag and one GitHub release per release. The per-plugin `<name>--vX` releases before this one stay as history.

  - **bahaospanov-skills**: new skill **deploy-to-prod** (user-invoked). It promotes what the integration branch holds to production: squashes the commits that finished one issue's work in several tries, cuts the range into waves around contract migrations and one-time scripts, shows a plan with each wave's manual steps, migration risks, scripts' dev status and open questions, then rewrites the source branch tree-identically, force-pushes behind a backup tag and a lease, and ships wave by wave from a runbook issue. Every skill now carries `agents/openai.yaml` for Codex.
  - **lean-docs**: files in a skill folder (one holding `SKILL.md`) skip every doc check.

# bahaospanov

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

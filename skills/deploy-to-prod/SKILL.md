---
name: deploy-to-prod
description: Promote what the integration branch holds to production — squash iterative commits, cut the work into waves, ship wave by wave with a runbook issue.
disable-model-invocation: true
---

# deploy-to-prod

Promote the commits the **source** branch (integration, usually `dev`) holds and the **target** (production, usually `main`) lacks. Arguments `[source] [target]` override what step 1 finds.

- **wave** — a prefix of the rewritten source shipped as one promotion: the target moves to the wave's **tip**, CI migrates and deploys, the manual steps run, then the next wave. Waves are prefixes so the target always fast-forwards.
- **hold wave** — the last wave, commits whose ticket or MR says not-for-prod; stays on the source, unpromoted this run.
- **squash group** — commits that finished one piece of work in several tries, rewritten as one.
- **tree-identical** — the rewritten source tip has byte-for-byte the tree of the old one. The rewrite changes history only.
- **runbook** — the tracker issue that carries the deploy: one checklist per wave.

History and production move only on the user's word in their latest message: plan approval (step 6), force push (step 8), and one "go" per wave (step 10).

## Steps

### 1. Discover

Read CLAUDE.md / AGENTS.md, the docs they point to on CI, deploys, the tracker and commits, the CI config, and the git remote. Find:

- source and target branch, and how production is promoted: a fast-forward push of the target branch, or a tag push (and its naming). Docs silent → infer from the CI workflow rules and the target's protection (who may push, force push refused; [`trackers.md`](trackers.md)), and mark it inferred in the plan. Any other mechanism (MR merge only, a manual job) puts the run in **runbook-only** mode: steps 1–9, and the runbook gives the user the exact promotion to perform.
- the CI jobs that migrate and deploy, their order (migrate before or after deploy), and the paths each deploy job ships (its change rules, or its build context when it has none). Grep a large CI config for stages, rules, changes and needs.
- the migration directory and how the tool orders revisions
- the tracker and how to reach it — [`trackers.md`](trackers.md)
- the check commands that gate a push, per app, with the install each needs in a fresh worktree
- read-only probes CI or docs use to confirm a deploy (health URLs, smoke jobs, read-only APIs) — the only channels the run probes production through
- the user's account on the tracker, as the docs or the user name it. A recipe that reads the current user returns the token's owner, often a bot.

Done when each item has a value or is recorded as unknown with the reason. Ask the user only for what the repo cannot answer. An unreachable tracker is not a stop: the run continues without tickets, says so in the plan, and prints the runbook in the terminal.

### 2. Gate

`git fetch`. The latest pipeline on the source must be green and built from the `origin/<source>` tip. When CI runs jobs by changed paths, that pipeline judged only the apps it touched: each app's most recent pipeline that ran its checks must be green too. Otherwise stop and report it.

### 3. Target-only commits

- `git cherry origin/<source> origin/<target>`: a `+` line is a hotfix with no twin on the source — stop and show it to the user.
- `git cherry origin/<target> origin/<source>`: a `-` line is a source commit the target already holds as a cherry-pick — the rewrite leaves it out.

Done when every target-only commit has its source twin listed for dropping, or the user has decided its fate.

### 4. Collect

Walk every commit in `<target>..<source>`:

- **issue refs** — `#N` and issue URLs in the message. A commit without one gets its MR looked up ([`trackers.md`](trackers.md)): "Closes #N" lines and a source branch name ending in a number.
- **tickets** — read every referenced issue in full: description, non-system notes, and the descriptions of its MRs — the ones that close it or carry an in-range commit, not those that only mention it. Deploy steps often live in the MR. Extract deploy steps, env vars, feature flags, ordering hints, any **not-for-prod** statement (not for prod, blocked, pending, a draft MR), and gaps worth a ⚑ in the plan (no how-to-test, open questions). A not-for-prod statement with a condition ("held until X") is checked now: met → no hold; unmet → hold; unverifiable → a question in the plan. Fetch everything to scratch files first, in parallel; past five tickets, sub-agents each take about 50 KB of those files and return this extraction.
- **migrations** — every added or changed revision, classified per [`migrations.md`](migrations.md).
- **one-time scripts** — new CLI commands and script files in the diff; commands a ticket or MR says to run; untracked files in worktrees; files under script-like directories (`scripts/`, `ops/`, `one-off/`, migrations) on local and remote branches holding commits the source lacks (`git cherry` shows a `+`), when the path is absent from the source tree — one hit per path. A branch hit outside this deploy is a note in the plan, nothing more; a script the deploy needs that lives only on such a branch is **missing** — a question in the plan. For each script in the deploy: what it does, its **timing**, and its **dev status** — `done`, `not run`, `failed/partial` or `unknown` — from ticket and MR notes, CI jobs that ran it, and dev's state probed through the step 1 channels; a status only a host shell or database session can show stays `unknown`. Every status but `done` is a question in the plan.
- **unshipped paths** — changed paths no deploy job ships. Each becomes a manual step with its likely action (install a unit, apply a compose diff, import a dashboard) and its timing, or `unknown — ask`; tooling and docs get a no-action line.

**Timing** is one of: before promote, after migrate, during deploy (between named jobs), after deploy, any time. When a manual step depends on production's current state (a config it changes, a URL it fixes), probe that state through the step 1 channels and record what it showed. A state only a host shell or a database session can show stays unprobed: the step carries `unprobed` and the plan asks the user.

Done when every commit has its refs (or none), every ticket is read, every migration classified, every script has its timing and dev status, every unshipped path has a line.

### 5. Plan

**Squash groups.** Commits join one group when they share the same issue refs, wherever they sit in the range. Commits without a ref join when they share a scope, overlap in files, the later ones use fix / fixup / review wording, and no other issue's commit sits between them. A group holds one issue's work: two different refs never share a group. Merge commits flatten into their commits. A commit and its revert, both in range, drop as a pair. A wave cut inside a group splits it, at an MR boundary when there is one.

**Waves.** One wave by default; a signal cuts another:

- a contract migration ships in a later wave than the code that stops using what it removes ([`migrations.md`](migrations.md))
- a one-time script that must run between two changes cuts between them
- an ordering hint in a ticket
- commits whose ticket or MR is not-for-prod go to the hold wave, with every commit that builds on them; when the trial cannot move a held group to the end, ask the user. An open issue or a missing how-to-test is a ⚑, never a hold.
- a script the user confirms is not `done` on dev, or **missing**, goes to the hold wave with the commits whose code needs its result; code that works without the result ships, and only the script waits.

A cut moves only the signalled commits and what builds on them — by the files they touch, or by meaning: a commit that relies on a contract migration's result stays after it even when it rebases cleanly before. Everything else stays in the earlier wave.

**Order.** Waves in sequence. Inside a wave, issue-linked groups first, in the order of their first commit, then the unlinked commits.

**Messages.** The repo's convention, read from its docs and the target's recent log. The prefix is `feat` when any commit in the group is one, else the type most of its commits carry, the first commit's on a tie; scopes combine, a scope-less commit contributing the apps its files touch; every `#N` and flattened `!N` is kept. The subject describes the whole group; the body joins the unique original bodies. The first commit's author stays; other authors become `Co-authored-by` trailers; the author date is the group's newest. The message carries only what the original commits carried.

The annotated rebase todo is the plan file ([`rewrite.md`](rewrite.md)); a re-plan edits its lines. Trial-run the rewrite in a scratch worktree ([`rewrite.md`](rewrite.md)). A group whose move conflicts keeps its original position, and the plan marks it. Done when the trial is tree-identical and every commit sits in exactly one group and one wave.

### 6. Present — consent 1

Show the plan as one wave timeline in a fenced block, laid out as below:

- a header line (range, commit counts, waves, trial result, how promotion was found), then the step 3 drops
- per wave: manual steps by timing, squash groups numbered for toggling (old short SHAs → one new line), single commits as `(kept)` lines, CI auto-steps with migration risk tags, `unknown — ask` and no-action lines, what the wave waits for
- the hold wave, numbered questions, ⚑ flags, notes (branch hits outside this deploy)
- a closing line: the groups, and `backup/*` tags older than 30 days for the user to delete — age from the date in the tag name, else the tagged commit's date

```
dev → main · 14 commits → 7 (1 dropped) · 2 waves · trial tree-identical ✓ · promote: ff push of main (inferred)
drop   5e6f7a8 fix(api): webhook retry #36   (twin of main 1f2e3d4)
wave 1 ─ tip: docs: deploy notes                          ─────────
  ├ BEFORE promote: add EXPORT_BUCKET to the prod env (#41)          unprobed
  ├ [1] #41  a1b2c3d d4e5f6a 0a1b2c3 ─▶ feat(api,web): order export #41
  ├ [2] #38  b7c8d9e e0f1a2b         ─▶ fix(api): refund rounding #38 ⚑
  ├     #40  c9d0e1f                    (kept)
  ├     unlinked 3c4d5e6                (kept, moved to wave end)
  ├ CI   migrate: 0007_export_jobs [expand] ▶ deploy ▶ smoke
  ├ MANUAL after deploy: `cli export-backfill` (#41) · dev: done (#41 note)
  ├ MANUAL unknown — ask: install infra/backup.timer (3c4d5e6)
  └ no action: docs/**, scripts/dev-seed.sh
wave 2 ─ tip: refactor(api): drop legacy coupons #44      ─────────
  ├ [3] #44  f1e2d3c 0b9a8c7         ─▶ refactor(api,admin): drop legacy coupons #44
  ├ CI   migrate: 0008_drop_coupons [contract] ▶ deploy
  └ waits: wave 1 web stops reading /coupons (d4e5f6a)
hold   ─ 9ab12cd feat(web): gift cards #47  (MR !52 is a draft)
? 1 0008_drop_coupons shares f1e2d3c with the code that stops using it: accept the migrate→deploy window?
? 2 `cli coupons-archive` (#44) dev: unknown. Ran on dev? If not, it holds; [3] ships without it.
⚑ #38: open, no how-to-test
notes: branch fix/paypal-guard has migrations/0006_webhooks.py, absent from dev
groups [1] 3→1 [2] 2→1 [3] 2→1 · backup tags > 30 d: none
```

The user may toggle groups, move commits between waves, and send commits to the hold wave. Re-plan from step 5 on any change. Done when the user approves this exact plan.

### 7. Rewrite and verify

Apply the approved plan per [`rewrite.md`](rewrite.md). Done when the result is tree-identical and every wave tip except the last passes the checks; a failing tip moves its cut, back to step 6.

### 8. New log — consent 2, force push

Show `git log --oneline <target>..` of the rewrite with wave tips marked. On the user's word: push the backup tag, then force-push with lease ([`rewrite.md`](rewrite.md)). The source's CI may run every job: the rewritten branch shares no before-SHA with the old one.

### 9. Runbook

Wait for the source pipeline on the rewritten tip to go green. Then create the runbook issue ([`trackers.md`](trackers.md)), assigned to the user, unlabelled:

```
Deploy <source> → <target>, <date>. Backup: `backup/<source>-<date>-<sha>`.

## Wave 1 — <tip sha> <subject>
- [ ] manual, before promote: <step> (<sha>, #N)
- [ ] promote: `git push origin <tip>:<target>`
- [ ] pipeline green: <link>
- [ ] auto: migrations <revisions> (CI)
- [ ] manual, when <job> finishes: <step> (#N)
- [ ] manual, after deploy: <step> (<sha>, #N)
- [ ] how to test #N: <item>

## Hold
- <sha> <subject> — <why held>
```

Referencing each `#N` cross-links the source issues. The user closes the runbook issue; the run never does.

### 10. Ship waves

Per wave, in order:

1. Hand the user the wave's before-promote steps (and, in wave 1, the any-time ones); wait for their "go" for this wave.
2. Promote: `git push origin <tip>:<target>` (a fast-forward; a rejection means the target moved — stop), or push the wave's tag.
3. Watch the target's pipeline: call out each after-migrate and during-deploy step the moment its job finishes; wait for green; run the read-only probes.
4. Tick the wave's automatic items in the runbook.
5. Hand the user the wave's manual steps and how-to-test items; wait until they report them done.

A red pipeline or a failed probe stops the run: report the failing job and the decisive log line, note it in the runbook, ship no later wave. Fix-forward or revert is the user's call.

A later run starts over at step 1: the source is already squashed, so it plans only the remaining waves.

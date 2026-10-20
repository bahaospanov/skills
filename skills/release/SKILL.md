---
name: release
description: Promote what the integration branch holds to production — fold fixup commits into their parent, cut the work into waves, ship wave by wave with a runbook issue, then tag a SemVer release, note the shipped issues for the user to close, and build a phone-sized release album.
disable-model-invocation: true
---

# release

Promote the commits the **source** branch (integration, usually `dev`) holds and the **target** (production, usually `main`) lacks. Arguments `[source] [target]` override what step 1 finds.

- **wave** — a prefix of the source, as it is or rewritten, shipped as one promotion: the target moves to the wave's **tip**, CI migrates and deploys, the manual steps run, then the next wave. Waves are prefixes so the target always fast-forwards.
- **hold wave** — the last wave, commits whose ticket or MR says not-for-prod; stays on the source, unpromoted this run.
- **fold** — a commit that is not a step of its own (a fixup, a rework) merged into the earlier commit it patches, its **parent**. Every other commit ships as it is, even when several share one issue.
- **rewrite** — new history for the source, made only when the plan needs it: a fold, a drop or a move. Without one, history stays untouched and steps 7–8 are skipped.
- **tree-identical** — the rewritten source tip has byte-for-byte the tree of the old one. The rewrite changes history only.
- **runbook** — the tracker issue that carries the deploy: one checklist per wave.
- **live view** — a page outside the terminal the user watches the run on, when one is named; it mirrors the run.

History and production move only on the user's word in their latest message: plan approval (step 6), "push" for the force push (step 8, after a rewrite), "deploy" per wave (step 10), and "release" for the version tag (step 11) — words a push gate such as git-gates lets a push through on, so ask for them by name. A tick on the live view never stands in for it.

## Steps

With a live view, every state change below also goes to it: [`LIVEVIEW.md`](LIVEVIEW.md).

### 1. Discover

Read CLAUDE.md / AGENTS.md, the docs they point to on CI, deploys, the tracker and commits, the CI config, and the git remote. Find:

- source and target branch, and how production is promoted: a fast-forward push of the target branch, or a tag push (and its naming). Docs silent → infer from the CI workflow rules and the target's protection (who may push, force push refused; [`TRACKERS.md`](TRACKERS.md)), and mark it inferred in the plan. Any other mechanism (MR merge only, a manual job) puts the run in **runbook-only** mode: steps 1–9, and the runbook gives the user the exact promotion to perform.
- the CI jobs that migrate and deploy, their order (migrate before or after deploy), and the paths each deploy job ships (its change rules, or its build context when it has none). Grep a large CI config for stages, rules, changes and needs.
- the migration directory and how the tool orders revisions
- feature flags: where each tier's values live (env files, CI File variables, a config service), and when the app reads them — at build time, baked into the image, or at runtime
- the tracker and how to reach it — [`TRACKERS.md`](TRACKERS.md)
- the check commands that gate a push, per app, with the install each needs in a fresh worktree
- read-only probes CI or docs use to confirm a deploy (health URLs, smoke jobs, read-only APIs) — the only channels the run probes production through
- the user's account on the tracker, as the docs or the user name it. A recipe that reads the current user returns the token's owner, often a bot.
- version tags on the target (`v<major>.<minor>.<patch>`), and the tracker's labels for work shipped to production (`shipped::prod`) and for a release's runbook (`type::release`): the existing ones, else those names
- a live view, when the docs, the agent's memory or the user name one: its URL and its contract ([`LIVEVIEW.md`](LIVEVIEW.md)). None named → the run goes without one.

Done when each item has a value or is recorded as unknown with the reason. Ask the user only for what the repo cannot answer. An unreachable tracker is not a stop: the run continues without tickets, says so in the plan, and prints the runbook in the terminal.

### 2. Gate

`git fetch`. The latest pipeline on the source must be green and built from the `origin/<source>` tip. When CI runs jobs by changed paths, that pipeline judged only the apps it touched: each app's most recent pipeline that ran its checks must be green too. Otherwise stop and report it.

### 3. Target-only commits

- `git cherry origin/<source> origin/<target>`: a `+` line is a hotfix with no twin on the source — stop and show it to the user.
- `git cherry origin/<target> origin/<source>`: a `-` line is a source commit the target already holds as a cherry-pick — the rewrite leaves it out.

Done when every target-only commit has its source twin listed for dropping, or the user has decided its fate.

### 4. Collect

Walk every commit in `<target>..<source>`:

- **issue refs** — `#N` and issue URLs in the message. A commit without one gets its MR looked up ([`TRACKERS.md`](TRACKERS.md)): "Closes #N" lines and a source branch name ending in a number.
- **tickets** — read every referenced issue in full: description, non-system notes, and the descriptions of its MRs — the ones that close it or carry an in-range commit, not those that only mention it. Deploy steps often live in the MR. Extract deploy steps, env vars, feature flags, ordering hints, any **not-for-prod** statement (not for prod, blocked, pending, a draft MR), and gaps worth a ⚑ in the plan (no how-to-test, open questions). A not-for-prod statement with a condition ("held until X") is checked now: met → no hold; unmet → hold; unverifiable → a question in the plan. Fetch everything to scratch files first, in parallel; past five tickets, sub-agents each take about 50 KB of those files and return this extraction.
- **migrations** — every added or changed revision, classified per [`MIGRATIONS.md`](MIGRATIONS.md).
- **one-time scripts** — new CLI commands and script files in the diff; commands a ticket or MR says to run; untracked files in worktrees; files under script-like directories (`scripts/`, `ops/`, `one-off/`, migrations) on local and remote branches holding commits the source lacks (`git cherry` shows a `+`), when the path is absent from the source tree — one hit per path. A branch hit outside this deploy is a note in the plan, nothing more; a script the deploy needs that lives only on such a branch is **missing** — a question in the plan. For each script in the deploy: what it does, its **timing**, and its **dev status** — `done`, `not run`, `failed/partial` or `unknown` — from ticket and MR notes, CI jobs that ran it, and dev's state probed through the step 1 channels; a status only a host shell or database session can show stays `unknown`. Every status but `done` is a question in the plan.
- **feature flags** — every flag that gates code in the range: one the range adds, or an existing one its features sit behind (a ticket or MR saying "behind X", flag reads in the diff). For each: what it gates (#N), its prod value — probed read-only through the step 1 channels or the feature's public behaviour (the gated page 404s), else `unprobed` — and its kind, build-time or runtime. The kind sets the timing: build-time → before promote, since setting it later means a rebuild and redeploy; runtime → after deploy, or any time. Enabling it on prod is the user's call unless a ticket decides it: a flag with no stated decision is a question in the plan. A flag left off is never a hold: its code ships dark.
- **unshipped paths** — changed paths no deploy job ships. Each becomes a manual step with its likely action (install a unit, apply a compose diff, import a dashboard) and its timing, or `unknown — ask`; tooling and docs get a no-action line.

**Timing** is one of: before promote, after migrate, during deploy (between named jobs), after deploy, any time. When a manual step depends on production's current state (a config it changes, a URL it fixes), probe that state through the step 1 channels and record what it showed. A state only a host shell or a database session can show stays unprobed: the step carries `unprobed` and the plan asks the user.

Done when every commit has its refs (or none), every ticket is read, every migration classified, every script has its timing and dev status, every flag has what it gates, its prod value and its kind, every unshipped path has a line.

### 5. Plan

**Folds.** Every commit ships as it is by default; a shared issue ref is no reason to combine commits. A commit folds into an earlier in-range commit, its parent, only when it is not a step of its own:

- autosquash or patch wording — `fixup!`, `squash!`, `amend!`, wip, typo, lint, review fix; the parent is the commit it names, else the latest earlier one touching the same files
- it reworks its parent — the lines it removes or changes blame to that one in-range commit, and it adds nothing new: B undoes or replaces A

A commit and its revert, both in range, drop as a pair. Merge commits flatten into their commits. A fold joins its parent's wave; one that builds on a commit past the wave cut ships unfolded in its own wave.

**Waves.** One wave by default; a signal cuts another:

- a contract migration ships in a later wave than the code that stops using what it removes ([`MIGRATIONS.md`](MIGRATIONS.md))
- a one-time script that must run between two changes cuts between them
- an ordering hint in a ticket
- commits whose ticket or MR is not-for-prod go to the hold wave, with every commit that builds on them; when the trial cannot move held commits to the end, ask the user. An open issue or a missing how-to-test is a ⚑, never a hold.
- a script the user confirms is not `done` on dev, or **missing**, goes to the hold wave with the commits whose code needs its result; code that works without the result ships, and only the script waits.

A cut moves only the signalled commits and what builds on them — by the files they touch, or by meaning: a commit that relies on a contract migration's result stays after it even when it rebases cleanly before. Everything else stays in the earlier wave.

**Order.** Waves in sequence. Inside a wave, commits keep their source order; a fold sits at its parent.

**Messages.** A fold keeps its parent's message. The parent's author stays; other authors become `Co-authored-by` trailers; the author date is the newest. A new subject is written only when two peers are each half of one change, in the repo's convention, read from its docs and the target's recent log: `feat` when either is one, scopes combine, every `#N` and flattened `!N` kept, the unique bodies joined. The message carries only what the original commits carried.

**Rewrite.** The plan rewrites history only for a fold, a drop (a step 3 twin, a revert pair) or a move (held commits not already at the tip, a wave cut that reorders). Without one, history stays untouched: waves are prefixes of the source as it is, promotion pushes the original tip SHAs, and each tip's own green pipeline is its check — the exact SHA, stronger than tree-identical; a tip with no pipeline of its own gets the checks in a scratch worktree ([`REWRITE.md`](REWRITE.md), Verify). No backup tag, no force push, open MRs keep their base.

When the plan rewrites, the annotated rebase todo is the plan file ([`REWRITE.md`](REWRITE.md)); a re-plan edits its lines. Trial-run the rewrite in a scratch worktree ([`REWRITE.md`](REWRITE.md)). A fold or move that conflicts keeps its original position, and the plan marks it. Done when every commit sits in exactly one wave, and a rewrite's trial is tree-identical.

### 6. Present — consent 1

Show the plan as one wave timeline in a fenced block, laid out as below:

- a header line (range, commit counts, waves, trial result or `history untouched`, how promotion was found), then the step 3 drops
- per wave: manual steps by timing, a `FLAG` line per feature flag at its timing (name, what it gates, prod value, kind), commits as `(kept)` lines, folds numbered for toggling (parent ◀ fold SHAs, the reason), CI auto-steps with migration risk tags, `unknown — ask` and no-action lines, what the wave waits for
- the hold wave, numbered questions, ⚑ flags, notes (branch hits outside this deploy)
- a closing line: the folds, and `backup/*` tags older than 30 days for the user to delete — age from the date in the tag name, else the tagged commit's date

```
dev → main · 11 commits → 8 (1 dropped, 2 folded) · 2 waves · trial tree-identical ✓ · promote: ff push of main (inferred)
drop   5e6f7a8 fix(api): webhook retry #36   (twin of main 1f2e3d4)
wave 1 ─ tip: chore(infra): backup timer                  ─────────
  ├ BEFORE promote: add EXPORT_BUCKET to the prod env (#41)          unprobed
  ├ FLAG BEFORE promote: EXPORT_PAGE_ENABLED → /exports page (#41) · prod: off (404) · build-time · ? 3
  ├     #41  a1b2c3d feat(api): order export job #41           (kept)
  ├ [1] #41  d4e5f6a ◀ 0a1b2c3  feat(web): export page #41     fixup! wording
  ├ [2] #38  b7c8d9e ◀ e0f1a2b  fix(api): refund rounding #38 ⚑   e0f1a2b replaces b7c8d9e's rounding call
  ├     #40  c9d0e1f fix(web): cart stops reading /coupons #40 (kept)
  ├     unlinked 3c4d5e6 chore(infra): backup timer            (kept)
  ├ CI   migrate: 0007_export_jobs [expand] ▶ deploy ▶ smoke
  ├ MANUAL after deploy: `cli export-backfill` (#41) · dev: done (#41 note)
  ├ MANUAL unknown — ask: install infra/backup.timer (3c4d5e6)
  └ no action: docs/**, scripts/dev-seed.sh
wave 2 ─ tip: refactor(api): drop legacy coupons #44      ─────────
  ├     #44  0b9a8c7 refactor(admin): coupons page removed #44 (kept)
  ├     #44  f1e2d3c refactor(api): drop legacy coupons #44    (kept)
  ├ CI   migrate: 0008_drop_coupons [contract] ▶ deploy
  └ waits: wave 1 web stops reading /coupons (c9d0e1f)
hold   ─ 9ab12cd feat(web): gift cards #47  (MR !52 is a draft)
? 1 0008_drop_coupons shares f1e2d3c with the code that stops using it: accept the migrate→deploy window?
? 2 `cli coupons-archive` (#44) dev: unknown. Ran on dev? If not, it holds; f1e2d3c ships without it.
? 3 EXPORT_PAGE_ENABLED (#41): enable on prod? Build-time: set it before promote, later means a rebuild; left off, /exports ships dark.
⚑ #38: open, no how-to-test
notes: branch fix/paypal-guard has migrations/0006_webhooks.py, absent from dev
folds [1] [2] · backup tags > 30 d: none
```

The user may toggle folds, move commits between waves, and send commits to the hold wave. Re-plan from step 5 on any change. Done when the user approves this exact plan.

### 7. Rewrite and verify

Skipped when history stays untouched. Otherwise apply the approved plan per [`REWRITE.md`](REWRITE.md). Done when the result is tree-identical and every wave tip except the last passes the checks; a failing tip moves its cut, back to step 6.

### 8. New log — consent 2, force push

Skipped with step 7. Show `git log --oneline <target>..` of the rewrite with wave tips marked, and the open MRs and branches built on the old source: after the push each needs `git rebase --onto origin/<source> <old tip>`. On the user's "push": push the backup tag, then force-push with lease ([`REWRITE.md`](REWRITE.md)). The source's CI may run every job: the rewritten branch shares no before-SHA with the old one.

### 9. Runbook

After a rewrite, wait for the source pipeline on the rewritten tip to go green. Then create the runbook issue ([`TRACKERS.md`](TRACKERS.md)), assigned to the user, unlabelled:

```
Deploy <source> → <target>, <date>. Backup: `backup/<source>-<date>-<sha>`.

## Wave 1 — <tip sha> <subject>
- [ ] manual, before promote: <step> (<sha>, #N)
- [ ] flag, <timing>: set <FLAG> in <where>, <build-time | runtime> (#N)
- [ ] promote: `git push origin <full tip sha>:refs/heads/<target>`
- [ ] pipeline green: <link>
- [ ] auto: migrations <revisions> (CI)
- [ ] manual, when <job> finishes: <step> (#N)
- [ ] manual, after deploy: <step> (<sha>, #N)
- [ ] how to test #N: <item>

## Hold
- <sha> <subject> — <why held>

## Close out
- [ ] version tag and release entry
- [ ] shipped issues noted and labelled
- [ ] release album, posted here
```

One flag line per flag the user enables, among its timing's steps. A how-to-test item for flag-gated code names the flag, `(once <FLAG> is on)`; while that flag is off, the item stays open and the wave does not wait on it.

The backup sentence appears only after a rewrite. Referencing each `#N` cross-links the source issues. The runbook issue stays open: the run notes it at close-out (step 11), and the user closes it.

### 10. Ship waves

**Before shots**, ahead of wave 1's promote, while production still lacks every change: write the presentation skill's `shots.json` ([`../presentation/SHOTS.md`](../presentation/SHOTS.md)) for the user-visible changes the waves ship, production as both `before` and `after`, and shoot the before side into the run's scratch folder: `node ../presentation/scripts/shoot.mjs shots.json shots/ before`, from this skill's folder. Done when every shot's outline sits on its change; step 11's report hands the file and the shots over.

Per wave, in order:

1. Hand the user the wave's before-promote steps (and, in wave 1, the any-time ones); wait for their "deploy" for this wave. A flag the user asks the run to set goes through the flag script ([`TRACKERS.md`](TRACKERS.md), Scripts).
2. Promote, after `git fetch`: resolve the tip to its full SHA (`git rev-parse --verify <tip>^{commit}`), confirm `git merge-base --is-ancestor origin/<target> <sha>`, then `git push origin "<sha>:refs/heads/<target>"` with the SHA written out literally — a short SHA can be mistyped, and a shell variable before `:` can be read as a modifier (zsh `$T:r…`). A failed check or a rejected push means the target moved — stop. Or push the wave's tag.
3. Watch the target's pipeline with the watch script or `gh run watch` ([`TRACKERS.md`](TRACKERS.md)): call out each after-migrate and during-deploy step the moment its job finishes; wait for green; run the read-only probes.
4. Tick the wave's automatic items in the runbook with the tick script.
5. Hand the user the wave's manual steps and how-to-test items; wait until they report them done.

A red pipeline or a failed probe stops the run: report the failing job and the decisive log line, note it in the runbook, ship no later wave. Fix-forward or revert is the user's call.

### 11. Close out

Once the user confirms production works after the last shipped wave (or after the waves that shipped, when the run stopped), ask for their "release". Then, in order, ticking the runbook's close-out items:

1. **Version.** `scripts/next-version.sh <shipped tip>` prints the previous tag and the next SemVer from the commits since it: a breaking `!` or `BREAKING CHANGE:` → major, any `feat` → minor, else patch; no previous tag → `v1.0.0`, unless the user names another. `git tag -a <v> -m <v> <full sha>`, `git push origin <v>`, then a release entry named `<v>` whose notes list the shipped issues (`- #N title`) and the runbook ([`TRACKERS.md`](TRACKERS.md)).
2. **Issues.** `scripts/issue-note.sh` per issue a shipped commit references: note `Shipped to production in <v> (runbook #R)` and the production label. An issue with work left — a held commit, an open MR — gets `Partly shipped in <v>: <shas>`, no label. Every issue stays open for the user to close.
3. **Report.** Call the Skill tool with "presentation", handing it the changes — the shipped tickets' how-to-test items (step 4), a flag-gated one only when its flag is on in production — `<v>` as the label, production as the site, and step 10's `shots.json` and before shots. Append a `## Release album` section to the runbook's description, the caption then the images, with the image script ([`TRACKERS.md`](TRACKERS.md)), so the album stays with the release record. A run with no user-visible change says so and has no album.
4. **Runbook.** `scripts/issue-note.sh --dates <first day of the run> <today> <runbook> "Released as <v>: <release link>" <release label>`, with the runbook label step 1 found.

Done when the tag and its release entry exist, every shipped issue is noted, the presentation skill's build is done and the album is in the runbook's description, and the runbook is noted and dated.

A later run starts over at step 1: the target already holds what shipped, so it plans only the remaining waves.

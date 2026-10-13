# Rewrite

The history rewrite behind steps 5, 7 and 8. Everything runs in a worktree of its own; the user's checkouts stay untouched.

## Build

```sh
OLD=$(git rev-parse origin/<source>)
BASE=$(git merge-base origin/<target> origin/<source>)
git worktree add --no-track -b deploy/<date> <scratch>/deploy origin/<source>
```

The rebase todo, `<scratch>/todo`, is the plan file: comment lines carry each group's number, wave and ref, and git skips them. A re-plan edits its lines. Start from `git log --reverse --no-merges --format='pick %h %s' origin/<target>..origin/<source>`, then reorder and annotate, oldest first inside each group:

```
# group 4 · wave 1 · #69
pick 9c68583 refactor(api): split catalog by concept #69
fixup eeb7c80 refactor(api): archives use the shared csv split #69
fixup ef708cb fix(api): demo seeds through the admin path #69
exec git commit --amend --no-verify --date="$(git log --no-walk --date=raw --format=%ad 9c68583 eeb7c80 ef708cb | sort -n | tail -1)" -F <scratch>/msg-4.txt
# wave 1 · #75
pick f2999da refactor: give the seam a job #75
```

- `msg-N.txt`: the new subject, a blank line, the unique bodies from `git log --no-walk --format=%b <shas>`, then `Co-authored-by: <name> <email>` for each author other than the first commit's (`--format='%an <%ae>'`).
- `--no-merges` flattens merges. Leave out the step 3 duplicates and dropped revert pairs: a hand-written todo skips git's own upstream-patch filtering.
- `--no-verify`: the wave-tip checks below replace per-commit hooks.

Run it non-interactively:

```sh
GIT_SEQUENCE_EDITOR="cp <scratch>/todo" git -C <scratch>/deploy rebase -i --onto origin/<target> $BASE
```

A conflict means the plan moved a group across a commit it depends on. Find the culprit: take the conflicting files, and in the original order find the last commit before the stopped one that touched them — the group holding it is the one that moved wrongly (it may be the stopped commit's own group). `git rebase --abort`, put the culprit group back at its original position, rebuild the todo, rerun. Record every such fallback for the plan.

## Verify

- **tree-identical**: `git diff --quiet $OLD HEAD` exits 0. Anything else aborts the run, whatever the cause.
- **wave tips**: for each tip but the last, `git worktree add --detach <scratch>/tip-N <tip>`, install, run the discovered checks. The last tip's tree is the old source's, already judged green by step 2.
- Remove the scratch worktrees once verified.

## Push

```sh
git tag backup/<source>-<YYYYMMDD>-<short OLD> $OLD
git push origin backup/<source>-<YYYYMMDD>-<short OLD>
git push --force-with-lease=<source>:$OLD origin deploy/<date>:<source>
```

The lease rejects the push if anyone moved the source since `OLD`: fetch, and restart at step 1.

After the push, delete the local `deploy/<date>` branch and its worktree.

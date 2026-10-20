---
"bahaospanov": minor
---

- **git-gates**: consent holes closed.
  - `git -C <dir>`, `git -c <key=value>` and git's other own options before `commit` or `push` no longer hide the command from consent and the push reviews.
  - A negated keyword ("don't commit", "no need to push") no longer authorizes. An explicit no to the act itself ("commit, don't push") refuses it even when other keywords or a standing grant would allow it, unless the turn also says yes to it.
  - Opening a PR or MR (`gh pr create`, `glab mr create`, a GitLab API POST) now needs "pr", "mr", "pull request", "merge request" or "ship" in the current turn.
  - "merge request" no longer authorizes merging.
  - "commit" no longer authorizes a push: pushing needs push, ship, deploy, pr, mr, tag or release.
- **git-cleanup**, **issue-first**: the same `git -C` fix, in their copy of the shared `git-commands.ts`. In git-cleanup, deleting a branch with `git -C <dir> push --delete` is now checked like any other deletion.

# Branches

## A worktree per change

A session opens on whatever the last agent left checked out, possibly someone else's branch with their uncommitted changes. Before any work, reads included, start a worktree on a new branch from the fresh base:

```sh
git fetch origin
git worktree add -b <type>/<slug>-<issue> .worktrees/<slug> origin/<base>
```

- `<type>` is the commit type of the work: `feat`, `fix`, `chore`, `docs`, `refactor`.
- The branch ends with the issue number when there is one (`feat/catalog-menu-107`), so its commits answer to that issue.
- `.worktrees/` sits in the repo's `.gitignore`.
- A fresh worktree needs its own install before the checks run.
- A branch whose MR merged takes no more pushes: a follow-up gets its own branch, or the push recreates the deleted branch outside any MR, looking shipped.

A question answered without changing anything needs no worktree, and neither does work the user says to do in the current checkout.

## One feature per branch

A branch and its MR carry one feature or fix. A piece is its own feature when it could ship alone: a reviewer could approve it, a tester check it and a revert undo it without the rest. It gets its own branch, from its own issue.

One feature takes only what it needs to work: the backend change and the frontend using it, a migration and its use, the matching change in another app, its tests, styles and docs, a refactor that makes room for it. Two pieces on one page are still two features when each could ship alone. A subject listing several capabilities ("x, y and z") usually carries several.

---
"bahaospanov": minor
---

- **git-cleanup**: the stale-work follow-up also fast-forwards the local integration branch the work landed in when it is behind origin: `git merge --ff-only` where it is checked out, else `git fetch origin <base>:<base>`.

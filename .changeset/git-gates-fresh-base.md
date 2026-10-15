---
"bahaospanov": minor
---

- **git-gates**: new check, fresh base: opening an MR/PR (`gh pr create`, `glab mr create`, a GitLab API POST to `merge_requests`) fetches the target and is denied when origin's source branch does not contain its latest commit; saying "no rebase" steps it aside.

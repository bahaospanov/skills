---
"bahaospanov": patch
---

- **git-gates**: a shell redirection after `git push` (`2>&1`, `> push.log`) is no longer read as a branch, so a push of a protected current branch meets its check and a delete's note names only the branch.

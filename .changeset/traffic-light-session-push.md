---
"bahaospanov": patch
---

- **traffic-light**: a session that edited no file is judged by its last push to an integration branch, as `git push` reported it, so a history rewrite force-pushed from a scratch worktree turns green once its pipeline passes, instead of staying red on another session's uncommitted changes in the checkout.

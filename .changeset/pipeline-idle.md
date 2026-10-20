---
"bahaospanov": patch
---

- **git-cleanup**: a GitLab pipeline parked at `manual` or `skipped` no longer holds cleanup back; it is logged instead. It never finishes, so it held cleanup forever.

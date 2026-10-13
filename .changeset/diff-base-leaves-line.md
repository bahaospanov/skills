---
"bahaospanov": patch
---

- **lean-comments**: the diff base survives a HEAD move only when the command authored history and the new HEAD descends from the old one, or amends it; `git reset --hard origin/dev && git cherry-pick -n <sha>` no longer blames the session for every commit dev gained.
- **lean-docs**: the same diff-base fix as lean-comments.

---
"bahaospanov": patch
---

- **git-cleanup**: merged, clean work whose pipeline passed is removed at the end of the turn by git-cleanup itself (worktree, local and origin branch, a lagging local base fast-forwarded), with one line saying what went. The worktree the session works in stays.
- **bahaospanov-skills**: the playbook's CLEANUP part removes merged work without asking and reports it in one line.

---
"bahaospanov": minor
---

- **git-cleanup**, **issue-first**: removed; the playbook's CLEANUP and ISSUES parts hold their rules as text. Uninstall them; the marketplace's `renames` drops them from your settings.
- **git-tidy**: checks commit messages and an MR's base only. The push checks are gone (landed branch, every commit works, one commit per change, one feature per MR); the playbook's BRANCHES and COMMITS parts hold their rules.
- **bahaospanov-skills**: CLEANUP.md no longer leaves cleanup to git-cleanup in Claude Code; BRANCHES.md says a merged branch takes no more pushes.

---
"bahaospanov": minor
---

- **git-gates**: a commit message without the issue the user mentioned no longer blocks the commit. It runs, the user sees the suggestion as a transcript line, and the model is told to relay it rather than file an issue or rewrite the commit. Other commit-message rules still deny. Claude Code's attachment labels (`[Image #2]`, `[Pasted text #1 …]`) no longer count as mentioned issues.
- **git-cleanup**, **issue-first**: the same attachment-label fix, in their copy of the shared `issue-refs.ts`.

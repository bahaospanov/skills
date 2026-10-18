---
"bahaospanov": minor
---

- **lean-comments**, **lean-docs**, **lean-scripts**: media and marketing work skips every per-edit check (limit-edits, docs-review, docs-no-repeat-code, scripts-review): a file its own checkout ignores, such as a local `reels/` folder, or one under a folder holding a `.lean-skip` file. It is checked from the file's own checkout, so a worktree under a repo's ignored `.worktrees/` is still checked. Turn reports already leave ignored files out.

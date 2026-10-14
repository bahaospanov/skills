---
"bahaospanov": patch
---

- **lean-docs**: changeset notes (`.changeset/*.md`) skip docs-review, docs-no-repeat-code and the limit-docs prose budget. `changeset version` folds them into CHANGELOG.md and deletes them, so "will anyone read this again?" is always no by design; docs-review flagged every one.

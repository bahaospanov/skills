---
"bahaospanov": minor
---

- **bahaospanov-skills**: **release** folds instead of squashing. Every commit ships as it is; a shared issue ref no longer groups commits. A commit folds into its parent only when it is not a step of its own: autosquash or patch wording, or a rework that only changes lines the parent added. A fold keeps the parent's message. The plan rewrites history only for a fold, a drop or a move; otherwise it says `history untouched`, skips the rewrite and force push, and promotes the original tip SHAs, each checked by its own pipeline. After a rewrite, step 8 lists the open MRs and branches to rebase onto the new source.

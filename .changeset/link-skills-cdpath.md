---
"bahaospanov": patch
---

- **bahaospanov-skills**: `scripts/link-skills.sh` finds the repo in a shell that exports `CDPATH`; before, `cd` printed the directory, the repo path came out doubled, and nothing was linked.

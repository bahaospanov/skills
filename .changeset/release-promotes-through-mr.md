---
"bahaospanov": minor
---

- **bahaospanov-skills**: release promotes each wave through an MR from a branch pinned at the wave's tip, merged at that exact SHA, instead of pushing the target branch; where the forge cannot merge as a fast-forward, it pushes the SHA and the forge records the MR as merged.

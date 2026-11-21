---
"bahaospanov": minor
---

- **traffic-light**: the light follows the session's main work: the checkout Claude first edits in, or the one it marks with the new `main` tool. Work in any other checkout is side work, so its PR merging no longer turns the light green or closes a Herdr subtask's pane, and Claude is told so once per side checkout. Once the main work is done, a session no parent started takes the next checkout it edits as its main work; a Herdr subtask keeps its one.

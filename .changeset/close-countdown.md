---
"bahaospanov": minor
---

- **close-countdown**: new mod. A Herdr pane counts down before it closes: the agent calls `close_pane_later` in place of a sleep-then-close shell line, and a band above the prompt shows the seconds left with ✋ Keep open and ❌ Close now buttons. A typed message or `/keep-open` cancels it too.

---
"bahaospanov": minor
---

- **traffic-light**: a Herdr subtask closes itself once its work is done. When the light turns green for merged or pushed work and no turn runs, a named Herdr agent's pane counts a minute down in the band, with ✋ Keep open and ❌ Close now; a turn that starts stops the count, and Keep open, a typed message or `/traffic-light keep-open` keeps the pane open until new work turns green.
- **herdr-rules**: removed. Its pane countdown moved into traffic-light, which starts it on its own when the work is green instead of on a `close_pane_later` call.
- **bahaospanov-skills**: playbook: a Herdr subtask with traffic-light leaves its pane's close to the band.

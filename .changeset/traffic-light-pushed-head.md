---
"bahaospanov": patch
---

- **traffic-light**: a session that has started no work is green, "no work started", instead of red for having no PR. Work pushed straight to an integration branch with no PR is judged by its pushed head: 🟡 "waiting on pipeline" while its runs go, or none started in the first three minutes, then green once they passed or none ran; new work after it waits for the next push.

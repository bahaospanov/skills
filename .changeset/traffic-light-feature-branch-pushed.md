---
"bahaospanov": patch
---

- **traffic-light**: a feature branch with no PR whose head was pushed straight to an integration branch (`git push origin HEAD:dev` from a worktree) is judged by that push's pipeline, so it turns green instead of staying red on "no PR yet".

---
"bahaospanov": patch
---

- **traffic-light**: work stays green once cleanup removed the worktree it was edited in, instead of red with "can't read GitLab": the GitLab token came from the env file that worktree's git config names, and went with it.

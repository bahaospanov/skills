---
"bahaospanov": patch
---

- **traffic-light**: a feature branch with no commit made on it stays red with "no PR yet" instead of green as "pushed to dev". That covers a branch only created, fast-forwarded, or rebased with nothing to replay. The integration branch already holds its head, so a Herdr subtask that stopped for review before its first commit had its pane closed.

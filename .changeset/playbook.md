---
"bahaospanov": minor
---

- **bahaospanov-skills**: new model-invoked skill `playbook`: how a change goes from issue to merged branch, in parts (issues, branches, commits, merge requests, cleanup); a project states its facts in a `### Playbook` block of its AGENTS.md. It replaces `mr-style`, whose labels now live in its MR part.
- **git-gates**: vertical commits. One commit per change counts a later commit matching an earlier one's API contract change in another app as a follow-up, and every commit works suggests squashing such a pair. Refusals name the playbook part holding their rule.
- **issue-first**: the refusal points to the playbook's ISSUES part for the procedure.

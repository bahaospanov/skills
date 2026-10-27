---
"bahaospanov": minor
---

- **bahaospanov-skills**: new user-invoked skill `setup-triage-labels`: writes a repo's `docs/agents/triage-labels.md` from one base set of issue labels (`type::`, `priority::`, `shipped::dev`, `shipped::prod`) and when each changes, from the issue draft through triage, the playbook's cleanup and a release. The project's own labels sit in a section every re-run keeps. Label instructions other setups left, such as `setup-matt-pocock-skills`' five triage roles, are replaced or removed, and the tracker's labels are created, updated or deleted to match.

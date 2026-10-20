---
"bahaospanov": minor
---

- **bahaospanov-skills**: new model-invoked skill `presentation`: phone-sized slides of what changed for a product's users, to post in a chat, for a release or any other what's-new post. Changes, label (a version or occasion), site and folder come from a calling skill, else the user, else the commits and closed issues since the last tag. `release` now builds its release album by calling it with the shipped changes and the version; its `REPORT.md` and `scripts/report/` moved into the new skill.

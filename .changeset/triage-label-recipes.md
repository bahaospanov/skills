---
"bahaospanov": minor
---

- **bahaospanov-skills**: `setup-triage-labels` writes the label recipes into `docs/agents/triage-labels.md`, for GitLab REST or GitHub `gh`: the untriaged list (open, no `priority::`, child Tasks left out), the on-dev-waiting-for-release list, the triage relabel and the `shipped::dev` add, and on GitLab the label ids a GraphQL work item takes. Recipes in other docs keep their mechanics and lose their labels: one that sets them takes `$LABELS` and points at the file, one that lists or relabels by a label gives way to the file's. Provisioning ends with the list recipes run read-only against the tracker.

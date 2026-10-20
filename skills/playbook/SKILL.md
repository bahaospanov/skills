---
name: playbook
description: How a change goes from issue to merged branch. Use when work needs an issue, a branch, a commit, an MR or PR, or cleanup after a merge.
---

# Playbook

How a change goes from its issue to a merged, cleaned-up branch, in every project. Read the project's facts, then the part for the task.

## Project facts

The project states them in its `CLAUDE.md` or `AGENTS.md`, under `## Agent skills`:

- **Issue tracker**: `docs/agents/issue-tracker.md`, the file the other engineering skills read too: where issues live, and the recipes to reach them.
- **Playbook**: a block of the facts below.

```markdown
### Playbook

- Base: dev
- Issue number: #12, at the end of the commit subject
- Deviations: a fix for a reported bug needs an issue too
```

| Fact | When the project leaves it out |
| --- | --- |
| Issue tracker | origin's forge: GitHub issues on github.com, else GitLab; no remote, no tracker |
| Base | origin's default branch |
| Issue number | `#<number>` at the end of the commit subject |
| Deviations | none |

A deviation outranks the part it changes.

## Parts

| Task | Part |
| --- | --- |
| Starting a change: its issue, found or created | [ISSUES.md](ISSUES.md) |
| Its branch and worktree | [BRANCHES.md](BRANCHES.md) |
| Commit messages, and how commits divide the work | [COMMITS.md](COMMITS.md) |
| Opening an MR or PR, and its description | [MR.md](MR.md) |
| After the merge | [CLEANUP.md](CLEANUP.md) |

A task that spans parts reads each one.

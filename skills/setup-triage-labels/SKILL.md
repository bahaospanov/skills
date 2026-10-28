---
name: setup-triage-labels
description: Set up a repo's issue labels from the base set and when each changes as work ships; replaces the label instructions other setups left, and brings the tracker's labels in line.
disable-model-invocation: true
metadata:
  credits:
    - skill: setup-matt-pocock-skills
      author: Matt Pocock
      url: "https://github.com/mattpocock/skills/blob/main/skills/engineering/setup-matt-pocock-skills/SKILL.md"
---

# Setup triage labels

Write the project's label vocabulary, `docs/agents/triage-labels.md`: the base set, when each label changes as work ships to dev and production, and the recipes that list and relabel by them, from [TRIAGE-LABELS.md](TRIAGE-LABELS.md), with the project's own labels under it. That file becomes the one source: the label instructions other documents or skills left, such as `setup-matt-pocock-skills`' five triage roles and the recipes using them, are replaced or removed.

Adapted from Matt Pocock's [`setup-matt-pocock-skills`](https://github.com/mattpocock/skills/blob/main/skills/engineering/setup-matt-pocock-skills/SKILL.md) (MIT): explore, present, confirm, then write.

## 1. Explore

- The tracker and its recipes: `docs/agents/issue-tracker.md`, else the origin remote.
- Every tracker label with its colour, description and counts: GitLab `GET labels?with_counts=true&per_page=100`, GitHub `gh label list --json name,color,description --limit 200`.
- How each one is used: the issues carrying it, and on GitLab each issue's `resource_label_events`: who adds it, at which stage, what it replaces.
- `docs/agents/triage-labels.md`: a Project labels section this skill wrote earlier is the project's; anything else in the file came from another setup.
- Every other label instruction in CLAUDE.md, AGENTS.md and `docs/agents/`: the `### Triage labels` block, label strings in recipes, flags read by a skill that brings its own vocabulary (`triage`'s "MRs as a request surface"), install lines for that skill.

Done when every tracker label has its count, who sets it and at which stage, and every label instruction outside the file is listed.

## 2. Present and ask

Sort every tracker label into one group:

- **base**: a base label's name, used as the base set means it
- **override**: a base label's name the project means differently, or in a colour it keeps
- **project**: the project's own, its meaning and when it is set read from how issues use it
- **drop**: a duplicate, unused, or from another vocabulary, with the issues it is on and the label each moves to

Then the base labels the tracker lacks, then each instruction outside the file. A recipe keeps its mechanics and loses its labels: one that sets them takes `$LABELS` and points at the file, one that lists or relabels by a label gives way to the file's Recipes. Any other instruction is rewritten to these labels or removed with whatever reads it. Lead each group with the recommendation, so the user accepts it in a word; one group, one answer, then the next.

Done when the user has answered for every label and every instruction.

## 3. Confirm

Show the drafts and let the user edit them: the file, every edit outside it, and the block

```markdown
### Triage labels

Base set from `/setup-triage-labels`, plus <its labels, or "nothing of its own">. Read `docs/agents/triage-labels.md` before creating, triaging or relabelling an issue, and when merged work reaches dev or production.
```

## 4. Write

- The file: [TRIAGE-LABELS.md](TRIAGE-LABELS.md) as it stands above **Project labels**, over whatever was there, keeping only the tracker's Recipes block with its variables named as the tracker recipes name them, then the Project labels section kept from the existing file, else the project and override rows from step 2.
- The block replaces any `### Triage labels` under `## Agent skills` in CLAUDE.md, else AGENTS.md; with neither, ask which to create.
- Every instruction outside the file, rewritten or removed as agreed. The `triage` skill reads this file for five roles it no longer holds, so its install lines and flags go too.

## 5. Provision

- Every base and project label: created when missing, its colour and description set where they differ. The description is the Meaning column.
- Every drop: its issues move to their new label first, then the label is deleted. Deleting strips it from every issue, so it waits for the user's yes.

| Need | GitLab REST | GitHub `gh` |
| --- | --- | --- |
| create | `POST labels` with `name`, `color`, `description` | `gh label create <name> --color <hex, no #> --description … --force` |
| update | `PUT labels/<url-encoded name>` with `color`, `description`; a `POST` of an existing name returns `409` | the same `--force` create |
| move an issue | `PUT issues/<iid>` with `add_labels`, `remove_labels` | `gh issue edit <n> --add-label … --remove-label …` |
| delete | `DELETE labels/<url-encoded name>` | `gh label delete <name> --yes` |

Done when the tracker holds the base set and the project's rows, each with its colour and description, and each list recipe in the file, run read-only, returns the open issues its labels pick out.

## 6. Report

Tell the user what was created, updated, moved and deleted, the issues each deleted label was on, and the files written and edited. Re-running `/setup-matt-pocock-skills` with `triage` installed writes the five roles back over the file; this skill runs again after it, and re-running it any time refreshes the base set and keeps the Project labels.

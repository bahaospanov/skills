# Merge requests

An MR or PR targets the base and carries one branch's feature ([BRANCHES.md](BRANCHES.md)).

## Before pushing

Rebase onto the latest base, so the checks run against what the MR merges into, then run the checks of every app the branch touched; the project's docs name them. A branch already on origin goes up with `--force-with-lease`.

```sh
git fetch origin <base> && git rebase origin/<base>
```

## Description

Temporarily off: the user's own PR-body skill writes MR and PR descriptions for now. The format below stays commented out until it returns; apply none of it.

<!--
A run of `### Label` blocks, using the labels that apply, from these eight:

| Label | Holds |
| --- | --- |
| Symptom | What was seen: the bug, or the gap the issue names |
| Cause | Why it happened: the mechanism behind the symptom |
| Measured | Numbers: the method first (where, viewport, throttling, runs), then the results before and after |
| Scope | What the change does, one bullet per area; a diff sketch in a fence where the shape matters |
| Constraint | What the change works within: merge order, an upstream bug, a limitation accepted |
| Cost | What it costs: bytes, time, behaviour changed on purpose, a one-way door and its blast radius |
| Verified | How it was checked: commands and their results, screenshots with their viewport |
| Remaining | What was not checked, or is left for later |

- The description opens with its first heading; the issue number (`#90`) sits inside a block.
- A label is always a `### Label` heading, spelled as in the table.
- Every line starts at column 0: Markdown runs indented lines into one paragraph. Command output and transcripts go in ``` fences.
- Every line says what the change does or what was found. What it leaves alone, the diff already shows.
- The description reads as the author's own and names no tool or model that wrote it.
-->

## Screenshots

Work touching a frontend carries screenshots in its description: the real app running locally with seeded data, not component mocks, each with its viewport named. The reviewer sees the change before merging; a diff is not a look at the thing. The same shots later go in the issue's How to test ([ISSUES.md](ISSUES.md)). Backend-only work skips them.

## After the merge

[CLEANUP.md](CLEANUP.md).

---
name: mr-style
description: Fixed-label blocks for a merge request or pull request description. Use when writing or updating an MR or PR description.
---

# MR style

A description is a run of `### Label` blocks. Use the labels that apply, from these eight:

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

## Shape

- The description opens with its first heading; the issue reference (`#90`) sits inside a block.
- A label is always a `### Label` heading, spelled as in the table. Screenshots go under Verified.
- Every line starts at column 0: Markdown runs indented lines into one paragraph. Command output and transcripts go in ``` fences.
- Every line says what the change does or what was found. What it leaves alone, the diff already shows.
- The description reads as the author's own and names no tool or model that wrote it.

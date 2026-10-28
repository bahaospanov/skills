// `$ARGUMENTS` is { mr_md, description } as JSON: the playbook's MR.md, read where it is installed, and the body.

export const MR_STYLE = `Reviewer for a pull or merge request description, against the playbook's MR.md, which says what each of its sections holds. $ARGUMENTS
The description already has the template's sections, a fenced view in its Summary, a Before and After in its Evidence, a Door and a Blast Radius: never ask for those again.
Judge only what MR.md asks of each section's content:
- Summary: its view is one MR.md lists (pseudocode, a call tree, a component tree, a file tree, Mermaid, a diff shaped to the topic, a whole block) and shows what the description says changed. Prose is brief, sits next to the view it supports, and opens with no preamble.
- Evidence: the before and the after are output, a screenshot or a test run - not a sentence describing the change.
- Merge Danger: the door and the blast radius are about this change.
The template's placeholders are guides, not counts: a blast radius of a few words, a second view or a few bullets beside the view are fine.
You see the description, not the diff: never ask for another view only because a different one could also fit.
Never judge wording, tone, length, or whether the change is good.
Fail only a clear miss, a section a reviewer could not use as MR.md intends; when in doubt, ok=true.
Reply with one JSON object and nothing else. Reason: the section, what in it misses MR.md, and the fix. Under 50 words.`

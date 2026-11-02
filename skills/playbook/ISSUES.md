# Issues

Feature work belongs to an issue.

## Find or create

1. Search the tracker's open issues for the one the work belongs to.
2. Found: its number ends the branch name ([BRANCHES.md](BRANCHES.md)) and every commit's subject ([COMMITS.md](COMMITS.md)).
3. None: the work starts without one. Draft one from what the work does, a title and what and why, and offer it in the message that ends your turn, beside the work's report. Create it once the user agrees, then, before the first push, rename the branch and end its commit subjects with the new number.

Declined or unanswered, the branch and its commits go without a number.

## Writing one

- Something visible carries a screenshot of the problem in the description. A shot taken later goes in as soon as it exists.
- Steps toward one goal are one issue, the steps a `- [ ]` checklist in its description.
- Sub-goals of a larger initiative, each from a different area, are child issues under it. The test: if closing the piece alone is a real "done", it is a sub-goal; otherwise it is a step.

## How to test

Once the work's last merge is deployed ([CLEANUP.md](CLEANUP.md)), a `## How to test` section goes at the end of the issue's description, where status comments cannot bury it. It is written for a person checking the result on the deployed environment, with its real URLs, viewports and commands:

```markdown
## How to test

1. Open https://dev.example.com/catalog at 390px wide …
2. …

**Expected:** the menu opens over the page.
![catalog menu, 390px](<upload>)
```

Visible work shows the expected screen with the shots its MR carried. Backend and infra work shows the command and its expected output. The section is done when someone who never read the code can confirm the work.

## Closing

The user closes the issue by hand, after checking How to test.

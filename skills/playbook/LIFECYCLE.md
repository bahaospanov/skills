# Lifecycle

An issue's states, from created to closed, and what each puts on the issue. Labels come from the project's `docs/agents/triage-labels.md`, written by `/setup-triage-labels`: an issue carries only the labels that file lists, changed as its recipes change them. A project without the file runs the same states without labels.

## Production

Production is where the project's users get the work. A merge into the base reaches it by one of three paths, read from the project's docs and the base's CI config:

| Path | A merge into the base | Production comes with |
| --- | --- | --- |
| dev | deploys the dev environment | the release that promotes it |
| direct | deploys production | that merge's pipeline |
| publish | deploys nothing | the version tag that publishes it |

A hotfix merged into the production branch takes the direct path.

## States

1. **Created.** The issue gets one `type::` and every project label that fits; when no label fits, it goes without. A `priority::` goes on only when the user named one. A child Task takes its own type and its parent's project labels.
2. **Triaged.** An open issue with no `priority::` is untriaged. Triage is the user's: they set the priority and correct the type, and an agent relabels on their word.
3. **Started.** The first commit naming the issue. The issue itself stays as it is: the commits hold the start.
4. **Merged.** Once the pipeline holding the work's last merge into the base has passed, the moment cleanup adds How to test ([CLEANUP.md](CLEANUP.md)), the issue gets the user as its assignee, in place of whoever held it, and its start date. On the dev path it also gets `shipped::dev`; on the direct path it moves on to Shipped at once. Work still to merge holds it back: another MR, an open checklist step, an open child issue.
5. **Shipped.** When production comes, the issue gets `shipped::prod` and its finish date. The release skill moves it; a release by hand does the same. A partly shipped issue waits for its last piece. Then Verify.
6. **Closed.** By Verify, or by the user.

## Verify

Once `shipped::prod` is on, check the issue's How to test ([ISSUES.md](ISSUES.md)) on production, its dev URLs swapped for production's. A step is **runnable** when a command, request or scripted browser check performs it and only reads: it creates, sends and pays nothing.

- Every step runnable: run them all. All pass: a comment with each step's output, then close the issue. One fails: Failed check, below.
- Any step manual: the issue stays open for the user, who closes it after checking or reports a failure.

## Going back

Each label says where all of the issue's work is; a move back takes off what stopped being true.

- **Revert on the base**, before a release: `shipped::dev` comes off. The assignee and start date stay.
- **Rollback on production**: `shipped::prod` comes off, and `shipped::dev` too when the revert reached the base; the finish date clears; a closed issue reopens, with a comment saying why.
- **Failed check**, the agent's or the user's: a comment with what failed; both `shipped::` labels come off and the finish date clears. The fix takes the issue through Merged and Shipped again.
- **A bug found after the close**: a new `type::bug` issue linking this one, which stays closed.
- **Paused or blocked**: the issue stays as it is; one blocked by another issue gets a comment naming it.
- **Abandoned**, on the user's word: closed as not planned with a one-line reason, and unassigned; its branch goes as cleanup says.
- **Duplicate**: closed with a link to the issue it repeats.

## Who and when

- **The user** is their tracker account, as the docs or the user name it. A recipe that reads the current user returns the token's owner, often a bot.
- **Start date**: the earliest author date among commits naming the issue, on the base and the work's branch. The base keeps earlier pieces' commits after cleanup removed their branches. The pattern anchors the number as the project writes it, so `#12` misses `#123`:

  ```sh
  git log --format=%as --grep='#12$' origin/<base> <branch> | sort | head -n 1
  ```

- **Finish date**: the day production came.
- **Setting them**: `scripts/issue-dates.sh <issue> <start> <finish>`, from this skill's folder; an empty date clears that one. On GitLab they are the start and due date fields, the due date holding the finish. GitHub issues have no date fields, so the script keeps both in one comment it edits in place.

## Recipes

| Need | GitLab REST | GitHub `gh` |
| --- | --- | --- |
| assign, in place of others | `PUT issues/<iid>` with `assignee_ids[]=<user id>` | `gh issue edit <n> --add-assignee <login> --remove-assignee <others>` |
| unassign | `PUT issues/<iid>` with `assignee_ids=0` | `gh issue edit <n> --remove-assignee <login>` |
| close with a comment | `POST issues/<iid>/notes`, then `PUT issues/<iid>` with `state_event=close` | `gh issue close <n> --comment …`, `--reason "not planned"` when abandoned |
| reopen | `PUT issues/<iid>` with `state_event=reopen` | `gh issue reopen <n> --comment …` |

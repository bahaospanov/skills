# Cleanup

Merged is not shipped: the work is cleaned up once the pipeline holding the merge has passed.

1. Wait for that pipeline. While it runs, or after it failed, the worktree, the branch and the issue stay as they are; a failure goes to the user.
2. Once it passed, without asking:
   - add the issue's How to test ([ISSUES.md](ISSUES.md));
   - remove the worktree and the branch, local and on origin;
   - fast-forward the local base: `git merge --ff-only origin/<base>` where it is checked out, else `git fetch origin <base>:<base>`.

   Then tell the user in one line what was removed. In Claude Code, git-cleanup removes it at the end of the turn and prints that line itself.
3. Leave the issue open for the user to close.

A branch is removed only once it has merged, into the base or through an MR naming it as the source, or when the user says to abandon it.

## Herdr subtask

A subtask is an agent that another agent, its parent, started in a Herdr pane (`HERDR_ENV=1`) with a brief. The brief names the parent; else `herdr agent list` shows it. After step 3, the subtask hands back and closes:

1. Write a report beside the brief, or in the temp dir when the brief came inline; never in the worktree, which cleanup removes. It holds the status (merged, pipeline result, what was removed, what is left for the parent or the user, the subtasks it started that still run and now report to the parent) and the path of the subtask's transcript, where the parent or the user looks up anything the report leaves out. Claude Code keeps it at `~/.claude/projects/<project>/<session-id>.jsonl`; `herdr agent get "$HERDR_PANE_ID"` gives the id under `agent_session`.
2. Send the parent one line pointing at the report. A parent in `blocked` takes typed text as its answer, so wait that out first with `herdr agent wait <parent> --until idle --until done`.

   ```sh
   herdr agent prompt <parent> "<own name>: <status>. Report: <path>"
   ```

3. Hand its own subtasks to the parent: every agent it started that `herdr agent list` still shows. Its name stops resolving once its pane closes, so each one reports to the parent from now on. A subtask in `blocked` takes typed text as its answer, so wait that out first with `herdr agent wait <child> --until idle --until done --until working`.

   ```sh
   herdr agent prompt <child> "<own name> is closing: send your report to <parent> instead."
   ```

4. Close the subtask's pane a minute later, so its last screen stays readable meanwhile. The last pane of a tab closes the tab. With the close-countdown mod, call its `close_pane_later` tool, `note` naming where the report went: the pane counts down above the prompt, where the person keeps it open or closes it now. Without the mod:

   ```sh
   P="$HERDR_PANE_ID" nohup sh -c 'sleep 60; herdr pane close "$P"' >/dev/null 2>&1 &
   ```

Done when `herdr agent read` shows the line in the parent and the handover in every live subtask it started, and the close is scheduled.

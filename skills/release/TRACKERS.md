# Trackers

Reading tickets, finding the MR behind a commit, watching pipelines, keeping the runbook issue, and setting a flag in a CI env file. The repo's own docs win over these recipes.

## Find it

- The repo's docs name the tracker, its API, and where the credentials live.
- Otherwise the remote host: `github.com` → GitHub via `gh`; a GitLab host → its REST API at `<host>/api/v4/projects/<url-encoded path or id>`.
- Keys like `ABC-123` in messages point to an external tracker (Linear, Jira): use its connected MCP server if one exists; otherwise the run goes on without tickets.

Load a token into the environment and pass it in a header; never print it.

## Recipes

| Need | GitLab REST | GitHub `gh` |
| --- | --- | --- |
| issue | `GET issues/<iid>` | `gh issue view <n> --json title,body,state,labels` |
| notes | `GET issues/<iid>/notes?sort=asc&per_page=100`, keep `system == false` | `gh issue view <n> --comments` |
| MRs linked to an issue | `GET issues/<iid>/closed_by`, plus `related_merge_requests` filtered to MRs with an in-range commit | `gh issue view <n> --json closedByPullRequestsReferences` |
| branch protection | `GET protected_branches/<branch>` | `gh api repos/{owner}/{repo}/branches/<branch>/protection` |
| MR behind a commit | `GET repository/commits/<sha>/merge_requests` | `gh api repos/{owner}/{repo}/commits/<sha>/pulls` |
| latest pipeline | `GET pipelines?ref=<branch>&per_page=1` | `gh run list --branch <branch> --limit 1` |
| pipeline jobs | `GET pipelines/<id>/jobs?per_page=100` | `gh run view <id>` |
| user id | `GET users?username=<name>` | the login itself |
| create issue | `POST issues` with `title`, `description`, `assignee_ids[]` | `gh issue create --title … --body-file … --assignee …` |
| edit body | `PUT issues/<iid>` with `description` | `gh issue edit <n> --body-file …` |
| watch a pipeline | `scripts/gitlab-pipeline-watch.sh <id> [seconds]` | `gh run watch <id> --exit-status` |
| tick runbook items | `scripts/issue-tick.sh <iid> <text>…` | same script, through `gh` |
| set a flag in an env File variable | `scripts/gitlab-file-var-line.sh [--add] <variable> <NAME> <value>` | no File variables: `gh variable set <NAME> --body <value>`; a secret is write-only, so the user sets it |

- Run independent GETs in parallel (`xargs -P 8`), writing each response to a scratch file.
- A commit an earlier run rewrote has no MR of its own: the lookup returns `[]`. Take MRs from the issue's linked MRs instead.
- Send long bodies from a file (`--form description=<file` / `--body-file`), never inline in the command.
- The token may belong to a bot: the user's account comes from the docs naming it, or from the user — never from a "current user" call, even one the docs' own recipes make.
- Poll a pipeline at an interval matched to how long the last few took, not a fixed short one.

## Scripts

`scripts/` in this skill's folder, run with `sh`. The GitLab ones take `GITLAB_URL` and `GITLAB_TOKEN` from the environment, and the project from the origin remote unless `GITLAB_PROJECT` names it. A need no script or `gh` command covers gets an inline recipe; a script comes once runs keep needing it.

- **gitlab-pipeline-watch** prints the jobs each time one changes status and exits when the pipeline ends: 0 on success, 1 otherwise, naming the failed jobs. Run it in the background; its exit is the signal.
- **issue-tick** re-reads the body and ticks every open item whose line contains one of the texts. A text matching no open item fails the run and writes nothing.
- **gitlab-file-var-line** changes one `NAME=value` line of a File variable that holds production secrets, without printing the file: it refuses unless the edit touches that line alone, keeps type, protection, masking and scope, reads the value back byte for byte, and deletes its copies. Values show only when they look like a flag (`0/1`, `true/false`, `yes/no`, `on/off`).

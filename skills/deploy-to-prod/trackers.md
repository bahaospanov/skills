# Trackers

Reading tickets, finding the MR behind a commit, watching pipelines, and keeping the runbook issue. The repo's own docs win over these recipes.

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

- Run independent GETs in parallel (`xargs -P 8`), writing each response to a scratch file.
- A commit squashed by an earlier run has no MR of its own: the lookup returns `[]`. Take MRs from the issue's linked MRs instead.
- Send long bodies from a file (`--form description=<file` / `--body-file`), never inline in the command.
- The token may belong to a bot: the user's account comes from the docs naming it, or from the user — never from a "current user" call, even one the docs' own recipes make.
- Poll a pipeline at an interval matched to how long the last few took, not a fixed short one.
- Tick a checklist item by editing the body: re-read it, flip `- [ ]` to `- [x]` on that line only, write it back.

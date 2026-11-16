#!/bin/sh
# usage: issue-dates.sh <issue> <start> <finish>   (YYYY-MM-DD; an empty one clears it)
# env, GitLab only: GITLAB_URL, GITLAB_TOKEN, GITLAB_PROJECT (id or url-encoded path; default: origin's path)
set -eu
n=$1 start=$2 finish=$3
origin=$(git remote get-url origin)

case $origin in
  *github.com[:/]*)
    tag='<!-- issue-dates -->'
    body=$(printf '%s\nStarted: %s · Finished: %s' "$tag" "${start:-–}" "${finish:-–}")
    id=$(gh api --paginate "repos/{owner}/{repo}/issues/$n/comments" \
      --jq ".[] | select(.body | startswith(\"$tag\")) | .id" | head -n 1)
    if [ -n "$id" ]; then
      gh api -X PATCH "repos/{owner}/{repo}/issues/comments/$id" -f body="$body" > /dev/null
    else
      gh issue comment "$n" --body "$body" > /dev/null
    fi
    echo "#$n dates=${start:--}..${finish:--}"
    exit 0 ;;
esac

: "${GITLAB_PROJECT:=$(printf %s "$origin" | sed -E 's#^[a-z+]+://[^/]+/##; s#^[^@/]+@[^:/]+:##; s#\.git$##; s#/#%2F#g')}"
h="PRIVATE-TOKEN: $GITLAB_TOKEN"
# REST has due_date only; the start date is a work item widget, reachable through GraphQL.
gid=$(curl -fsS -H "$h" "$GITLAB_URL/api/v4/projects/$GITLAB_PROJECT/issues/$n" | jq -r .id)
jq -n --arg id "gid://gitlab/WorkItem/$gid" --arg s "$start" --arg d "$finish" \
  'def date: if . == "" then null else . end;
   {query: "mutation($id: WorkItemID!, $s: Date, $d: Date) { workItemUpdate(input: {id: $id, startAndDueDateWidget: {startDate: $s, dueDate: $d}}) { errors } }",
    variables: {id: $id, s: ($s | date), d: ($d | date)}}' \
  | curl -fsS -X POST -H "$h" -H 'Content-Type: application/json' --data @- "$GITLAB_URL/api/graphql" \
  | jq -e '(.errors // []) + (.data.workItemUpdate.errors // []) | length == 0' > /dev/null \
  || { echo "#$n: setting the dates failed" >&2; exit 1; }
echo "#$n dates=${start:--}..${finish:--}"

#!/bin/sh
# usage: issue-close.sh [--keep-open] [--dates <start> <due>] <issue> <note> [label]...
#   --dates sets the start and due dates (YYYY-MM-DD), GitLab only
# env, GitLab only: GITLAB_URL, GITLAB_TOKEN, GITLAB_PROJECT (id or url-encoded path; default: origin's path)
set -eu
keep= start= due=
while :; do
  case ${1:-} in
    --keep-open) keep=1; shift ;;
    --dates) start=$2 due=$3; shift 3 ;;
    *) break ;;
  esac
done
n=$1 note=$2
shift 2
labels=$(IFS=,; echo "$*")
origin=$(git remote get-url origin)

case $origin in
  *github.com[:/]*)
    [ -z "$labels" ] || gh issue edit "$n" --add-label "$labels" > /dev/null
    if [ -n "$keep" ]; then gh issue comment "$n" --body "$note" > /dev/null; else gh issue close "$n" --comment "$note" > /dev/null; fi
    [ -z "$start" ] || echo "dates skipped: GitHub issues have none" >&2
    gh issue view "$n" --json state,labels --jq '"#'"$n"' \(.state) labels=\(.labels | map(.name) | join(","))"'
    exit 0 ;;
esac

: "${GITLAB_PROJECT:=$(printf %s "$origin" | sed -E 's#^[a-z+]+://[^/]+/##; s#^[^@/]+@[^:/]+:##; s#\.git$##; s#/#%2F#g')}"
api="$GITLAB_URL/api/v4/projects/$GITLAB_PROJECT/issues/$n"
h="PRIVATE-TOKEN: $GITLAB_TOKEN"
curl -fsS -X POST -H "$h" --data-urlencode "body=$note" "$api/notes" > /dev/null
if [ -n "$start" ]; then
  # REST has due_date only; the start date is a work item widget, reachable through GraphQL.
  gid=$(curl -fsS -H "$h" "$api" | jq -r .id)
  jq -n --arg id "gid://gitlab/WorkItem/$gid" --arg s "$start" --arg d "$due" \
    '{query: "mutation($id: WorkItemID!, $s: Date, $d: Date) { workItemUpdate(input: {id: $id, startAndDueDateWidget: {startDate: $s, dueDate: $d}}) { errors } }", variables: {id: $id, s: $s, d: $d}}' \
    | curl -fsS -X POST -H "$h" -H 'Content-Type: application/json' --data @- "$GITLAB_URL/api/graphql" \
    | jq -e '(.errors // []) + (.data.workItemUpdate.errors // []) | length == 0' > /dev/null \
    || { echo "#$n: setting the dates failed" >&2; exit 1; }
fi
set -- --data-urlencode "add_labels=$labels"
[ -n "$keep" ] || set -- "$@" --data state_event=close
curl -fsS -X PUT -H "$h" "$@" "$api" | jq -r '"#\(.iid) \(.state) labels=\(.labels | join(",")) dates=\(.start_date // "-")..\(.due_date // "-")"'

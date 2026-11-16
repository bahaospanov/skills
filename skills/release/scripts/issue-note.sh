#!/bin/sh
# usage: issue-note.sh [--dates <start> <finish>] <issue> <note> [label]...
# env, GitLab only: GITLAB_URL, GITLAB_TOKEN, GITLAB_PROJECT (id or url-encoded path; default: origin's path)
set -eu
dates= start= finish=
while :; do
  case ${1:-} in
    --dates) dates=1 start=$2 finish=$3; shift 3 ;;
    *) break ;;
  esac
done
n=$1 note=$2
shift 2
labels=$(IFS=,; echo "$*")
origin=$(git remote get-url origin)
[ -z "$dates" ] || "$(dirname "$0")/../../playbook/scripts/issue-dates.sh" "$n" "$start" "$finish" > /dev/null

case $origin in
  *github.com[:/]*)
    [ -z "$labels" ] || gh issue edit "$n" --add-label "$labels" > /dev/null
    gh issue comment "$n" --body "$note" > /dev/null
    gh issue view "$n" --json state,labels --jq '"#'"$n"' \(.state) labels=\(.labels | map(.name) | join(","))"'
    exit 0 ;;
esac

: "${GITLAB_PROJECT:=$(printf %s "$origin" | sed -E 's#^[a-z+]+://[^/]+/##; s#^[^@/]+@[^:/]+:##; s#\.git$##; s#/#%2F#g')}"
api="$GITLAB_URL/api/v4/projects/$GITLAB_PROJECT/issues/$n"
h="PRIVATE-TOKEN: $GITLAB_TOKEN"
curl -fsS -X POST -H "$h" --data-urlencode "body=$note" "$api/notes" > /dev/null
curl -fsS -X PUT -H "$h" --data-urlencode "add_labels=$labels" "$api" | jq -r '"#\(.iid) \(.state) labels=\(.labels | join(",")) dates=\(.start_date // "-")..\(.due_date // "-")"'

#!/bin/sh
# usage: gitlab-pipeline-watch.sh <pipeline id> [poll seconds, default 20]
# env: GITLAB_URL, GITLAB_TOKEN, GITLAB_PROJECT (id or url-encoded path; default: origin's path)
set -eu
id=$1
every=${2:-20}
: "${GITLAB_PROJECT:=$(git remote get-url origin | sed -E 's#^[a-z+]+://[^/]+/##; s#^[^@/]+@[^:/]+:##; s#\.git$##; s#/#%2F#g')}"
api="$GITLAB_URL/api/v4/projects/$GITLAB_PROJECT/pipelines/$id"
jobs() { curl -fsS -H "PRIVATE-TOKEN: $GITLAB_TOKEN" "$api/jobs?per_page=100"; }
last=
while :; do
  now=$(jobs | jq -r 'sort_by(.name) | map("\(.name)=\(.status)") | join(" ")')
  [ "$now" = "$last" ] || { echo "$(date -u +%H:%M:%S) $now"; last=$now; }
  status=$(curl -fsS -H "PRIVATE-TOKEN: $GITLAB_TOKEN" "$api" | jq -r .status)
  case $status in
    success) echo "pipeline $id: success"; exit 0 ;;
    failed|canceled|skipped)
      echo "pipeline $id: $status"
      jobs | jq -r '.[] | select(.status == "failed") | "failed: \(.name), job \(.id)"'
      exit 1 ;;
  esac
  sleep "$every"
done

#!/bin/sh
# usage: gitlab-issue-images.sh <issue> <section file> <image>...
# env: GITLAB_URL, GITLAB_TOKEN, GITLAB_PROJECT (id or url-encoded path; default: origin's path)
set -eu
n=$1 section=$2
shift 2
: "${GITLAB_PROJECT:=$(git remote get-url origin | sed -E 's#^[a-z+]+://[^/]+/##; s#^[^@/]+@[^:/]+:##; s#\.git$##; s#/#%2F#g')}"
api="$GITLAB_URL/api/v4/projects/$GITLAB_PROJECT"
h="PRIVATE-TOKEN: $GITLAB_TOKEN"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
curl -fsS -H "$h" "$api/issues/$n" | jq -j .description > "$tmp/body"
printf '\n\n%s' "$(cat "$section")" >> "$tmp/body"
for f; do
  printf '\n\n%s' "$(curl -fsS -X POST -H "$h" -F "file=@$f" "$api/uploads" | jq -r .markdown)" >> "$tmp/body"
done
curl -fsS -X PUT -H "$h" --data-urlencode "description@$tmp/body" "$api/issues/$n" | jq -r .web_url

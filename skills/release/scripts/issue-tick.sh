#!/bin/sh
# usage: issue-tick.sh <issue number> <text>...
# env, GitLab only: GITLAB_URL, GITLAB_TOKEN, GITLAB_PROJECT (id or url-encoded path; default: origin's path)
set -eu
n=$1
shift
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
origin=$(git remote get-url origin)
case $origin in
  *github.com[:/]*) host=github ;;
  *)
    host=gitlab
    : "${GITLAB_PROJECT:=$(printf %s "$origin" | sed -E 's#^[a-z+]+://[^/]+/##; s#^[^@/]+@[^:/]+:##; s#\.git$##; s#/#%2F#g')}"
    api="$GITLAB_URL/api/v4/projects/$GITLAB_PROJECT/issues/$n" ;;
esac

if [ $host = github ]; then
  gh issue view "$n" --json body --jq .body > "$tmp/old.md"
else
  curl -fsS -H "PRIVATE-TOKEN: $GITLAB_TOKEN" "$api" | jq -j .description > "$tmp/old.md"
fi

jq -n --rawfile body "$tmp/old.md" '
  def open_item: test("^\\s*[-*] \\[ \\] ");
  $ARGS.positional as $texts
  | ($body | split("\n")) as $lines
  | { missing: [$texts[] | . as $t | select([$lines[] | select(open_item and contains($t))] | length == 0)],
      lines: [$lines[] | . as $l
        | if open_item and any($texts[]; . as $t | $l | contains($t)) then sub("\\[ \\]"; "[x]") else . end] }
' --args "$@" > "$tmp/result.json"

if jq -e '.missing | length > 0' "$tmp/result.json" > /dev/null; then
  jq -r '.missing[] | "no open item contains: \(.)"' "$tmp/result.json" >&2
  exit 1
fi
jq -j '.lines | join("\n")' "$tmp/result.json" > "$tmp/new.md"

if [ $host = github ]; then
  gh issue edit "$n" --body-file "$tmp/new.md" > /dev/null
else
  jq -n --rawfile d "$tmp/new.md" '{description: $d}' > "$tmp/req.json"
  curl -fsS -X PUT -H "PRIVATE-TOKEN: $GITLAB_TOKEN" -H 'Content-Type: application/json' --data @"$tmp/req.json" "$api" > /dev/null
fi

diff "$tmp/old.md" "$tmp/new.md" | sed -n 's/^> /ticked: /p'
echo "open items left: $(grep -cE '^[[:space:]]*[-*] \[ \] ' "$tmp/new.md" || true)"

#!/bin/sh
# usage: gitlab-file-var-line.sh [--add] <variable key> <NAME> <value>
#   --add appends the line when the file has no NAME= line yet
# env: GITLAB_URL, GITLAB_TOKEN, GITLAB_PROJECT (default: origin's path), GITLAB_VAR_SCOPE (default *)
set -eu
add=
if [ "${1:-}" = --add ]; then add=1; shift; fi
key=$1 name=$2 value=$3
case $value in *"
"*) echo "the value holds a newline" >&2; exit 2 ;; esac
scope=${GITLAB_VAR_SCOPE:-*}
: "${GITLAB_PROJECT:=$(git remote get-url origin | sed -E 's#^[a-z+]+://[^/]+/##; s#^[^@/]+@[^:/]+:##; s#\.git$##; s#/#%2F#g')}"
url="$GITLAB_URL/api/v4/projects/$GITLAB_PROJECT/variables/$key"
umask 077
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
get() { curl -fsS -G -H "PRIVATE-TOKEN: $GITLAB_TOKEN" --data-urlencode "filter[environment_scope]=$scope" "$url"; }
shown='if test("^(0|1|true|false|yes|no|on|off)?$"; "i") then . else "<hidden>" end'

get > "$tmp/old.json"
jq -e '.variable_type == "file" and .value != null' "$tmp/old.json" > /dev/null \
  || { echo "$key: not a File variable whose value can be read" >&2; exit 1; }
jq -j .value "$tmp/old.json" > "$tmp/old.txt"
count=$(jq -r --arg p "$name=" '.value | split("\n") | map(select(startswith($p))) | length' "$tmp/old.json")
case $count in
  1) ;;
  0) [ -n "$add" ] || { echo "$key has no $name= line; rerun with --add to append it" >&2; exit 1; } ;;
  *) echo "$key has $count $name= lines; fix it by hand" >&2; exit 1 ;;
esac
old=$(jq -r --arg p "$name=" ".value | split(\"\n\") | map(select(startswith(\$p)))[0] // \"(absent)\" | ltrimstr(\$p) | if . == \"(absent)\" then . else $shown end" "$tmp/old.json")
new=$(jq -rn --arg v "$value" "\$v | $shown")

jq -j --arg p "$name=" --arg l "$name=$value" '
  .value | split("\n")
  | if any(.[]; startswith($p)) then map(if startswith($p) then $l else . end)
    elif .[-1] == "" then .[:-1] + [$l, ""]
    else . + [$l] end
  | join("\n")' "$tmp/old.json" > "$tmp/new.txt"
if cmp -s "$tmp/old.txt" "$tmp/new.txt"; then
  echo "$key: $name is already $new; nothing written"
  exit 0
fi
jq -en --rawfile o "$tmp/old.txt" --rawfile w "$tmp/new.txt" --arg p "$name=" --arg l "$name=$value" '
  def rest: split("\n") | map(select(startswith($p) | not));
  ($o | rest) == ($w | rest) and [$w | split("\n")[] | select(startswith($p))] == [$l]' > /dev/null \
  || { echo "$key: the edit would touch more than the $name line; nothing written" >&2; exit 1; }

attrs=$(jq -r '"protected=\(.protected)&masked=\(.masked)&raw=\(.raw // false)"' "$tmp/old.json")
curl -fsS -X PUT -H "PRIVATE-TOKEN: $GITLAB_TOKEN" --data-urlencode "value@$tmp/new.txt" \
  --data "variable_type=file&$attrs" --data-urlencode "filter[environment_scope]=$scope" "$url" > /dev/null

get > "$tmp/check.json"
jq -j .value "$tmp/check.json" > "$tmp/check.txt"
cmp -s "$tmp/check.txt" "$tmp/new.txt" || { echo "$key: read-back differs from the intended file" >&2; exit 1; }
jq -e --slurpfile o "$tmp/old.json" '
  def a: [.variable_type, .protected, .masked, .raw, .environment_scope];
  a == ($o[0] | a)' "$tmp/check.json" > /dev/null \
  || { echo "$key: attributes changed on write" >&2; exit 1; }
echo "$key: $name $old -> $new; one line changed, attributes kept, read back identical"

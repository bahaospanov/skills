#!/bin/sh
# usage: next-version.sh <shipped tip>  -> "<previous tag or none> <next version>"
set -eu
tip=$1
prev=$(git describe --tags --abbrev=0 --match 'v[0-9]*.[0-9]*.[0-9]*' "$tip" 2>/dev/null || true)
if [ -z "$prev" ]; then
  echo "none v1.0.0"
  exit 0
fi
subjects=$(git log --no-merges --format=%s "$prev..$tip")
[ -n "$subjects" ] || { echo "nothing shipped since $prev" >&2; exit 1; }
IFS=. read -r major minor patch <<EOF
${prev#v}
EOF
if printf '%s\n' "$subjects" | grep -qE '^[a-z]+(\([^)]*\))?!:' || git log --no-merges --format=%b "$prev..$tip" | grep -qE '^BREAKING[ -]CHANGE:'; then
  next="v$((major + 1)).0.0"
elif printf '%s\n' "$subjects" | grep -qE '^feat(\([^)]*\))?:'; then
  next="v$major.$((minor + 1)).0"
else
  next="v$major.$minor.$((patch + 1))"
fi
echo "$prev $next"

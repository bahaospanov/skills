#!/usr/bin/env bash
set -euo pipefail

# Adapted from mattpocock/skills scripts/link-skills.sh (MIT).
# Use this or the bahaospanov-skills plugin, not both: each skill would load twice.
# Beside the plugin, --in-progress links only skills/in-progress, which the plugin leaves out.

# An exported CDPATH makes cd print the directory, doubling it in REPO.
REPO="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
DESTS=("$HOME/.claude/skills" "$HOME/.agents/skills")

ROOT="$REPO/skills"
if [ "${1:-}" = "--in-progress" ]; then
  ROOT="$REPO/skills/in-progress"
fi

names=()
srcs=()
while IFS= read -r -d '' skill_md; do
  src="$(dirname "$skill_md")"
  names+=("$(basename "$src")")
  srcs+=("$src")
done < <(find "$ROOT" -name SKILL.md -not -path '*/node_modules/*' -print0)

for DEST in "${DESTS[@]}"; do
  # A destination that is itself a symlink into this repo would make the
  # per-skill links land inside the repo's own skills/ tree.
  if [ -L "$DEST" ]; then
    resolved="$(readlink -f "$DEST")"
    case "$resolved" in
      "$REPO"|"$REPO"/*)
        echo "error: $DEST is a symlink into this repo ($resolved)." >&2
        echo "Remove it (rm \"$DEST\") and re-run; the script recreates it as a real dir." >&2
        exit 1
        ;;
    esac
  fi

  mkdir -p "$DEST"

  for i in "${!names[@]}"; do
    name="${names[$i]}"
    src="${srcs[$i]}"
    target="$DEST/$name"

    if [ -e "$target" ] && [ ! -L "$target" ]; then
      rm -rf "$target"
    fi

    ln -sfn "$src" "$target"
    echo "linked $name -> $src ($DEST)"
  done
done

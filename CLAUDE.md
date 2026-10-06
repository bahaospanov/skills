# bahaospanov/skills

Two kinds of plugin share this repo and its marketplace (`.claude-plugin/marketplace.json`):

- **mods**: a folder each (`git-gates/`, `lean-docs/`, …) with its own `.claude-plugin/plugin.json`. Building and checking them: README, "Develop" and "Check".
- **skills**: `skills/<name>/`, shipped together as one plugin, `bahaospanov-skills`, whose manifest is the root `.claude-plugin/plugin.json`.

## Skills

- A skill folder holds `SKILL.md`, reference files named in UPPERCASE (`REWRITE.md`), and `agents/openai.yaml` (Codex picker metadata).
- Invocation, kept the same in Claude Code and Codex: [.agents/invocation.md](.agents/invocation.md).
- Every skill is listed in the root manifest and in the README under **User-invoked** or **Model-invoked**, its name linked to its SKILL file. Run `claude plugin validate .` after touching a manifest; its one warning, that this CLAUDE.md is not plugin context, is expected.
- `scripts/link-skills.sh` symlinks every skill into `~/.claude/skills` and `~/.agents/skills` for local work. Use it or the plugin, not both.

## Releasing

Every plugin shares one version, lockstep, managed by changesets.

- Every change ships with a changeset: `.changeset/<slug>.md`, frontmatter `"bahaospanov": patch | minor | major`, then one line per plugin it touches (`- **git-gates**: …`). Write the file directly; `npx changeset` asks interactively.
- "Release" means: `npm run version` (bumps, writes `CHANGELOG.md`, syncs every manifest), commit `chore: release vX.Y.Z`, push straight to `main` (no PR), `git tag -a vX.Y.Z -m vX.Y.Z`, push the tag, then `gh release create vX.Y.Z --title vX.Y.Z` with that version's `CHANGELOG.md` section as notes.
- `<name>--vX` tags and releases are from before 1.0.0, history only.

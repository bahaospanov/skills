# bahaospanov/skills

Two kinds of plugin share this repo and its marketplace (`.claude-plugin/marketplace.json`):

- **mods**: a folder each (`git-gates/`, `lean-docs/`, …) with its own `.claude-plugin/plugin.json` and version. Building and checking them: README, "Develop" and "Check".
- **skills**: `skills/<name>/`, shipped together as one plugin, `bahaospanov-skills`, whose manifest is the root `.claude-plugin/plugin.json`.

## Skills

- A skill folder holds `SKILL.md`, reference files named in UPPERCASE (`REWRITE.md`), and `agents/openai.yaml` (Codex picker metadata).
- Invocation, kept the same in Claude Code and Codex: [.agents/invocation.md](.agents/invocation.md).
- Every skill is listed in the root manifest and in the README under **User-invoked** or **Model-invoked**, its name linked to its SKILL file. Run `claude plugin validate .claude-plugin/plugin.json --strict` after touching a manifest.
- `scripts/link-skills.sh` symlinks every skill into `~/.claude/skills` and `~/.agents/skills` for local work. Use it or the plugin, not both.

## Releasing

"Release" means commit, push straight to `main` (no PR), tag, and a GitHub release.

- Skills: bump the root manifest's version, then `claude plugin tag . -m "bahaospanov-skills %s" --push` and `gh release create bahaospanov-skills--v<ver> --title "bahaospanov-skills v<ver>"`, the notes naming the skills that changed.
- A mod: bump its manifest's version, then `claude plugin tag ./<mod> -m "<mod> %s" --push` and `gh release create <mod>--v<ver> --title "<mod> v<ver>"`.

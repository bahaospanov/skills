# Model-invoked vs user-invoked

Adapted from [mattpocock/skills](https://github.com/mattpocock/skills/blob/main/.agents/invocation.md) (MIT).

Every `SKILL.md` under `skills/` is a skill. The axis that splits them is **invocation**, who can reach it:

- **User-invoked**: reachable only by the human typing its name. Set `disable-model-invocation: true` in the frontmatter (Claude Code) and `policy.allow_implicit_invocation: false` in `agents/openai.yaml` (Codex). The `description` is human-facing: a one-line summary for someone browsing slash commands, no trigger lists.
- **Model-invoked**: reachable by model or user. Omit both settings. The `description` is model-facing and carries the trigger phrasing ("Use when the user wants…") that lets the model fire it. The test: could the model usefully reach for this on its own?

Every skill carries `agents/openai.yaml` beside its `SKILL.md`: `interface.display_name` and `interface.short_description` for the Codex skill picker, plus the `policy` block for user-invoked skills. A skill is user-invoked in both harnesses or in neither.

The top-level `README.md` groups skills into **User-invoked** and **Model-invoked**.

## Dependencies between skills

A skill that needs another one says so as an instruction to call the Skill tool with its name (`Call the Skill tool with "grilling"`), not a `../other-skill/FILE.md` link and not a bare `/name` mention. One skill per call: a step needing two says "call the Skill tool twice".

Only a model-invoked skill can be reached that way. When a step needs a user-invoked skill, tell the user to run `/<name>`.

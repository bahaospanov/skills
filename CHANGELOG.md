# bahaospanov

## 1.0.0

### Major Changes

- One version for every plugin in this repo: git-gates, git-cleanup, lean-docs, lean-comments, lean-scripts and the bahaospanov-skills bundle all move to 1.0.0 together, with one `vX.Y.Z` tag and one GitHub release per release. The per-plugin `<name>--vX` releases before this one stay as history.

  - **bahaospanov-skills**: new skill **deploy-to-prod** (user-invoked). It promotes what the integration branch holds to production: squashes the commits that finished one issue's work in several tries, cuts the range into waves around contract migrations and one-time scripts, shows a plan with each wave's manual steps, migration risks, scripts' dev status and open questions, then rewrites the source branch tree-identically, force-pushes behind a backup tag and a lease, and ships wave by wave from a runbook issue. Every skill now carries `agents/openai.yaml` for Codex.
  - **lean-docs**: files in a skill folder (one holding `SKILL.md`) skip every doc check.

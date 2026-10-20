# Story

Why the mods in this repo exist, the tests a rule passes before it becomes one, and the incident behind each rule.

## How it got here

1. **Text rules failed.** The agent committed before the user said so. No CLAUDE.md line, memory or instruction stopped it; a hook in `~/.claude/settings.json` did.
2. **Hooks became mods.** On 2026-09-16 the settings hooks moved into mods, which carry code, tests and a version. The prompt hooks reviewing docs, scripts and commit bodies went into lean-repo verbatim, the consent guard into git-gates, and lean-comments was added. The same day they were regrouped, one mod per purpose.
3. **Mods grew.** Each new failure got a check: a push to a branch that had landed (09-21), commits that broke the project in between (10-01), cleanup before the pipeline passed (10-05). On 2026-10-15 a teammate's branches and MRs brought the tidy half: one commit per change, one feature per MR, fresh base, issue-first.
4. **Rules reached a team.** Rules made on personal projects now bind everyone in a project that enables the mods, and not all of them are seasoned programmers. git-gates' purpose, "Git work is authorized and tidy", holds two kinds of rule: authorized protects the person running the agent, tidy is project policy.
5. **Rules began moving back to text.** 1.15.0 turned a missing issue reference from a block into a note. 1.16.0 moved the MR description format out of git-gates into the mr-style skill.
6. **The playbook took the text.** On 2026-10-20 the workflow's rules, from issue to cleanup, went into one skill, the playbook, which a project adopts and feeds its own facts. mr-style folded into it, the mods began pointing to its parts, and each rule kept one home: the issue number, checked by both git-gates and issue-first, moved into issue-first alone.
7. **git-gates split in two.** The same day consent stayed in git-gates, for each person to install, and the team's checks moved to git-tidy, for a project to enable.

## The tests

### Mods guarantee, docs guide

A rule earns a mod only when both hold:

- the agent was seen breaking it while it existed only as text;
- a break is costly, or hard to see in time: an unauthorized commit, push or merge; an AI trailer in permanent history.

Every other rule is guidance. Its text lives in the playbook, or in the project's docs when it is that project's alone, where people and agents read it, and a mod may only point to it and coach.

### Operator or project

| | Operator rule | Project rule |
| --- | --- | --- |
| Protects | the person running the agent, and their control over it | shared code, history, the tracker |
| Examples | commit, push or merge only on my word | Conventional Commits, issue refs, every commit works |
| Lives in | a user-scope plugin each person installs | the playbook and the project's facts, plus a project-scope plugin that checks them |

### Signs a rule is guidance

- it hardcodes one project's facts: paths, labels, branch names, examples;
- it repeats text a doc already holds;
- it is a model judgment that raises false alarms;
- it was written after one incident and records no reason.

### Where each kind of thing lives

| Kind | Home |
| --- | --- |
| Workflow rules: issues, branches, commits, MRs, cleanup | the playbook skill, which a project adopts |
| A project's facts and deviations (base branch, issue number format, tracker) | the project repo's agent docs, changed through an MR |
| Rules a tool can check | a plugin, its refusals naming the playbook part that holds the rule |
| How Claude works with its user | the user's `~/.claude/CLAUDE.md` |
| Private facts (hosts, where tokens live) | memory |
| Short-lived state | the issue tracker |

Every rule lives where people can read it and see what it is for; memory holds only private facts.

### Enforcing for a team

- A code check may deny.
- A model judgment advises, or asks with an escape phrase that shows in the transcript.
- Every block names the rule, its reason and the fix, and points to the playbook part holding the rule.
- Each rule is checked in one mod only.
- Project facts come from the project's docs or a small config, with defaults that work anywhere.
- A rule works the moment a project enables its plugin, with no CI; CI may double-check later. Work done outside Claude Code goes unchecked, an accepted gap.

## Adding a rule

1. Name the incident: date, project, what broke, and the text rule it broke. With none, write the rule in the playbook, or in the project's docs when it is that project's alone, and stop.
2. Pick its kind, operator or project, and with it the plugin.
3. Check it in code when code can decide; a model judgment only advises or asks.
4. Head the check's module with the incident, as `git-gates/hooks/landed-branch.ts` does, and add its row to the ledger.

The rule is done when its module and its ledger row name the same incident. Changing a rule's effect, or removing it, updates its row in the same commit, with the reason.

## Ledger

Kind: **op** operator, **proj** project. Effect: **deny**; **hold**, the agent asks the user and any answer lets it through; **note**; **follow-up**, an end-of-turn prompt; **allow**; **skip**, the mod's checks stay out. An origin that is only a commit records no reason.

### git-gates

| Rule | Kind | Check | Effect | Origin |
| --- | --- | --- | --- | --- |
| Commit and push need the user's word in the current turn | op | code | deny | Before this repo: the agent committed before the user said so, and only a settings hook stopped it. Moved 2026-09-16, c488005 |
| Merge needs "merge" | op | code | deny | c488005. Its refusal gives the reason: merging is a deploy with no approval gate |
| Opening an MR needs pr, mr, pull request, merge request or ship | op | code | deny | 2026-10-20: opening one is outward-facing, yet needed no word; found in an audit |
| A push needs a word other than "commit" | op | code | deny | 2026-10-20, the user's call |
| A negated word ("don't push") counts as no | op | code | deny | 2026-10-20: "don't commit" counted as consent; found in an audit |
| git's own options (`git -C dir`) do not hide a commit or push | op | code | deny | 2026-10-20: `git -C` slipped past every check; found in an audit |
| A failed consent check blocks | op | code | deny | c488005 |
| Grants: a commit per task, asked once | op | regex | allow | c488005 |
| Consent outlives follow-ups, task reports and messages typed mid-turn | op | code | allow | 65a287a, ee5d625, 3a9bda1: each a denial after the user had said yes |
| A protected branch is named to be pushed to | op | code | deny | c488005 |

### git-tidy

Split from git-gates on 2026-10-20; the origins are from git-gates' history.

| Rule | Kind | Check | Effect | Origin |
| --- | --- | --- | --- | --- |
| No push to a branch that already landed | proj | code | deny | 2026-09-21: a follow-up pushed minutes after its MR merged recreated the deleted branch, outside any MR, looking shipped |
| Fresh base before opening an MR | proj | code | deny | dfd41df |
| Conventional Commits subject | proj | code | deny | c488005 |
| No reviewer pre-answers ("no X changed") | proj | regex | note | c488005 as a deny; a note since 2026-10-20: real causes match the pattern and there was no way past it |
| No Claude credit: Co-Authored-By trailer, "Generated with" line | proj | code | deny | a0ab38c |
| A body only for a subtle cause | proj | Haiku | note | The settings prompt hook, moved verbatim 2026-09-16, 4da7656. A note since 2026-10-20: someone new to the rules cannot argue with a model's block |
| Every commit works | proj | Sonnet | deny | 2026-10-01, a team project: the API dropped endpoints one commit before the admin stopped calling them |
| One commit per change | proj | code, Sonnet | hold | 2026-10-15, a team project: a teammate's branches grew a commit per fix. A contract change and its match in another app count as one since 2026-10-20: vertical commits, the user's call |
| One feature per MR | proj | code, Sonnet | hold | 2026-10-15, a team project: a teammate's MRs carried several features, often in one commit |

### git-cleanup

| Rule | Kind | Check | Effect | Origin |
| --- | --- | --- | --- | --- |
| Removing a branch needs it merged | op | code | deny | bb1060d. A worktree's removal is not held since 2026-10-20: it keeps the branch |
| Cleanup and issue edits wait for the pipeline | op | code | deny | 2026-10-05: right after an MR merged, the agent removed its worktree and branch and ticked the issue while the deploy pipeline still ran. A GitLab pipeline parked at manual or skipped holds nothing back since 2026-10-20: it never finishes, so it held cleanup forever. A squash merge waits for the pipeline holding its new commit since 2026-10-20: it used to skip the check |
| Closing an issue is left to the user | op | — | skip | 05cb416. Since 2026-10-20 the release skill leaves issues open too: the user's call |
| Merged, clean work gets removed | op | code | follow-up | 2026-10-05: a merged, checked branch kept its worktree and branches, and nothing came back for them |
| A local base behind origin is fast-forwarded | op | code | follow-up | e229dab |

### issue-first

| Rule | Kind | Check | Effect | Origin |
| --- | --- | --- | --- | --- |
| A `feat` commit names an issue, at the end of its subject or in its branch | proj | code | deny | 8dc0eee. A version in the branch (`feat/react-19`) counts as none since 2026-10-20: it waived the check |
| The subject ends with the issue the user or the branch named | proj | code | note | 53e9700 in git-gates as a deny; a note since 1a7fd74; moved to issue-first 2026-10-20 so one mod holds the issue number |

### lean-docs

| Rule | Kind | Check | Effect | Origin |
| --- | --- | --- | --- | --- |
| Will anyone read it again? | proj | Haiku | note | The settings prompt hook, moved verbatim 2026-09-16, 4da7656 |
| A doc line does not restate code | proj | code | note | 18129c5 as a deny; a note since 2026-10-20: it blocked legitimate writes, a glossary mapping, an agent-doc line and a table row in this file |
| A turn adds little prose | proj | code | follow-up | 18129c5 |
| Skill folders | — | — | skip | b63fe7b: a skill is read again on every use |
| Changesets | — | — | skip | 3966435: docs-review flagged every one, and `changeset version` deletes them |

### lean-comments

| Rule | Kind | Check | Effect | Origin |
| --- | --- | --- | --- | --- |
| At most 3 comment lines per edit, no comment-heavy region | proj | code | note | 06830d8. The region counts only when the edit adds comments since 2026-10-20: it fired on every edit near old comments |
| At most 3 new comment lines per file per turn | proj | code | follow-up | 06830d8 |
| Installed skills and plugins | — | — | skip | 6c17732: someone else's code |

### lean-scripts

| Rule | Kind | Check | Effect | Origin |
| --- | --- | --- | --- | --- |
| Could it be typed again on the spot? | proj | Haiku | note | The settings prompt hook, moved verbatim 2026-09-16, 4da7656 |
| Application modules | — | — | skip | 2026-10-20: a script is a shell file, a file in a scripts, bin, tools or ops folder, or a shebang file; the `src/`/`app/` guess fit one layout |

### Every lean mod

| Rule | Kind | Check | Effect | Origin |
| --- | --- | --- | --- | --- |
| Ignored files, folders under a `.lean-skip` | — | — | skip | 160d3aa. The end-of-turn checks honour `.lean-skip` too since 2026-10-20 |

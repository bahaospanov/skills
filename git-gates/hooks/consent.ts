import type { Verb } from './shared/git-commands'

const word = (alternatives: string) => new RegExp(String.raw`(^|[^\p{L}])(${alternatives})(?=[^\p{L}]|$)`, 'giu')
const AUTH = word('commit|push|ship|deploy|merge|pr|mr|tag|release')
const PUSH_AUTH = word('push|ship|deploy|pr|mr|tag|release')
// "merge request" names the thing to open, not the act of merging it.
const MERGE_AUTH = word(String.raw`merge(?!\s+requests?)|merging`)
const OPEN_AUTH = word(String.raw`pr|mr|ship|pull\s+requests?|merge\s+requests?`)
const VERB_WORDS: Record<Verb, RegExp> = { commit: word('commit'), push: word('push'), merge: MERGE_AUTH }
// A keyword at most two words after one of these, in the same clause, is the user saying no.
const NEGATED = /(^|[^\p{L}'])(don't|dont|do not|doesn't|never|no|not|without|stop|avoid)(\s+[^\s.,;!?]+){0,2}\s+$/iu
const CLAUSE = /[.,;!?\n]/g

const mentions = (text: string, words: RegExp): boolean[] => {
  const plain = text.replace(/[’‘]/g, "'")
  return [...plain.matchAll(words)].map((m) => {
    const start = (m.index ?? 0) + (m[1]?.length ?? 0)
    const before = plain.slice(0, start)
    const clause = before.slice(Math.max(0, ...[...before.matchAll(CLAUSE)].map((c) => (c.index ?? 0) + 1)))
    return !NEGATED.test(clause)
  })
}

const says = (text: string, words: RegExp) => mentions(text, words).some(Boolean)

export const GRANT_DEFAULT_USES = 5
export const GRANT_SESSION_USES = 10

const COUNTS = [
  /.*[Cc]ommits?\s*[xX*]\s*([0-9]+)/u,
  /.*[^0-9]([0-9]+)\s+(?:separate\s+)?[Cc]ommits/u,
]
const SESSION_WIDE = /(rest of (the |this )?session|until I (say|tell)|keep committing)/iu
const PER_TASK =
  /(auto-?commit|commit (after|between|per|each|every|as you go|along the way)|(after|between) each (task|step|part|item|fix)[^.]{0,40}commit|one commit per|separate commits|commit them separately)/iu

export const authorizes = (text: string) => says(text, AUTH)

export const authorizesPush = (text: string) => says(text, PUSH_AUTH)

export const authorizesMerge = (text: string) => says(text, MERGE_AUTH)

export const authorizesOpening = (text: string) => says(text, OPEN_AUTH)

// "commit, don't push": an explicit no to this very act wins over other keywords, unless the turn also says yes to it.
export const forbids = (typed: string[], verb: Verb) => {
  const said = typed.flatMap((text) => mentions(text, VERB_WORDS[verb]))
  return said.includes(false) && !said.includes(true)
}

export const grantRequest = (text: string): number | undefined => {
  const flat = text.replace(/\n/g, ' ')
  const counted = COUNTS.map((pattern) => flat.match(pattern)?.[1]).find((n) => n !== undefined)
  if (counted !== undefined && Number(counted) > 0) return Number(counted)
  if (SESSION_WIDE.test(flat)) return GRANT_SESSION_USES
  if (PER_TASK.test(flat)) return GRANT_DEFAULT_USES
  return undefined
}

export const protectedHit = (targets: string[], policy: string[]) =>
  targets.map((target) => policy.find((branch) => target === '*' || target === branch)).find((hit) => hit !== undefined)

// A bare "push" does not count: the branch itself must be named near a shipping verb.
export const namesBranch = (text: string, branch: string) => {
  const escaped = branch.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  return new RegExp(
    `(push|ship|deploy|merge)[^.!?]{0,40}(^|[^a-z0-9_/-])${escaped}([^a-z0-9_/-]|$)`,
    'imu',
  ).test(text)
}

export const noUserMessage = () => 'git-gates: no user message found in this session; blocking'

export const pushRefused = (command: string) => `git-gates: blocking '${command}' — "commit" authorizes the commit, not a push.
A push needs push, ship, deploy, pr, mr, tag or release in the current turn.
Stop at the commit, say the branch is ready, and let the user say when to push.`

export const forbiddenRefused = (command: string, verb: Verb) => `git-gates: blocking '${command}' — the user said not to ${verb} in this turn.
Other keywords in the message do not override that. Stop here, say what is
ready, and let the user tell you when to ${verb}.`

export const openRefused = (command: string) => `git-gates: blocking '${command}' — opening a merge request needs the user to ask for one:
"pr", "mr", "pull request", "merge request" or "ship" in the current turn.
"push" and "commit" authorize the branch, not a request others are notified
of. Push if that was asked, report that the branch is ready, and let the user
say when to open it.`

export const deletionNote = (branches: string[]) =>
  `git-gates: deleting ${branches.map((b) => `'${b}'`).join(', ')} — a branch delete needs no keyword`

export const mergeRefused = (command: string) => `git-gates: blocking '${command}' — merging needs the user to say "merge" in
their most recent message. "ship", "push", "commit", "deploy" and "pr" do NOT
authorize it: they authorize landing work on the BRANCH, and the user expects
to press merge themselves.

Merging into an integration branch is a deploy with no approval gate behind
it. Stop at the push, report the MR state, and let the user merge.

A tool call that a permission layer happens to let through is not the user
authorizing it. If an earlier call was blocked and a later identical one is
not, that is the sandbox changing its mind, not consent.`

export const pushUndetermined = (command: string, policy: string[]) => `git-gates: cannot determine the destination branch of '${command}', and this
repo protects branches (${policy.join(' ')}). Re-run with an explicit
refspec so the destination is unambiguous, e.g.
  git push origin <branch>`

export const protectedPushRefused = (command: string, branch: string) => `git-gates: blocking '${command}' — '${branch}' is a protected branch in this
repo (.claude/push-policy.json) and the user's most recent message does not
name it. A bare "push" authorizes pushing a feature branch, not a direct push
to an integration branch: that bypasses the PR flow.

Default path — push the feature branch and open a PR:
  git push -u origin <feature-branch>
  gh pr create --base ${branch}

If a direct push is genuinely wanted, the user must say so by name, e.g.
"push to ${branch}". Ask them; do not paraphrase your way around this.`

export const noKeyword = (command: string, grantTool: string) => `git-gates: blocking '${command}' — the most recent user message does not
contain an authorizing keyword (commit/push/ship/deploy/merge/pr/mr/tag/
release) and no standing commit grant covers this call. Do NOT commit or push
without explicit instruction in the current turn. Stop, state what is ready,
and wait for the user to authorize.

If the user already authorized repeated commits earlier in this session (e.g.
a multi-task run or a goal-scoped skill), pre-authorize with the ${grantTool}
tool. That covers \`git commit\` only — \`git push\` always needs a keyword in
the current message.`

export const grantRefused = (lookback: number) => `git-gates: refusing to grant — no authorizing keyword
(commit/push/ship/deploy/merge/pr/mr/tag/release) in the last ${lookback} user
messages. A grant widens an authorization the user gave; it cannot create one.
Ask the user to authorize committing, then retry.`

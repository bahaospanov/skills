import type { EngineInterface, Register } from 'claude-code'
import { aiAttributionViolations, commitMessageViolations, invokesCommit, messageFrom, preAnswers, runsGitCommit } from './commit-message'
import { acknowledgesStaleBase, FETCH_TIMEOUT_MS, staleBaseRefused } from './fresh-base'
import { COMMIT_MESSAGE } from './prompts'
import { commandDir, currentTurn, defaultBranchOf, mrOpeningOf, type MrOpening } from './shared/git-commands'
import { CONTINUATION_ORIGINS, CONTINUATION_PLUGINS } from './shared/continuations'
import { MODEL, promptFor, SYSTEM, verdictOf, type Review, type Verdict as ReviewVerdict } from './shared/verdict'

const HUMAN_ORIGINS: readonly string[] = ['composer', 'bridge', 'sdk']
const COMMIT_REVIEW: Review = { name: 'commit message review', prompt: COMMIT_MESSAGE, status: 'judging message' }
const LOOKBACK = 30

type Prompt = { text: string; human: boolean; turnId?: string | undefined }

let prompts: Prompt[] = []

// Transcript rows carry no origin, so the engine's own user-role rows are told apart by their markup.
const ENGINE_ROW = /<task-notification>|<local-command-(caveat|stdout|stderr)>/
const REMINDER = /<system-reminder>[\s\S]*?<\/system-reminder>/g

// Tracked prompts are exact; after a reload or resume the transcript stands in, minus the engine's rows.
const recentPrompts = async ($: EngineInterface, count: number): Promise<Prompt[]> => {
  if (prompts.length > 0) return prompts.slice(-count)
  const messages = await $.session.messages()
  return messages
    .filter((m) => m.role === 'user' && !m.toolResults?.length && !ENGINE_ROW.test(m.text))
    .map((m) => ({ text: m.text.replace(REMINDER, '').trim(), human: true }))
    .filter((p) => p.text !== '')
    .slice(-count)
}

// What the user typed in the current turn: its opening prompt plus anything typed while it ran.
const typedThisTurn = async ($: EngineInterface) => {
  const turn = currentTurn(await recentPrompts($, LOOKBACK))
  return turn.length === 0 ? undefined : turn.filter((p) => p.human).map((p) => p.text)
}

const git = async ($: EngineInterface, args: string[], cwd?: string) => {
  const run = await $.process.run(['git', ...args], cwd === undefined ? undefined : { cwd })
  return run.exitCode === 0 ? run.stdout.trim() : undefined
}

// The loader only admits literal $.env.get names; HOME is all a `cd ~/…` needs.
const repoOf = async ($: EngineInterface, command: string) => {
  const dir = commandDir(command)
  return dir?.startsWith('~') ? `${await $.env.get('HOME')}${dir.slice(1)}` : dir
}

const currentBranch = async ($: EngineInterface, cwd?: string) => {
  const branch = await git($, ['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
  return branch && branch !== 'HEAD' ? branch : undefined
}

// `git()` swallows a non-zero exit, and that exit is the answer here.
const isAncestor = async ($: EngineInterface, commit: string, of: string, cwd?: string) => {
  const run = await $.process.run(['git', 'merge-base', '--is-ancestor', commit, of], cwd === undefined ? undefined : { cwd })
  return run.exitCode === 0
}

// Origin's copy of the source is what the MR shows; a branch not pushed yet falls back to the local one.
const staleBase = async ($: EngineInterface, command: string, opening: MrOpening) => {
  const cwd = await repoOf($, command)
  const target = opening.target ?? defaultBranchOf(await git($, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], cwd))
  const source = opening.source ?? (await currentBranch($, cwd))
  if (target === undefined || source === undefined) return undefined
  await $.process
    .run(['git', 'fetch', '--quiet', 'origin', target], { ...(cwd === undefined ? {} : { cwd }), timeoutMs: FETCH_TIMEOUT_MS })
    .catch(() => undefined)
  const base = await git($, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${target}`], cwd)
  const head =
    (await git($, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${source}`], cwd)) ??
    (await git($, ['rev-parse', '--verify', '--quiet', `refs/heads/${source}`], cwd))
  if (base === undefined || head === undefined || (await isAncestor($, base, head, cwd))) return undefined
  return { source, target }
}

// The loader follows $ only into functions of this file, so the model call lives here, not in shared/verdict.ts.
const judge = async ($: EngineInterface, review: Review, input: object): Promise<ReviewVerdict | undefined> => {
  $.ui.status(review.status)
  try {
    const result = await $.model.complete({ model: MODEL, system: SYSTEM, prompt: promptFor(review, input) })
    const reply = result.isAnswered ? result.text : `(${result.reason})`
    const verdict = verdictOf(reply)
    if (verdict === undefined) $.ui.log(`git-tidy (${review.name}): no verdict: ${reply.slice(0, 120)}`)
    return verdict
  } finally {
    $.ui.status(undefined)
  }
}

const relayed = (advice: string) =>
  `${advice}\nThe commit ran. Tell the user this as a recommendation; amend it only if they ask. The playbook skill's COMMITS.md has the rule.`

export const register: Register = (on) => {
  on('prompt.submit', ($, e, next) => {
    if (e.origin.kind === 'plugin' && CONTINUATION_PLUGINS.includes(e.origin.name)) return next(e)
    if (CONTINUATION_ORIGINS.includes(e.origin.kind)) return next(e)
    prompts = [...prompts, { text: e.text, human: HUMAN_ORIGINS.includes(e.origin.kind), turnId: e.turnId }].slice(-LOOKBACK)
    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const opening = mrOpeningOf(e.command)
    if (opening === undefined) return next(e)
    if ((await typedThisTurn($))?.some(acknowledgesStaleBase)) return next(e)
    const stale = await staleBase($, e.command, opening)
    return stale === undefined ? next(e) : { deny: staleBaseRefused(e.command, stale.source, stale.target) }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!invokesCommit(e.command) && !runsGitCommit(e.command)) return next(e)
    const source = messageFrom(e.command)
    const text =
      source === undefined ? undefined : 'text' in source ? source.text : await $.fs.read(source.file).catch(() => undefined)
    const found = [...(text ? commitMessageViolations(text) : []), ...aiAttributionViolations(e.command, text)]
    if (found.length > 0) return { deny: `git-tidy (commit message): ${found.join('; ')}` }
    const advice = text === undefined ? undefined : preAnswers(text)
    if (advice === undefined) return next(e)
    const result = await next(e)
    if (result.deny !== undefined) return result
    $.ui.log(`git-tidy (commit message): ${advice}`)
    return { ...result, context: [...(result.context ?? []), relayed(`git-tidy (commit message): ${advice}`)] }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!runsGitCommit(e.command)) return next(e)
    const review = await judge($, COMMIT_REVIEW, {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: e.command, description: e.description },
      cwd: await $.session.cwd(),
    })
    if (review?.ok !== false) return next(e)
    // A model judgment advises: someone new to the rules cannot argue with a model's block.
    const result = await next(e)
    if (result.deny !== undefined) return result
    $.ui.log(`git-tidy (${COMMIT_REVIEW.name}): ${review.reason}`)
    return { ...result, context: [...(result.context ?? []), relayed(`git-tidy (${COMMIT_REVIEW.name}): ${review.reason}`)] }
  })
}

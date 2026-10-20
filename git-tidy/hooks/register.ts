import type { EngineInterface, Register } from 'claude-code'
import { aiAttributionViolations, commitMessageViolations, invokesCommit, messageFrom, preAnswers, runsGitCommit } from './commit-message'
import {
  acknowledgesOrder,
  commitOrderRefused,
  DELETED_CHARS,
  MAX_SERIES,
  MIN_SERIES,
  ORDER_MODEL,
  pushSources,
  trimDiff,
  type SeriesCommit,
} from './commit-order'
import { acknowledgesScope, manyIssues, SCOPE_MODEL, scopeRefused } from './feature-scope'
import { acknowledgesSplit, FOLLOW_UP_MODEL, followUpsRefused, markedFollowUp } from './follow-ups'
import { acknowledgesStaleBase, FETCH_TIMEOUT_MS, staleBaseRefused } from './fresh-base'
import { acknowledgesLanded, landedRefused } from './landed-branch'
import { COMMIT_MESSAGE, COMMIT_ORDER, FEATURE_SCOPE, FOLLOW_UPS } from './prompts'
import {
  branchesOf,
  commandDir,
  currentTurn,
  defaultBranchOf,
  deletedBranches,
  FALLBACK_BASES,
  mrOpeningOf,
  pushTargets,
  verbOf,
  type MrOpening,
} from './shared/git-commands'
import { CONTINUATION_ORIGINS, CONTINUATION_PLUGINS } from './shared/continuations'
import { MODEL, promptFor, SYSTEM, verdictOf, type Review, type Verdict as ReviewVerdict } from './shared/verdict'

const HUMAN_ORIGINS: readonly string[] = ['composer', 'bridge', 'sdk']
const COMMIT_REVIEW: Review = { name: 'commit message review', prompt: COMMIT_MESSAGE, status: 'judging message' }
const ORDER_REVIEW: Review = { name: 'every commit works', prompt: COMMIT_ORDER, status: 'judging commit order' }
const FOLLOW_UP_REVIEW: Review = { name: 'one commit per change', prompt: FOLLOW_UPS, status: 'judging follow-up commits' }
const SCOPE_REVIEW: Review = { name: 'one feature per MR', prompt: FEATURE_SCOPE, status: 'judging features per MR' }
const LOOKBACK = 30

type Prompt = { text: string; human: boolean; turnId?: string | undefined }

let prompts: Prompt[] = []
// Prompts the user typed this session; `prompts` is capped, so it cannot tell a new one apart.
let typedCount = 0
// The branch commits last held for the user to choose on, and how many prompts they had typed by then.
let held: { series: string; reason: string; typed: number } | undefined
let scopeHeld: { series: string; reason: string; typed: number } | undefined
// A branch stays as it is once the user chose that; its later pushes are not held again.
const scopeKept = new Set<string>()

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

const protectedBranches = async ($: EngineInterface, cwd?: string) => {
  const top = await git($, ['rev-parse', '--show-toplevel'], cwd)
  if (!top) return []
  const policy = await $.fs.read(`${top}/.claude/push-policy.json`).catch(() => undefined)
  return policy === undefined ? [] : branchesOf(policy)
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

const landedTarget = async ($: EngineInterface, command: string) => {
  const cwd = await repoOf($, command)
  const integration = await protectedBranches($, cwd)
  if (integration.length === 0) return undefined
  const targets = pushTargets(command, await currentBranch($, cwd))
  if (targets === undefined) return undefined
  for (const branch of targets) {
    if (branch === '*' || integration.includes(branch)) continue
    const pushed = await git($, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`], cwd)
    if (pushed === undefined) continue
    for (const base of integration) {
      if (await isAncestor($, pushed, `refs/remotes/origin/${base}`, cwd)) return { branch, base }
    }
  }
  return undefined
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

// A repo without a push policy still merges somewhere; only the follow-up and feature reviews rely on this guess.
const integrationBases = async ($: EngineInterface, cwd?: string) => {
  const policy = await protectedBranches($, cwd)
  if (policy.length > 0) return policy
  const head = defaultBranchOf(await git($, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], cwd))
  const bases: string[] = []
  for (const base of new Set([...(head ? [head] : []), ...FALLBACK_BASES])) {
    if ((await git($, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${base}`], cwd)) !== undefined) bases.push(base)
  }
  return bases
}

// Commits the push sends that no remote has yet, oldest first; undefined when git cannot say.
const unpushedCommits = async ($: EngineInterface, sources: string[], cwd?: string) => {
  const shas: string[] = []
  for (const source of sources) {
    const listed = await git($, ['rev-list', '--reverse', source, '--not', '--remotes'], cwd)
    if (listed === undefined) return undefined
    for (const sha of listed.split('\n')) if (sha !== '' && !shas.includes(sha)) shas.push(sha)
  }
  return shas
}

// Every commit the branch's MR will carry, pushed or not, oldest first; undefined when no base is on origin.
const branchCommits = async ($: EngineInterface, sources: string[], bases: string[], cwd?: string) => {
  const refs: string[] = []
  for (const base of bases) {
    const ref = `refs/remotes/origin/${base}`
    if ((await git($, ['rev-parse', '--verify', '--quiet', ref], cwd)) !== undefined) refs.push(ref)
  }
  if (refs.length === 0) return undefined
  const shas: string[] = []
  for (const source of sources) {
    const listed = await git($, ['rev-list', '--reverse', '--no-merges', source, '--not', ...refs], cwd)
    if (listed === undefined) return undefined
    for (const sha of listed.split('\n')) if (sha !== '' && !shas.includes(sha)) shas.push(sha)
  }
  return shas
}

// The whole branch, not just this push: pushing after every commit sends one at a time.
const pushedBranch = async ($: EngineInterface, command: string) => {
  if (verbOf(command) !== 'push' || deletedBranches(command) !== undefined) return undefined
  const cwd = await repoOf($, command)
  const current = await currentBranch($, cwd)
  const bases = await integrationBases($, cwd)
  const targets = pushTargets(command, current)
  // A push straight to an integration branch lands a series someone laid out, release commit included.
  if (targets === undefined || targets.some((t) => t === '*' || bases.includes(t))) return undefined
  const sources = pushSources(command, current)
  if (!sources?.length || !(await unpushedCommits($, sources, cwd))?.length) return undefined
  const shas = await branchCommits($, sources, bases, cwd)
  return shas === undefined ? undefined : { shas, cwd, branch: sources.join(' ') }
}

const describeCommit = async ($: EngineInterface, sha: string, cwd?: string): Promise<SeriesCommit | undefined> => {
  const [subject, files, diff, deleted] = await Promise.all([
    git($, ['show', '-s', '--format=%s', sha], cwd),
    git($, ['show', '--format=', '--name-status', sha], cwd),
    git($, ['show', '--format=', '-U0', '--no-color', '--diff-filter=AM', sha], cwd),
    git($, ['show', '--format=', '-U0', '--no-color', '--diff-filter=D', sha], cwd),
  ])
  if (subject === undefined || files === undefined) return undefined
  return {
    subject,
    files: files.split('\n').filter(Boolean),
    diff: trimDiff(diff ?? ''),
    deleted: trimDiff(deleted ?? '', DELETED_CHARS),
  }
}

// The loader follows $ only into functions of this file, so the model call lives here, not in shared/verdict.ts.
const judge = async (
  $: EngineInterface,
  review: Review,
  input: object,
  model = MODEL,
): Promise<ReviewVerdict | undefined> => {
  $.ui.status(review.status)
  try {
    const result = await $.model.complete({ model, system: SYSTEM, prompt: promptFor(review, input) })
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
    if (HUMAN_ORIGINS.includes(e.origin.kind)) typedCount++
    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (verbOf(e.command) !== 'push' || deletedBranches(e.command) !== undefined) return next(e)
    const landed = await landedTarget($, e.command)
    if (landed === undefined) return next(e)
    if ((await typedThisTurn($))?.some(acknowledgesLanded)) return next(e)
    return { deny: landedRefused(e.command, landed.branch, landed.base) }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const opening = mrOpeningOf(e.command)
    if (opening === undefined) return next(e)
    if ((await typedThisTurn($))?.some(acknowledgesStaleBase)) return next(e)
    const stale = await staleBase($, e.command, opening)
    return stale === undefined ? next(e) : { deny: staleBaseRefused(e.command, stale.source, stale.target) }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (verbOf(e.command) !== 'push' || deletedBranches(e.command) !== undefined) return next(e)
    const cwd = await repoOf($, e.command)
    const sources = pushSources(e.command, await currentBranch($, cwd))
    if (!sources?.length) return next(e)
    const shas = await unpushedCommits($, sources, cwd)
    if (shas === undefined || shas.length < MIN_SERIES) return next(e)
    if (shas.length > MAX_SERIES) {
      $.ui.log(`git-tidy (${ORDER_REVIEW.name}): ${shas.length} commits, over ${MAX_SERIES}, not reviewed`)
      return next(e)
    }
    if ((await typedThisTurn($))?.some(acknowledgesOrder)) return next(e)
    const commits = await Promise.all(shas.map((sha) => describeCommit($, sha, cwd)))
    if (commits.includes(undefined)) return next(e)
    const review = await judge($, ORDER_REVIEW, { commits }, ORDER_MODEL)
    if (review?.ok !== false) return next(e)
    $.ui.log(`git-tidy (${ORDER_REVIEW.name}): ${review.reason}`)
    return { deny: commitOrderRefused(e.command, review.reason) }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const pushed = await pushedBranch($, e.command)
    if (pushed === undefined || pushed.shas.length < MIN_SERIES) return next(e)
    const { shas, cwd } = pushed
    if (shas.length > MAX_SERIES) {
      $.ui.log(`git-tidy (${FOLLOW_UP_REVIEW.name}): ${shas.length} commits, over ${MAX_SERIES}, not reviewed`)
      return next(e)
    }
    if ((await typedThisTurn($))?.some(acknowledgesSplit)) return next(e)
    // The choice is the user's: once they have typed anything after the hold, these commits go as they are.
    const series = shas.join(' ')
    if (held?.series === series) {
      return typedCount > held.typed ? next(e) : { deny: followUpsRefused(e.command, held.reason) }
    }
    const commits = await Promise.all(shas.map((sha) => describeCommit($, sha, cwd)))
    if (commits.includes(undefined)) return next(e)
    let reason = markedFollowUp(commits.flatMap((c) => (c ? [c.subject] : [])))
    if (reason === undefined) {
      const review = await judge($, FOLLOW_UP_REVIEW, { commits }, FOLLOW_UP_MODEL)
      if (review?.ok === false) reason = review.reason
    }
    if (reason === undefined) return next(e)
    held = { series, reason, typed: typedCount }
    $.ui.log(`git-tidy (${FOLLOW_UP_REVIEW.name}): ${reason}`)
    return { deny: followUpsRefused(e.command, reason) }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const pushed = await pushedBranch($, e.command)
    if (pushed === undefined || pushed.shas.length === 0 || scopeKept.has(pushed.branch)) return next(e)
    const { shas, cwd, branch } = pushed
    if (shas.length > MAX_SERIES) {
      $.ui.log(`git-tidy (${SCOPE_REVIEW.name}): ${shas.length} commits, over ${MAX_SERIES}, not reviewed`)
      return next(e)
    }
    const series = shas.join(' ')
    const answered = scopeHeld?.series === series && typedCount > scopeHeld.typed
    if (answered || (await typedThisTurn($))?.some(acknowledgesScope)) {
      scopeKept.add(branch)
      return next(e)
    }
    if (scopeHeld?.series === series) return { deny: scopeRefused(e.command, scopeHeld.reason) }
    const messages = await Promise.all(shas.map((sha) => git($, ['show', '-s', '--format=%B', sha], cwd)))
    let reason = manyIssues(messages.flatMap((m) => (m === undefined ? [] : [m])))
    if (reason === undefined) {
      const commits = await Promise.all(shas.map((sha) => describeCommit($, sha, cwd)))
      if (commits.includes(undefined)) return next(e)
      const review = await judge($, SCOPE_REVIEW, { commits }, SCOPE_MODEL)
      if (review?.ok === false) reason = review.reason
    }
    if (reason === undefined) return next(e)
    scopeHeld = { series, reason, typed: typedCount }
    $.ui.log(`git-tidy (${SCOPE_REVIEW.name}): ${reason}`)
    return { deny: scopeRefused(e.command, reason) }
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

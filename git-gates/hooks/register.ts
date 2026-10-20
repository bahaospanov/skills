import type { EngineInterface, Register } from 'claude-code'
import {
  authorizes,
  authorizesMerge,
  authorizesOpening,
  authorizesPush,
  deletionNote,
  forbiddenRefused,
  forbids,
  grantRefused,
  grantRequest,
  mergeRefused,
  namesBranch,
  noKeyword,
  noUserMessage,
  openRefused,
  protectedHit,
  protectedPushRefused,
  pushRefused,
  pushUndetermined,
} from './consent'
import { GRANT_DEFAULT_TTL_S, grantArgsOf, isLive, openGrant, spend, type Grant } from './grants'
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
  type Verb,
} from './shared/git-commands'

// A --plugin-dir load serves it as mcp__git-gates__grant; the registered name is kept for messages.
const GRANT_TOOL = /^mcp__(plugin_)?git-gates__grant$/
const HUMAN_ORIGINS: readonly string[] = ['composer', 'bridge', 'sdk']
// These follow-ups continue the user's turn, as the Stop hook they replaced did, so they keep their authorization.
const CONTINUATION_PLUGINS: readonly string[] = ['git-cleanup', 'lean-comments', 'lean-docs']
// So does a background task the agent started reporting back, or the engine following up a UI action.
const CONTINUATION_ORIGINS: readonly string[] = ['task-notification', 'auto-continuation']
const LOOKBACK = 30

type Prompt = { text: string; human: boolean; turnId?: string | undefined }
type Verdict = { reason: string } | { note?: string }

let prompts: Prompt[] = []
let grant: Grant | undefined
let grantTool = 'mcp__git-gates__grant'

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

// A repo without a push policy still merges somewhere; only the landed-delete exemption relies on this guess.
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

const landedBase = async ($: EngineInterface, commit: string, bases: string[], cwd?: string) => {
  for (const base of bases) if (await isAncestor($, commit, `refs/remotes/origin/${base}`, cwd)) return base
  return undefined
}

// Asks origin itself: a stale remote-tracking ref could hide commits pushed since, and the delete would drop them.
const deletesOnlyLanded = async ($: EngineInterface, branches: string[], cwd?: string) => {
  const bases = await integrationBases($, cwd)
  for (const branch of branches) {
    if (bases.includes(branch)) return false
    const listed = await git($, ['ls-remote', 'origin', `refs/heads/${branch}`], cwd)
    const head = listed?.split(/\s/)[0]
    if (!head || (await landedBase($, head, bases, cwd)) === undefined) return false
  }
  return true
}

const consent = async ($: EngineInterface, command: string, verb: Verb | 'open'): Promise<Verdict> => {
  const now = await $.clock.now()
  const typed = await typedThisTurn($)
  if (verb !== 'open' && typed !== undefined && forbids(typed, verb)) return { reason: forbiddenRefused(command, verb) }

  if (verb === 'commit' && isLive(grant, now)) {
    grant = spend(grant)
    return {
      note: `git-gates: allowed by standing commit grant — ${grant.usesRemaining} use(s) left${grant.goal ? `, goal: ${grant.goal}` : ''}`,
    }
  }

  if (typed === undefined) return { reason: noUserMessage() }

  if (verb === 'open') return typed.some(authorizesOpening) ? {} : { reason: openRefused(command) }

  if (verb === 'merge') return typed.some(authorizesMerge) ? {} : { reason: mergeRefused(command) }

  if (verb === 'push') {
    const cwd = await repoOf($, command)
    const policy = await protectedBranches($, cwd)
    if (policy.length > 0) {
      const targets = pushTargets(command, await currentBranch($, cwd))
      if (targets === undefined) return { reason: pushUndetermined(command, policy) }
      const hit = protectedHit(targets, policy)
      if (hit !== undefined) {
        return typed.some((text) => namesBranch(text, hit))
          ? { note: `git-gates: direct push to '${hit}' — authorized by name in the user's message` }
          : { reason: protectedPushRefused(command, hit) }
      }
    }
    // Deleting a branch whose head already sits in an integration branch ships nothing.
    const deleted = deletedBranches(command)
    if (deleted !== undefined && (await deletesOnlyLanded($, deleted, cwd))) return { note: deletionNote(deleted) }
  }

  if (!typed.some(authorizes)) return { reason: noKeyword(command, grantTool) }
  if (verb === 'push' && !typed.some(authorizesPush)) return { reason: pushRefused(command) }

  const asking = verb === 'commit' ? typed.find((text) => grantRequest(text) !== undefined) : undefined
  const uses = asking === undefined ? undefined : grantRequest(asking)
  if (asking !== undefined && uses !== undefined && !(grant?.promptText === asking && grant.expiresAt > now)) {
    grant = spend(openGrant(uses, GRANT_DEFAULT_TTL_S, '', now, asking))
    return {
      note: `git-gates: user message opens a commit grant — ${grant.usesRemaining} further commit(s) allowed for ${GRANT_DEFAULT_TTL_S / 60}m`,
    }
  }
  return {}
}

type Outcome = { deny?: string | undefined; isError?: boolean | undefined; text?: string | undefined }

const firstLine = (text: string) => text.split('\n')[0] ?? ''

// While the settings guards still run, a call this mod allowed but its settings twin blocked is a parity gap worth seeing.
const enforce = async <R extends Outcome>(
  $: EngineInterface,
  verdict: Verdict,
  twin: RegExp,
  run: () => Promise<R>,
): Promise<R | { deny: string }> => {
  if ('reason' in verdict) return { deny: verdict.reason }
  if (verdict.note) $.ui.log(verdict.note)
  const result = await run()
  const blocked = result.deny ?? (result.isError ? result.text : undefined)
  if (blocked !== undefined && twin.test(blocked)) {
    $.ui.log(`git-gates: allowed, but a settings guard blocked it: ${firstLine(blocked)}`)
  }
  return result
}

export const register: Register = (on) => {
  on('prompt.submit', ($, e, next) => {
    if (e.origin.kind === 'plugin' && CONTINUATION_PLUGINS.includes(e.origin.name)) return next(e)
    if (CONTINUATION_ORIGINS.includes(e.origin.kind)) return next(e)
    prompts = [...prompts, { text: e.text, human: HUMAN_ORIGINS.includes(e.origin.kind), turnId: e.turnId }].slice(-LOOKBACK)
    return next(e)
  })

  on('session.start', async ($, e, next) => {
    const registered = await $.tool.register({
      name: 'grant',
      description:
        'Pre-authorize N `git commit` calls for this session (uses: default 5, max 20) for ttl_seconds (default 7200, max 28800), with an optional goal. ' +
        'Refused unless one of the last 30 user messages authorizes committing. Never covers git push. ' +
        'action: "grant" (default), "status" or "revoke".',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['grant', 'status', 'revoke'] },
          uses: { type: 'integer', minimum: 1 },
          ttl_seconds: { type: 'integer', minimum: 1 },
          goal: { type: 'string' },
        },
      },
    })
    grantTool = registered.tool
    return next(e)
  })

  on('tool.call', { tool: GRANT_TOOL }, async ($, e) => {
    const args = grantArgsOf(e)
    if ('error' in args) return { deny: args.error }
    const now = await $.clock.now()
    if (args.action === 'revoke') {
      grant = undefined
      return { result: 'git-gates: grant revoked' }
    }
    if (args.action === 'status') {
      if (grant === undefined) return { result: 'git-gates: no grant for this session' }
      const secondsLeft = Math.round((grant.expiresAt - now) / 1000)
      return { result: JSON.stringify({ ...grant, live: isLive(grant, now), seconds_left: secondsLeft }) }
    }
    const recent = await recentPrompts($, LOOKBACK)
    if (!recent.some((p) => p.human && authorizes(p.text))) return { deny: grantRefused(LOOKBACK) }
    grant = openGrant(args.uses, args.ttlSeconds, args.goal, now)
    const seconds = Math.round((grant.expiresAt - now) / 1000)
    return {
      result: `git-gates: granted ${grant.usesRemaining} commit(s) for ${seconds}s${args.goal ? ` — goal: ${args.goal}` : ''}`,
    }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const verb = verbOf(e.command) ?? (mrOpeningOf(e.command) === undefined ? undefined : 'open')
    if (verb === undefined) return next(e)
    return enforce($, await consent($, e.command, verb), /git-commit-guard/, () => next(e))
  }).catch(($, e, next) =>
    next.called ? undefined : { deny: `git-gates: the check failed (${next.error.message ?? next.error.kind}); blocking until it works` },
  )
}

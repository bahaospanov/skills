import type { EngineInterface, Register } from 'claude-code'
import {
  acknowledgesPipeline,
  cleanupOf,
  coverageOf,
  githubPipelines,
  gitlabPipelines,
  issuesEditedBy,
  pipelineRefused,
  remoteOf,
  type Coverage,
  type Pipeline,
} from './pipeline-first'
import {
  branchesOf,
  commandDir,
  currentTurn,
  defaultBranchOf,
  deletedBranches,
  FALLBACK_BASES,
  pushTargets,
  verbOf,
  type Verb,
} from './shared/git-commands'
import { refsInText } from './shared/issue-refs'
import { staleReport, worktreesOf, type Stale } from './stale-work'

const HUMAN_ORIGINS: readonly string[] = ['composer', 'bridge', 'sdk']
const LOOKBACK = 30
const MAX_STALE_FOLLOW_UPS = 2
const FETCH_TIMEOUT_MS = 20_000
const PIPELINE_PAGE = 20
const ISSUE_LOOKBACK = 200

type Prompt = { text: string; turnId?: string | undefined }
type Held = { what: string; base: string; coverage: Exclude<Coverage, { kind: 'green' | 'unknown' }> }

let typed: Prompt[] = []
let gitlabToken: string | undefined
// Branches this session committed to or pushed, by repo: the only work the stale check tidies.
const worked = new Map<string, { dir: string | undefined; branches: Set<string> }>()
const reportedStale = new Set<string>()
let staleFollowUps = 0

const firstLine = (text: string) => text.split('\n')[0] ?? ''

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

// A rebase merge lands copies, never the branch's own commits; `git cherry` matches them by patch.
const holds = async ($: EngineInterface, upstream: string, head: string, cwd?: string) => {
  if (await isAncestor($, head, upstream, cwd)) return true
  const cherry = await git($, ['cherry', upstream, head], cwd)
  return cherry !== undefined && !cherry.split('\n').some((line) => line.startsWith('+'))
}

const integrationBases = async ($: EngineInterface, cwd?: string) => {
  const top = await git($, ['rev-parse', '--show-toplevel'], cwd)
  const policy = top ? await $.fs.read(`${top}/.claude/push-policy.json`).catch(() => undefined) : undefined
  const protectedBranches = policy === undefined ? [] : branchesOf(policy)
  if (protectedBranches.length > 0) return protectedBranches
  const head = defaultBranchOf(await git($, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], cwd))
  const bases: string[] = []
  for (const base of new Set([...(head ? [head] : []), ...FALLBACK_BASES])) {
    if ((await git($, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${base}`], cwd)) !== undefined) bases.push(base)
  }
  return bases
}

const landedBase = async ($: EngineInterface, commit: string, bases: string[], cwd?: string) => {
  for (const base of bases) if (await holds($, `refs/remotes/origin/${base}`, commit, cwd)) return base
  return undefined
}

const pipelinesOf = async ($: EngineInterface, base: string, cwd?: string): Promise<Pipeline[] | string> => {
  const url = await git($, ['remote', 'get-url', 'origin'], cwd)
  const remote = url === undefined ? undefined : remoteOf(url)
  if (remote === undefined) return 'origin is no forge this check reads'
  if (remote.host === 'github.com') {
    const argv = ['gh', 'run', 'list', '--branch', base, '--limit', String(PIPELINE_PAGE), '--json', 'databaseId,headSha,status,conclusion,url']
    const run = await $.process.run(argv, cwd === undefined ? undefined : { cwd }).catch(() => undefined)
    if (run?.exitCode !== 0) return `gh run list failed: ${firstLine(run?.stderr ?? 'gh not found')}`
    return githubPipelines(run.stdout) ?? 'gh run list answered no list'
  }
  if (gitlabToken === undefined) return 'no gitlab_token in git-cleanup options'
  const api = `https://${remote.host}/api/v4/projects/${encodeURIComponent(remote.path)}/pipelines`
  const response = await $.http.fetch(`${api}?ref=${encodeURIComponent(base)}&per_page=${PIPELINE_PAGE}`, {
    headers: { 'PRIVATE-TOKEN': gitlabToken },
  })
  if (!response.ok) return `GitLab answered ${response.status}`
  return gitlabPipelines(response.text) ?? 'GitLab answered no list'
}

// Pipelines run on a linear base, so the ones holding the work are the newest few: stop at the first that does not.
const coverage = async ($: EngineInterface, head: string, base: string, cwd?: string): Promise<Coverage> => {
  const pipelines = await pipelinesOf($, base, cwd)
  if (typeof pipelines === 'string') return { kind: 'unknown', why: pipelines }
  const marked: (Pipeline & { covers: boolean })[] = []
  for (const pipeline of pipelines) {
    const covers = await holds($, pipeline.sha, head, cwd)
    marked.push({ ...pipeline, covers })
    if (!covers) break
  }
  return coverageOf(marked)
}

const issueLanding = async ($: EngineInterface, ref: string, bases: string[], cwd?: string) => {
  for (const base of bases) {
    const log = await git($, ['log', `refs/remotes/origin/${base}`, `-n${ISSUE_LOOKBACK}`, '--format=%H%x09%s'], cwd)
    for (const line of log?.split('\n') ?? []) {
      const [sha, subject] = line.split('\t')
      if (sha && subject && refsInText(subject, true).includes(ref)) return { head: sha, base, subject }
    }
  }
  return undefined
}

const heldWork = async ($: EngineInterface, command: string): Promise<Held | undefined> => {
  const cleanup = cleanupOf(command)
  const branches = [...(cleanup?.branches ?? []), ...(deletedBranches(command) ?? [])]
  const issues = issuesEditedBy(command)
  if (branches.length === 0 && issues.length === 0 && !cleanup?.worktrees.length) return undefined
  const cwd = await repoOf($, command)
  if (cleanup?.worktrees.length) {
    const trees = worktreesOf((await git($, ['worktree', 'list', '--porcelain'], cwd)) ?? '')
    for (const path of cleanup.worktrees) {
      const tail = path.replace(/^\.\//, '').replace(/\/$/, '')
      const tree = trees.find((wt) => wt.path === tail || wt.path.endsWith(`/${tail}`))
      if (tree?.branch !== undefined) branches.push(tree.branch)
    }
  }
  await $.process.run(['git', 'fetch', '--quiet', 'origin'], { ...(cwd === undefined ? {} : { cwd }), timeoutMs: FETCH_TIMEOUT_MS }).catch(() => undefined)
  const bases = await integrationBases($, cwd)
  const work: { what: string; head: string; base: string }[] = []
  for (const branch of new Set(branches)) {
    if (bases.includes(branch)) continue
    const head =
      (await git($, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], cwd)) ??
      (await git($, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`], cwd))
    const base = head === undefined ? undefined : await landedBase($, head, bases, cwd)
    if (head !== undefined && base !== undefined) work.push({ what: `'${branch}'`, head, base })
  }
  for (const ref of issues) {
    const landing = await issueLanding($, ref, bases, cwd)
    if (landing !== undefined) work.push({ what: `the work on ${ref} (${landing.subject})`, head: landing.head, base: landing.base })
  }
  for (const item of work) {
    const shipped = await coverage($, item.head, item.base, cwd)
    if (shipped.kind === 'unknown') $.ui.log(`git-cleanup (pipeline first): ${item.what}: pipeline unknown (${shipped.why}); not gating`)
    if (shipped.kind === 'waiting' || shipped.kind === 'failed') return { what: item.what, base: item.base, coverage: shipped }
  }
  return undefined
}

const recordWork = async ($: EngineInterface, command: string, verb: Verb) => {
  if (deletedBranches(command) !== undefined) return
  const dir = await repoOf($, command)
  const common = await git($, ['rev-parse', '--path-format=absolute', '--git-common-dir'], dir)
  if (common === undefined) return
  const current = await currentBranch($, dir)
  const branches = verb === 'push' ? (pushTargets(command, current) ?? []) : current ? [current] : []
  const repo = worked.get(common) ?? { dir, branches: new Set<string>() }
  for (const branch of branches) if (branch !== '*') repo.branches.add(branch)
  worked.set(common, repo)
}

const staleWork = async ($: EngineInterface) => {
  const reports: { main: string; items: Stale[] }[] = []
  for (const [common, repo] of worked) {
    const trees = worktreesOf((await git($, ['worktree', 'list', '--porcelain'], repo.dir)) ?? '')
    const main = trees[0]?.path
    if (main === undefined) continue
    await $.process.run(['git', 'fetch', '--quiet', '--prune', 'origin'], { cwd: main, timeoutMs: FETCH_TIMEOUT_MS }).catch(() => undefined)
    const bases = await integrationBases($, main)
    const items: Stale[] = []
    for (const branch of repo.branches) {
      if (bases.includes(branch) || reportedStale.has(`${common}\0${branch}`)) continue
      const local = await git($, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], main)
      const remote = await git($, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`], main)
      const head = local ?? remote
      if (head === undefined) continue
      const base = await landedBase($, head, bases, main)
      if (base === undefined) continue
      if (remote !== undefined && remote !== head && (await landedBase($, remote, bases, main)) === undefined) continue
      const tree = trees.slice(1).find((wt) => wt.branch === branch)
      if (tree !== undefined && (await git($, ['status', '--porcelain'], tree.path)) !== '') continue
      const shipped = await coverage($, head, base, main)
      if (shipped.kind === 'waiting' || shipped.kind === 'failed') continue
      reportedStale.add(`${common}\0${branch}`)
      items.push({ branch, base, worktree: tree?.path, local: local !== undefined, remote: remote !== undefined })
    }
    if (items.length > 0) reports.push({ main, items })
  }
  return reports
}

export const register: Register = (on, options) => {
  gitlabToken = typeof options.gitlab_token === 'string' && options.gitlab_token !== '' ? options.gitlab_token : undefined

  on('prompt.submit', ($, e, next) => {
    if (HUMAN_ORIGINS.includes(e.origin.kind)) typed = [...typed, { text: e.text, turnId: e.turnId }].slice(-LOOKBACK)
    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const held = await heldWork($, e.command)
    if (held === undefined) return next(e)
    if (currentTurn(typed).some((p) => acknowledgesPipeline(p.text))) return next(e)
    $.ui.log(`git-cleanup (pipeline first): ${held.what} waits on its pipeline`)
    return { deny: pipelineRefused(e.command, held.what, held.base, held.coverage) }
  }).catch(($, e, next) => {
    $.ui.log(`git-cleanup (pipeline first): the check failed (${next.error.message ?? next.error.kind}); not gating`)
    return undefined
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const verb = verbOf(e.command)
    const result = await next(e)
    if (verb !== 'commit' && verb !== 'push') return result
    if ('deny' in result && result.deny !== undefined) return result
    await recordWork($, e.command, verb).catch(() => undefined)
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined || e.reason !== 'answer' || worked.size === 0 || staleFollowUps >= MAX_STALE_FOLLOW_UPS) {
      return result
    }
    const reports = await staleWork($).catch(() => [])
    if (reports.length === 0) return result
    staleFollowUps++
    const branches = reports.flatMap((r) => r.items.map((s) => s.branch))
    $.ui.log(`git-cleanup (stale work): ${branches.join(', ')} merged and clean; a follow-up prompt asks to remove them`)
    const text = reports.map((r) => staleReport(r.items, r.main)).join('\n\n')
    $.clock.after(0, () => {
      $.prompt.submit({ text }).catch(() => undefined)
    })
    return result
  })
}

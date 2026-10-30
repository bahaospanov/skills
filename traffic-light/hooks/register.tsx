import { atom, read, update } from 'claude-code'
import type { EngineInterface, ProcessRunResult, Register } from 'claude-code'

import type { Color, Light } from '../types'

type Engine = EngineInterface

const INTEGRATION = ['dev', 'develop', 'main', 'master']
const PR_URL = /https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/
const GITHUB_REMOTE = /github\.com[:/]([\w.-]+?)\/([\w.-]+?)(?:\.git)?$/
const PR_COMMAND = /\bgh\s+pr\s+(create|view|merge|ready|checks|edit)\b/
const GIT_COMMAND = /\b(git|gh)\s/
const CHANGE_COMMAND =
  /\b(git\s+(-C\s+\S+\s+)?(commit|revert|cherry-pick|worktree\s+add|checkout\s+-[bB]|switch\s+(-[cC]|--create))|gh\s+(pr|issue)\s+create)\b/
const PUSH_COMMAND = /\bgit\s+(-C\s+\S+\s+)?push\b/
const POLL_MS = 30_000
const PIPELINE_START_MS = 3 * 60_000
const DEMO_STEP_MS = 4_000

const light = atom({ plugin: 'traffic-light', key: 'light' } as const, null)
const pr = atom({ plugin: 'traffic-light', key: 'pr' } as const, null)
const workDir = atom({ plugin: 'traffic-light', key: 'workDir' } as const, null)
const spent = atom({ plugin: 'traffic-light', key: 'spent' } as const, [])
const started = atom({ plugin: 'traffic-light', key: 'started' } as const, false)

const DOT: Record<Color, string> = { green: '🟢', yellow: '🟡', red: '🔴' }
const HEADLINE: Record<Color, string> = {
  green: 'safe to leave',
  yellow: 'waiting on PR',
  red: 'working',
}
const THEME = { green: 'success', yellow: 'warning', red: 'error' } as const

const PENDING_CHECK = new Set(['QUEUED', 'IN_PROGRESS', 'PENDING', 'EXPECTED', 'WAITING', 'REQUESTED'])
const FAILED_CHECK = new Set(['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE'])
const PASSED_RUN = new Set(['success', 'skipped', 'neutral'])

type Check = { status?: string; conclusion?: string; state?: string }
type Pr = {
  number: number
  url: string
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  baseRefName: string
  mergedAt: string | null
  mergeCommit: { oid: string } | null
  statusCheckRollup: Check[] | null
}
type Run = {
  id: number
  workflow_id: number
  name: string
  status: string
  conclusion: string | null
  created_at: string
}

// A green verdict's `done` names the work it stands for: the merged PR's URL, or the pushed commit.
type Verdict = Light & { done?: string }

const lit = (color: Color, reason: string): Light => ({ color, reason })
const ASKING = lit('red', 'Claude is asking you')
const WORKING = lit('red', 'Claude is working')
const DEMO = [
  lit('green', '#182 merged into dev, deploy-dev passed'),
  lit('yellow', '#182 open, checks running'),
  lit('red', 'Claude is asking you'),
]

let asking = false
let working = false
// The work the last verdict judged green, and the one green when the running
// turn began: the turn's first change spends that one.
let greenWork: string | undefined
let pending: string | undefined
let isDemo = false
let refreshing: Promise<void> | undefined
let isStale = false

async function run($: Engine, argv: string[], cwd?: string): Promise<ProcessRunResult | undefined> {
  try {
    return await $.process.run(argv, { cwd, timeoutMs: 20_000 })
  } catch {
    return undefined
  }
}

async function gitRoot($: Engine, dir: string) {
  const out = await run($, ['git', '-C', dir, 'rev-parse', '--show-toplevel'])
  return out?.exitCode === 0 ? out.stdout.trim() : undefined
}

async function unfinished($: Engine, root: string) {
  const status = await run($, ['git', '-C', root, 'status', '--porcelain'])
  if (status?.exitCode === 0 && status.stdout.trim() !== '') return 'uncommitted changes'
  const ahead = await run($, ['git', '-C', root, 'rev-list', '--count', '@{upstream}..HEAD'])
  if (ahead?.exitCode === 0 && Number(ahead.stdout.trim()) > 0) return 'unpushed commits'
  return undefined
}

async function currentBranch($: Engine, root: string) {
  const out = await run($, ['git', '-C', root, 'branch', '--show-current'])
  return out?.exitCode === 0 ? out.stdout.trim() : ''
}

async function viewPr($: Engine, target: string, cwd?: string): Promise<Pr | 'none' | 'error'> {
  const fields = 'number,url,state,baseRefName,mergedAt,mergeCommit,statusCheckRollup'
  const out = await run($, ['gh', 'pr', 'view', target, '--json', fields], cwd)
  if (out === undefined) return 'error'
  if (out.exitCode !== 0) return /no (open )?pull requests? found/i.test(out.stderr) ? 'none' : 'error'
  return JSON.parse(out.stdout) as Pr
}

function checksText(rollup: Check[] | null) {
  // A CheckRun carries status + conclusion, a commit StatusContext only state.
  const states = (rollup ?? []).map(
    check => check.state ?? (check.status === 'COMPLETED' ? check.conclusion : check.status) ?? '',
  )
  if (states.some(state => PENDING_CHECK.has(state))) return 'checks running'
  if (states.some(state => FAILED_CHECK.has(state))) return 'checks failing'
  return 'waiting for merge'
}

async function listRuns($: Engine, path: string) {
  const out = await run($, ['gh', 'api', path])
  return out?.exitCode === 0 ? (JSON.parse(out.stdout) as { workflow_runs: Run[] }).workflow_runs : undefined
}

// A run cancelled by a newer push to the same branch (concurrency
// cancel-in-progress) is settled by that newer run, which carries this commit.
async function settle($: Engine, repo: string, base: string, one: Run) {
  if (one.conclusion !== 'cancelled') return one
  const runs = await listRuns($, `repos/${repo}/actions/workflows/${one.workflow_id}/runs?branch=${base}&event=push&per_page=1`)
  const newest = runs?.[0]
  return newest !== undefined && newest.created_at > one.created_at ? newest : one
}

async function pipeline($: Engine, repo: string, base: string, sha: string, landedAt: string): Promise<Light> {
  const runs = await listRuns($, `repos/${repo}/actions/runs?head_sha=${sha}&event=push`)
  if (runs === undefined) return lit('red', "can't read the pipeline")
  if (runs.length === 0) {
    const age = (await $.clock.now()) - Date.parse(landedAt)
    return age < PIPELINE_START_MS ? lit('yellow', 'pipeline not started yet') : lit('green', 'no pipeline ran')
  }
  const settled = await Promise.all(runs.map(one => settle($, repo, base, one)))
  const names = (list: Run[]) => [...new Set(list.map(one => one.name))].join(', ')
  const running = settled.filter(one => one.status !== 'completed')
  if (running.length > 0) return lit('yellow', `${names(running)} running`)
  const failed = settled.filter(one => !PASSED_RUN.has(one.conclusion ?? ''))
  if (failed.length > 0) return lit('red', `${names(failed)} ${failed[0]?.conclusion ?? 'failed'}`)
  return lit('green', `${names(settled)} passed`)
}

async function prLight($: Engine, found: Pr): Promise<Light> {
  const label = `#${found.number}`
  if (found.state === 'OPEN') return lit('yellow', `${label} open, ${checksText(found.statusCheckRollup)}`)
  if (found.state === 'CLOSED') return lit('red', `${label} closed without merging`)
  if (!INTEGRATION.includes(found.baseRefName)) {
    return lit('red', `${label} merged into ${found.baseRefName}, not dev or main`)
  }
  const repo = PR_URL.exec(found.url)
  if (repo === null || found.mergeCommit === null || found.mergedAt === null) {
    return lit('green', `${label} merged into ${found.baseRefName}`)
  }
  const after = await pipeline($, `${repo[1]}/${repo[2]}`, found.baseRefName, found.mergeCommit.oid, found.mergedAt)
  return lit(after.color, `${label} merged into ${found.baseRefName}, ${after.reason}`)
}

async function unlessSpent($: Engine, verdict: Light, work: string, since: string): Promise<Verdict> {
  if (verdict.color !== 'green') return verdict
  if ((await read($, spent)).includes(work)) return lit('red', `new work since ${since}`)
  return { ...verdict, done: work }
}

// The integration branch whose head on origin contains HEAD, as after `git push origin HEAD:dev` from another branch.
async function pushedTo($: Engine, root: string) {
  const refs = INTEGRATION.map(name => `refs/remotes/origin/${name}`)
  const out = await run($, ['git', '-C', root, 'for-each-ref', '--contains', 'HEAD', '--format=%(refname:lstrip=3)', ...refs])
  return out?.exitCode === 0 ? out.stdout.split('\n').find(name => name !== '') : undefined
}

// The reflog of origin's branch dates when its head reached the remote, the push the pipeline runs for.
async function pushedLight($: Engine, root: string, branch: string): Promise<Verdict> {
  const head = await run($, ['git', '-C', root, 'log', '-1', '--format=%H %h'])
  const ref = `refs/remotes/origin/${branch}`
  const pushed = await run($, ['git', '-C', root, 'log', '-g', '-1', '--date=iso-strict', '--format=%gd', ref])
  const remote = await run($, ['git', '-C', root, 'remote', 'get-url', 'origin'])
  const [sha, short] = head?.exitCode === 0 ? head.stdout.trim().split(' ') : []
  const pushedAt = pushed?.exitCode === 0 ? /@\{(.+)\}/.exec(pushed.stdout)?.[1] : undefined
  const repo = GITHUB_REMOTE.exec(remote?.exitCode === 0 ? remote.stdout.trim() : '')
  if (sha === undefined || short === undefined || pushedAt === undefined || repo === null) return lit('red', 'no PR yet')
  const slug = `${repo[1]}/${repo[2]}`
  const after = await pipeline($, slug, branch, sha, pushedAt)
  const verdict = lit(after.color, `${short} pushed to ${branch}, ${after.reason}`)
  if (after.color === 'yellow') return { ...verdict, headline: 'waiting on pipeline' }
  return unlessSpent($, verdict, `${slug}@${sha}`, `${short} was pushed`)
}

async function judge($: Engine): Promise<Verdict> {
  if (!(await read($, started))) return lit('green', 'no work started')
  const dir = (await read($, workDir)) ?? (await $.session.cwd())
  const root = await gitRoot($, dir)
  const left = root === undefined ? undefined : await unfinished($, root)
  if (left !== undefined) return lit('red', left)
  const branch = root === undefined ? '' : await currentBranch($, root)
  const tracked = await read($, pr)
  if (root !== undefined && INTEGRATION.includes(branch) && tracked === null) return pushedLight($, root, branch)
  const feature = branch !== '' && !INTEGRATION.includes(branch) ? branch : undefined
  const found =
    feature !== undefined ? await viewPr($, feature, root) : tracked !== null ? await viewPr($, tracked) : 'none'
  if (found === 'error') return lit('red', "can't reach GitHub (gh)")
  if (found === 'none') {
    const pushed = root === undefined ? undefined : await pushedTo($, root)
    return root === undefined || pushed === undefined ? lit('red', 'no PR yet') : pushedLight($, root, pushed)
  }
  return unlessSpent($, await prLight($, found), found.url, `#${found.number} merged`)
}

async function show($: Engine, next: Light) {
  await update($, light, () => next)
}

function face(next: Light) {
  if (asking) return ASKING
  return working && next.color === 'green' ? WORKING : next
}

function refresh($: Engine): Promise<void> {
  if (isDemo) return Promise.resolve()
  if (refreshing !== undefined) {
    isStale = true
    return refreshing
  }
  refreshing = (async () => {
    do {
      isStale = false
      const { done, ...next } = await judge($).catch((): Verdict => lit('red', "couldn't read the work state"))
      greenWork = done
      if (!isDemo) await show($, face(next))
    } while (isStale)
  })().finally(() => {
    refreshing = undefined
  })
  return refreshing
}

function soon($: Engine) {
  $.clock.after(1, () => void refresh($))
}

async function ask($: Engine) {
  asking = true
  if (!isDemo) await show($, ASKING)
}

function stopAsking($: Engine) {
  if (!asking) return
  asking = false
  soon($)
}

async function remember($: Engine, file: string) {
  const root = await gitRoot($, file.slice(0, Math.max(file.lastIndexOf('/'), 1)))
  if (root === undefined) return
  await update($, workDir, () => root)
  await startWork($)
  return root
}

async function startWork($: Engine) {
  await update($, started, () => true)
  soon($)
}

async function edited($: Engine, file: string) {
  const root = await remember($, file)
  if (root === undefined || pending === undefined) return
  const ignored = await run($, ['git', '-C', root, 'check-ignore', '-q', file])
  if (ignored?.exitCode !== 0) await spend($)
}

async function spend($: Engine) {
  const merged = pending
  if (merged === undefined) return
  pending = undefined
  await update($, spent, list => [...list, merged])
  soon($)
}

function demo($: Engine) {
  isDemo = true
  DEMO.forEach((step, i) => $.clock.after(1 + i * DEMO_STEP_MS, () => void show($, step)))
  $.clock.after(DEMO.length * DEMO_STEP_MS, () => {
    isDemo = false
    void refresh($)
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'traffic-light',
      description: 'Refresh the traffic light; "demo" shows green, yellow and red',
    })
    $.clock.every(POLL_MS, () => {
      void read($, light).then(now => (now?.color === 'yellow' ? refresh($) : undefined))
    })
    soon($)

    return next(e)
  })

  on('command.run', { command: 'traffic-light' }, async ($, e) => {
    if (e.args.trim() === 'demo') {
      demo($)
      return { text: 'Showing green, yellow and red for 4 seconds each, then the real state.' }
    }
    await refresh($)
    const now = await read($, light)

    return {
      text: now === null ? 'No state yet.' : `${DOT[now.color]} ${now.headline ?? HEADLINE[now.color]} · ${now.reason}`,
    }
  })

  on('prompt.submit', ($, e, next) => {
    asking = false
    soon($)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      working = true
      pending = greenWork
      if (!isDemo && (await read($, light))?.color === 'green') await show($, WORKING)
    }
    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    asking = false
    if (e.agentId === undefined) {
      working = false
      pending = undefined
    }
    soon($)
    return next(e)
  })

  on('classic.PermissionRequest', async ($, e, next) => {
    await ask($)
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.tool === 'AskUserQuestion') await ask($)
    const ran = await next(e)
    try {
      stopAsking($)
      if (e.tool === 'Edit' || e.tool === 'Write') await edited($, e.file_path)
      if (e.tool === 'NotebookEdit') await edited($, e.notebook_path)
      if (e.tool === 'Bash') {
        if (CHANGE_COMMAND.test(e.command)) await spend($)
        const url = PR_COMMAND.test(e.command) ? PR_URL.exec(ran.text ?? '')?.[0] : undefined
        if (url !== undefined) await update($, pr, () => url)
        if (CHANGE_COMMAND.test(e.command) || PUSH_COMMAND.test(e.command) || url !== undefined) await startWork($)
        if (GIT_COMMAND.test(e.command)) soon($)
      }
    } catch {}

    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const now = await read($, light)
    if (now === null || e.props.hasSurvey) return next(e)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text color={THEME[now.color]} weight="bold">
          ● {now.headline ?? HEADLINE[now.color]}
        </Text>
        <Text dimColor>  {now.reason}</Text>
      </Box>
    )
  })
}

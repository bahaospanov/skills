import { atom, read, update } from 'claude-code'
import type { EngineInterface, ProcessRunResult, Register, Timer } from 'claude-code'

import type { Color, Light, Push, Repo } from '../types'

type Engine = EngineInterface

const INTEGRATION = ['dev', 'develop', 'main', 'master']
// `git@host:o/r.git`, `ssh://git@host:2222/group/sub/r.git`, `https://user:token@host/o/r`.
const REMOTE = /^(?:[a-z+]+:\/\/)?(?:[^@/\s]+@)?(\w[\w.-]*)(?::\d+(?=\/))?[:/]((?:[\w.-]+\/)+[\w.-]+?)(?:\.git)?\/?$/i
const PR_URL = /https:\/\/([\w.-]+)\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)/
const MR_URL = /https?:\/\/([\w.-]+)(?::\d+)?\/((?:[\w.-]+\/)+[\w.-]+)\/-\/merge_requests\/(\d+)/
const MR_URLS = new RegExp(MR_URL.source, 'g')
const WEB_URL = /"web_url"\s*:\s*"([^"]+)"/g
const PR_COMMAND = /\bgh\s+pr\s+(create|view|merge|ready|checks|edit)\b/
const MR_COMMAND = /\bglab\s+mr\s+(create|view|merge|update|approve|rebase)\b|\/merge_requests\b/
const FORGE_COMMAND = /\b(git|gh|glab)\s|\/api\/v4\//
const CHANGE_COMMAND =
  /\b(git\s+(-C\s+\S+\s+)?(commit|revert|cherry-pick|worktree\s+add|checkout\s+-[bB]|switch\s+(-[cC]|--create))|(gh\s+(pr|issue)|glab\s+(mr|issue))\s+create)\b/
// A curl POST creating a GitLab MR or issue; a POST to a path past one (a note, a merge) creates no work, and -G or
// --get, alone or in a short-flag cluster, sends the data as a GET's query: a read.
const REST_CREATE =
  /^(?=[^]*\bcurl\b)(?![^]*\s(?:--get|-[a-zA-Z]*G[a-zA-Z]*)(?=\s|$))(?=[^]*(?:-X\s*POST|--request\s+POST|\s(?:-d|--data\S*|-F|--form|--json)\s))(?=[^]*\/(?:merge_requests|issues)(?![\w/]))/
const PUSH_COMMAND = /\bgit\s+(-C\s+\S+\s+)?push\b/
const COMMIT_COMMAND = /\bgit\s+(-C\s+\S+\s+)?(commit|revert|cherry-pick)\b/
// The folder a command works in: `git -C <dir>`, else a leading `cd <dir>`.
const GIT_DIR = /\bgit\s+-C\s+("[^"]*"|'[^']*'|[^\s;&|]+)/
const CD_DIR = /^\s*cd\s+("[^"]*"|'[^']*'|[^\s;&|]+)\s*(?:&&|;)/
const MAIN_TOOL = /^mcp__(plugin_)?traffic-light__main$/
const PUSH_REMOTE = /^To\s+(\S+)/m
// A ref `git push` updated: ` + a067441...b4135b7 reword -> main`, `   f6f58fb..9e417dc  main -> main`, ` * [new branch] dev -> dev`.
const PUSHED_REF = /^\s*[+*]?\s*(?:\[[^\]]*\]|[0-9a-f]+\.\.\.?([0-9a-f]+))\s+\S+\s+->\s+(?:refs\/heads\/)?(\S+)/gm
const POLL_MS = 30_000
const PIPELINE_START_MS = 3 * 60_000
const DEMO_STEP_MS = 4_000
const CLOSE_SECONDS = 60
const BAR = 40
const NO_GITLAB_ACCESS = "can't read GitLab: set GITLAB_TOKEN or sign in glab"

const light = atom({ plugin: 'traffic-light', key: 'light' } as const, null)
const pr = atom({ plugin: 'traffic-light', key: 'pr' } as const, null)
const workDir = atom({ plugin: 'traffic-light', key: 'workDir' } as const, null)
const sides = atom({ plugin: 'traffic-light', key: 'sides' } as const, [])
const lastPush = atom({ plugin: 'traffic-light', key: 'lastPush' } as const, null)
const spent = atom({ plugin: 'traffic-light', key: 'spent' } as const, [])
const started = atom({ plugin: 'traffic-light', key: 'started' } as const, false)
const closing = atom({ plugin: 'traffic-light', key: 'closing' } as const, null)
const closeClock = atom({ plugin: 'traffic-light', key: 'closeClock' } as const, 0)
const keptOpen = atom({ plugin: 'traffic-light', key: 'keptOpen' } as const, null)

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
const GITLAB_RUNNING = new Set(['created', 'waiting_for_resource', 'preparing', 'pending', 'running', 'scheduled'])
const GITLAB_PASSED = new Set(['success', 'skipped'])
const GITLAB_FAILED = new Set(['failed', 'canceled'])

type Check = { status?: string; conclusion?: string; state?: string }
type Pr = {
  number: number
  url: string
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  baseRefName: string
  headRefName: string
  mergedAt: string | null
  mergeCommit: { oid: string } | null
  statusCheckRollup: Check[] | null
}
type ActionsRun = {
  id: number
  workflow_id: number
  name: string
  status: string
  conclusion: string | null
  created_at: string
}
type Mr = {
  iid: number
  web_url: string
  state: 'opened' | 'closed' | 'locked' | 'merged'
  target_branch: string
  source_branch: string
  merged_at: string | null
  merge_commit_sha: string | null
  squash_commit_sha: string | null
  sha: string
  head_pipeline?: { status: string } | null
}
type Pipeline = { id: number; status: string; name?: string | null }

type Change = {
  repo: Repo
  label: string
  url: string
  state: 'open' | 'closed' | 'merged'
  base: string
  head: string
  mergedAt: string | null
  landed: string | null
  checks: string
}
type Run = { name: string; state: 'running' | 'passed' | 'failed'; word: string }
type Vars = { url?: string | undefined; token?: string | undefined }

// A green verdict's `done` names the work it stands for: the merged PR's URL, or the pushed commit.
type Verdict = Light & { done?: string }

class Blind extends Error {}

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
let ticking: Timer | undefined
let mainTool = 'mcp__traffic-light__main'
// The side checkouts the model has been told about, once each.
const noted = new Set<string>()

// Never the session's folder by default: cleanup removes the worktree a session often runs in, and nothing starts in a
// folder that is gone. Every command names its checkout with `-C` or needs none.
async function run($: Engine, argv: string[], cwd = '/'): Promise<ProcessRunResult | undefined> {
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

const hostOf = (url: string) => /^https?:\/\/([^/:?#]+)/i.exec(url)?.[1]?.toLowerCase()
const noun = (repo: Repo | undefined) => (repo?.forge === 'gitlab' ? 'MR' : 'PR')

// Only its GITLAB_URL and GITLAB_TOKEN lines are read: the file is never run.
async function envFile($: Engine, dir: string | undefined): Promise<Vars> {
  if (dir === undefined) return {}
  const named = await run($, ['git', '-C', dir, 'config', '--type=path', '--get', 'traffic-light.envFile'])
  const file = named?.exitCode === 0 ? named.stdout.trim() : ''
  if (file === '') return {}
  const common = await run($, ['git', '-C', dir, 'rev-parse', '--path-format=absolute', '--git-common-dir'])
  const main = common?.exitCode === 0 ? common.stdout.trim().replace(/\/\.git$/, '') : dir
  const text = await $.fs.read(file.startsWith('/') ? file : `${main}/${file}`).catch(() => '')
  const value = (key: string) =>
    new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=\\s*(.*?)\\s*$`, 'm').exec(text)?.[1]?.replace(/^(["'])(.*)\1$/, '$2')
  return { url: value('GITLAB_URL'), token: value('GITLAB_TOKEN') }
}

// A token goes only to the host its GITLAB_URL names, or, with none, to the remote's host over https.
function accessFor(repo: Repo, { url, token }: Vars) {
  const base = (url || `https://${repo.host}`).replace(/\/+$/, '').replace(/\/api\/v4$/, '')
  return token && hostOf(base) === repo.host ? { base, token } : undefined
}

async function gitlabAccess($: Engine, repo: Repo) {
  const env = { url: await $.env.get('GITLAB_URL'), token: await $.env.get('GITLAB_TOKEN') }
  return accessFor(repo, env) ?? accessFor(repo, await envFile($, repo.dir))
}

async function forgeOf($: Engine, host: string, dir: string | undefined) {
  if (host.includes('github')) return 'github'
  if (host.includes('gitlab')) return 'gitlab'
  const named = [await $.env.get('GITLAB_URL'), (await envFile($, dir)).url]
  return named.some(url => url !== undefined && hostOf(url) === host) ? 'gitlab' : undefined
}

async function repoAt($: Engine, remote: string, dir: string | undefined): Promise<Repo | undefined> {
  const [, host, path] = REMOTE.exec(remote) ?? []
  if (host === undefined || path === undefined) return undefined
  const name = host.toLowerCase()
  return { forge: await forgeOf($, name, dir), host: name, path, dir }
}

async function origin($: Engine, root: string) {
  const out = await run($, ['git', '-C', root, 'remote', 'get-url', 'origin'])
  return out?.exitCode === 0 ? repoAt($, out.stdout.trim(), root) : undefined
}

const unknownForge = (repo: Repo) => new Blind(`can't read ${repo.host}: not GitHub or GitLab`)

async function gitlab($: Engine, repo: Repo, path: string) {
  const api = `projects/${encodeURIComponent(repo.path)}/${path}`
  const access = await gitlabAccess($, repo)
  if (access !== undefined) {
    const headers = { 'PRIVATE-TOKEN': access.token }
    const reply = await $.http.fetch(`${access.base}/api/v4/${api}`, { headers }).catch(() => undefined)
    if (reply === undefined) throw new Blind(`can't reach ${repo.host}`)
    return { status: reply.status, text: reply.text }
  }
  const out = await run($, ['glab', 'api', '--hostname', repo.host, api])
  if (out === undefined) throw new Blind(NO_GITLAB_ACCESS)
  if (out.exitCode === 0) return { status: 200, text: out.stdout }
  return { status: Number(/HTTP (\d{3})/.exec(out.stderr)?.[1] ?? 0), text: `${out.stdout}\n${out.stderr}` }
}

async function gitlabRead<T>($: Engine, repo: Repo, path: string): Promise<T> {
  const reply = await gitlab($, repo, path)
  if (reply.status === 200) return JSON.parse(reply.text) as T
  throw new Blind(`can't read GitLab at ${repo.host}${reply.status === 0 ? '' : ` (HTTP ${reply.status})`}`)
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

async function viewPr($: Engine, target: string, cwd?: string): Promise<Change | 'none'> {
  const fields = 'number,url,state,baseRefName,headRefName,mergedAt,mergeCommit,statusCheckRollup'
  const out = await run($, ['gh', 'pr', 'view', target, '--json', fields], cwd)
  if (out?.exitCode !== 0) {
    if (out !== undefined && /no (open )?pull requests? found/i.test(out.stderr)) return 'none'
    throw new Blind("can't reach GitHub (gh)")
  }
  const found = JSON.parse(out.stdout) as Pr
  const [, host, path] = PR_URL.exec(found.url) ?? []
  return {
    repo: { forge: 'github', host: host ?? 'github.com', path: path ?? '', dir: cwd },
    label: `#${found.number}`,
    url: found.url,
    state: found.state === 'OPEN' ? 'open' : found.state === 'MERGED' ? 'merged' : 'closed',
    base: found.baseRefName,
    head: found.headRefName,
    mergedAt: found.mergedAt,
    landed: path === undefined ? null : (found.mergeCommit?.oid ?? null),
    checks: checksText(found.statusCheckRollup),
  }
}

function fromMr(repo: Repo, found: Mr): Change {
  const pipeline = found.head_pipeline?.status ?? ''
  return {
    repo,
    label: `!${found.iid}`,
    url: found.web_url,
    state: found.state === 'merged' ? 'merged' : found.state === 'closed' ? 'closed' : 'open',
    base: found.target_branch,
    head: found.source_branch,
    mergedAt: found.merged_at,
    // A fast-forward merge makes no commit of its own: the source's head is what landed.
    landed: found.merge_commit_sha ?? found.squash_commit_sha ?? found.sha,
    checks: GITLAB_RUNNING.has(pipeline)
      ? 'pipeline running'
      : GITLAB_FAILED.has(pipeline)
        ? 'pipeline failing'
        : 'waiting for merge',
  }
}

async function changeFor($: Engine, repo: Repo, branch: string, root: string): Promise<Change | 'none'> {
  if (repo.forge === 'github') return viewPr($, branch, root)
  if (repo.forge === undefined) throw unknownForge(repo)
  const list = await gitlabRead<Mr[]>($, repo, `merge_requests?source_branch=${encodeURIComponent(branch)}&state=all`)
  const mine = list.find(one => one.state === 'opened' || one.state === 'locked') ?? list[0]
  return mine === undefined ? 'none' : fromMr(repo, await gitlabRead<Mr>($, repo, `merge_requests/${mine.iid}`))
}

async function changeAt($: Engine, url: string, root: string | undefined): Promise<Change | 'none'> {
  const [, host, path, iid] = MR_URL.exec(url) ?? []
  if (host === undefined || path === undefined) return viewPr($, url)
  const dir = root ?? (await gitRoot($, await $.session.cwd()))
  const repo: Repo = { forge: 'gitlab', host: host.toLowerCase(), path, dir }
  return fromMr(repo, await gitlabRead<Mr>($, repo, `merge_requests/${iid}`))
}

async function listRuns($: Engine, repo: Repo, path: string) {
  const out = await run($, ['gh', 'api', '--hostname', repo.host, path])
  return out?.exitCode === 0 ? (JSON.parse(out.stdout) as { workflow_runs: ActionsRun[] }).workflow_runs : undefined
}

// A run cancelled by a newer push to the same branch (concurrency cancel-in-progress) is settled by that newer run,
// which carries this commit; a failed one by a newer run that passed, as a fix pushed after it ships this commit too.
async function settle($: Engine, repo: Repo, base: string, one: ActionsRun) {
  const isFailed = one.status === 'completed' && !PASSED_RUN.has(one.conclusion ?? '')
  if (!isFailed) return one
  const cancelled = one.conclusion === 'cancelled'
  const only = cancelled ? '' : '&status=success'
  const path = `repos/${repo.path}/actions/workflows/${one.workflow_id}/runs?branch=${base}&event=push${only}&per_page=1`
  const newest = (await listRuns($, repo, path))?.[0]
  const settles = newest !== undefined && newest.created_at > one.created_at
  return settles && (cancelled || newest.conclusion === 'success') ? newest : one
}

async function githubRuns($: Engine, repo: Repo, base: string, sha: string) {
  const runs = await listRuns($, repo, `repos/${repo.path}/actions/runs?head_sha=${sha}&event=push`)
  if (runs === undefined) throw new Blind("can't read the pipeline")
  const settled = await Promise.all(runs.map(one => settle($, repo, base, one)))
  return settled.map((one): Run => {
    if (one.status !== 'completed') return { name: one.name, state: 'running', word: 'running' }
    const state = PASSED_RUN.has(one.conclusion ?? '') ? 'passed' : 'failed'
    return { name: one.name, state, word: one.conclusion ?? 'failed' }
  })
}

// A pipeline auto-cancelled by a newer push to the branch, or failed and then passed by a newer one, is settled by the
// newer one, as `settle` does.
async function gitlabRuns($: Engine, repo: Repo, base: string, sha: string): Promise<Run[]> {
  const ref = encodeURIComponent(base)
  const [first] = await gitlabRead<Pipeline[]>($, repo, `pipelines?sha=${sha}&ref=${ref}&per_page=1`)
  if (first === undefined) return []
  const only = first.status === 'failed' ? '&status=success' : ''
  const [newest] = GITLAB_FAILED.has(first.status)
    ? await gitlabRead<Pipeline[]>($, repo, `pipelines?ref=${ref}${only}&per_page=1`)
    : []
  const settles = newest !== undefined && newest.id > first.id
  const one = settles && (first.status === 'canceled' || GITLAB_PASSED.has(newest.status)) ? newest : first
  const name = one.name ?? `pipeline #${one.id}`
  if (GITLAB_PASSED.has(one.status)) return [{ name, state: 'passed', word: 'passed' }]
  if (GITLAB_FAILED.has(one.status)) return [{ name, state: 'failed', word: one.status }]
  return [{ name, state: 'running', word: one.status === 'manual' ? 'waiting on a manual job' : 'running' }]
}

async function runsOf($: Engine, repo: Repo, base: string, sha: string) {
  if (repo.forge === undefined) throw unknownForge(repo)
  return repo.forge === 'github' ? githubRuns($, repo, base, sha) : gitlabRuns($, repo, base, sha)
}

const blinded = (error: unknown): Light => {
  if (error instanceof Blind) return lit('red', error.message)
  throw error
}

async function pipeline(
  $: Engine,
  repo: Repo,
  base: string,
  sha: string,
  landedAt: string,
  isCleanedUp?: () => Promise<boolean>,
): Promise<Light> {
  const runs = await runsOf($, repo, base, sha).catch(blinded)
  if (!Array.isArray(runs)) return runs
  if (runs.length === 0) {
    const age = (await $.clock.now()) - Date.parse(landedAt)
    if (age >= PIPELINE_START_MS) return lit('green', 'no pipeline ran')
    if (await isCleanedUp?.()) return lit('green', 'no pipeline started, cleaned up')
    return lit('yellow', 'pipeline not started yet')
  }
  const names = (list: Run[]) => [...new Set(list.map(one => one.name))].join(', ')
  const running = runs.filter(one => one.state === 'running')
  if (running.length > 0) return lit('yellow', `${names(running)} ${running[0]?.word}`)
  const failed = runs.filter(one => one.state === 'failed')
  if (failed.length > 0) return lit('red', `${names(failed)} ${failed[0]?.word}`)
  return lit('green', `${names(runs)} passed`)
}

// The playbook removes a PR's branch, from the checkout and from origin, only once its pipeline passed, so a branch
// gone with no run yet means none is coming. `root` is undefined once the worktree holding the branch is removed.
async function cleanedUp($: Engine, repo: Repo, head: string, root: string | undefined) {
  if (root !== undefined) {
    const local = await run($, ['git', '-C', root, 'rev-parse', '--verify', '--quiet', `refs/heads/${head}`])
    if (local?.exitCode !== 1) return false
  }
  if (repo.forge === 'gitlab') {
    // An unauthenticated read of a private project is a 404 too: only the branch's own 404 counts.
    const reply = await gitlab($, repo, `repository/branches/${encodeURIComponent(head)}`).catch(() => undefined)
    return reply?.status === 404 && /Branch Not Found/.test(reply.text)
  }
  const remote = await run($, ['gh', 'api', '--hostname', repo.host, `repos/${repo.path}/branches/${head}`])
  return remote !== undefined && remote.exitCode !== 0 && /\b404\b/.test(remote.stderr)
}

const waiting = (repo: Repo, verdict: Light): Light =>
  repo.forge === 'gitlab' && verdict.color === 'yellow' ? { ...verdict, headline: 'waiting on MR' } : verdict

async function changeLight($: Engine, found: Change, root: string | undefined): Promise<Light> {
  const { label, base } = found
  if (found.state === 'open') return waiting(found.repo, lit('yellow', `${label} open, ${found.checks}`))
  if (found.state === 'closed') return lit('red', `${label} closed without merging`)
  if (!INTEGRATION.includes(base)) return lit('red', `${label} merged into ${base}, not dev or main`)
  if (found.landed === null || found.mergedAt === null) return lit('green', `${label} merged into ${base}`)
  const after = await pipeline($, found.repo, base, found.landed, found.mergedAt, () =>
    cleanedUp($, found.repo, found.head, root),
  )
  return waiting(found.repo, lit(after.color, `${label} merged into ${base}, ${after.reason}`))
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

// Whether its reflog shows a commit made on the branch. One only created, fast-forwarded or rebased with nothing to
// replay holds none, though an integration branch contains it. An unreadable reflog counts as work.
async function hasOwnCommit($: Engine, root: string, branch: string) {
  const out = await run($, ['git', '-C', root, 'reflog', 'show', '--format=%H %gs', `refs/heads/${branch}`])
  if (out?.exitCode !== 0) return true
  return out.stdout.split('\n').some(entry => {
    const [sha, action = ''] = entry.split(/ (.*)/)
    const onto = /\(finish\): \S+ onto ([0-9a-f]+)$/.exec(action)?.[1]
    if (onto !== undefined) return onto !== sha
    return /^(commit|cherry-pick|revert|am)\b/.test(action) || (/^merge\b/.test(action) && !action.endsWith(': Fast-forward'))
  })
}

// The reflog of origin's branch dates when its head reached the remote, the push the pipeline runs for.
async function pushedLight($: Engine, root: string, branch: string, repo: Repo | undefined): Promise<Verdict> {
  const head = await run($, ['git', '-C', root, 'log', '-1', '--format=%H %h'])
  const ref = `refs/remotes/origin/${branch}`
  const pushed = await run($, ['git', '-C', root, 'log', '-g', '-1', '--date=iso-strict', '--format=%gd', ref])
  const [sha, short] = head?.exitCode === 0 ? head.stdout.trim().split(' ') : []
  const pushedAt = pushed?.exitCode === 0 ? /@\{(.+)\}/.exec(pushed.stdout)?.[1] : undefined
  if (sha === undefined || short === undefined || pushedAt === undefined || repo === undefined) {
    return lit('red', `no ${noun(repo)} yet`)
  }
  return pushVerdict($, { repo, branch, sha, at: pushedAt }, short)
}

async function pushVerdict($: Engine, push: Push, short: string): Promise<Verdict> {
  const after = await pipeline($, push.repo, push.branch, push.sha, push.at)
  const verdict = lit(after.color, `${short} pushed to ${push.branch}, ${after.reason}`)
  if (after.color === 'yellow') return { ...verdict, headline: 'waiting on pipeline' }
  return unlessSpent($, verdict, `${push.repo.host}/${push.repo.path}@${push.sha}`, `${short} was pushed`)
}

async function commitSha($: Engine, repo: Repo, ref: string) {
  if (repo.forge === 'gitlab') {
    return (await gitlabRead<{ id: string }>($, repo, `repository/commits/${encodeURIComponent(ref)}`)).id
  }
  if (repo.forge === undefined) return undefined
  const out = await run($, ['gh', 'api', '--hostname', repo.host, `repos/${repo.path}/commits/${ref}`])
  return out?.exitCode === 0 ? (JSON.parse(out.stdout) as { sha: string }).sha : undefined
}

// What the push itself reported, so a ref pushed from a scratch worktree, not the checkout's HEAD, is the work.
async function recordPush($: Engine, printed: string) {
  const remote = PUSH_REMOTE.exec(printed)?.[1]
  const ref = [...printed.matchAll(PUSHED_REF)].filter(line => INTEGRATION.includes(line[2] ?? '')).pop()
  const branch = ref?.[2]
  if (remote === undefined || branch === undefined) return
  const repo = await repoAt($, remote, await gitRoot($, await $.session.cwd()))
  const sha = repo === undefined ? undefined : await commitSha($, repo, ref?.[1] ?? branch).catch(() => undefined)
  if (repo === undefined || sha === undefined) return
  const at = new Date(await $.clock.now()).toISOString()
  await update($, lastPush, () => ({ repo, branch, sha, at }))
}

// A listing names several MRs and follows none; an MR's JSON may link others in its text, its own URL is `web_url`.
function changeUrl(command: string, printed: string) {
  if (PR_COMMAND.test(command)) return PR_URL.exec(printed)?.[0]
  if (!MR_COMMAND.test(command)) return undefined
  const own = [...printed.matchAll(WEB_URL)].map(found => found[1] ?? '').filter(url => MR_URL.test(url))
  const urls = new Set(own.length > 0 ? own : [...printed.matchAll(MR_URLS)].map(found => found[0]))
  return urls.size === 1 ? [...urls][0] : undefined
}

async function judge($: Engine): Promise<Verdict> {
  if (!(await read($, started))) return lit('green', 'no work started')
  const edited = await read($, workDir)
  const push = await read($, lastPush)
  if (edited === null && push !== null) return pushVerdict($, push, push.sha.slice(0, 7))
  const dir = edited ?? (await $.session.cwd())
  const root = await gitRoot($, dir)
  const left = root === undefined ? undefined : await unfinished($, root)
  if (left !== undefined) return lit('red', left)
  const branch = root === undefined ? '' : await currentBranch($, root)
  const repo = root === undefined ? undefined : await origin($, root)
  const tracked = await read($, pr)
  if (root !== undefined && INTEGRATION.includes(branch) && tracked === null) return pushedLight($, root, branch, repo)
  const feature = root !== undefined && branch !== '' && !INTEGRATION.includes(branch) ? branch : undefined
  let found: Change | 'none'
  try {
    found =
      feature !== undefined && root !== undefined
        ? repo === undefined
          ? 'none'
          : await changeFor($, repo, feature, root)
        : tracked !== null
          ? await changeAt($, tracked, root)
          : 'none'
  } catch (error) {
    // Cleanup removes the edited worktree only once its work is done, and the token its env file gave goes with it.
    if (!(error instanceof Blind) || edited === null || root !== undefined) throw error
    return unlessSpent($, lit('green', 'worktree removed, cleaned up'), edited, 'cleanup')
  }
  if (found === 'none') {
    const isFresh = root !== undefined && feature !== undefined && !(await hasOwnCommit($, root, feature))
    const pushed = root === undefined || isFresh ? undefined : await pushedTo($, root)
    return root === undefined || pushed === undefined ? lit('red', `no ${noun(repo)} yet`) : pushedLight($, root, pushed, repo)
  }
  const url = found.url
  if (feature !== undefined && url !== tracked) await update($, pr, () => url)
  return unlessSpent($, await changeLight($, found, root), url, `${found.label} merged`)
}

// A side checkout's own work: its PR, or its push to an integration branch. Its uncommitted files are not judged: a
// shared checkout carries other agents' too.
async function sideLight($: Engine, root: string): Promise<Light | undefined> {
  const branch = await currentBranch($, root)
  const repo = await origin($, root)
  if (repo === undefined || branch === '') return undefined
  if (INTEGRATION.includes(branch)) {
    return (await hasOwnCommit($, root, branch)) ? pushedLight($, root, branch, repo) : undefined
  }
  const found = await changeFor($, repo, branch, root)
  if (found !== 'none') return changeLight($, found, root)
  return (await hasOwnCommit($, root, branch)) ? lit('red', `no ${noun(repo)} yet`) : undefined
}

// The main work's green waits on every side checkout still in flight; cleanup removing one ends its wait.
async function heldBySide($: Engine): Promise<Light | undefined> {
  const main = await read($, workDir)
  for (const root of await read($, sides)) {
    if (root === main) continue
    if ((await gitRoot($, root)) !== root) {
      await update($, sides, list => list.filter(one => one !== root))
      continue
    }
    const side = await sideLight($, root).catch(() => undefined)
    if (side !== undefined && side.color !== 'green') return { ...side, reason: `side work in ${root}: ${side.reason}` }
  }
  return undefined
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
      const verdict = await judge($).catch(
        (error: unknown): Verdict => lit('red', error instanceof Blind ? error.message : "couldn't read the work state"),
      )
      const held = verdict.color === 'green' ? await heldBySide($).catch(() => undefined) : undefined
      const { done, ...next }: Verdict = held ?? verdict
      greenWork = done
      if (!isDemo) {
        const shown = face(next)
        await show($, shown)
        await closeWhenDone($, shown)
      }
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
  await stopClosing($)
  if (!isDemo) await show($, ASKING)
}

// `herdr agent start <name>` names the agent it starts: a named Herdr agent is a subtask another agent started.
async function subtaskPane($: Engine) {
  const pane = (await $.env.get('HERDR_PANE_ID')) ?? ''
  if (pane === '') return undefined
  const out = await run($, ['herdr', 'agent', 'get', pane])
  if (out?.exitCode !== 0) return undefined
  try {
    const agent = (JSON.parse(out.stdout) as { result?: { agent?: { name?: string | null } } }).result?.agent
    return agent?.name ? pane : undefined
  } catch {
    return undefined
  }
}

async function closeWhenDone($: Engine, shown: Light) {
  const work = greenWork
  if (shown.color !== 'green' || work === undefined || working || asking) return stopClosing($)
  if ((await read($, closing)) !== null || (await read($, keptOpen)) === work) return
  const pane = await subtaskPane($)
  if (pane === undefined || working || asking || greenWork !== work) return
  const t = await $.clock.now()
  await update($, closeClock, () => t)
  await update($, closing, () => ({ pane, work, endsAt: t + CLOSE_SECONDS * 1000 }))
  startTicking($)
}

function startTicking($: Engine) {
  ticking?.cancel()
  ticking = $.clock.every(1000, () => {
    void (async () => {
      const c = await read($, closing)
      if (c === null) return stopTicking()
      const t = await $.clock.now()
      await update($, closeClock, () => t)
      if (t >= c.endsAt) await closePane($)
    })()
  })
}

function stopTicking() {
  ticking?.cancel()
  ticking = undefined
}

async function stopClosing($: Engine) {
  stopTicking()
  if ((await read($, closing)) !== null) await update($, closing, () => null)
}

async function keepOpen($: Engine, why: string) {
  const c = await read($, closing)
  if (c === null) return false
  await stopClosing($)
  await update($, keptOpen, () => c.work)
  $.ui.toast(`Pane close cancelled: ${why}`)
  return true
}

async function closePane($: Engine) {
  const c = await read($, closing)
  await stopClosing($)
  if (c !== null) await run($, ['herdr', 'pane', 'close', c.pane])
}

function stopAsking($: Engine) {
  if (!asking) return
  asking = false
  soon($)
}

async function startWork($: Engine) {
  await update($, started, () => true)
  soon($)
}

const parentOf = (file: string) => file.slice(0, Math.max(file.lastIndexOf('/'), 1))
const pathOf = (input: Record<string, unknown>) => (typeof input.path === 'string' ? input.path : '')

async function pathIn($: Engine, cwd: string, named: string) {
  const bare = named.replace(/^(["'])(.*)\1$/, '$2')
  if (bare.startsWith('/')) return bare
  if (bare === '~' || bare.startsWith('~/')) return `${(await $.env.get('HOME')) ?? ''}${bare.slice(1)}`
  return `${cwd}/${bare}`
}

async function commandRoot($: Engine, command: string) {
  const cwd = await $.session.cwd()
  const named = GIT_DIR.exec(command)?.[1] ?? CD_DIR.exec(command)?.[1]
  return gitRoot($, named === undefined ? cwd : await pathIn($, cwd, named))
}

// The main work is the checkout `workDir` names: the first one edited, or the one marked with the main tool. Work in
// another checkout is side work, unless the main work is done in a session no parent started: then that checkout is.
async function sideOf($: Engine, root: string | undefined) {
  const main = await read($, workDir)
  if (root === undefined || main === null || root === main) return undefined
  return greenWork === undefined || (await subtaskPane($)) !== undefined ? root : undefined
}

function sideNote(root: string, main: string | null) {
  if (noted.has(root)) return undefined
  noted.add(root)
  return (
    `traffic-light: ${root} is side work. The light, and a Herdr subtask's pane close, follow the main work in ${main}. ` +
    `If ${root} holds the session's main work, mark it with the ${mainTool} tool.`
  )
}

async function addSide($: Engine, root: string) {
  if (!(await read($, sides)).includes(root)) await update($, sides, list => [...list, root])
}

// The checkout the main work leaves stays waited on as side work.
async function makeMain($: Engine, root: string) {
  const main = await read($, workDir)
  if (main !== null && main !== root) {
    await update($, pr, () => null)
    await addSide($, main)
  }
  await update($, sides, list => list.filter(one => one !== root))
  await update($, workDir, () => root)
  await startWork($)
}

async function edited($: Engine, file: string) {
  const root = await gitRoot($, parentOf(file))
  if (root === undefined) return undefined
  if ((await sideOf($, root)) !== undefined) {
    await addSide($, root)
    return sideNote(root, await read($, workDir))
  }
  await makeMain($, root)
  if (pending === undefined) return undefined
  const ignored = await run($, ['git', '-C', root, 'check-ignore', '-q', file])
  if (ignored?.exitCode !== 0) await spend($)
  return undefined
}

// A command run in a side checkout leaves the main work's light, PR and push as they were.
async function ranCommand($: Engine, command: string, printed: string) {
  const isChange = CHANGE_COMMAND.test(command) || REST_CREATE.test(command)
  const isPush = PUSH_COMMAND.test(command)
  const url = changeUrl(command, printed)
  if (FORGE_COMMAND.test(command)) soon($)
  if (!isChange && !isPush && url === undefined) return undefined
  const side = await sideOf($, await commandRoot($, command))
  if (side !== undefined) {
    if (isPush || url !== undefined || COMMIT_COMMAND.test(command)) await addSide($, side)
    return sideNote(side, await read($, workDir))
  }
  if (isChange) {
    await spend($)
    await update($, lastPush, () => null)
  }
  if (isPush) await recordPush($, printed)
  if (url !== undefined) await update($, pr, () => url)
  await startWork($)
  return undefined
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
      description: 'Refresh the traffic light; "demo" shows green, yellow and red; "keep-open" stops the pane closing',
    })
    const registered = await $.tool.register({
      name: 'main',
      description:
        "Mark the session's main work: the checkout (worktree) that holds it, given as any path inside it. " +
        "The traffic light, and a Herdr subtask's pane close, follow the main work only; work in any other checkout " +
        'is side work. Unmarked, the first checkout the session edits in is the main work.',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string', description: "A file or folder inside the main work's checkout" } },
        required: ['path'],
      },
    })
    mainTool = registered.tool
    $.clock.every(POLL_MS, () => {
      void read($, light).then(now => (now?.color === 'yellow' ? refresh($) : undefined))
    })
    if ((await read($, closing)) !== null) startTicking($)
    soon($)

    return next(e)
  })

  on('command.run', { command: 'traffic-light' }, async ($, e) => {
    if (e.args.trim() === 'demo') {
      demo($)
      return { text: 'Showing green, yellow and red for 4 seconds each, then the real state.' }
    }
    if (e.args.trim() === 'keep-open') {
      return { text: (await keepOpen($, '/traffic-light keep-open')) ? 'The pane stays open.' : 'No close was scheduled.' }
    }
    await refresh($)
    const now = await read($, light)

    return {
      text: now === null ? 'No state yet.' : `${DOT[now.color]} ${now.headline ?? HEADLINE[now.color]} · ${now.reason}`,
    }
  })

  on('prompt.submit', async ($, e, next) => {
    asking = false
    if (e.origin.kind === 'composer' || e.origin.kind === 'bridge') await keepOpen($, 'a message was typed')
    soon($)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      working = true
      pending = greenWork
      await stopClosing($)
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

  on('tool.call', { tool: MAIN_TOOL }, async ($, e) => {
    const path = pathOf(e)
    const root = path === '' ? undefined : ((await gitRoot($, path)) ?? (await gitRoot($, parentOf(path))))
    if (root === undefined) return { deny: `traffic-light: ${path || 'no path'} is in no git checkout` }
    await makeMain($, root)
    return {
      result:
        `traffic-light: the main work is ${root}. Work in any other checkout is side work: ` +
        "it never turns the light green or closes a Herdr subtask's pane.",
    }
  }).catch(() => ({ deny: "traffic-light: couldn't mark the main work" }))

  on('tool.call', async ($, e, next) => {
    if (e.tool === 'AskUserQuestion') await ask($)
    const ran = await next(e)
    let note: string | undefined
    try {
      stopAsking($)
      if (e.tool === 'Edit' || e.tool === 'Write') note = await edited($, e.file_path)
      if (e.tool === 'NotebookEdit') note = await edited($, e.notebook_path)
      if (e.tool === 'Bash') note = await ranCommand($, e.command, ran.text ?? '')
    } catch {}

    if (note === undefined || ran.deny !== undefined) return ran
    return { ...ran, context: [...(ran.context ?? []), note] }
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const now = await read($, light)
    if (now === null || e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const row = (
      <Box>
        <Text color={THEME[now.color]} weight="bold">
          ● {now.headline ?? HEADLINE[now.color]}
        </Text>
        <Text dimColor>  {now.reason}</Text>
      </Box>
    )
    const c = await read($, closing)
    if (c === null) return row

    const left = Math.max(0, Math.ceil((c.endsAt - (await read($, closeClock))) / 1000))
    const width = Math.max(10, Math.min(BAR, e.props.bodyColumns - 24))
    const filled = Math.min(width, Math.round((width * left) / CLOSE_SECONDS))
    return (
      <Box flexDirection="column">
        {row}
        <Box>
          <Text color="success">⏻ Pane closes in {left}s </Text>
          <Text color="success">
            {'█'.repeat(filled)}
            <Text dimColor>{'░'.repeat(width - filled)}</Text>
          </Text>
        </Box>
        <Box>
          <Button key="keep-open" label="✋ Keep open" onPress={() => void keepOpen($, 'Keep open pressed')} />
          <Text> </Text>
          <Button key="close-now" label="❌ Close now" onPress={() => void closePane($)} />
        </Box>
      </Box>
    )
  })
}

import { atom, read, update } from 'claude-code'
import type { EngineInterface, ProcessRunResult, Register } from 'claude-code'

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
// A curl POST creating a GitLab MR or issue; a POST to a path past one (a note, a merge) creates no work.
const REST_CREATE =
  /^(?=[^]*\bcurl\b)(?=[^]*(?:-X\s*POST|--request\s+POST|\s(?:-d|--data\S*|-F|--form|--json)\s))(?=[^]*\/(?:merge_requests|issues)(?![\w/]))/
const PUSH_COMMAND = /\bgit\s+(-C\s+\S+\s+)?push\b/
const PUSH_REMOTE = /^To\s+(\S+)/m
// A ref `git push` updated: ` + a067441...b4135b7 reword -> main`, `   f6f58fb..9e417dc  main -> main`, ` * [new branch] dev -> dev`.
const PUSHED_REF = /^\s*[+*]?\s*(?:\[[^\]]*\]|[0-9a-f]+\.\.\.?([0-9a-f]+))\s+\S+\s+->\s+(?:refs\/heads\/)?(\S+)/gm
const POLL_MS = 30_000
const PIPELINE_START_MS = 3 * 60_000
const DEMO_STEP_MS = 4_000
const NO_GITLAB_ACCESS = "can't read GitLab: set GITLAB_TOKEN or sign in glab"

const light = atom({ plugin: 'traffic-light', key: 'light' } as const, null)
const pr = atom({ plugin: 'traffic-light', key: 'pr' } as const, null)
const workDir = atom({ plugin: 'traffic-light', key: 'workDir' } as const, null)
const lastPush = atom({ plugin: 'traffic-light', key: 'lastPush' } as const, null)
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

// A run cancelled by a newer push to the same branch (concurrency
// cancel-in-progress) is settled by that newer run, which carries this commit.
async function settle($: Engine, repo: Repo, base: string, one: ActionsRun) {
  if (one.conclusion !== 'cancelled') return one
  const path = `repos/${repo.path}/actions/workflows/${one.workflow_id}/runs?branch=${base}&event=push&per_page=1`
  const newest = (await listRuns($, repo, path))?.[0]
  return newest !== undefined && newest.created_at > one.created_at ? newest : one
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

// A pipeline auto-cancelled by a newer push to the branch is settled by the newer one, as `settle` does.
async function gitlabRuns($: Engine, repo: Repo, base: string, sha: string): Promise<Run[]> {
  const ref = encodeURIComponent(base)
  const [first] = await gitlabRead<Pipeline[]>($, repo, `pipelines?sha=${sha}&ref=${ref}&per_page=1`)
  if (first === undefined) return []
  const [newest] = first.status === 'canceled' ? await gitlabRead<Pipeline[]>($, repo, `pipelines?ref=${ref}&per_page=1`) : []
  const one = newest !== undefined && newest.id > first.id ? newest : first
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
  const found =
    feature !== undefined && root !== undefined
      ? repo === undefined
        ? 'none'
        : await changeFor($, repo, feature, root)
      : tracked !== null
        ? await changeAt($, tracked, root)
        : 'none'
  if (found === 'none') {
    const pushed = root === undefined ? undefined : await pushedTo($, root)
    return root === undefined || pushed === undefined ? lit('red', `no ${noun(repo)} yet`) : pushedLight($, root, pushed, repo)
  }
  return unlessSpent($, await changeLight($, found, root), found.url, `${found.label} merged`)
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
      const { done, ...next } = await judge($).catch(
        (error: unknown): Verdict => lit('red', error instanceof Blind ? error.message : "couldn't read the work state"),
      )
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
        const isChange = CHANGE_COMMAND.test(e.command) || REST_CREATE.test(e.command)
        if (isChange) {
          await spend($)
          await update($, lastPush, () => null)
        }
        if (PUSH_COMMAND.test(e.command)) await recordPush($, ran.text ?? '')
        const url = changeUrl(e.command, ran.text ?? '')
        if (url !== undefined) await update($, pr, () => url)
        if (isChange || PUSH_COMMAND.test(e.command) || url !== undefined) await startWork($)
        if (FORGE_COMMAND.test(e.command)) soon($)
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

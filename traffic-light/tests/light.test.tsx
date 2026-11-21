import { expect, mock, test } from 'claude-code/testing'
import type { Engine, Mounted } from 'claude-code/testing'
import type { On } from 'claude-code'

const BAND = {
  plugin: 'traffic-light',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const URL = 'https://github.com/o/r/pull/7'
const MR = 'https://gitlab.example.com/team/app/-/merge_requests/360'
const TOKEN = 'glpat-secret'
const GITLAB = { remote: 'git@gitlab.example.com:team/app.git', env: { GITLAB_TOKEN: TOKEN } }

type Run = { id: number; workflow_id: number; name: string; status: string; conclusion: string | null; created_at: string }
type Pipeline = { id: number; status: string; ref: string; sha: string; name: null; created_at: string }
type Merge = { iid: number; source_branch: string }
// A second checkout of the same origin, holding other work than the session's first edit.
type Side = { root: string; branch: string; pr: Record<string, unknown> | null }
type World = {
  side: Side | null
  branch: string
  status: string
  pr: Record<string, unknown> | null
  runs: Run[]
  newest: Run[]
  printed: string
  head: string
  pushedAt: string
  landed: string
  reflog: string | null
  isFresh: boolean
  hasCheckout: boolean
  isSessionInCheckout: boolean
  localBranches: string[]
  originBranches: string[]
  remote: string
  env: Record<string, string>
  envFile: string | null
  files: Record<string, string>
  hasGlab: boolean
  mrs: Merge[]
  pipelines: Pipeline[]
  fetched: string[]
  calls: string[]
  agentName: string | null
}

const run = (status: string, conclusion: string | null, created_at = '2026-10-25T10:00:05Z'): Run => ({
  id: 1,
  workflow_id: 9,
  name: 'deploy-dev',
  status,
  conclusion,
  created_at,
})

const pull = (state: string, extra: Record<string, unknown> = {}) => ({
  number: 7,
  url: URL,
  state,
  baseRefName: 'dev',
  headRefName: 'feat/x',
  mergedAt: '2026-10-25T10:00:00Z',
  mergeCommit: { oid: 'abc123' },
  statusCheckRollup: [],
  ...extra,
})

const pipeline = (id: number, status: string, sha = 'abc1234000'): Pipeline => ({
  id,
  status,
  ref: 'dev',
  sha,
  name: null,
  created_at: '2026-10-25T10:00:05Z',
})

const merge = (state: string, extra: Record<string, unknown> = {}) => ({
  iid: 360,
  web_url: MR,
  state,
  target_branch: 'dev',
  source_branch: 'feat/x',
  merged_at: '2026-10-25T10:00:00Z',
  merge_commit_sha: null,
  squash_commit_sha: null,
  sha: 'abc1234000',
  head_pipeline: null,
  ...extra,
})

// GitLab's REST API over `world`, as GITLAB_TOKEN or glab reach it; `path` follows `projects/team%2Fapp/`.
function gitlab(world: World, path: string) {
  const [route = '', query = ''] = path.split('?')
  const params: Record<string, string> = Object.fromEntries(query.split('&').map(pair => pair.split('=').map(decodeURIComponent)))
  const found = (body: unknown) => ({ status: 200, body })
  const missing = (what: string) => ({ status: 404, body: { message: `404 ${what} Not Found` } })
  if (route === 'merge_requests') return found(world.mrs.filter(one => one.source_branch === params.source_branch))
  const iid = /^merge_requests\/(\d+)$/.exec(route)?.[1]
  const one = world.mrs.find(mr => mr.iid === Number(iid))
  if (iid !== undefined) return one === undefined ? missing('Merge Request') : found(one)
  if (route === 'pipelines') {
    const list = world.pipelines.filter(
      one =>
        one.ref === params.ref && (params.sha ?? one.sha) === one.sha && (params.status ?? one.status) === one.status,
    )
    return found(list.sort((a, b) => b.id - a.id).slice(0, Number(params.per_page ?? 20)))
  }
  const branch = /^repository\/branches\/(.+)$/.exec(route)?.[1]
  if (branch !== undefined) return world.originBranches.includes(decodeURIComponent(branch)) ? found({}) : missing('Branch')
  if (route.startsWith('repository/commits/')) return found({ id: `${world.head}000` })
  return missing('Route')
}

function reply(world: World, argv: readonly string[]) {
  const ok = (stdout: string) => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })
  const fail = (stderr: string) => ({ ...ok(''), exitCode: 1, stderr })
  const line = argv.join(' ')
  world.calls.push(line)
  if (argv[0] === 'glab') {
    const { status, body } = gitlab(world, (argv.at(-1) ?? '').replace('projects/team%2Fapp/', ''))
    return status === 200 ? ok(JSON.stringify(body)) : fail(`glab: ${JSON.stringify(body)} (HTTP ${status})`)
  }
  if (line.startsWith('herdr agent get')) return ok(JSON.stringify({ result: { agent: { name: world.agentName } } }))
  if (line.startsWith('herdr pane close')) return ok('')
  if (line.includes('config --type=path --get traffic-light.envFile')) {
    return world.envFile === null ? fail('') : ok(`${world.envFile}\n`)
  }
  if (line.includes('rev-parse --path-format=absolute --git-common-dir')) return ok('/main/.git\n')
  const side = world.side
  if (side !== null && line.includes(`-C ${side.root}`)) {
    if (line.includes('rev-parse --show-toplevel')) return ok(`${side.root}\n`)
    if (line.includes('branch --show-current')) return ok(`${side.branch}\n`)
  }
  if (side !== null && line.startsWith('gh pr view') && [side.branch, side.pr?.url].includes(argv[3])) {
    return side.pr === null ? fail(`no pull requests found for branch "${side.branch}"`) : ok(JSON.stringify(side.pr))
  }
  if (line.includes('rev-parse --show-toplevel')) return world.hasCheckout ? ok('/repo\n') : fail('not a git repository')
  if (line.includes('rev-parse --verify --quiet refs/heads/')) {
    return world.localBranches.some(name => line.endsWith(`refs/heads/${name}`)) ? ok('abc1234000\n') : fail('')
  }
  if (line.includes('/branches/')) {
    return world.originBranches.some(name => line.endsWith(`/branches/${name}`))
      ? ok('{}')
      : fail('gh: Branch not found (HTTP 404)')
  }
  if (line.includes('status --porcelain')) return ok(world.status)
  if (line.includes('rev-list --count')) return ok('0\n')
  if (line.includes('branch --show-current')) return ok(`${world.branch}\n`)
  if (line.includes('check-ignore')) return fail('')
  if (line.includes('log -g')) return ok(`origin/${world.branch}@{${world.pushedAt}}\n`)
  if (line.includes('log -1')) return ok(`${world.head}000 ${world.head}\n`)
  if (line.includes('remote get-url origin')) return ok(`${world.remote}\n`)
  if (line.includes('for-each-ref --contains HEAD')) return ok(world.landed)
  if (line.includes('reflog show')) return world.reflog === null ? fail('') : ok(world.reflog)
  if (line.startsWith('gh pr view')) {
    return world.pr === null ? fail(`no pull requests found for branch "${world.branch}"`) : ok(JSON.stringify(world.pr))
  }
  if (line.includes('/commits/')) return ok(JSON.stringify({ sha: `${world.head}000` }))
  if (line.includes('/actions/workflows/')) return ok(JSON.stringify({ workflow_runs: world.newest }))
  if (line.includes('/actions/runs?')) return ok(JSON.stringify({ workflow_runs: world.runs }))
  return fail('unexpected command')
}

// Stands for the engine beneath the mod: git, gh, glab, GitLab's API and the Bash tool answer from `world`. Unless
// fresh, the session has started work with an edit. A session in the checkout starts no process there once it is gone.
async function start($: Engine, on: On, world: Partial<World>) {
  const full: World = {
    side: null,
    branch: 'feat/x',
    status: '',
    pr: null,
    runs: [],
    newest: [],
    printed: '',
    head: 'abc1234',
    pushedAt: '2026-10-25T10:00:00Z',
    landed: '',
    reflog: null,
    isFresh: false,
    hasCheckout: true,
    isSessionInCheckout: false,
    localBranches: ['feat/x'],
    originBranches: ['feat/x'],
    remote: 'git@github.com:o/r.git',
    env: {},
    envFile: null,
    files: {},
    hasGlab: false,
    mrs: [],
    pipelines: [],
    fetched: [],
    calls: [],
    agentName: null,
    ...world,
  }
  const clock = mock.clock(on, { now: Date.parse('2026-10-25T10:01:00Z') })
  on('command.register', () => ({ value: { command: 'traffic-light' } }))
  on('tool.register', (_, e) => ({ value: { tool: `mcp__traffic-light__${e.name}` } }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('env.get', (_, e) => ({ value: full.env[e.name] }))
  on('fs.read', (_, e) => {
    const text = full.files[e.path]
    return text === undefined ? { deny: `ENOENT: ${e.path}` } : { value: text }
  })
  on('process.run', (_, e) => {
    if (full.isSessionInCheckout && !full.hasCheckout && (e.init?.cwd ?? '/repo') === '/repo') {
      return { deny: `spawn ${e.argv[0]} ENOENT` }
    }
    return e.argv[0] === 'glab' && !full.hasGlab ? { deny: 'glab: command not found' } : { value: reply(full, e.argv) }
  })
  on('http.fetch', (_, e) => {
    full.fetched.push(e.url)
    const path = /^https:\/\/[^/]+\/api\/v4\/projects\/team%2Fapp\/(.*)$/.exec(e.url)?.[1]
    const { status, body } =
      e.init?.headers?.['PRIVATE-TOKEN'] !== TOKEN
        ? { status: 401, body: { message: '401 Unauthorized' } }
        : path === undefined
          ? { status: 404, body: { message: '404 Project Not Found' } }
          : gitlab(full, path)
    return { value: { status, ok: status < 300, headers: {}, text: JSON.stringify(body) } }
  })
  on('tool.call', () => ({ result: {}, text: full.printed }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('classic.PermissionRequest', () => ({}))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  if (!full.isFresh) await $.tool.call({ tool: 'Edit', file_path: '/repo/a.ts', old_string: 'a', new_string: 'b' })
  return Object.assign(full, { clock })
}

async function light($: Engine) {
  const presentation = { isFullscreen: false, columns: 120 }
  return (await $.command.run({ command: 'traffic-light', args: '', origin: { kind: 'composer' }, presentation })).text
}

test('a session that started no work is green, and red only while a turn runs', async ($, on) => {
  await start($, on, { isFresh: true, status: ' M notes.md\n' })
  expect(await light($)).toBe('🟢 safe to leave · no work started')

  await $.turn.start({ text: 'what does this repo do?', turnId: 't1' })
  expect(await light($)).toBe('🔴 working · Claude is working')

  await $.turn.complete(ENDED)
  expect(await light($)).toBe('🟢 safe to leave · no work started')
})

test('a commit, a push or a PR starts the work', async ($, on) => {
  const world = await start($, on, { isFresh: true })
  await $.tool.call({ tool: 'Bash', command: 'git -C /repo push origin feat/x' })
  expect(await light($)).toBe('🔴 working · no PR yet')

  world.branch = 'dev'
  world.printed = `${URL}\n`
  world.pr = pull('OPEN')
  await $.tool.call({ tool: 'Bash', command: 'gh pr view 7' })
  expect(await light($)).toBe('🟡 waiting on PR · #7 open, waiting for merge')
})

test('a branch with no PR is red, in the band too', async ($, on) => {
  await start($, on, {})

  expect(await light($)).toBe('🔴 working · no PR yet')
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /● working/ }))?.text).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /no PR yet/ }))?.text).toBeDefined()
  await ui.unmount()
})

test('uncommitted changes are red even with an open PR', async ($, on) => {
  await start($, on, { status: ' M hooks/register.tsx\n', pr: pull('OPEN') })

  expect(await light($)).toBe('🔴 working · uncommitted changes')
})

test('an open PR is yellow, failing checks included', async ($, on) => {
  const world = await start($, on, { pr: pull('OPEN', { statusCheckRollup: [{ status: 'IN_PROGRESS' }] }) })
  expect(await light($)).toBe('🟡 waiting on PR · #7 open, checks running')

  world.pr = pull('OPEN', { statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'FAILURE' }] })
  expect(await light($)).toBe('🟡 waiting on PR · #7 open, checks failing')
})

test('a merged PR is yellow while its pipeline runs, green once it passed', async ($, on) => {
  const world = await start($, on, { pr: pull('MERGED'), runs: [run('in_progress', null)] })
  expect(await light($)).toBe('🟡 waiting on PR · #7 merged into dev, deploy-dev running')

  world.runs = [run('completed', 'success')]
  expect(await light($)).toBe('🟢 safe to leave · #7 merged into dev, deploy-dev passed')
})

test('a failed pipeline is red', async ($, on) => {
  await start($, on, { pr: pull('MERGED'), runs: [run('completed', 'failure')] })

  expect(await light($)).toBe('🔴 working · #7 merged into dev, deploy-dev failure')
})

test('a run cancelled by a newer push is settled by that push', async ($, on) => {
  await start($, on, {
    pr: pull('MERGED'),
    runs: [run('completed', 'cancelled')],
    newest: [run('completed', 'success', '2026-10-25T10:02:00Z')],
  })

  expect(await light($)).toBe('🟢 safe to leave · #7 merged into dev, deploy-dev passed')
})

test('a failed run is settled by a newer one of its workflow that passed', async ($, on) => {
  const world = await start($, on, {
    pr: pull('MERGED'),
    runs: [run('completed', 'failure')],
    newest: [run('completed', 'failure', '2026-10-25T10:02:00Z')],
  })
  expect(await light($)).toBe('🔴 working · #7 merged into dev, deploy-dev failure')

  world.newest = [run('completed', 'success', '2026-10-25T10:02:00Z')]
  expect(await light($)).toBe('🟢 safe to leave · #7 merged into dev, deploy-dev passed')
})

test('a PR merged into a feature branch is red', async ($, on) => {
  await start($, on, { pr: pull('MERGED', { baseRefName: 'feat/base' }) })

  expect(await light($)).toBe('🔴 working · #7 merged into feat/base, not dev or main')
})

test('the PR a gh command printed is followed once the branch is gone', async ($, on) => {
  const world = await start($, on, { pr: null, printed: `${URL}\n` })
  await $.tool.call({ tool: 'Bash', command: 'gh pr create --base dev --fill' })

  world.branch = 'dev'
  world.pr = pull('MERGED')
  world.runs = [run('completed', 'success')]
  expect(await light($)).toBe('🟢 safe to leave · #7 merged into dev, deploy-dev passed')
})

const NOT_STARTED = '🟡 waiting on PR · #7 merged into dev, pipeline not started yet'
const CLEANED_UP = '🟢 safe to leave · #7 merged into dev, no pipeline started, cleaned up'

test('a merged PR no pipeline picked up is green once cleanup removed its branch, without the three-minute wait', async ($, on) => {
  const world = await start($, on, { pr: pull('MERGED'), printed: `${URL}\n` })
  await $.tool.call({ tool: 'Bash', command: 'gh pr create --base dev --fill' })
  expect(await light($)).toBe(NOT_STARTED)

  world.originBranches = []
  expect(await light($)).toBe(NOT_STARTED)

  world.branch = 'dev'
  world.localBranches = []
  expect(await light($)).toBe(CLEANED_UP)
})

test('a merged PR no pipeline picked up is green once its worktree and branch are gone', async ($, on) => {
  const world = await start($, on, { pr: pull('MERGED'), printed: `${URL}\n` })
  await $.tool.call({ tool: 'Bash', command: 'gh pr create --base dev --fill' })
  expect(await light($)).toBe(NOT_STARTED)

  world.hasCheckout = false
  expect(await light($)).toBe(NOT_STARTED)

  world.originBranches = []
  expect(await light($)).toBe(CLEANED_UP)
})

test('a merged PR is green once cleanup removed the worktree the session runs in', async ($, on) => {
  const world = await start($, on, { pr: pull('MERGED'), printed: `${URL}\n`, isSessionInCheckout: true })
  await $.tool.call({ tool: 'Bash', command: 'gh pr create --base dev --fill' })
  expect(await light($)).toBe(NOT_STARTED)

  world.hasCheckout = false
  world.originBranches = []
  expect(await light($)).toBe(CLEANED_UP)
})

const GREEN ='🟢 safe to leave · #7 merged into dev, deploy-dev passed'
const ENDED = { turnId: 't1', answer: 'done', durationMs: 1_000, isAborted: false, reason: 'answer' } as const

test('a turn after green is red while it runs, and green again when it changed nothing', async ($, on) => {
  await start($, on, { pr: pull('MERGED'), runs: [run('completed', 'success')] })
  expect(await light($)).toBe(GREEN)

  await $.turn.start({ text: 'what does the band read?', turnId: 't1' })
  expect(await light($)).toBe('🔴 working · Claude is working')

  await $.turn.complete(ENDED)
  expect(await light($)).toBe(GREEN)
})

test('an edit in a turn after green keeps the merged PR from turning it green again', async ($, on) => {
  const world = await start($, on, { pr: pull('MERGED'), runs: [run('completed', 'success')] })
  expect(await light($)).toBe(GREEN)

  await $.turn.start({ text: 'make the footer bolder', turnId: 't1' })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/footer.tsx', old_string: 'a', new_string: 'b' })
  await $.turn.complete(ENDED)
  expect(await light($)).toBe('🔴 working · new work since #7 merged')

  world.pr = pull('MERGED', { number: 8, url: 'https://github.com/o/r/pull/8' })
  expect(await light($)).toBe('🟢 safe to leave · #8 merged into dev, deploy-dev passed')
})

test('a worktree opened in a turn after green spends it too', async ($, on) => {
  await start($, on, { pr: pull('MERGED'), runs: [run('completed', 'success')] })
  expect(await light($)).toBe(GREEN)

  await $.turn.start({ text: 'now the scan screen', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'git -C /repo worktree add .worktrees/scan -b feat/scan dev' })
  await $.turn.complete(ENDED)
  expect(await light($)).toBe('🔴 working · new work since #7 merged')
})

const PUSHED = '🟢 safe to leave · abc1234 pushed to main, deploy-dev passed'

test('work pushed straight to an integration branch, with no PR, is judged by its pushed head', async ($, on) => {
  const world = await start($, on, { branch: 'main', runs: [run('in_progress', null)] })
  expect(await light($)).toBe('🟡 waiting on pipeline · abc1234 pushed to main, deploy-dev running')
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /● waiting on pipeline/ }))?.text).toBeDefined()
  await ui.unmount()

  world.runs = [run('completed', 'success')]
  expect(await light($)).toBe(PUSHED)
})

test('a push no pipeline picks up is yellow for three minutes, then green', async ($, on) => {
  const world = await start($, on, { branch: 'main' })
  expect(await light($)).toBe('🟡 waiting on pipeline · abc1234 pushed to main, pipeline not started yet')

  await world.clock.advance(3 * 60_000)
  expect(await light($)).toBe('🟢 safe to leave · abc1234 pushed to main, no pipeline ran')
})

test('an edit after a pushed head was green waits for the next push', async ($, on) => {
  const world = await start($, on, { branch: 'main', runs: [run('completed', 'success')] })
  expect(await light($)).toBe(PUSHED)

  await $.turn.start({ text: 'one more fix', turnId: 't1' })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/footer.tsx', old_string: 'a', new_string: 'b' })
  await $.turn.complete(ENDED)
  expect(await light($)).toBe('🔴 working · new work since abc1234 was pushed')

  world.head = 'def5678'
  expect(await light($)).toBe('🟢 safe to leave · def5678 pushed to main, deploy-dev passed')
})

test('a feature branch with no PR, its head pushed straight to dev, is judged by that push', async ($, on) => {
  const world = await start($, on, { branch: 'fix/invite-url-fit', runs: [run('in_progress', null)] })
  await $.tool.call({ tool: 'Bash', command: 'git add a.ts && git commit -q -m "fix: a" && git log --oneline -1' })
  expect(await light($)).toBe('🔴 working · no PR yet')

  world.landed = 'dev\n'
  await $.tool.call({
    tool: 'Bash',
    command: 'git fetch -q origin && git rebase -q origin/dev && git push origin HEAD:dev 2>&1 | tail -3',
  })
  expect(await light($)).toBe('🟡 waiting on pipeline · abc1234 pushed to dev, deploy-dev running')

  world.runs = [run('completed', 'success')]
  expect(await light($)).toBe('🟢 safe to leave · abc1234 pushed to dev, deploy-dev passed')
})

const REJECTED = 'To https://github.com/o/r.git\n ! [rejected]        reword/initial-prompt -> main (stale info)\n'
const FORCED = 'To https://github.com/o/r.git\n + a067441...abc1234 reword/initial-prompt -> main (forced update)\n'
const FORCE_PUSH = 'git push --force-with-lease=main:a067441 origin reword/initial-prompt:main 2>&1 | tail -4'

test('a session that edited no file is judged by its push to an integration branch, not its dirty checkout', async ($, on) => {
  const world = await start($, on, {
    isFresh: true,
    branch: '',
    status: ' M App/AppModel.swift\n',
    runs: [run('in_progress', null)],
  })
  await $.tool.call({ tool: 'Bash', command: 'git worktree add --detach /tmp/wt-reword a067441' })
  expect(await light($)).toBe('🔴 working · uncommitted changes')

  world.printed = REJECTED
  await $.tool.call({ tool: 'Bash', command: FORCE_PUSH })
  expect(await light($)).toBe('🔴 working · uncommitted changes')

  world.printed = FORCED
  await $.tool.call({ tool: 'Bash', command: FORCE_PUSH })
  expect(await light($)).toBe('🟡 waiting on pipeline · abc1234 pushed to main, deploy-dev running')

  world.runs = [run('completed', 'success')]
  expect(await light($)).toBe('🟢 safe to leave · abc1234 pushed to main, deploy-dev passed')
})

test('a branch made after that push hands the light back to the checkout', async ($, on) => {
  const world = await start($, on, { isFresh: true, branch: '', status: ' M App/AppModel.swift\n', printed: FORCED })
  world.runs = [run('completed', 'success')]
  await $.tool.call({ tool: 'Bash', command: FORCE_PUSH })
  expect(await light($)).toBe('🟢 safe to leave · abc1234 pushed to main, deploy-dev passed')

  world.printed = ''
  await $.turn.start({ text: 'now the photo viewer', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'git worktree add -b feat/viewer .worktrees/viewer origin/main' })
  await $.turn.complete(ENDED)
  expect(await light($)).toBe('🔴 working · uncommitted changes')
})

test('a permission prompt turns it red until the next prompt', async ($, on) => {
  await start($, on, { pr: pull('OPEN') })
  expect(await light($)).toBe('🟡 waiting on PR · #7 open, waiting for merge')

  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'git push' } })
  expect(await light($)).toBe('🔴 working · Claude is asking you')

  await $.prompt.submit({ text: 'yes, push it', wait: false, origin: { kind: 'composer' } })
  expect(await light($)).toBe('🟡 waiting on PR · #7 open, waiting for merge')
})

const SUBTASK = {
  pr: pull('MERGED'),
  runs: [run('completed', 'success')],
  env: { HERDR_PANE_ID: 'w1:p6A' },
  agentName: 'retry',
}
const CLOSE = 'herdr pane close w1:p6A'

type Band = Mounted<'terminal', 'AbovePrompt'>

async function closingIn(ui: Band) {
  return (await ui.find({ type: 'Text', text: /Pane closes in/ }))?.text
}

test("a subtask's pane closes a minute after its work turns green, the band counting down", async ($, on) => {
  const world = await start($, on, SUBTASK)
  expect(await light($)).toBe(GREEN)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await closingIn(ui)).toMatch(/in 60s/)

  await world.clock.advance(45_000)
  expect(await closingIn(ui)).toMatch(/in 15s/)
  expect(world.calls).not.toContain(CLOSE)

  await world.clock.advance(15_000)
  expect(world.calls).toContain(CLOSE)
  await ui.unmount()
})

test('a Herdr session no agent started stays open once its work is green', async ($, on) => {
  const world = await start($, on, { ...SUBTASK, agentName: null })
  expect(await light($)).toBe(GREEN)

  await world.clock.advance(120_000)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await closingIn(ui)).toBeUndefined()
  expect(world.calls).not.toContain(CLOSE)
  await ui.unmount()
})

const SIDE_URL = 'https://github.com/o/r/pull/28'
const SIDE: Side = { root: '/side', branch: 'feat/side', pr: pull('MERGED', { number: 28, url: SIDE_URL, headRefName: 'feat/side' }) }
const WAITING = '🟡 waiting on PR · #7 open, waiting for merge'

// Side work as a session does it: an edit in another checkout, then a commit there and its PR.
async function sideWork($: Engine, world: World) {
  world.printed = `${SIDE_URL}\n`
  const edit = await $.tool.call({ tool: 'Edit', file_path: '/side/SKILL.md', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Bash', command: 'cd /side && git commit -qam "feat: a" && gh pr create --fill' })
  world.printed = ''
  return edit
}

test("a subtask's side work merging leaves its pane open, the light on its main work", async ($, on) => {
  const world = await start($, on, { ...SUBTASK, pr: null, side: SIDE })
  expect(await light($)).toBe('🔴 working · no PR yet')

  const edit = await sideWork($, world)
  expect(edit.context?.join('\n')).toMatch(/\/side is side work[^]*main work in \/repo[^]*mcp__traffic-light__main/)
  expect(await light($)).toBe('🔴 working · no PR yet')
  await world.clock.advance(120_000)
  expect(world.calls).not.toContain(CLOSE)
})

test("a session's side work leaves the light on its main work until that is done, then the next checkout is", async ($, on) => {
  const world = await start($, on, { pr: pull('OPEN'), runs: [run('completed', 'success')], side: SIDE })
  expect(await light($)).toBe(WAITING)

  await sideWork($, world)
  expect(await light($)).toBe(WAITING)

  world.pr = pull('MERGED')
  expect(await light($)).toBe(GREEN)

  world.side = { ...SIDE, pr: null }
  await $.turn.start({ text: 'now the skill', turnId: 't1' })
  await $.tool.call({ tool: 'Edit', file_path: '/side/SKILL.md', old_string: 'b', new_string: 'c' })
  await $.turn.complete(ENDED)
  expect(await light($)).toBe('🔴 working · no PR yet')
})

test('marking the main work moves the light and the pane close to it', async ($, on) => {
  const world = await start($, on, { ...SUBTASK, isFresh: true, pr: null, side: SIDE })
  await $.tool.call({ tool: 'Edit', file_path: '/side/notes.md', old_string: 'a', new_string: 'b' })
  expect(await light($)).toBe('🟢 safe to leave · #28 merged into dev, deploy-dev passed')

  const marked = await $.tool.call({ tool: 'mcp__traffic-light__main', path: '/repo' })
  expect(String(marked.result)).toMatch(/main work is \/repo/)
  expect(await light($)).toBe('🔴 working · no PR yet')
  await world.clock.advance(120_000)
  expect(world.calls).not.toContain(CLOSE)
})

const SIDE_OPEN: Side = { ...SIDE, pr: pull('OPEN', { number: 28, url: SIDE_URL, headRefName: 'feat/side' }) }

test("a subtask's main work merging leaves its pane open while its side work is in flight", async ($, on) => {
  const world = await start($, on, { ...SUBTASK, side: SIDE_OPEN })
  await sideWork($, world)
  expect(await light($)).toBe('🟡 waiting on PR · side work in /side: #28 open, waiting for merge')
  await world.clock.advance(120_000)
  expect(world.calls).not.toContain(CLOSE)

  world.side = SIDE
  expect(await light($)).toBe(GREEN)
  await world.clock.advance(60_000)
  expect(world.calls).toContain(CLOSE)
})

test('the checkout the main work moves from stays waited on as side work', async ($, on) => {
  const world = await start($, on, { ...SUBTASK, pr: pull('OPEN'), side: SIDE })
  expect(await light($)).toBe(WAITING)

  await $.tool.call({ tool: 'mcp__traffic-light__main', path: '/side' })
  expect(await light($)).toBe('🟡 waiting on PR · side work in /repo: #7 open, waiting for merge')
  await world.clock.advance(120_000)
  expect(world.calls).not.toContain(CLOSE)

  world.hasCheckout = false
  expect(await light($)).toBe('🟢 safe to leave · #28 merged into dev, deploy-dev passed')
})

const FRESH = 'chore/test-design-users-252'
const BORN = '1c5eb7f000 branch: Created from origin/dev'
const NO_WORK = '🔴 working · no PR yet'
const ON_DEV = '🟢 safe to leave · abc1234 pushed to dev, deploy-dev passed'
const REFLOGS = [
  { id: 'only created', reflog: [BORN], light: NO_WORK, closes: false },
  { id: 'rebased with nothing to replay', reflog: [`abc1234000 rebase (finish): refs/heads/${FRESH} onto abc1234000`, BORN], light: NO_WORK, closes: false },
  { id: 'fast-forwarded to dev', reflog: ['abc1234000 merge origin/dev: Fast-forward', BORN], light: NO_WORK, closes: false },
  { id: 'a commit', reflog: ['abc1234000 commit: test: a', BORN], light: ON_DEV, closes: true },
  { id: 'a cherry-pick', reflog: ['abc1234000 cherry-pick: test: a', BORN], light: ON_DEV, closes: true },
  { id: 'a revert', reflog: ['abc1234000 revert: Revert "test: a"', BORN], light: ON_DEV, closes: true },
  { id: 'a merge commit', reflog: ["abc1234000 merge origin/dev: Merge made by the 'ort' strategy.", BORN], light: ON_DEV, closes: true },
  { id: 'commits a rebase replayed', reflog: [`abc1234000 rebase (finish): refs/heads/${FRESH} onto 9f8e7d6000`, BORN], light: ON_DEV, closes: true },
]

for (const { id, reflog, light: expected, closes } of REFLOGS) {
  test(`a branch dev contains holds work only once a commit was made on it: ${id}`, async ($, on) => {
    const world = await start($, on, { ...SUBTASK, pr: null, branch: FRESH, landed: 'dev\n', reflog: reflog.join('\n') })
    expect(await light($)).toBe(expected)

    await world.clock.advance(60_000)
    expect(world.calls.includes(CLOSE)).toBe(closes)
  })
}

const PRESENTATION = { isFullscreen: false, columns: 120 }
const KEEPERS = [
  { id: '✋ Keep open', keep: async (_: Engine, ui: Band) => void (await ui.press({ key: 'keep-open' })) },
  {
    id: 'a typed message',
    keep: async ($: Engine) =>
      void (await $.prompt.submit({ text: 'wait, one more thing', wait: false, origin: { kind: 'composer' } })),
  },
  {
    id: '/traffic-light keep-open',
    keep: async ($: Engine) =>
      void (await $.command.run({
        command: 'traffic-light',
        args: 'keep-open',
        origin: { kind: 'composer' },
        presentation: PRESENTATION,
      })),
  },
]

for (const { id, keep } of KEEPERS) {
  test(`${id} keeps the pane open, also once a later turn ends green on the same work`, async ($, on) => {
    const world = await start($, on, SUBTASK)
    expect(await light($)).toBe(GREEN)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

    await keep($, ui)
    await world.clock.advance(120_000)
    expect(await closingIn(ui)).toBeUndefined()

    await $.turn.start({ text: 'what did the pipeline run?', turnId: 't1' })
    await $.turn.complete(ENDED)
    expect(await light($)).toBe(GREEN)
    await world.clock.advance(120_000)
    expect(world.calls).not.toContain(CLOSE)
    await ui.unmount()
  })
}

test('a turn that starts stops the close, and it counts from a minute again once the turn ends green', async ($, on) => {
  const world = await start($, on, SUBTASK)
  expect(await light($)).toBe(GREEN)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await world.clock.advance(50_000)

  await $.turn.start({ text: 'the pipeline finished', turnId: 't1' })
  await world.clock.advance(30_000)
  expect(await closingIn(ui)).toBeUndefined()
  expect(world.calls).not.toContain(CLOSE)

  await $.turn.complete(ENDED)
  expect(await light($)).toBe(GREEN)
  expect(await closingIn(ui)).toMatch(/in 60s/)
  await ui.unmount()
})

test('❌ Close now closes the pane at once', async ($, on) => {
  const world = await start($, on, SUBTASK)
  expect(await light($)).toBe(GREEN)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  await ui.press({ key: 'close-now' })
  expect(world.calls).toContain(CLOSE)
  await ui.unmount()
})

test('a GitHub Enterprise origin is read with gh on its own host', async ($, on) => {
  const world = await start($, on, {
    remote: 'git@github.example.com:o/r.git',
    pr: pull('MERGED', { url: 'https://github.example.com/o/r/pull/7' }),
    runs: [run('completed', 'success')],
  })

  expect(await light($)).toBe(GREEN)
  expect(world.calls.some(line => line.startsWith('gh api --hostname github.example.com repos/o/r/actions/runs?'))).toBe(true)
})

test('an open MR on a self-hosted GitLab is yellow, read with GITLAB_TOKEN in a header, never the URL', async ($, on) => {
  const world = await start($, on, { ...GITLAB, mrs: [merge('opened', { head_pipeline: { status: 'running' } })] })
  expect(await light($)).toBe('🟡 waiting on MR · !360 open, pipeline running')

  world.mrs = [merge('opened', { head_pipeline: { status: 'failed' } })]
  expect(await light($)).toBe('🟡 waiting on MR · !360 open, pipeline failing')

  world.mrs = [merge('opened', { head_pipeline: { status: 'success' } })]
  expect(await light($)).toBe('🟡 waiting on MR · !360 open, waiting for merge')
  expect(world.fetched.length > 0 && world.fetched.every(url => !url.includes(TOKEN))).toBe(true)
})

test('a merged MR is judged by the pipeline of the commit it landed, fast-forward or merge commit', async ($, on) => {
  const world = await start($, on, { ...GITLAB, mrs: [merge('merged')], pipelines: [pipeline(446, 'running')] })
  expect(await light($)).toBe('🟡 waiting on MR · !360 merged into dev, pipeline #446 running')

  world.pipelines = [pipeline(446, 'success')]
  expect(await light($)).toBe('🟢 safe to leave · !360 merged into dev, pipeline #446 passed')

  world.mrs = [merge('merged', { merge_commit_sha: 'fed9876000' })]
  world.pipelines = [pipeline(446, 'success'), pipeline(450, 'failed', 'fed9876000')]
  expect(await light($)).toBe('🔴 working · !360 merged into dev, pipeline #450 failed')
})

test('a GitLab pipeline the next push cancelled is settled by the newer one', async ($, on) => {
  await start($, on, {
    ...GITLAB,
    mrs: [merge('merged')],
    pipelines: [pipeline(447, 'canceled'), pipeline(448, 'success', 'def5678000')],
  })

  expect(await light($)).toBe('🟢 safe to leave · !360 merged into dev, pipeline #448 passed')
})

test('a failed GitLab pipeline is settled by a newer one on the branch that passed, not one still running', async ($, on) => {
  const world = await start($, on, {
    ...GITLAB,
    mrs: [merge('merged')],
    pipelines: [pipeline(583, 'failed'), pipeline(586, 'running', 'fed9876000')],
  })
  expect(await light($)).toBe('🔴 working · !360 merged into dev, pipeline #583 failed')

  world.pipelines = [pipeline(583, 'failed'), pipeline(585, 'success', 'def5678000'), pipeline(586, 'running', 'fed9876000')]
  expect(await light($)).toBe('🟢 safe to leave · !360 merged into dev, pipeline #585 passed')
})

test('a GitLab branch with no MR, or an MR closed unmerged or merged elsewhere, is red', async ($, on) => {
  const world = await start($, on, { ...GITLAB })
  expect(await light($)).toBe('🔴 working · no MR yet')

  world.mrs = [merge('closed')]
  expect(await light($)).toBe('🔴 working · !360 closed without merging')

  world.mrs = [merge('merged', { target_branch: 'feat/base' })]
  expect(await light($)).toBe('🔴 working · !360 merged into feat/base, not dev or main')
})

const CREATED = JSON.stringify({
  iid: 360,
  web_url: MR,
  description: 'After https://gitlab.example.com/team/app/-/merge_requests/359',
  author: { web_url: 'https://gitlab.example.com/me' },
})
const LISTED = JSON.stringify([
  { iid: 361, web_url: MR.replace('360', '361') },
  { iid: 360, web_url: MR },
])

test('the MR a REST call printed is followed once its worktree and branch are gone, a listing is not', async ($, on) => {
  const world = await start($, on, { ...GITLAB, mrs: [merge('merged')], printed: CREATED })
  await $.tool.call({
    tool: 'Bash',
    command: 'curl -sS -X POST -H "PRIVATE-TOKEN: $GITLAB_TOKEN" "$GITLAB_URL/api/v4/projects/3/merge_requests" -d title=x',
  })
  expect(await light($)).toBe('🟡 waiting on MR · !360 merged into dev, pipeline not started yet')

  world.printed = LISTED
  await $.tool.call({ tool: 'Bash', command: 'curl -sS "$GITLAB_URL/api/v4/projects/3/merge_requests?state=opened"' })
  world.hasCheckout = false
  world.originBranches = []
  expect(await light($)).toBe('🟢 safe to leave · !360 merged into dev, no pipeline started, cleaned up')
})

test('glab reads GitLab when no token is set, and the MR a glab mr command printed is followed', async ($, on) => {
  const world = await start($, on, { remote: GITLAB.remote, hasGlab: true, mrs: [merge('opened')], printed: `${MR}\n` })
  await $.tool.call({ tool: 'Bash', command: 'glab mr create --target-branch dev --fill --yes' })

  world.branch = 'dev'
  expect(await light($)).toBe('🟡 waiting on MR · !360 open, waiting for merge')
})

const BLIND = "🔴 working · can't read GitLab: set GITLAB_TOKEN or sign in glab"

test('a GitLab it holds no token for, and no glab, reads as unreadable, and a token for another host is never sent', async ($, on) => {
  const world = await start($, on, { remote: GITLAB.remote, mrs: [merge('merged')], pipelines: [pipeline(446, 'success')] })
  expect(await light($)).toBe(BLIND)

  world.env = { GITLAB_URL: 'https://gitlab.other.com', GITLAB_TOKEN: TOKEN }
  expect(await light($)).toBe(BLIND)
  expect(world.fetched).toEqual([])
})

test('the env file git config names gives the token, read and never run', async ($, on) => {
  const world = await start($, on, { remote: GITLAB.remote, mrs: [merge('merged')], pipelines: [pipeline(446, 'success')] })
  expect(await light($)).toBe(BLIND)

  world.envFile = '.env.infra'
  world.files = { '/main/.env.infra': `# operator tokens\nGITLAB_URL=https://gitlab.example.com\nexport GITLAB_TOKEN="${TOKEN}"\n` }
  expect(await light($)).toBe('🟢 safe to leave · !360 merged into dev, pipeline #446 passed')
})

test('work stays green once cleanup removed its worktree, though GitLab can no longer be read', async ($, on) => {
  const world = await start($, on, {
    remote: GITLAB.remote,
    envFile: '.env.infra',
    files: { '/main/.env.infra': `GITLAB_URL=https://gitlab.example.com\nGITLAB_TOKEN=${TOKEN}\n` },
    mrs: [merge('merged')],
    pipelines: [pipeline(446, 'success')],
    printed: CREATED,
  })
  await $.tool.call({
    tool: 'Bash',
    command: 'curl -sS -X POST -H "PRIVATE-TOKEN: $GITLAB_TOKEN" "$GITLAB_URL/api/v4/projects/3/merge_requests" -d title=x',
  })
  expect(await light($)).toBe('🟢 safe to leave · !360 merged into dev, pipeline #446 passed')

  world.hasCheckout = false
  expect(await light($)).toBe('🟢 safe to leave · worktree removed, cleaned up')
})

const GITLAB_PUSH = 'To gitlab.example.com:team/app.git\n   f6f58fb..abc1234  HEAD -> dev\n'

test('a commit pushed straight to a GitLab integration branch is judged by its pipeline', async ($, on) => {
  const world = await start($, on, {
    ...GITLAB,
    isFresh: true,
    branch: '',
    status: ' M a.ts\n',
    printed: GITLAB_PUSH,
    pipelines: [pipeline(449, 'running')],
  })
  await $.tool.call({ tool: 'Bash', command: 'git push origin HEAD:dev 2>&1 | tail -3' })
  expect(await light($)).toBe('🟡 waiting on pipeline · abc1234 pushed to dev, pipeline #449 running')

  world.pipelines = [pipeline(449, 'success')]
  expect(await light($)).toBe('🟢 safe to leave · abc1234 pushed to dev, pipeline #449 passed')
})

test('an origin on neither GitHub nor GitLab cannot be read, unless GITLAB_URL names its host', async ($, on) => {
  const world = await start($, on, { remote: 'ssh://git@git.example.org:2222/team/app.git', mrs: [merge('opened')] })
  expect(await light($)).toBe("🔴 working · can't read git.example.org: not GitHub or GitLab")

  world.env = { GITLAB_URL: 'https://git.example.org/', GITLAB_TOKEN: TOKEN }
  expect(await light($)).toBe('🟡 waiting on MR · !360 open, waiting for merge')
})

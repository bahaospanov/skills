import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
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

type Run = { id: number; workflow_id: number; name: string; status: string; conclusion: string | null; created_at: string }
type World = {
  branch: string
  status: string
  pr: Record<string, unknown> | null
  runs: Run[]
  newest: Run[]
  printed: string
  head: string
  pushedAt: string
  isFresh: boolean
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
  mergedAt: '2026-10-25T10:00:00Z',
  mergeCommit: { oid: 'abc123' },
  statusCheckRollup: [],
  ...extra,
})

function reply(world: World, argv: readonly string[]) {
  const ok = (stdout: string) => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })
  const fail = (stderr: string) => ({ ...ok(''), exitCode: 1, stderr })
  const line = argv.join(' ')
  if (line.includes('rev-parse --show-toplevel')) return ok('/repo\n')
  if (line.includes('status --porcelain')) return ok(world.status)
  if (line.includes('rev-list --count')) return ok('0\n')
  if (line.includes('branch --show-current')) return ok(`${world.branch}\n`)
  if (line.includes('check-ignore')) return fail('')
  if (line.includes('log -g')) return ok(`origin/${world.branch}@{${world.pushedAt}}\n`)
  if (line.includes('log -1')) return ok(`${world.head}000 ${world.head}\n`)
  if (line.includes('remote get-url origin')) return ok('git@github.com:o/r.git\n')
  if (line.startsWith('gh pr view')) {
    return world.pr === null ? fail(`no pull requests found for branch "${world.branch}"`) : ok(JSON.stringify(world.pr))
  }
  if (line.includes('/actions/workflows/')) return ok(JSON.stringify({ workflow_runs: world.newest }))
  if (line.includes('/actions/runs?')) return ok(JSON.stringify({ workflow_runs: world.runs }))
  return fail('unexpected command')
}

// Stands for the engine beneath the mod: git, gh and the Bash tool answer from `world`. Unless fresh, the session has
// started work with an edit.
async function start($: Engine, on: On, world: Partial<World>) {
  const full: World = {
    branch: 'feat/x',
    status: '',
    pr: null,
    runs: [],
    newest: [],
    printed: '',
    head: 'abc1234',
    pushedAt: '2026-10-25T10:00:00Z',
    isFresh: false,
    ...world,
  }
  const clock = mock.clock(on, { now: Date.parse('2026-10-25T10:01:00Z') })
  on('command.register', () => ({ value: { command: 'traffic-light' } }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('process.run', (_, e) => ({ value: reply(full, e.argv) }))
  on('tool.call', () => ({ result: {}, text: full.printed }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('classic.PermissionRequest', () => ({}))
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

const GREEN = '🟢 safe to leave · #7 merged into dev, deploy-dev passed'
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

test('a permission prompt turns it red until the next prompt', async ($, on) => {
  await start($, on, { pr: pull('OPEN') })
  expect(await light($)).toBe('🟡 waiting on PR · #7 open, waiting for merge')

  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'git push' } })
  expect(await light($)).toBe('🔴 working · Claude is asking you')

  await $.prompt.submit({ text: 'yes, push it', wait: false, origin: { kind: 'composer' } })
  expect(await light($)).toBe('🟡 waiting on PR · #7 open, waiting for merge')
})

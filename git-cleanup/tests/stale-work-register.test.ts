import type { On, PromptOrigin } from 'claude-code'
import { describe, expect, mock, test, tier, type Engine } from 'claude-code/testing'

tier('user')

const WT = '/repo/.claude/worktrees/a'

type Repo = { landed: boolean; dirty: boolean; remoteBranch: boolean; localDevBehind: boolean; cwd: string; refusesDelete: boolean }

// A repo at /repo with no push policy and no forge remote, origin/HEAD -> main, an origin/dev, and the worktree WT on fix/a.
const world = (on: On) => {
  const repo: Repo = { landed: false, dirty: false, remoteBranch: true, localDevBehind: false, cwd: '/repo', refusesDelete: false }
  const submitted: string[] = []
  const notices: string[] = []
  const removals: string[] = []
  const clock = mock.clock(on)
  mock.env(on, { HOME: '/Users/me' })
  on('ui.log', ($, e) => {
    if (e.text.startsWith('git-cleanup: ')) notices.push(e.text)
    return { value: undefined }
  })
  on('fs.read', ($, e) => ({ deny: `ENOENT: ${e.path}` }))
  on('session.cwd', () => ({ value: repo.cwd }))
  on('prompt.submit', ($, e) => {
    if (e.origin.kind === 'plugin') submitted.push(e.text)
    return { text: e.text }
  })
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('process.run', ($, e) => {
    const args = e.argv.join(' ')
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '' } })
    const no = { value: { exitCode: 1, stdout: '', stderr: '' } }
    const inWorktree = e.init?.cwd === WT
    if (args === 'git rev-parse --path-format=absolute --git-common-dir') return ok('/repo/.git\n')
    if (args === 'git rev-parse --show-toplevel') return ok(`${e.init?.cwd ?? '/repo'}\n`)
    if (args === 'git rev-parse --abbrev-ref HEAD') return ok(inWorktree ? 'fix/a\n' : 'dev\n')
    if (args === 'git worktree list --porcelain') {
      return ok(`worktree /repo\nHEAD 1111\nbranch refs/heads/dev\n\nworktree ${WT}\nHEAD a1\nbranch refs/heads/fix/a\n`)
    }
    if (args === 'git fetch --quiet --prune origin') return ok('')
    if (args === 'git symbolic-ref --quiet refs/remotes/origin/HEAD') return ok('refs/remotes/origin/main\n')
    if (/^git rev-parse --verify --quiet refs\/remotes\/origin\/(main|dev)$/.test(args)) return ok('base\n')
    if (args === 'git rev-parse --verify --quiet refs/heads/fix/a') return ok('a1\n')
    if (args === 'git rev-parse --verify --quiet refs/remotes/origin/fix/a') return repo.remoteBranch ? ok('a1\n') : no
    if (args === 'git merge-base --is-ancestor a1 refs/remotes/origin/dev') return repo.landed ? ok('') : no
    if (args === 'git rev-parse --verify --quiet refs/heads/dev') return ok(repo.localDevBehind ? 'old\n' : 'base\n')
    if (args === 'git merge-base --is-ancestor old refs/remotes/origin/dev') return ok('')
    if (args === 'git status --porcelain') return ok(repo.dirty ? ' M app.ts\n' : '')
    if (/^git (worktree remove|branch -D|push origin --delete|merge --ff-only) /.test(args)) {
      removals.push(`${args} @ ${e.init?.cwd}`)
      if (repo.refusesDelete && args.startsWith('git push origin --delete')) {
        return { value: { exitCode: 1, stdout: '', stderr: 'remote: permission denied\n' } }
      }
      return ok('')
    }
    return no
  })
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false } }))
  return { repo, submitted, notices, removals, clock }
}

const bash = (command: string) => ({ tool: 'Bash' as const, command })
const prompt = (text: string, origin: PromptOrigin = { kind: 'composer' }) => ({ text, origin, wait: false })
const turnEnds = (extra: { agentId?: string } = {}) => ({
  answer: 'done',
  durationMs: 1,
  isAborted: false,
  turnId: 't1',
  reason: 'answer' as const,
  ...extra,
})

const ship = async ($: Engine) => {
  await $.prompt.submit(prompt('ship'))
  await $.tool.call(bash(`cd ${WT} && git commit -m "fix: a"`))
  await $.tool.call(bash(`cd ${WT} && git push -u origin fix/a`))
}

describe('stale work', () => {
  test('once the branch lands, git-cleanup removes it and says so in one line', async ($, on) => {
    const { repo, submitted, notices, removals, clock } = world(on)
    await ship($)

    await $.turn.complete(turnEnds())
    await clock.settle()
    expect(notices).toEqual([])

    repo.landed = true
    await $.turn.complete(turnEnds())
    await clock.settle()
    await $.turn.complete(turnEnds())
    await clock.settle()

    expect(notices).toEqual(['git-cleanup: removed fix/a'])
    expect(removals).toEqual([`git worktree remove ${WT} @ /repo`, 'git branch -D fix/a @ /repo', 'git push origin --delete fix/a @ /repo'])
    expect(submitted).toEqual([])
  })

  test('a local base behind origin is fast-forwarded first, where it is checked out', async ($, on) => {
    const { repo, removals, clock } = world(on)
    await ship($)
    repo.landed = true
    repo.localDevBehind = true

    await $.turn.complete(turnEnds())
    await clock.settle()

    expect(removals[0]).toBe('git merge --ff-only origin/dev @ /repo')
  })

  test('the worktree this session works in stays', async ($, on) => {
    const { repo, notices, removals, clock } = world(on)
    await ship($)
    repo.landed = true
    repo.cwd = `${WT}/apps/web`

    await $.turn.complete(turnEnds())
    await clock.settle()

    expect(removals).toEqual([])
    expect(notices).toEqual([])
  })

  test('a step that fails is named, and its branch is not reported removed', async ($, on) => {
    const { repo, notices, clock } = world(on)
    await ship($)
    repo.landed = true
    repo.refusesDelete = true

    await $.turn.complete(turnEnds())
    await clock.settle()

    expect(notices).toEqual(['git-cleanup: could not remove push origin --delete fix/a (remote: permission denied)'])
  })

  test('a dirty worktree, a subagent turn or untouched work is left alone', async ($, on) => {
    const { repo, notices, removals, clock } = world(on)
    repo.landed = true
    await $.turn.complete(turnEnds())
    await clock.settle()
    expect(notices).toEqual([])

    await ship($)
    repo.dirty = true
    await $.turn.complete(turnEnds())
    await $.turn.complete(turnEnds({ agentId: 'a1' }))
    await clock.settle()
    expect(notices).toEqual([])
    expect(removals).toEqual([])
  })
})

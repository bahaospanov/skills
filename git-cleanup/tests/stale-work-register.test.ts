import type { On, PromptOrigin } from 'claude-code'
import { describe, expect, mock, test, tier, type Engine } from 'claude-code/testing'

tier('user')

const WT = '/repo/.claude/worktrees/a'

type Repo = { landed: boolean; dirty: boolean; remoteBranch: boolean }

// A repo at /repo with no push policy and no forge remote, origin/HEAD -> main, an origin/dev, and the worktree WT on fix/a.
const world = (on: On) => {
  const repo: Repo = { landed: false, dirty: false, remoteBranch: true }
  const submitted: string[] = []
  const clock = mock.clock(on)
  mock.env(on, { HOME: '/Users/me' })
  on('ui.log', () => ({ value: undefined }))
  on('fs.read', ($, e) => ({ deny: `ENOENT: ${e.path}` }))
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
    if (args === 'git status --porcelain') return ok(repo.dirty ? ' M app.ts\n' : '')
    return no
  })
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false } }))
  return { repo, submitted, clock }
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
  test('once the branch lands, one follow-up asks to remove its worktree and branches', async ($, on) => {
    const { repo, submitted, clock } = world(on)
    await ship($)

    await $.turn.complete(turnEnds())
    await clock.settle()
    expect(submitted).toEqual([])

    repo.landed = true
    await $.turn.complete(turnEnds())
    await clock.settle()
    await $.turn.complete(turnEnds())
    await clock.settle()

    expect(submitted.length).toBe(1)
    expect(submitted[0]).toContain(`fix/a: in origin/dev; worktree ${WT}, local branch, on origin`)
    expect(submitted[0]).toContain(`cd /repo\n  git worktree remove ${WT}\n  git branch -d fix/a\n  git push origin --delete fix/a`)
  })

  test('a dirty worktree, a subagent turn or untouched work gets no follow-up', async ($, on) => {
    const { repo, submitted, clock } = world(on)
    repo.landed = true
    await $.turn.complete(turnEnds())
    await clock.settle()
    expect(submitted).toEqual([])

    await ship($)
    repo.dirty = true
    await $.turn.complete(turnEnds())
    await $.turn.complete(turnEnds({ agentId: 'a1' }))
    await clock.settle()
    expect(submitted).toEqual([])
  })
})

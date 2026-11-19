import type { On, PromptOrigin } from 'claude-code'
import { describe, expect, mock, test, tier } from 'claude-code/testing'

tier('user')

type Branch = { pushed: boolean; carriesDev: boolean; pushedHoldsDev: boolean }

// A repo at /repo on fix/a, with no push policy, origin/HEAD -> main, and an origin/dev.
const world = (on: On, branch: Branch) => {
  const ran: string[] = []
  const logs: string[] = []
  mock.clock(on)
  on('session.cwd', () => ({ value: '/repo' }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.log', ($, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  on('tool.register', ($, e) => ({ value: { tool: `mcp__git-gates__${e.name}` } }))
  on('session.messages', () => ({ value: [] }))
  on('fs.read', ($, e) => ({ deny: `ENOENT: ${e.path}` }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('process.run', ($, e) => {
    const answer = (ok: boolean, stdout = '') => ({
      value: { exitCode: ok ? 0 : 1, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    })
    const args = e.argv.join(' ')
    if (args === 'git rev-parse --show-toplevel') return answer(true, '/repo\n')
    if (args === 'git rev-parse --abbrev-ref HEAD') return answer(true, 'fix/a\n')
    if (args === 'git symbolic-ref --quiet refs/remotes/origin/HEAD') return answer(true, 'refs/remotes/origin/main\n')
    if (/^git rev-parse --verify --quiet refs\/remotes\/origin\/(main|dev)$/.test(args)) return answer(true, 'base\n')
    if (args === 'git rev-parse --verify --quiet refs/remotes/origin/fix/a') return answer(branch.pushed, 'head\n')
    if (args === 'git merge-base --is-ancestor refs/remotes/origin/dev refs/heads/fix/a') return answer(branch.carriesDev)
    if (args === 'git merge-base --is-ancestor refs/remotes/origin/dev refs/remotes/origin/fix/a') {
      return answer(branch.pushedHoldsDev)
    }
    return answer(false)
  })
  on('tool.call', { tool: 'Bash' }, ($, e) => {
    ran.push(e.command)
    return { result: { stdout: '', stderr: '', interrupted: false } }
  })
  return { ran, logs }
}

const bash = (command: string) => ({ tool: 'Bash' as const, command })
const prompt = (text: string, origin: PromptOrigin = { kind: 'composer' }) => ({ text, origin, wait: false })

const REBASED: Branch = { pushed: true, carriesDev: true, pushedHoldsDev: false }
const PUSH = 'git push --force-with-lease origin fix/a'

const ROWS = [
  { id: 'merge: the branch rebased onto the moved dev', said: 'merge', branch: REBASED, runs: true },
  {
    id: 'merge: the branch already on dev, new commits on top',
    said: 'merge',
    branch: { ...REBASED, pushedHoldsDev: true },
    runs: false,
  },
  { id: 'merge: a branch never pushed', said: 'merge', branch: { ...REBASED, pushed: false }, runs: false },
  { id: "merge, but don't push", said: "merge it, but don't push", branch: REBASED, runs: false },
  { id: 'no merge', said: 'looks good', branch: REBASED, runs: false },
]

describe('push in a merge turn', () => {
  for (const { id, said, branch, runs } of ROWS) {
    test(`"merge" re-pushes only a branch rebased onto its moved base: ${id}`, async ($, on) => {
      const { ran } = world(on, branch)
      await $.prompt.submit(prompt(said))

      await $.tool.call(bash(PUSH))

      expect(ran).toEqual(runs ? [PUSH] : [])
    })
  }
})

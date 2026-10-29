import type { On, PromptOrigin } from 'claude-code'
import { describe, expect, mock, test, tier } from 'claude-code/testing'

tier('user')

// A repo at /repo with no push policy, origin/HEAD -> main, and an origin/dev.
const world = (on: On) => {
  const ran: string[] = []
  mock.clock(on)
  on('session.cwd', () => ({ value: '/repo' }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('tool.register', ($, e) => ({ value: { tool: `mcp__git-gates__${e.name}` } }))
  on('session.messages', () => ({ value: [] }))
  on('fs.read', ($, e) => ({ deny: `ENOENT: ${e.path}` }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('process.run', ($, e) => {
    const args = e.argv.join(' ')
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    const no = { value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    if (args === 'git rev-parse --show-toplevel') return ok('/repo\n')
    if (args === 'git rev-parse --abbrev-ref HEAD') return ok('dev\n')
    if (args === 'git symbolic-ref --quiet refs/remotes/origin/HEAD') return ok('refs/remotes/origin/main\n')
    if (/^git rev-parse --verify --quiet refs\/remotes\/origin\/(main|dev)$/.test(args)) return ok('base\n')
    return no
  })
  on('tool.call', { tool: 'Bash' }, ($, e) => {
    ran.push(e.command)
    return { result: { stdout: '', stderr: '', interrupted: false } }
  })
  return { ran }
}

const bash = (command: string) => ({ tool: 'Bash' as const, command })
const prompt = (text: string, origin: PromptOrigin = { kind: 'composer' }) => ({ text, origin, wait: false })

describe('branch delete', () => {
  test('deleting a branch on origin needs no keyword, merged or not; an integration branch does', async ($, on) => {
    const { ran } = world(on)
    await $.prompt.submit(prompt('thanks, looks good'))

    await $.tool.call(bash('cd /repo && git push origin --delete fix/a'))
    await $.tool.call(bash('cd /repo && git worktree remove x && git branch -D fix/b && git push origin :fix/b'))
    const base = await $.tool.call(bash('cd /repo && git push origin --delete dev'))
    const alongside = await $.tool.call(bash('cd /repo && git push origin --delete fix/a && git push origin fix/c'))

    expect(ran).toEqual([
      'cd /repo && git push origin --delete fix/a',
      'cd /repo && git worktree remove x && git branch -D fix/b && git push origin :fix/b',
    ])
    expect(base.deny).toContain('does not\ncontain an authorizing keyword')
    expect(alongside.deny).toContain('does not\ncontain an authorizing keyword')
  })

  test('a delete needs no user message at all, but a no to pushing still refuses it', async ($, on) => {
    const { ran } = world(on)

    await $.tool.call(bash('git push origin --delete fix/a'))
    expect(ran).toEqual(['git push origin --delete fix/a'])

    await $.prompt.submit(prompt("don't push anything"))
    const refused = await $.tool.call(bash('git push origin --delete fix/a'))
    expect(refused.deny).toBeDefined()
    expect(ran).toEqual(['git push origin --delete fix/a'])
  })
})

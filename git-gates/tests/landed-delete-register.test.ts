import type { On, PromptOrigin } from 'claude-code'
import { describe, expect, mock, test, tier } from 'claude-code/testing'

tier('user')

// A repo at /repo with no push policy, origin/HEAD -> main, an origin/dev, and fix/a on origin.
const world = (on: On) => {
  const repo = { landed: false }
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
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '' } })
    const no = { value: { exitCode: 1, stdout: '', stderr: '' } }
    if (args === 'git rev-parse --show-toplevel') return ok('/repo\n')
    if (args === 'git rev-parse --abbrev-ref HEAD') return ok('dev\n')
    if (args === 'git symbolic-ref --quiet refs/remotes/origin/HEAD') return ok('refs/remotes/origin/main\n')
    if (/^git rev-parse --verify --quiet refs\/remotes\/origin\/(main|dev)$/.test(args)) return ok('base\n')
    if (args === 'git ls-remote origin refs/heads/fix/a') return ok('a1\trefs/heads/fix/a\n')
    if (args === 'git merge-base --is-ancestor a1 refs/remotes/origin/dev') return repo.landed ? ok('') : no
    return no
  })
  on('tool.call', { tool: 'Bash' }, ($, e) => {
    ran.push(e.command)
    return { result: { stdout: '', stderr: '', interrupted: false } }
  })
  return { repo, ran }
}

const bash = (command: string) => ({ tool: 'Bash' as const, command })
const prompt = (text: string, origin: PromptOrigin = { kind: 'composer' }) => ({ text, origin, wait: false })

describe('landed delete', () => {
  test('deleting a landed branch on origin needs no keyword; an unlanded or integration one does', async ($, on) => {
    const { repo, ran } = world(on)
    await $.prompt.submit(prompt('thanks, looks good'))

    const early = await $.tool.call(bash('cd /repo && git push origin --delete fix/a'))
    expect(early.deny).toContain('does not\ncontain an authorizing keyword')

    repo.landed = true
    await $.tool.call(bash('cd /repo && git worktree remove x && git push origin --delete fix/a'))
    const base = await $.tool.call(bash('cd /repo && git push origin --delete dev'))

    expect(ran).toEqual(['cd /repo && git worktree remove x && git push origin --delete fix/a'])
    expect(base.deny).toContain('does not\ncontain an authorizing keyword')
  })
})

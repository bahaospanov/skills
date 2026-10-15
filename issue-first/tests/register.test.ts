import type { On, PromptOrigin } from 'claude-code'
import { describe, expect, mock, test, tier } from 'claude-code/testing'

tier('user')

type World = { branch?: string; remote?: boolean; files?: Record<string, string> }

// Beneath the mod: a git checkout on `branch`, a disk of `files`, and a Bash that records what ran.
const world = (on: On, options: World = {}) => {
  const ran: string[] = []
  mock.env(on, { HOME: '/Users/me' })
  on('session.cwd', () => ({ value: '/repo' }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('process.run', ($, e) => {
    const args = e.argv.join(' ')
    const stdout =
      args === 'git rev-parse --abbrev-ref HEAD'
        ? `${options.branch ?? 'feat/catalog-menu'}\n`
        : args === 'git remote' && options.remote !== false
          ? 'origin\n'
          : args === 'git remote'
            ? ''
            : undefined
    return { value: { exitCode: stdout === undefined ? 1 : 0, stdout: stdout ?? '', stderr: '' } }
  })
  on('fs.read', ($, e) => {
    const text = options.files?.[e.path]
    return text === undefined ? { deny: `ENOENT: ${e.path}` } : { value: text }
  })
  on('tool.call', { tool: 'Bash' }, ($, e) => {
    ran.push(e.command)
    return { result: { stdout: '', stderr: '', interrupted: false } }
  })
  return { ran }
}

const bash = (command: string) => ({ tool: 'Bash' as const, command })
const prompt = (text: string, origin: PromptOrigin = { kind: 'composer' }) => ({ text, origin, wait: false })

describe('register', () => {
  test('a feat commit naming no issue is refused and never runs', async ($, on) => {
    const { ran } = world(on)

    const refused = await $.tool.call(bash('git commit -m "feat(web): catalog menu"'))

    expect(refused.deny).toContain('"feat(web): catalog menu" is a feature')
    expect(refused.deny).toContain('show it to the user')
    expect(ran).toEqual([])
  })

  test("Claude Code's heredoc message is read too", async ($, on) => {
    const { ran } = world(on)

    const refused = await $.tool.call(bash('git commit -m "$(cat <<\'EOF\'\nfeat(web): catalog menu\nEOF\n)"'))

    expect(refused.deny).toContain('is a feature')
    expect(ran).toEqual([])
  })

  test('a message file is read from where the commit runs', async ($, on) => {
    const { ran } = world(on, { files: { '/repo/msg.txt': 'feat: a\n', '/repo/wt/msg.txt': 'feat: b\n' } })

    const here = await $.tool.call(bash('git commit -F msg.txt'))
    const there = await $.tool.call(bash('cd wt && git commit -F msg.txt'))

    expect(here.deny).toContain('"feat: a" is a feature')
    expect(there.deny).toContain('"feat: b" is a feature')
    expect(ran).toEqual([])
  })

  test('a feat commit naming its issue runs', async ($, on) => {
    const { ran } = world(on)

    await $.tool.call(bash('git commit -m "feat(web): catalog menu #107"'))
    await $.tool.call(bash('git commit -m "feat(web): b" -m "Closes #108"'))

    expect(ran).toEqual(['git commit -m "feat(web): catalog menu #107"', 'git commit -m "feat(web): b" -m "Closes #108"'])
  })

  test('a branch carrying the issue number covers its commits', async ($, on) => {
    const { ran } = world(on, { branch: 'feat/catalog-menu-107' })

    await $.tool.call(bash('git commit -m "feat(web): catalog menu"'))

    expect(ran).toEqual(['git commit -m "feat(web): catalog menu"'])
  })

  test('commits that are not features, or in a repo with no remote, run', async ($, on) => {
    const { ran } = world(on, { remote: false })

    await $.tool.call(bash('git commit -m "fix(web): a"'))
    await $.tool.call(bash('git commit -m "feat: b"'))

    expect(ran).toEqual(['git commit -m "fix(web): a"', 'git commit -m "feat: b"'])
  })

  test('the user saying "no issue" lets this turn commit; the next turn asks again', async ($, on) => {
    const { ran } = world(on)

    await $.prompt.submit(prompt('no issue, commit it'))
    await $.tool.call(bash('git commit -m "feat: a"'))
    await $.prompt.submit(prompt('now the next feature'))
    const refused = await $.tool.call(bash('git commit -m "feat: b"'))

    expect(ran).toEqual(['git commit -m "feat: a"'])
    expect(refused.deny).toContain('"feat: b" is a feature')
  })

  test('"no issue" from anyone but the user waives nothing', async ($, on) => {
    const { ran } = world(on)

    await $.prompt.submit(prompt('no issue needed', { kind: 'plugin', name: 'other' }))
    const refused = await $.tool.call(bash('git commit -m "feat: a"'))

    expect(refused.deny).toContain('is a feature')
    expect(ran).toEqual([])
  })
})

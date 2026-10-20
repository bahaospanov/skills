import type { On, PromptOrigin, SessionMessage } from 'claude-code'
import { describe, expect, mock, test, tier } from 'claude-code/testing'

tier('user')

type Repo = { branch: string; remote?: boolean; common: string }

type World = {
  branch?: string
  remote?: boolean
  files?: Record<string, string>
  // Other checkouts a command can `cd` into, keyed by directory; the session's own is /repo.
  repos?: Record<string, Repo>
  common?: string
  messages?: SessionMessage[]
  // What a hook beneath this mod answers the commit with.
  beneath?: string
}

// Beneath the mod: a git checkout on `branch`, a disk of `files`, and a Bash that records what ran.
const world = (on: On, options: World = {}) => {
  const ran: string[] = []
  const logs: string[] = []
  mock.env(on, { HOME: '/Users/me' })
  on('session.cwd', () => ({ value: '/repo' }))
  on('session.messages', () => ({ value: options.messages ?? [] }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('process.run', ($, e) => {
    const args = e.argv.join(' ')
    const cwd = e.init?.cwd
    const repo = cwd === undefined ? undefined : options.repos?.[cwd]
    const common = repo?.common ?? options.common
    const stdout =
      args === 'git rev-parse --abbrev-ref HEAD'
        ? `${repo?.branch ?? options.branch ?? 'feat/catalog-menu'}\n`
        : args === 'git remote'
          ? (repo?.remote ?? options.remote) !== false
            ? 'origin\n'
            : ''
          : args === 'git rev-parse --path-format=absolute --git-common-dir' && common !== undefined
            ? `${common}\n`
            : undefined
    return { value: { exitCode: stdout === undefined ? 1 : 0, stdout: stdout ?? '', stderr: '' } }
  })
  on('fs.read', ($, e) => {
    const text = options.files?.[e.path]
    return text === undefined ? { deny: `ENOENT: ${e.path}` } : { value: text }
  })
  on('ui.log', ($, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  on('tool.call', { tool: 'Bash' }, ($, e) => {
    ran.push(e.command)
    return options.beneath === undefined
      ? { result: { stdout: '', stderr: '', interrupted: false } }
      : { deny: options.beneath }
  })
  return { ran, logs }
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

  test('a feat commit whose subject ends with its issue runs', async ($, on) => {
    const { ran } = world(on)

    await $.tool.call(bash('git commit -m "feat(web): catalog menu #107"'))
    const inBody = await $.tool.call(bash('git commit -m "feat(web): b" -m "Closes #108"'))

    expect(ran).toEqual(['git commit -m "feat(web): catalog menu #107"'])
    expect(inBody.deny).toContain('end the subject with its number: "feat(web): b #N"')
  })

  test('a version at the end of the branch name is no issue', async ($, on) => {
    const { ran } = world(on, { branch: 'feat/react-19' })

    const refused = await $.tool.call(bash('git commit -m "feat(web): move to react 19"'))

    expect(refused.deny).toContain('is a feature')
    expect(ran).toEqual([])
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

  test('a commit without the issue the user named goes through with a suggestion', async ($, on) => {
    const { ran, logs } = world(on, { branch: 'fix/a' })

    await $.prompt.submit(prompt('implement #160, then commit'))
    const unlinked = await $.tool.call(bash('git commit -m "fix: chat"'))
    const linked = await $.tool.call(bash('git commit -m "fix: chat #160"'))

    expect(ran).toEqual(['git commit -m "fix: chat"', 'git commit -m "fix: chat #160"'])
    expect(logs).toEqual([
      'issue-first: committed without an issue number; suggestion: end the subject with the issue it is about: "fix: chat #160" (mentioned: #160)',
    ])
    expect(unlinked.deny).toBeUndefined()
    expect(unlinked.context?.at(-1)).toContain('do not file an issue or rewrite the commit unless they ask')
    expect(linked.context ?? []).toEqual([])
  })

  test('a commit another hook denies gets no suggestion', async ($, on) => {
    const { logs } = world(on, { branch: 'fix/a', beneath: 'first line is not Conventional Commits' })

    await $.prompt.submit(prompt('implement #160, then commit'))
    const refused = await $.tool.call(bash('git commit -m "Fixed stuff"'))

    expect(refused.deny).toBe('first line is not Conventional Commits')
    expect(logs).toEqual([])
  })

  test("an issue named in passing does not override the branch's issue", async ($, on) => {
    const { ran, logs } = world(on, { branch: 'chore/nuxt4-ui4-89' })

    await $.prompt.submit(prompt("what's the #82 script"))
    await $.prompt.submit(prompt('ship'))
    await $.tool.call(bash('git commit -m "chore(web): upgrade to nuxt 4 #89"'))

    expect(ran).toEqual(['git commit -m "chore(web): upgrade to nuxt 4 #89"'])
    expect(logs).toEqual([])
  })

  test('a commit in a worktree answers to that worktree’s branch', async ($, on) => {
    const worktree = { branch: 'chore/nuxt4-ui4-89', common: '/repo/.git' }
    world(on, { common: '/repo/.git', branch: 'dev', repos: { '/repo/wt': worktree } })

    await $.prompt.submit(prompt("what's the #82 script"))
    await $.prompt.submit(prompt('ship'))
    const linked = await $.tool.call(bash('cd /repo/wt && git commit -m "chore(web): upgrade to nuxt 4 #89"'))
    const unlinked = await $.tool.call(bash('cd /repo/wt && git commit -m "chore(web): upgrade to nuxt 4 #88"'))

    expect(linked.context ?? []).toEqual([])
    expect(unlinked.context?.at(-1)).toContain('(mentioned: #82)')
  })

  test('what the user typed does not bind a commit in another repo', async ($, on) => {
    const mods = { branch: 'main', common: '/mods/.git' }
    const { ran, logs } = world(on, { common: '/repo/.git', repos: { '/mods': mods } })

    await $.prompt.submit(prompt("what's the #82 script"))
    await $.prompt.submit(prompt('release it'))
    await $.tool.call(bash('cd /mods && git commit -m "fix(git-gates): read the repo the command works in"'))

    expect(ran).toEqual(['cd /mods && git commit -m "fix(git-gates): read the repo the command works in"'])
    expect(logs).toEqual([])
  })

  test('a ticket in the branch name counts as mentioned', async ($, on) => {
    const { ran } = world(on, { branch: 'feat/BLK-7-login' })

    await $.prompt.submit(prompt('commit'))
    const unlinked = await $.tool.call(bash('git commit -m "fix: login"'))

    expect(unlinked.context?.at(-1)).toContain('"fix: login #BLK-7"')
    expect(ran).toEqual(['git commit -m "fix: login"'])
  })

  test('without an issue tracker a numbered mention asks for nothing', async ($, on) => {
    const { ran, logs } = world(on, { remote: false })

    await $.prompt.submit(prompt('fix #87 and commit'))
    await $.tool.call(bash('git commit -m "fix: a"'))

    expect(ran).toEqual(['git commit -m "fix: a"'])
    expect(logs).toEqual([])
  })

  test('after a reload the transcript stands in for the prompts', async ($, on) => {
    const messages = [{ role: 'user', text: 'implement #160, then commit' }] as SessionMessage[]
    const { logs } = world(on, { branch: 'fix/a', messages })

    await $.tool.call(bash('git commit -m "fix: chat"'))

    expect(logs.at(-1)).toContain('(mentioned: #160)')
  })
})

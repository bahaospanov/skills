import type { On, PromptOrigin } from 'claude-code'
import { describe, expect, mock, test, tier } from 'claude-code/testing'

tier('user')

// A GitHub repo at /repo with no CI: fix/a landed in main, fix/b did not.
const world = (on: On) => {
  const forge = { mergedPr: false }
  const ran: string[] = []
  const logs: string[] = []
  mock.clock(on)
  mock.env(on, { HOME: '/Users/me' })
  on('ui.log', ($, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  on('fs.read', ($, e) => ({ deny: `ENOENT: ${e.path}` }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('process.run', ($, e) => {
    const args = e.argv.join(' ')
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '' } })
    const no = { value: { exitCode: 1, stdout: '', stderr: '' } }
    const answers: Record<string, string> = {
      'git rev-parse --show-toplevel': '/repo\n',
      'git remote get-url origin': 'https://github.com/team/app.git\n',
      'git fetch --quiet origin': '',
      'git symbolic-ref --quiet refs/remotes/origin/HEAD': 'refs/remotes/origin/main\n',
      'git rev-parse --verify --quiet refs/remotes/origin/main': 'm1\n',
      'git rev-parse --verify --quiet refs/heads/fix/a': 'a1\n',
      'git rev-parse --verify --quiet refs/heads/fix/b': 'b1\n',
      'git merge-base --is-ancestor a1 refs/remotes/origin/main': '',
      'git cherry refs/remotes/origin/main b1': '+ b1\n',
      'gh run list --branch main --limit 20 --json databaseId,headSha,status,conclusion,url': '[]',
      'gh pr list --head fix/b --state merged --limit 1 --json number': forge.mergedPr ? '[{"number":3}]' : '[]',
    }
    const answer = answers[args]
    return answer === undefined ? no : ok(answer)
  })
  on('tool.call', { tool: 'Bash' }, ($, e) => {
    ran.push(e.command)
    return { result: { stdout: '', stderr: '', interrupted: false } }
  })
  return { forge, ran, logs }
}

const bash = (command: string) => ({ tool: 'Bash' as const, command })
const prompt = (text: string, origin: PromptOrigin = { kind: 'composer' }) => ({ text, origin, wait: false })

describe('merged first', () => {
  test('with no pipeline, a branch git shows merged is removed; one it does not is held', async ($, on) => {
    const { ran, logs } = world(on)
    await $.prompt.submit(prompt('clean up the branches'))

    await $.tool.call(bash('cd /repo && git branch -D fix/a'))
    const held = await $.tool.call(bash('cd /repo && git branch -D fix/b'))

    expect(ran).toEqual(['cd /repo && git branch -D fix/a'])
    expect(logs.some((line) => line.includes('the branch has no pipelines'))).toBe(true)
    expect(held.deny).toContain("nothing says 'fix/b' is merged")
  })

  test('the user saying it merged lets it go', async ($, on) => {
    const { ran } = world(on)
    await $.prompt.submit(prompt('merged, clean up'))

    await $.tool.call(bash('cd /repo && git branch -D fix/b'))
    expect(ran).toEqual(['cd /repo && git branch -D fix/b'])
  })

  test('a merged PR on the forge lets it go: a squash merge git cannot see', async ($, on) => {
    const { forge, ran } = world(on)
    forge.mergedPr = true
    await $.prompt.submit(prompt('clean up the branches'))

    await $.tool.call(bash('cd /repo && git push origin --delete fix/b'))
    expect(ran).toEqual(['cd /repo && git push origin --delete fix/b'])
  })

  test('saying it is not merged keeps it held', async ($, on) => {
    const { ran } = world(on)
    await $.prompt.submit(prompt('not merged yet, but remove the branch'))

    const held = await $.tool.call(bash('cd /repo && git branch -D fix/b'))
    expect(ran).toEqual([])
    expect(held.deny).toContain('merged first')
  })
})

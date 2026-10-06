import type { On, PromptOrigin } from 'claude-code'
import { describe, expect, mock, test, tier, type TestOptions } from 'claude-code/testing'

tier('user')

const WT = '/repo/.claude/worktrees/a'
// The repo's 2.1.280 types predate `TestOptions.options`; the engine running the tests has it.
const TOKEN = { options: { gitlab_token: 'glpat-test' } } as unknown as TestOptions

// A GitLab repo at /repo whose fix/a landed in dev by rebase (as c9, "#98"), so only `git cherry` sees it.
// Pipeline #346 runs on c9; #345 on b8, older than the landing, passed.
const world = (on: On) => {
  const ci = { status: 'running' }
  const ran: string[] = []
  const logs: string[] = []
  const submitted: string[] = []
  const fetched: { url: string; token: string | undefined }[] = []
  const clock = mock.clock(on)
  mock.env(on, { HOME: '/Users/me' })
  on('ui.log', ($, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  on('fs.read', ($, e) => ({ deny: `ENOENT: ${e.path}` }))
  on('prompt.submit', ($, e) => {
    if (e.origin.kind === 'plugin') submitted.push(e.text)
    return { text: e.text }
  })
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('http.fetch', ($, e) => {
    fetched.push({ url: e.url, token: e.init?.headers?.['PRIVATE-TOKEN'] })
    const pipelines = e.url.includes('ref=dev')
      ? [
          { id: 346, sha: 'c9', status: ci.status, web_url: 'https://gitlab.example.com/team/app/-/pipelines/346' },
          { id: 345, sha: 'b8', status: 'success' },
        ]
      : []
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(pipelines) } }
  })
  on('process.run', ($, e) => {
    const args = e.argv.join(' ')
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '' } })
    const no = { value: { exitCode: 1, stdout: '', stderr: '' } }
    const answers: Record<string, string> = {
      'git rev-parse --path-format=absolute --git-common-dir': '/repo/.git\n',
      'git rev-parse --show-toplevel': `${e.init?.cwd ?? '/repo'}\n`,
      'git rev-parse --abbrev-ref HEAD': e.init?.cwd === WT ? 'fix/a\n' : 'dev\n',
      'git remote': 'origin\n',
      'git remote get-url origin': 'git@gitlab.example.com:team/app.git\n',
      'git worktree list --porcelain': `worktree /repo\nHEAD 1111\nbranch refs/heads/dev\n\nworktree ${WT}\nHEAD a1\nbranch refs/heads/fix/a\n`,
      'git fetch --quiet origin': '',
      'git fetch --quiet --prune origin': '',
      'git symbolic-ref --quiet refs/remotes/origin/HEAD': 'refs/remotes/origin/main\n',
      'git rev-parse --verify --quiet refs/remotes/origin/main': 'm0\n',
      'git rev-parse --verify --quiet refs/remotes/origin/dev': 'c9\n',
      'git rev-parse --verify --quiet refs/heads/fix/a': 'a1\n',
      'git cherry refs/remotes/origin/main a1': '+ a1\n',
      'git cherry refs/remotes/origin/dev a1': '- a1\n',
      'git cherry c9 a1': '- a1\n',
      'git cherry b8 a1': '+ a1\n',
      'git merge-base --is-ancestor c9 c9': '',
      'git cherry b8 c9': '+ c9\n',
      'git log refs/remotes/origin/main -n200 --format=%H%x09%s': '',
      'git log refs/remotes/origin/dev -n200 --format=%H%x09%s': 'c9\tfix(api): retry torn range #98\nb8\tfeat(web): grid sizes #97\n',
      'git status --porcelain': '',
    }
    const answer = answers[args]
    return answer === undefined ? no : ok(answer)
  })
  on('tool.call', { tool: 'Bash' }, ($, e) => {
    ran.push(e.command)
    return { result: { stdout: '', stderr: '', interrupted: false } }
  })
  return { ci, ran, logs, submitted, fetched, clock }
}

const bash = (command: string) => ({ tool: 'Bash' as const, command })
const prompt = (text: string, origin: PromptOrigin = { kind: 'composer' }) => ({ text, origin, wait: false })
const turnEnds = () => ({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' as const })

const CLEANUP = 'cd /repo && git worktree remove .claude/worktrees/a && git branch -D fix/a'
const FILL_IN = `cd /repo && curl -sS -X PUT "$API/issues/98" --header "PRIVATE-TOKEN: $T" --form "description=<issue-98.md"`
const CLOSE = `cd /repo && curl -sS -X PUT "$API/issues/98" --header "PRIVATE-TOKEN: $T" --data 'state_event=close'`
const NOTE = `cd /repo && jq -n --arg b "$T" '{body:$b}' | curl -sS -X POST "$API/issues/98/notes" --data @-`

describe('pipeline first', () => {
  test('a rebased branch and its issue body wait for the pipeline that ships them', TOKEN, async ($, on) => {
    const { ci, ran, fetched } = world(on)
    await $.prompt.submit(prompt('merged'))

    const cleanup = await $.tool.call(bash(CLEANUP))
    const fillIn = await $.tool.call(bash(FILL_IN))
    await $.tool.call(bash(NOTE))
    await $.tool.call(bash(CLOSE))

    expect(cleanup.deny).toContain("'fix/a' landed in 'dev', and pipeline #346")
    expect(cleanup.deny).toContain('is still running')
    expect(fillIn.deny).toContain('the work on #98 (fix(api): retry torn range #98) landed')
    expect(ran).toEqual([NOTE, CLOSE])
    expect(fetched[0]).toEqual({
      url: 'https://gitlab.example.com/api/v4/projects/team%2Fapp/pipelines?ref=dev&per_page=20',
      token: 'glpat-test',
    })

    ci.status = 'success'
    await $.tool.call(bash(CLEANUP))
    await $.tool.call(bash(FILL_IN))
    expect(ran).toEqual([NOTE, CLOSE, CLEANUP, FILL_IN])
  })

  test('a failed pipeline holds the work back too', TOKEN, async ($, on) => {
    const { ci } = world(on)
    ci.status = 'failed'
    await $.prompt.submit(prompt('merged, clean up'))

    const cleanup = await $.tool.call(bash(CLEANUP))
    expect(cleanup.deny).toContain('its newest pipeline, #346')
    expect(cleanup.deny).toContain('ended failed')
  })

  test('the user can say not to wait', TOKEN, async ($, on) => {
    const { ran } = world(on)
    await $.prompt.submit(prompt('skip the pipeline and clean up'))

    await $.tool.call(bash(CLEANUP))
    expect(ran).toEqual([CLEANUP])
  })

  test('with no token the status is unknown: logged, not gated', async ($, on) => {
    const { ran, logs, fetched } = world(on)
    await $.prompt.submit(prompt('merged'))

    await $.tool.call(bash(CLEANUP))
    expect(ran).toEqual([CLEANUP])
    expect(fetched).toEqual([])
    expect(logs.some((line) => line.includes('no gitlab_token in git-cleanup options'))).toBe(true)
  })

  test('the stale-work follow-up waits for a green pipeline too', TOKEN, async ($, on) => {
    const { ci, submitted, clock } = world(on)
    await $.prompt.submit(prompt('ship'))
    await $.tool.call(bash(`cd ${WT} && git commit -m "fix: a"`))
    await $.tool.call(bash(`cd ${WT} && git push -u origin fix/a`))

    await $.turn.complete(turnEnds())
    await clock.settle()
    expect(submitted).toEqual([])

    ci.status = 'success'
    await $.turn.complete(turnEnds())
    await clock.settle()
    expect(submitted.length).toBe(1)
    expect(submitted[0]).toContain(`fix/a: in origin/dev; worktree ${WT}, local branch`)
  })
})

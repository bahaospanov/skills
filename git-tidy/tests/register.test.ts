import type { ModelCompleteInput, On, PromptOrigin, SessionMessage } from 'claude-code'
import { describe, expect, mock, test, tier } from 'claude-code/testing'

tier('user')

type Repo = { branch: string; remote?: boolean; common: string }

type World = {
  branch?: string
  // Other checkouts a command can `cd` into, keyed by directory; the session's own is /repo.
  repos?: Record<string, Repo>
  common?: string
  files?: Record<string, string>
  messages?: SessionMessage[]
  beneath?: string
  gitFails?: boolean
  remote?: boolean
  // Whether origin's source branch contains origin's target (`dev`) once fetched.
  base?: 'fresh' | 'stale'
  review?: string
  unanswered?: boolean
}

const USAGE = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const answered = (text: string) => ({ isAnswered: true as const, text, usage: USAGE })

// Beneath the mod: a git checkout at /repo, a disk of `files`, Haiku answering `review`, and a Bash that records what ran.
const world = (on: On, options: World = {}) => {
  const ran: string[] = []
  const logs: string[] = []
  const asked: ModelCompleteInput[] = []
  mock.clock(on)
  mock.env(on, { HOME: '/Users/me' })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('model.complete', ($, e) => {
    asked.push(e)
    if (options.unanswered) return { value: { isAnswered: false as const, reason: 'empty-reply' as const, usage: USAGE } }
    return { value: answered(options.review ?? '{"ok": true}') }
  })
  on('ui.status', () => ({ value: undefined }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('session.messages', () => ({ value: options.messages ?? [] }))
  on('process.run', ($, e) => {
    if (options.gitFails) return { deny: 'git is gone' }
    const args = e.argv.join(' ')
    if (options.base !== undefined) {
      if (args.startsWith('git rev-parse --verify --quiet refs/remotes/origin/')) {
        return { value: { exitCode: 0, stdout: args.endsWith('/dev') ? 'base1\n' : 'head1\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
      }
      if (args === 'git merge-base --is-ancestor base1 head1') {
        return { value: { exitCode: options.base === 'fresh' ? 0 : 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
      }
    }
    const cwd = e.init?.cwd
    const repo = cwd === undefined ? undefined : options.repos?.[cwd]
    const common = repo?.common ?? options.common
    const stdout =
      args === 'git rev-parse --show-toplevel'
        ? `${cwd ?? '/repo'}\n`
        : args === 'git rev-parse --abbrev-ref HEAD'
          ? `${repo?.branch ?? options.branch ?? 'feat/a'}\n`
          : args === 'git remote'
            ? (repo?.remote ?? options.remote)
              ? 'origin\n'
              : ''
            : args === 'git rev-parse --path-format=absolute --git-common-dir' && common !== undefined
              ? `${common}\n`
              : undefined
    return { value: { exitCode: stdout === undefined ? 1 : 0, stdout: stdout ?? '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
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
  return { ran, logs, asked }
}

const bash = (command: string) => ({ tool: 'Bash' as const, command })

const prompt = (text: string, origin: PromptOrigin = { kind: 'composer' }) => ({ text, origin, wait: false })

describe('register', () => {
  test('a merge request on a stale target is denied until the user says the old base is intended', async ($, on) => {
    const { ran } = world(on, { base: 'stale' })
    const open = 'curl -sS -X POST "$API/merge_requests" --form source_branch=feat/x --form target_branch=dev --form "title=x"'

    await $.prompt.submit(prompt('ship'))
    const refused = await $.tool.call(bash(open))

    expect(refused.deny).toContain("'feat/x' does not contain the latest 'dev'")
    expect(ran).toEqual([])

    await $.prompt.submit(prompt('no rebase, open the MR'))
    await $.tool.call(bash(open))

    expect(ran).toEqual([open])
  })

  test('a merge request whose source has the latest target opens', async ($, on) => {
    const { ran } = world(on, { base: 'fresh' })

    await $.prompt.submit(prompt('ship'))
    await $.tool.call(bash('gh pr create --base dev --head feat/x --title x'))

    expect(ran).toEqual(['gh pr create --base dev --head feat/x --title x'])
  })

  test('a commit message that is not Conventional Commits is denied without asking Haiku', async ($, on) => {
    const { ran, asked } = world(on)

    await $.prompt.submit(prompt('commit'))
    const refused = await $.tool.call(bash('git commit -m "Fixed stuff"'))

    expect(refused.deny).toBe("git-tidy (commit message): first line is not Conventional Commits: 'Fixed stuff'")
    expect(ran).toEqual([])
    expect(asked).toEqual([])
  })

  test('git -C commits get the message checks too', async ($, on) => {
    const { ran } = world(on)

    await $.prompt.submit(prompt('commit'))
    const refused = await $.tool.call(bash('git -C /repo commit -m "Fixed stuff"'))

    expect(refused.deny).toBe("git-tidy (commit message): first line is not Conventional Commits: 'Fixed stuff'")
    expect(ran).toEqual([])
  })

  test('a commit crediting Claude as co-author is denied without asking Haiku', async ($, on) => {
    const { ran, asked } = world(on)

    await $.prompt.submit(prompt('commit'))
    const inMessage = await $.tool.call(
      bash("git commit -F - <<'EOF'\nfix: a\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nEOF"),
    )
    const asTrailer = await $.tool.call(bash('git commit -m "fix: a" --trailer "Co-authored-by: Claude <noreply@anthropic.com>"'))
    const footer = await $.tool.call(bash('git commit -m "fix: a" -m "🤖 Generated with [Claude Code](https://claude.com/claude-code)"'))
    await $.tool.call(bash('git commit -m "fix: a"'))

    const reason = 'git-tidy (commit message): a Co-Authored-By trailer credits Claude; commit without it'
    expect(inMessage.deny).toBe(reason)
    expect(asTrailer.deny).toBe(reason)
    expect(footer.deny).toBe('git-tidy (commit message): a "Generated with Claude" line credits Claude; commit without it')
    expect(ran).toEqual(['git commit -m "fix: a"'])
    expect(asked.length).toBe(1)
  })

  test('a commit whose body Haiku rejects runs, and the user gets the review as advice', async ($, on) => {
    const { ran, asked, logs } = world(on, { review: '{"ok": false, "reason": "body restates the diff"}' })

    await $.prompt.submit(prompt('commit'))
    const advised = await $.tool.call(bash('git commit -m "fix: a" -m "Changed a.py"'))

    expect(asked[0]?.prompt.startsWith('Reviewer for a commit message. {"hook_event_name":"PreToolUse"')).toBe(true)
    expect(advised.deny).toBeUndefined()
    expect(advised.context?.at(-1)).toContain('git-tidy (commit message review): body restates the diff\nThe commit ran.')
    expect(logs).toEqual(['git-tidy (commit message review): body restates the diff'])
    expect(ran).toEqual(['git commit -m "fix: a" -m "Changed a.py"'])
  })

  test('a body pre-answering a reviewer runs, and the user gets advice', async ($, on) => {
    const { ran, logs } = world(on)

    await $.prompt.submit(prompt('commit'))
    const advised = await $.tool.call(bash('git commit -m "fix: a" -m "Nothing else changed."'))

    expect(advised.deny).toBeUndefined()
    expect(logs).toEqual(['git-tidy (commit message): pre-answers a reviewer instead of saying why:\n      Nothing else changed.'])
    expect(ran).toEqual(['git commit -m "fix: a" -m "Nothing else changed."'])
  })

  test('a commit Haiku gives no answer on still runs, and the reason is logged', async ($, on) => {
    const { ran, logs } = world(on, { unanswered: true })

    await $.prompt.submit(prompt('commit'))
    const result = await $.tool.call(bash('git commit -m "fix: a"'))

    expect(result.deny).toBeUndefined()
    expect(logs).toEqual(['git-tidy (commit message review): no verdict: (empty-reply)'])
    expect(ran).toEqual(['git commit -m "fix: a"'])
  })

  test('commands that are not commits never ask Haiku', async ($, on) => {
    const { asked } = world(on)

    await $.prompt.submit(prompt('ship it'))
    await $.tool.call(bash('git status'))
    await $.tool.call(bash('git push origin feat/a'))

    expect(asked).toEqual([])
  })
})

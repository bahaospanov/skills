import type { ModelCompleteRequest, On, PromptOrigin, SessionMessage } from 'claude-code'
import { describe, expect, mock, test, tier } from 'claude-code/testing'

tier('user')

const POLICY = { '/repo/.claude/push-policy.json': '{"protected_branches": ["dev", "main"]}' }

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
  landedIn?: string
  remote?: boolean
  // Whether origin's source branch contains origin's target (`dev`) once fetched.
  base?: 'fresh' | 'stale'
  review?: string
  // The one-feature-per-MR review's reply, asked apart from the others.
  scope?: string
  unanswered?: boolean
  // Commits no remote has yet, oldest first, keyed by sha.
  unpushed?: Record<string, Commit>
  // The branch's commits origin already has, oldest first; they come before `unpushed`.
  pushed?: Record<string, Commit>
  // Branches origin has, as remote-tracking refs.
  origin?: string[]
}

type Commit = { subject: string; files: string; diff?: string; body?: string }

const USAGE = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const answered = (text: string) => ({ isAnswered: true as const, text, usage: USAGE })

// Beneath the mod: a git checkout at /repo, a disk of `files`, Haiku answering `review`, and a Bash that records what ran.
const world = (on: On, options: World = {}) => {
  const ran: string[] = []
  const logs: string[] = []
  const asked: ModelCompleteRequest[] = []
  const scoped: ModelCompleteRequest[] = []
  mock.clock(on)
  mock.env(on, { HOME: '/Users/me' })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('model.complete', ($, e) => {
    if (e.prompt.includes('more than one feature')) {
      scoped.push(e)
      return { value: answered(options.scope ?? '{"ok": true}') }
    }
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
    if (options.landedIn !== undefined) {
      if (args.startsWith('git rev-parse --verify --quiet refs/remotes/origin/')) {
        return { value: { exitCode: 0, stdout: 'cafe123\n', stderr: '' } }
      }
      if (args === `git merge-base --is-ancestor cafe123 refs/remotes/origin/${options.landedIn}`) {
        return { value: { exitCode: 0, stdout: '', stderr: '' } }
      }
    }
    if (options.base !== undefined) {
      if (args.startsWith('git rev-parse --verify --quiet refs/remotes/origin/')) {
        return { value: { exitCode: 0, stdout: args.endsWith('/dev') ? 'base1\n' : 'head1\n', stderr: '' } }
      }
      if (args === 'git merge-base --is-ancestor base1 head1') {
        return { value: { exitCode: options.base === 'fresh' ? 0 : 1, stdout: '', stderr: '' } }
      }
    }
    const tracked = /^git rev-parse --verify --quiet refs\/remotes\/origin\/(.+)$/.exec(args)?.[1]
    if (tracked !== undefined && options.origin?.includes(tracked)) {
      return { value: { exitCode: 0, stdout: `${tracked}1\n`, stderr: '' } }
    }
    const unpushed = options.unpushed ?? {}
    const branch = { ...options.pushed, ...unpushed }
    const shown = /^git show (-s --format=%s|-s --format=%B|--format= --name-status|--format= -U0 --no-color --diff-filter=AM) (\w+)$/.exec(args)
    if (args.startsWith('git rev-list --reverse ')) {
      const listed = args.endsWith(' --not --remotes') ? unpushed : branch
      return { value: { exitCode: 0, stdout: Object.keys(listed).map((sha) => `${sha}\n`).join(''), stderr: '' } }
    }
    const commit = shown?.[2] === undefined ? undefined : branch[shown[2]]
    if (shown && commit) {
      const part =
        shown[1] === '-s --format=%s'
          ? commit.subject
          : shown[1] === '-s --format=%B'
            ? [commit.subject, commit.body].filter(Boolean).join('\n\n')
            : shown[1] === '--format= --name-status'
              ? commit.files
              : (commit.diff ?? '')
      return { value: { exitCode: 0, stdout: `${part}\n`, stderr: '' } }
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
  return { ran, logs, asked, scoped }
}

const bash = (command: string) => ({ tool: 'Bash' as const, command })

const prompt = (text: string, origin: PromptOrigin = { kind: 'composer' }) => ({ text, origin, wait: false })
// A prompt typed while the turn `turnId` was running.
const typedOver = (turnId: string, text: string) => ({ ...prompt(text), turnId })

describe('register', () => {
  test('a push to a branch that already landed is denied until the next MR is named', async ($, on) => {
    const { ran } = world(on, { files: POLICY, landedIn: 'dev' })

    await $.prompt.submit(prompt('ship'))
    const refused = await $.tool.call(bash('git push'))

    expect(refused.deny).toContain("'feat/a' has already landed in 'dev'")
    expect(ran).toEqual([])

    await $.prompt.submit(prompt('open a new MR for the follow-up and push'))
    await $.tool.call(bash('git push'))

    expect(ran).toEqual(['git push'])
  })

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

  test('a well-formed commit whose body Haiku rejects is denied before it runs', async ($, on) => {
    const { ran, asked, logs } = world(on, { review: '{"ok": false, "reason": "body restates the diff"}' })

    await $.prompt.submit(prompt('commit'))
    const refused = await $.tool.call(bash('git commit -m "fix: a" -m "Changed a.py"'))

    expect(asked[0]?.prompt.startsWith('Reviewer for a commit message. {"hook_event_name":"PreToolUse"')).toBe(true)
    expect(refused.deny).toBe('git-tidy (commit message review): body restates the diff')
    expect(logs).toEqual(['git-tidy (commit message review): body restates the diff'])
    expect(ran).toEqual([])
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

  const PROVIDER_FIRST = {
    a1: { subject: 'refactor(api): drop the content endpoints', files: 'D\tapi/routes/content.py', diff: '' },
    b2: { subject: 'refactor(admin): drop the content pages', files: 'D\tadmin/pages/Content.tsx\nD\tadmin/api/content.ts' },
  }

  test('a push of commits that leave the project broken in between is denied with the reason', async ($, on) => {
    const { ran, asked } = world(on, {
      unpushed: PROVIDER_FIRST,
      review: '{"ok": false, "reason": "drop the content endpoints leaves the admin calling them; move the admin commit first"}',
    })

    await $.prompt.submit(prompt('ship'))
    const refused = await $.tool.call(bash('git push -u origin chore/drop'))

    expect(refused.deny).toContain('git-tidy (every commit works)')
    expect(refused.deny).toContain('move the admin commit first')
    expect(asked[0]?.prompt).toContain('drop the content pages')
    expect(asked[0]?.model).toBe('claude-sonnet-5-5')
    expect(ran).toEqual([])
  })

  test('a series the review passes is pushed', async ($, on) => {
    const { ran, asked } = world(on, { unpushed: PROVIDER_FIRST })

    await $.prompt.submit(prompt('push'))
    await $.tool.call(bash('git push'))

    expect(asked).toHaveLength(1)
    expect(ran).toEqual(['git push'])
  })

  test('a single new commit costs no review', async ($, on) => {
    const { ran, asked } = world(on, { unpushed: { a1: PROVIDER_FIRST.a1 }, review: '{"ok": false, "reason": "x"}' })

    await $.prompt.submit(prompt('push'))
    await $.tool.call(bash('git push'))

    expect(asked).toHaveLength(0)
    expect(ran).toEqual(['git push'])
  })

  test('a series over the cap is logged, not reviewed', async ($, on) => {
    const many = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`c${i}`, { subject: `feat: ${i}`, files: `M\tf${i}` }]))
    const { ran, asked, logs } = world(on, { unpushed: many, review: '{"ok": false, "reason": "x"}' })

    await $.prompt.submit(prompt('push'))
    await $.tool.call(bash('git push'))

    expect(asked).toHaveLength(0)
    expect(logs).toContain('git-tidy (every commit works): 16 commits, over 15, not reviewed')
    expect(ran).toEqual(['git push'])
  })

  test('the user vouching for the order skips the review', async ($, on) => {
    const { ran, asked } = world(on, { unpushed: PROVIDER_FIRST, review: '{"ok": false, "reason": "x"}' })

    await $.prompt.submit(prompt('push it, the order is fine'))
    await $.tool.call(bash('git push'))

    expect(asked).toHaveLength(0)
    expect(ran).toEqual(['git push'])
  })

  // The menu went up in one push; its mobile fix follows alone.
  const MENU = { p1: { subject: 'feat(web): catalog menu next to the logo #107', files: 'A\tweb/components/CatalogMenu.vue' } }
  const MENU_FIX = { u1: { subject: 'fix(web): catalog menu on mobile #107', files: 'M\tweb/components/CatalogMenu.vue' } }
  const BRANCH = { files: POLICY, origin: ['dev', 'main'], pushed: MENU, unpushed: MENU_FIX }

  const FOLLOW_UP = '{"ok": false, "reason": "catalog menu on mobile fixes catalog menu next to the logo"}'

  test('a push adding a follow-up to a commit origin already has is held for the user with the reason', async ($, on) => {
    const { ran, asked } = world(on, { ...BRANCH, review: FOLLOW_UP })

    await $.prompt.submit(prompt('ship'))
    const held = await $.tool.call(bash('git push'))

    expect(held.deny).toContain('git-tidy (one commit per change)')
    expect(held.deny).toContain('fixes catalog menu next to the logo')
    expect(held.deny).toContain('recommend folding them, and ask')
    expect(asked[0]?.prompt).toContain('catalog menu next to the logo')
    expect(asked[0]?.prompt).toContain('catalog menu on mobile')
    expect(asked[0]?.model).toBe('claude-sonnet-5-5')
    expect(ran).toEqual([])
  })

  test('a retry before the user answers is held again without asking the model', async ($, on) => {
    const { ran, asked } = world(on, { ...BRANCH, review: FOLLOW_UP })

    await $.prompt.submit(prompt('ship'))
    await $.tool.call(bash('git push'))
    const again = await $.tool.call(bash('git push'))

    expect(again.deny).toContain('fixes catalog menu next to the logo')
    expect(asked).toHaveLength(1)
    expect(ran).toEqual([])
  })

  test('once the user answers, the held commits go as they are', async ($, on) => {
    const { ran, asked } = world(on, { ...BRANCH, review: FOLLOW_UP })

    await $.prompt.submit(prompt('ship'))
    await $.tool.call(bash('git push'))
    await $.prompt.submit(prompt('no, push them as they are'))
    await $.tool.call(bash('git push'))

    expect(asked).toHaveLength(1)
    expect(ran).toEqual(['git push'])
  })

  test('commits the review finds separate are pushed', async ($, on) => {
    const { ran, asked } = world(on, BRANCH)

    await $.prompt.submit(prompt('push'))
    await $.tool.call(bash('git push'))

    expect(asked).toHaveLength(1)
    expect(ran).toEqual(['git push'])
  })

  test('a commit marked fixup! is held without asking the model', async ($, on) => {
    const { ran, asked } = world(on, {
      ...BRANCH,
      unpushed: { u1: { subject: 'fixup! feat(web): catalog menu next to the logo #107', files: 'M\tweb/components/CatalogMenu.vue' } },
    })

    await $.prompt.submit(prompt('push'))
    const refused = await $.tool.call(bash('git push'))

    expect(refused.deny).toContain("is marked to fold into 'feat(web): catalog menu next to the logo #107'")
    expect(asked).toHaveLength(0)
    expect(ran).toEqual([])
  })

  test('the user saying to keep the commits skips the review', async ($, on) => {
    const { ran, asked } = world(on, { ...BRANCH, review: '{"ok": false, "reason": "x"}' })

    await $.prompt.submit(prompt('push, keep the commits'))
    await $.tool.call(bash('git push'))

    expect(asked).toHaveLength(0)
    expect(ran).toEqual(['git push'])
  })

  test('a push straight to an integration branch is not reviewed', async ($, on) => {
    const { ran, asked } = world(on, { ...BRANCH, review: '{"ok": false, "reason": "x"}' })

    await $.prompt.submit(prompt('push to main'))
    await $.tool.call(bash('git push origin HEAD:main'))

    expect(asked).toHaveLength(0)
    expect(ran).toEqual(['git push origin HEAD:main'])
  })

  test('a branch of one commit costs no review', async ($, on) => {
    const { ran, asked } = world(on, { ...BRANCH, pushed: {}, review: '{"ok": false, "reason": "x"}' })

    await $.prompt.submit(prompt('push'))
    await $.tool.call(bash('git push'))

    expect(asked).toHaveLength(0)
    expect(ran).toEqual(['git push'])
  })

  // A real branch: four features in one commit, no issue named.
  const BUNDLE = {
    b1: {
      subject: 'feat(api-py,web): asset page details, specs list and collections, model physical size, similar models ranked by tag rarity',
      files: 'M\tapps/api-py/app/assets/api.py\nM\tapps/web/pages/asset/[id].vue',
    },
  }
  const MANY = '{"ok": false, "reason": "asset specs list, model physical size, similar models ranking"}'

  test('a branch carrying several features is held for the user with the features named', async ($, on) => {
    const { ran, scoped } = world(on, { files: POLICY, origin: ['dev', 'main'], unpushed: BUNDLE, scope: MANY })

    await $.prompt.submit(prompt('ship'))
    const held = await $.tool.call(bash('git push -u origin feat/asset-detail'))

    expect(held.deny).toContain('git-tidy (one feature per MR)')
    expect(held.deny).toContain('similar models ranking')
    expect(held.deny).toContain('recommend a branch\nand MR per feature')
    expect(scoped[0]?.prompt).toContain('similar models ranked by tag rarity')
    expect(scoped[0]?.model).toBe('claude-sonnet-5-5')
    expect(ran).toEqual([])
  })

  test('commits naming two issues are held without asking the model', async ($, on) => {
    const { ran, scoped } = world(on, {
      ...BRANCH,
      unpushed: { u1: { subject: 'feat(web): subcategory cards', body: '#109', files: 'A\tweb/components/Cards.vue' } },
    })

    await $.prompt.submit(prompt('ship'))
    const held = await $.tool.call(bash('git push'))

    expect(held.deny).toContain("the branch's commits name 2 issues: #107, #109")
    expect(scoped).toHaveLength(0)
    expect(ran).toEqual([])
  })

  test('once the user answers, the branch goes as it is, and its later pushes too', async ($, on) => {
    const { ran, scoped } = world(on, { files: POLICY, origin: ['dev', 'main'], unpushed: BUNDLE, scope: MANY })

    await $.prompt.submit(prompt('ship'))
    await $.tool.call(bash('git push'))
    const retried = await $.tool.call(bash('git push'))
    await $.prompt.submit(prompt('keep it, push'))
    await $.tool.call(bash('git push'))
    await $.tool.call(bash('git push'))

    expect(retried.deny).toContain('git-tidy (one feature per MR)')
    expect(scoped).toHaveLength(1)
    expect(ran).toEqual(['git push', 'git push'])
  })

  test('the user saying it is one MR skips the review', async ($, on) => {
    const { ran, scoped } = world(on, { files: POLICY, origin: ['dev', 'main'], unpushed: BUNDLE, scope: MANY })

    await $.prompt.submit(prompt('push it, keep them together in one MR'))
    await $.tool.call(bash('git push'))

    expect(scoped).toHaveLength(0)
    expect(ran).toEqual(['git push'])
  })

  test('a branch of one feature is pushed after one review', async ($, on) => {
    const { ran, scoped } = world(on, { files: POLICY, origin: ['dev', 'main'], unpushed: MENU })

    await $.prompt.submit(prompt('push'))
    await $.tool.call(bash('git push'))

    expect(scoped).toHaveLength(1)
    expect(ran).toEqual(['git push'])
  })
})

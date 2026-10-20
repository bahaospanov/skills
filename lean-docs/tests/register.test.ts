import type { ModelCompleteRequest, On } from 'claude-code'
import { describe, expect, mock, test, tier, type Engine } from 'claude-code/testing'

tier('user')

const REJECT = '{"ok": false, "reason": "one-time procedure"}'
const APPROVE = '{"ok": true}'

const answered = (text: string) => ({
  isAnswered: true as const,
  text,
  usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
})

type Repo = {
  diff: string
  diffs: Record<string, string>
  head: string
  parents: Record<string, string>
  movesTo?: string
  status?: string
  untracked: Record<string, string>
  grep: Record<string, string[]>
  files: Record<string, string>
}

// Beneath the mod: a git worktree at /repo (HOME /Users/me) whose HEAD, diff, untracked files, grep hits and disk the
// test sets. `status` follows the diff unless a test pins it, standing in for work this session's hand never made.
const world = (on: On, reply = APPROVE) => {
  const repo: Repo = { diff: '', diffs: {}, head: 'abc', parents: {}, untracked: {}, grep: {}, files: {} }
  const descends = (commit: string | undefined, from: string): boolean =>
    commit !== undefined && (commit === from || descends(repo.parents[commit], from))
  const asked: ModelCompleteRequest[] = []
  const logs: string[] = []
  const submitted: string[] = []
  const ran: string[] = []
  const clock = mock.clock(on)
  const status = () =>
    repo.status ??
    [repo.diff === '' ? '' : ' M tracked', ...Object.keys(repo.untracked).map((file) => `?? ${file}`)].filter((line) => line !== '').join('\n')
  mock.env(on, { HOME: '/Users/me' })
  on('session.cwd', () => ({ value: '/repo' }))
  on('process.run', ($, e) => {
    const args = e.argv.slice(1).join(' ')
    const answer = (stdout: string | undefined) => ({
      value: { exitCode: stdout === undefined ? 1 : 0, stdout: stdout ?? '', stderr: '' },
    })
    if (e.argv[0] === 'sh') return answer(e.argv[4]?.startsWith('/repo/reels/') ? '' : undefined)
    if (args.endsWith('rev-parse --show-toplevel')) return answer(/^(-C \/repo|rev-parse)/.test(args) ? '/repo\n' : undefined)
    if (args === '-C /repo worktree list --porcelain') return answer('worktree /repo\nHEAD abc\n')
    if (args === '-C /repo rev-parse HEAD') return answer(`${repo.head}\n`)
    const [, from, to] = args.match(/^-C \/repo merge-base --is-ancestor (\S+) (\S+)$/) ?? []
    if (from !== undefined && to !== undefined) return answer(descends(to, from) ? '' : undefined)
    const [, was, now] = args.match(/^-C \/repo rev-parse (\S+)\^ (\S+)\^$/) ?? []
    if (was !== undefined && now !== undefined) {
      const parents = [repo.parents[was], repo.parents[now]]
      return answer(parents.includes(undefined) ? undefined : `${parents.join('\n')}\n`)
    }
    if (args === '-C /repo status --porcelain') return answer(status())
    const base = args.match(/^-C \/repo diff --unified=0 (.+)$/)
    if (base?.[1] !== undefined) return answer(repo.diffs[base[1]] ?? repo.diff)
    if (args === '-C /repo ls-files --others --exclude-standard') return answer(Object.keys(repo.untracked).join('\n'))
    const grep = args.match(/^-C \/repo grep -l -F -- (.+)$/)
    if (grep?.[1] !== undefined) return answer(repo.grep[grep[1]]?.join('\n'))
    return answer(undefined)
  })
  on('fs.read', ($, e) => {
    const text = repo.files[e.path] ?? repo.untracked[e.path.replace(/^\/repo\//, '')]
    return text === undefined ? { deny: `ENOENT: ${e.path}` } : { value: text }
  })
  on('fs.exists', ($, e) => ({ value: e.path in repo.files || e.path.replace(/^\/repo\//, '') in repo.untracked }))
  on('model.complete', ($, e) => {
    asked.push(e)
    return { value: answered(reply) }
  })
  on('ui.status', () => ({ value: undefined }))
  on('ui.log', ($, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  on('prompt.submit', ($, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('tool.call', { tool: 'Bash' }, ($, e) => {
    ran.push(e.command)
    if (repo.movesTo !== undefined) [repo.head, repo.movesTo] = [repo.movesTo, undefined]
    return { result: { stdout: '', stderr: '', interrupted: false } }
  })
  on('tool.call', { tool: 'Write' }, ($, e) => {
    ran.push(e.file_path)
    return { result: { type: 'create' as const, filePath: e.file_path, content: e.content, structuredPatch: [], originalFile: null } }
  })
  on('tool.call', { tool: 'Edit' }, ($, e) => {
    ran.push(e.file_path)
    const result = { filePath: e.file_path, oldString: e.old_string, newString: e.new_string, originalFile: null }
    return { result: { ...result, structuredPatch: [], userModified: false, replaceAll: false } }
  })
  return { repo, asked, logs, submitted, ran, clock }
}

const turnEnds = (extra: { agentId?: string; isAborted?: boolean } = {}) => ({
  answer: 'done',
  durationMs: 1,
  isAborted: extra.isAborted ?? false,
  turnId: 't1',
  reason: extra.isAborted ? ('aborted' as const) : ('answer' as const),
  ...(extra.agentId === undefined ? {} : { agentId: extra.agentId }),
})

const prose = (n: number, tag = 'Step') => Array.from({ length: n }, (_, i) => `${tag} ${i}.`).join('\n')

const docDiff = (path: string, n: number) =>
  [`--- a/${path}`, `+++ b/${path}`, `@@ -1,0 +2,${n} @@`, ...Array.from({ length: n }, (_, i) => `+Step ${i}.`)].join('\n')

// HEAD leaves abc for `to` inside `command`; a diff against abc would then blame THEIRS.md on this session.
const moveHead = async ($: Engine, repo: Repo, command: string, to: string) => {
  await $.tool.call({ tool: 'Bash', command: 'cd /repo && make' })
  repo.movesTo = to
  repo.diffs['abc'] = docDiff('THEIRS.md', 19)
  await $.tool.call({ tool: 'Bash', command })
  repo.diff = docDiff('README.md', 19)
  await $.turn.complete(turnEnds())
}

describe('register', () => {
  test('docs-review: a grown doc in a checkout is reviewed and a rejection reaches the model as context', async ($, on) => {
    const { asked, logs } = world(on, REJECT)

    const answered = await $.tool.call({ tool: 'Edit', file_path: '/repo/docs/setup.md', old_string: 'a', new_string: 'a longer page' })

    expect(asked.length).toBe(1)
    expect(asked[0]?.model).toBe('claude-haiku-4-5-20251001')
    expect(asked[0]?.prompt.startsWith('Reviewer for NEW OR GROWN DOCUMENTATION. {"hook_event_name":"PostToolUse"')).toBe(true)
    expect(answered.context).toEqual(['lean-docs/docs-review: one-time procedure'])
    expect(logs).toEqual(['lean-docs/docs-review: one-time procedure'])
  })

  test('docs-review: trims, code files, and docs outside a checkout, in a dotfile tree or in temp cost no model call', async ($, on) => {
    const { repo, asked, ran } = world(on, REJECT)
    repo.files['/repo/README.md'] = 'a much longer page than before'

    await $.tool.call({ tool: 'Edit', file_path: '/repo/README.md', old_string: 'a long paragraph', new_string: 'short' })
    await $.tool.call({ tool: 'Write', file_path: '/repo/README.md', content: 'shorter page' })
    await $.tool.call({ tool: 'Write', file_path: '/repo/app.ts', content: 'export {}' })
    await $.tool.call({ tool: 'Write', file_path: '/elsewhere/notes.md', content: 'notes' })
    await $.tool.call({ tool: 'Write', file_path: '/Users/me/.claude/notes.md', content: 'notes' })
    await $.tool.call({ tool: 'Write', file_path: '/tmp/notes.md', content: 'notes' })

    expect(ran.length).toBe(6)
    expect(asked).toEqual([])
  })

  test('docs-review: an approving verdict leaves the result; no verdict lets it stand and says so', async ($, on) => {
    const { logs } = world(on, 'Sorry, I cannot help with that.')

    const answered = await $.tool.call({ tool: 'Write', file_path: '/repo/docs/recovery.md', content: 'restore steps' })

    expect(answered.context).toBeUndefined()
    expect(logs).toEqual(['lean-docs/docs-review: no verdict: Sorry, I cannot help with that.'])
  })

  test('docs-no-repeat-code: a doc line repeating identifiers stated in code is written, and Claude gets the hint', async ($, on) => {
    const { repo, asked, ran } = world(on, REJECT)
    repo.grep['API_URL'] = ['src/config.ts', 'README.md']
    repo.grep['config.ts'] = ['src/config.ts']

    const refused = await $.tool.call({
      tool: 'Edit',
      file_path: '/repo/docs/setup.md',
      old_string: 'Setup.',
      new_string: 'Setup.\nSet `API_URL` in `config.ts`.',
    })

    expect(refused.deny).toBeUndefined()
    expect(refused.context?.at(-1)?.startsWith('lean-docs/docs-no-repeat-code: this line repeats API_URL/config.ts, already stated in src/config.ts:')).toBe(true)
    expect(ran).toEqual(['/repo/docs/setup.md'])
    expect(asked.length).toBe(1)
  })

  test('skill files: a new SKILL.md, a sibling and a nested file in a skill folder skip docs-review and docs-no-repeat-code', async ($, on) => {
    const { repo, asked, ran } = world(on, REJECT)
    repo.files['/repo/skills/deploy/SKILL.md'] = '---\nname: deploy\n---'
    repo.grep['API_URL'] = ['src/config.ts']
    repo.grep['config.ts'] = ['src/config.ts']
    const steps = 'Steps.\nSet `API_URL` in `config.ts`.'

    const written = [
      await $.tool.call({ tool: 'Write', file_path: '/repo/skills/new/SKILL.md', content: steps }),
      await $.tool.call({ tool: 'Edit', file_path: '/repo/skills/deploy/rewrite.md', old_string: 'Steps.', new_string: steps }),
      await $.tool.call({ tool: 'Edit', file_path: '/repo/skills/deploy/refs/trackers.md', old_string: 'Steps.', new_string: steps }),
    ]

    expect(written.map((call) => [call.deny, call.context])).toEqual([[undefined, undefined], [undefined, undefined], [undefined, undefined]])
    expect(ran.length).toBe(3)
    expect(asked).toEqual([])
  })

  test('media work: a doc the checkout ignores or under a .lean-skip folder skips docs-review and docs-no-repeat-code', async ($, on) => {
    const { repo, asked } = world(on, REJECT)
    repo.grep['API_URL'] = ['src/config.ts']
    repo.grep['config.ts'] = ['src/config.ts']
    const steps = 'Steps.\nSet `API_URL` in `config.ts`.'

    const written = await $.tool.call({ tool: 'Write', file_path: '/repo/reels/HISTORY.md', content: steps })

    expect([written.deny, written.context]).toEqual([undefined, undefined])
    expect(asked).toEqual([])
  })

  test('skill files: a doc in skills/ but outside any skill folder is still checked', async ($, on) => {
    const { repo, asked } = world(on, REJECT)
    repo.files['/repo/skills/deploy/SKILL.md'] = '---\nname: deploy\n---'
    repo.grep['API_URL'] = ['src/config.ts']
    repo.grep['config.ts'] = ['src/config.ts']

    const refused = await $.tool.call({ tool: 'Edit', file_path: '/repo/skills/README.md', old_string: 'A.', new_string: 'A.\nSet `API_URL` in `config.ts`.' })
    const reviewed = await $.tool.call({ tool: 'Edit', file_path: '/repo/skills/README.md', old_string: 'a', new_string: 'a longer page' })

    expect(refused.context?.at(-1)?.startsWith('lean-docs/docs-no-repeat-code:')).toBe(true)
    expect(reviewed.context).toEqual(['lean-docs/docs-review: one-time procedure'])
    expect(asked.length).toBe(2)
  })

  test('changesets: a changeset skips docs-review and docs-no-repeat-code, and limit-docs does not count it', async ($, on) => {
    const { repo, asked, ran, submitted, clock } = world(on, REJECT)
    repo.grep['API_URL'] = ['src/config.ts']
    repo.grep['config.ts'] = ['src/config.ts']
    const note = '---\n"pkg": minor\n---\n\nSet `API_URL` in `config.ts`.'

    await $.tool.call({ tool: 'Bash', command: 'cd /repo && make' })
    const written = [
      await $.tool.call({ tool: 'Write', file_path: '/repo/.changeset/api-url.md', content: note }),
      await $.tool.call({ tool: 'Edit', file_path: '/repo/.changeset/api-url.md', old_string: 'Set', new_string: 'Set it once:\nSet' }),
    ]
    repo.untracked['.changeset/api-url.md'] = prose(45)
    repo.diff = docDiff('README.md', 3)
    await $.turn.complete(turnEnds())
    await clock.settle()

    expect(written.map((call) => [call.deny, call.context])).toEqual([[undefined, undefined], [undefined, undefined]])
    expect(ran.length).toBe(3)
    expect(asked).toEqual([])
    expect(submitted.length).toBe(1)
    expect(submitted[0]).toContain('README.md grew by 3 lines')
    expect(submitted[0]).not.toContain('.changeset/')
  })

  test('limit-docs: prose in a skill folder is not counted; a doc outside one still is', async ($, on) => {
    const { repo, submitted, clock } = world(on)
    repo.files['/repo/skills/deploy/SKILL.md'] = '---\nname: deploy\n---'
    repo.grep['make'] = ['Makefile']
    repo.grep['FLAG=1'] = ['Makefile']

    await $.tool.call({ tool: 'Bash', command: 'cd /repo && make' })
    repo.untracked['skills/new/SKILL.md'] = prose(45)
    repo.untracked['skills/deploy/rewrite.md'] = prose(45)
    repo.untracked['skills/deploy/refs/trackers.md'] = prose(45)
    repo.diff = [docDiff('skills/deploy/SKILL.md', 19), '+Run `make` with `FLAG=1`.', docDiff('README.md', 3)].join('\n')
    await $.turn.complete(turnEnds())
    await clock.settle()

    expect(submitted.length).toBe(1)
    expect(submitted[0]).toContain('lean-docs/limit-docs: prose outweighs the change.\n  README.md grew by 3 lines\n')
    expect(submitted[0]).not.toContain('skills/')
  })

  test('limit-docs: a new untracked document sends one follow-up', async ($, on) => {
    const { repo, logs, submitted, clock } = world(on)

    await $.tool.call({ tool: 'Bash', command: 'cd /repo && make' })
    repo.untracked['docs/plan.md'] = prose(45)
    await $.turn.complete(turnEnds())
    await clock.settle()
    await $.turn.complete(turnEnds())
    await clock.settle()

    expect(submitted.length).toBe(1)
    expect(submitted[0]).toContain('lean-docs/limit-docs: prose outweighs the change.\n  NEW document docs/plan.md (45 lines)')
    expect(logs).toContain("lean-docs/limit-docs: this turn's docs are over budget; a follow-up prompt asks to cut")
  })

  test('limit-docs: a fast-forward by another agent re-anchors the base instead of landing in this turn', async ($, on) => {
    const { repo, submitted, clock } = world(on)

    await $.tool.call({ tool: 'Bash', command: 'git -C /repo log --oneline -5' })
    repo.head = 'def'
    repo.diff = docDiff('README.md', 19)
    repo.diffs['def'] = ''
    await $.turn.complete(turnEnds())
    await clock.settle()

    expect(submitted).toEqual([])
  })

  test('limit-docs: a commit written by this session keeps its prose in the report', async ($, on) => {
    const { repo, submitted, clock } = world(on)
    repo.parents = { def: 'abc' }

    await $.tool.call({ tool: 'Bash', command: 'cd /repo && make' })
    repo.diff = docDiff('README.md', 19)
    repo.movesTo = 'def'
    repo.diffs['def'] = ''
    await $.tool.call({ tool: 'Bash', command: 'git -C /repo commit -m "docs: x"' })
    await $.turn.complete(turnEnds())
    await clock.settle()

    expect(submitted[0]).toContain('README.md')
    expect(submitted[0]).toContain('Diff base: abc')
  })

  test('limit-docs: an amend keeps the base: it replaces HEAD on the same parent instead of descending from it', async ($, on) => {
    const { repo, submitted, clock } = world(on)
    repo.parents = { def: 'abc', fed: 'abc' }

    await $.tool.call({ tool: 'Bash', command: 'cd /repo && make' })
    repo.diff = docDiff('README.md', 19)
    repo.diffs = { def: '', fed: '' }
    repo.movesTo = 'def'
    await $.tool.call({ tool: 'Bash', command: 'git -C /repo commit -m "docs: x"' })
    repo.movesTo = 'fed'
    await $.tool.call({ tool: 'Bash', command: 'git -C /repo commit --amend --no-edit' })
    await $.turn.complete(turnEnds())
    await clock.settle()

    expect(submitted[0]).toContain('README.md')
    expect(submitted[0]).toContain('Diff base: abc')
  })

  test('limit-docs: a reset onto another line re-anchors though the same command cherry-picks', async ($, on) => {
    const { repo, submitted, clock } = world(on)
    repo.parents = { abc: 'p1', dev: 'p2', p2: 'p1' }

    await moveHead($, repo, 'git reset --hard origin/dev && git cherry-pick -n abc && git status --short', 'dev')
    await clock.settle()

    expect(submitted[0]).toContain('README.md')
    expect(submitted[0]).toContain('Diff base: dev')
    expect(submitted[0]).not.toContain('THEIRS.md')
  })

  test('limit-docs: a rebase re-anchors, a commit in the same command included', async ($, on) => {
    const { repo, submitted, clock } = world(on)
    repo.parents = { abc: 'p1', dev: 'p1', bca: 'dev', fix: 'bca' }

    await moveHead($, repo, 'git rebase origin/dev && git commit -am fix', 'fix')
    await clock.settle()

    expect(submitted[0]).toContain('Diff base: fix')
    expect(submitted[0]).not.toContain('THEIRS.md')
  })

  test('limit-docs: a fast-forward under an unrelated command re-anchors: descending from the base is not enough', async ($, on) => {
    const { repo, submitted, clock } = world(on)
    repo.parents = { def: 'abc' }

    await moveHead($, repo, 'cd /repo && make test', 'def')
    await clock.settle()

    expect(submitted[0]).toContain('Diff base: def')
    expect(submitted[0]).not.toContain('THEIRS.md')
  })

  test("limit-docs: another agent's uncommitted prose in a checkout this session only read is not reported", async ($, on) => {
    const { repo, submitted, clock } = world(on)
    repo.status = ''

    await $.tool.call({ tool: 'Bash', command: 'git -C /repo log --oneline -5' })
    repo.diff = docDiff('README.md', 19)
    await $.turn.complete(turnEnds())
    await clock.settle()

    expect(submitted).toEqual([])
  })

  test('limit-docs: a doc line added through Bash that repeats code is noted', async ($, on) => {
    const { repo, submitted, clock } = world(on)
    repo.grep['make'] = ['Makefile']
    repo.grep['FLAG=1'] = ['Makefile']

    await $.tool.call({ tool: 'Bash', command: 'echo x >> /repo/README.md' })
    repo.diff = ['--- a/README.md', '+++ b/README.md', '@@ -1,0 +2,1 @@', '+Run `make` with `FLAG=1`.'].join('\n')
    await $.turn.complete(turnEnds())
    await clock.settle()

    expect(submitted[0]).toContain('README.md repeats make/FLAG=1 - already stated in Makefile; point at it instead of copying it')
  })

  test('limit-docs: at most two follow-ups a session; untouched repos, subagent and interrupted turns are not checked', async ($, on) => {
    const { repo, submitted, clock } = world(on)

    repo.untracked['docs/a.md'] = prose(45, 'A')
    await $.turn.complete(turnEnds())
    await $.tool.call({ tool: 'Bash', command: 'git -C /repo status' })
    await $.turn.complete(turnEnds({ agentId: 'a1' }))
    await $.turn.complete(turnEnds({ isAborted: true }))
    await clock.settle()
    expect(submitted).toEqual([])

    for (const tag of ['B', 'C', 'D']) {
      repo.untracked = { [`docs/${tag}.md`]: prose(45, tag) }
      await $.turn.complete(turnEnds())
      await clock.settle()
    }
    expect(submitted.length).toBe(2)
  })
})

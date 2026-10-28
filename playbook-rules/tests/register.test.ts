import type { ModelCompleteInput, On, PromptOrigin } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

const FILLED =
  '## Summary\n\n```text\nx\n```\n\n## Evidence\n\n- **Before:** 1 fail\n  **After:** 1 pass\n\n## Merge Danger\n\n**Door:** two-way\n\n**Blast Radius:** docs\n'
const MR_MD = '# Merge requests\n\nPick the smallest view that makes the key point clear.\n'

type World = {
  files?: Record<string, string>
  // The playbook's MR.md, wherever the mod looks for it; absent, none is found.
  mrMd?: string
  review?: string
  unanswered?: boolean
}

const USAGE = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

// Beneath the mod: a session at /repo, a disk of `files`, Haiku answering `review`, and a Bash that records what ran.
const world = (on: On, options: World = {}) => {
  const ran: string[] = []
  const logs: string[] = []
  const asked: ModelCompleteInput[] = []
  mock.env(on, { HOME: '/Users/me' })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('session.messages', () => ({ value: [] }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('fs.read', ($, e) => {
    if (e.path.endsWith('/skills/playbook/MR.md') && options.mrMd !== undefined) return { value: options.mrMd }
    const text = options.files?.[e.path]
    return text === undefined ? { deny: `ENOENT: ${e.path}` } : { value: text }
  })
  on('model.complete', ($, e) => {
    asked.push(e)
    if (options.unanswered) return { value: { isAnswered: false as const, reason: 'empty-reply' as const, usage: USAGE } }
    return { value: { isAnswered: true as const, text: options.review ?? '{"ok": true}', usage: USAGE } }
  })
  on('ui.status', () => ({ value: undefined }))
  on('ui.log', ($, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  on('tool.call', { tool: 'Bash' }, ($, e) => {
    ran.push(e.command)
    return { result: { stdout: '', stderr: '', interrupted: false } }
  })
  return { ran, logs, asked }
}

const bash = (command: string) => ({ tool: 'Bash' as const, command })

const prompt = (text: string, origin: PromptOrigin = { kind: 'composer' }) => ({ text, origin, wait: false })

describe('register', () => {
  test('a PR opened with a free-form body is denied before any model call, naming what the template misses', async ($, on) => {
    const { ran, asked } = world(on, { mrMd: MR_MD })

    await $.prompt.submit(prompt('ship'))
    const refused = await $.tool.call(bash('gh pr create --base dev --title t --body "Adds the label file."'))

    expect(refused.deny).toContain('no `## Summary` section')
    expect(refused.deny).toContain('MR.md')
    expect(ran).toEqual([])
    expect(asked).toEqual([])
  })

  test('a body file following the template goes to Haiku with MR.md, and the PR opens when Haiku passes it', async ($, on) => {
    const { ran, asked } = world(on, { files: { '/repo/pr.md': FILLED, '/other/pr.md': FILLED }, mrMd: MR_MD })

    await $.prompt.submit(prompt('ship'))
    await $.tool.call(bash('gh pr create --base dev --title t --body-file pr.md'))
    await $.tool.call(bash('cd /other && gh pr create --base dev --title t --body-file pr.md'))

    expect(ran).toEqual([
      'gh pr create --base dev --title t --body-file pr.md',
      'cd /other && gh pr create --base dev --title t --body-file pr.md',
    ])
    expect(asked[0]?.prompt).toContain('Pick the smallest view that makes the key point clear.')
    expect(asked[0]?.prompt).toContain('**Door:** two-way')
  })

  test("Haiku's style finding denies the PR until the user says the description is fine", async ($, on) => {
    const { ran } = world(on, { mrMd: MR_MD, review: '{"ok": false, "reason": "Evidence: Before is a sentence, not output."}' })
    const open = `gh pr create --title t --body '${FILLED}'`

    await $.prompt.submit(prompt('ship'))
    const refused = await $.tool.call(bash(open))

    expect(refused.deny).toContain('Evidence: Before is a sentence, not output.')
    expect(ran).toEqual([])

    await $.prompt.submit(prompt('the description is fine, ship'))
    await $.tool.call(bash(open))

    expect(ran).toEqual([open])
  })

  test('with no MR.md to compare against, the PR opens unreviewed and a log line says why', async ($, on) => {
    const { ran, logs, asked } = world(on)
    const open = `gh pr create --title t --body '${FILLED}'`

    await $.prompt.submit(prompt('ship'))
    await $.tool.call(bash(open))

    expect(ran).toEqual([open])
    expect(asked).toEqual([])
    expect(logs.some((line) => line.includes('MR.md'))).toBe(true)
  })

  test('no answer from Haiku lets the PR open, with a log line', async ($, on) => {
    const { ran, logs } = world(on, { mrMd: MR_MD, unanswered: true })
    const open = `gh pr create --title t --body '${FILLED}'`

    await $.prompt.submit(prompt('ship'))
    await $.tool.call(bash(open))

    expect(ran).toEqual([open])
    expect(logs.some((line) => line.includes('no verdict'))).toBe(true)
  })

  test('"no template" lets a free-form body through without a review, but never one crediting the tool', async ($, on) => {
    const { ran, asked } = world(on, { mrMd: MR_MD })
    const plain = 'gh pr create --title t --body "Adds the label file."'
    const credited = 'gh pr create --title t --body "Adds the label file.\n\n🤖 Generated with Claude Code"'

    await $.prompt.submit(prompt('no template, ship it'))
    await $.tool.call(bash(plain))
    const refused = await $.tool.call(bash(credited))

    expect(ran).toEqual([plain])
    expect(asked).toEqual([])
    expect(refused.deny).toContain('credits the tool')
  })

  test('a body the check cannot read is denied with the way to make it readable', async ($, on) => {
    const { ran } = world(on)

    await $.prompt.submit(prompt('ship'))
    const refused = await $.tool.call(bash('gh pr create --fill'))

    expect(refused.deny).toContain('--body-file')
    expect(ran).toEqual([])
  })

  test('commands that set no description pass untouched', async ($, on) => {
    const { ran, asked } = world(on, { mrMd: MR_MD })

    await $.prompt.submit(prompt('label it'))
    await $.tool.call(bash('gh pr edit 205 --add-label type::bug'))
    await $.tool.call(bash('git status'))

    expect(ran).toEqual(['gh pr edit 205 --add-label type::bug', 'git status'])
    expect(asked).toEqual([])
  })
})

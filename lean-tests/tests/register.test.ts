import type { ModelCompleteInput, On } from 'claude-code'
import { describe, expect, mock, test, tier } from 'claude-code/testing'

tier('user')

const REJECT = '{"ok": false, "reason": "static copy"}'
const APPROVE = '{"ok": true}'

const answered = (text: string) => ({
  isAnswered: true as const,
  text,
  usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
})

const inputOf = (asked: ModelCompleteInput[]) => {
  const json = asked[0]?.prompt.match(/^Reviewer for a UI TEST\. (\{.*?\})\n/)?.[1]
  return json === undefined ? undefined : JSON.parse(json)
}

const HOME_TEST = `import { render, screen } from '@testing-library/react'
import HomePage from './page'

it('shows the welcome banner', () => {
  render(<HomePage />)
  expect(screen.getByText('Welcome')).toBeInTheDocument()
})
`

// Beneath the mod: /repo is a git checkout, HOME is /Users/me, `files` is the disk.
const world = (on: On, reply: string, files: Record<string, string> = {}) => {
  const asked: ModelCompleteInput[] = []
  const logs: string[] = []
  mock.env(on, { HOME: '/Users/me' })
  on('session.cwd', () => ({ value: '/repo' }))
  on('process.run', ($, e) => ({
    value: {
      exitCode: e.argv[0] === 'sh' ? (e.argv[4]?.startsWith('/repo/reels/') ? 0 : 1) : e.argv[2]?.startsWith('/repo') ? 0 : 128,
      stdout: e.argv[0] === 'git' && e.argv[2]?.startsWith('/repo') ? '/repo\n' : '',
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
  on('fs.read', ($, e) => {
    const text = files[e.path]
    return text === undefined ? { deny: `ENOENT: ${e.path}` } : { value: text }
  })
  on('model.complete', ($, e) => {
    asked.push(e)
    return { value: answered(reply) }
  })
  on('ui.status', () => ({ value: undefined }))
  on('ui.log', ($, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  on('tool.call', { tool: 'Write' }, ($, e) => ({
    result: { type: 'create' as const, filePath: e.file_path, content: e.content, structuredPatch: [], originalFile: null },
  }))
  on('tool.call', { tool: 'Edit' }, ($, e) => {
    const result = { filePath: e.file_path, oldString: e.old_string, newString: e.new_string, originalFile: null }
    return { result: { ...result, structuredPatch: [], userModified: false, replaceAll: false } }
  })
  return { asked, logs }
}

describe('register', () => {
  test('a UI test gaining a literal-text assertion is reviewed with its component, and a rejection reaches the model', async ($, on) => {
    const { asked, logs } = world(on, REJECT, { '/repo/src/app/page.tsx': 'export default () => <p>Welcome</p>' })

    const answered = await $.tool.call({ tool: 'Write', file_path: '/repo/src/app/page.test.tsx', content: HOME_TEST })

    expect(inputOf(asked)).toEqual({
      test_file: '/repo/src/app/page.test.tsx',
      added_assertions: ["expect(screen.getByText('Welcome')).toBeInTheDocument()"],
      test_source: HOME_TEST,
      subject_file: '/repo/src/app/page.tsx',
      subject_source: 'export default () => <p>Welcome</p>',
    })
    expect(answered.context).toEqual(['lean-tests/static-text: static copy'])
    expect(logs).toEqual(['lean-tests/static-text: static copy'])
  })

  test('an edit retyping a string is judged on its new line alone; an approval adds nothing', async ($, on) => {
    const { asked } = world(on, APPROVE, { '/repo/src/app/page.test.tsx': HOME_TEST })

    const answered = await $.tool.call({
      tool: 'Edit',
      file_path: '/repo/src/app/page.test.tsx',
      old_string: "render(<HomePage />)\n  expect(screen.getByText('Hello')).toBeInTheDocument()",
      new_string: "render(<HomePage />)\n  expect(screen.getByText('Welcome')).toBeInTheDocument()",
    })

    expect(inputOf(asked)?.added_assertions).toEqual(["expect(screen.getByText('Welcome')).toBeInTheDocument()"])
    expect(inputOf(asked)?.test_source).toBe(HOME_TEST)
    expect(answered.context).toBeUndefined()
  })

  test('no literal text added, a deletion, source, logic tests, and tests outside a checkout, in temp or media work are not reviewed', async ($, on) => {
    const { asked } = world(on, REJECT, { '/repo/src/app/page.test.tsx': HOME_TEST })

    await $.tool.call({ tool: 'Edit', file_path: '/repo/src/app/page.test.tsx', old_string: 'it(', new_string: "fireEvent.click(screen.getByTestId('go'))\nit(" })
    await $.tool.call({ tool: 'Edit', file_path: '/repo/src/app/page.test.tsx', old_string: "  expect(screen.getByText('Welcome')).toBeInTheDocument()\n", new_string: '' })
    await $.tool.call({ tool: 'Write', file_path: '/repo/src/app/page.tsx', content: "<p>{t('Welcome')}</p> getByText('Welcome')" })
    await $.tool.call({ tool: 'Write', file_path: '/repo/src/lib/money.test.ts', content: "expect(el).toHaveTextContent('$46.20')" })
    await $.tool.call({ tool: 'Write', file_path: '/elsewhere/page.test.tsx', content: HOME_TEST })
    await $.tool.call({ tool: 'Write', file_path: '/tmp/page.test.tsx', content: HOME_TEST })
    await $.tool.call({ tool: 'Write', file_path: '/repo/reels/teaser/scene.test.tsx', content: HOME_TEST })

    expect(asked).toEqual([])
  })
})

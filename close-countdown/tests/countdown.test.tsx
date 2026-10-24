import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const TOOL = 'mcp__close-countdown__close_pane_later'

const BAND = {
  plugin: 'close-countdown',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

// Stands for the engine beneath the mod; returns the argv of every command it ran.
async function start($: Engine, on: On) {
  const ran: string[][] = []
  on('tool.register', (_, e) => ({ value: { tool: `mcp__close-countdown__${e.name}` } }))
  on('command.register', () => ({ value: { command: 'keep-open' } }))
  on('ui.toast', () => ({ value: undefined }))
  on('process.run', (_, e) => {
    ran.push([...e.argv])
    return {
      value: { exitCode: 0, stdout: 'w2:p99\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  return ran
}

test('the band counts down and the pane closes at zero', async ($, on) => {
  const clock = mock.clock(on)
  const ran = await start($, on)

  await $.tool.call({ tool: TOOL, seconds: 10, note: 'report sent' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /Closing this pane in 10s/ }))?.text).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /report sent/ }))?.text).toBeDefined()

  await clock.advance(4000)
  expect((await ui.find({ type: 'Text', text: /Closing this pane in 6s/ }))?.text).toBeDefined()

  await clock.advance(7000)
  expect(ran).toContainEqual(['herdr', 'pane', 'close', 'w2:p99'])
  expect(await ui.find({ type: 'Text', text: /Closing this pane/ })).toBeUndefined()
  await ui.unmount()
})

test('Keep open cancels the close', async ($, on) => {
  const clock = mock.clock(on)
  const ran = await start($, on)

  await $.tool.call({ tool: TOOL, seconds: 10 })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'keep-open' })
  await clock.advance(20000)

  expect(ran).not.toContainEqual(['herdr', 'pane', 'close', 'w2:p99'])
  expect(await ui.find({ type: 'Text', text: /Closing this pane/ })).toBeUndefined()
  await ui.unmount()
})

test('Close now closes the pane at once', async ($, on) => {
  mock.clock(on)
  const ran = await start($, on)

  await $.tool.call({ tool: TOOL, seconds: 60 })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'close-now' })

  expect(ran).toContainEqual(['herdr', 'pane', 'close', 'w2:p99'])
  expect(await ui.find({ type: 'Text', text: /Closing this pane/ })).toBeUndefined()
  await ui.unmount()
})

test('a typed message cancels the close', async ($, on) => {
  const clock = mock.clock(on)
  const ran = await start($, on)

  await $.tool.call({ tool: TOOL, seconds: 10, pane: 'w2:p42' })
  await $.prompt.submit({ text: 'wait, one more thing', wait: false, origin: { kind: 'composer' } })
  await clock.advance(20000)

  expect(ran).not.toContainEqual(['herdr', 'pane', 'close', 'w2:p42'])
})

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Countdown } from '../types'

const PLUGIN = 'herdr-rules'
const TOOL = 'close_pane_later'
const BAR = 38

const countdown = atom({ plugin: 'herdr-rules', key: 'countdown' } as const, null, {
  shape: 'countdown-1',
})
const now = atom({ plugin: 'herdr-rules', key: 'now' } as const, 0)

let tick: Timer | undefined

function stopTicking() {
  tick?.cancel()
  tick = undefined
}

async function cancel($: EngineInterface, why: string): Promise<boolean> {
  stopTicking()
  if ((await read($, countdown)) === null) return false
  await update($, countdown, () => null)
  $.ui.toast(`Pane close cancelled: ${why}`)
  return true
}

// Each tick redraws the band; the one past the deadline closes the pane.
function startTicking($: EngineInterface) {
  stopTicking()
  tick = $.clock.every(1000, () => {
    void (async () => {
      const c = await read($, countdown)
      if (c === null) return stopTicking()
      const t = await $.clock.now()
      await update($, now, () => t)
      if (t >= c.endsAt) await closeNow($)
    })()
  })
}

async function closeNow($: EngineInterface) {
  stopTicking()
  const c = await read($, countdown)
  if (c === null) return
  await update($, countdown, () => null)
  await $.process.run(['herdr', 'pane', 'close', c.pane])
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: TOOL,
      description:
        "Closes a Herdr pane after a countdown drawn above this session's prompt, and returns at once. " +
        'The last step of a Herdr subtask handing back to its parent, in place of a sleep-then-close shell line. ' +
        'A message typed into this session, its Keep open button or /keep-open cancels it.',
      inputSchema: {
        type: 'object',
        properties: {
          seconds: { type: 'integer', minimum: 5, description: 'Seconds until the close; default 60.' },
          note: {
            type: 'string',
            description: "A few words shown beside the countdown, e.g. 'report sent to w2:pZ'.",
          },
          pane: { type: 'string', description: "The Herdr pane id to close; default this session's own pane." },
        },
      },
      isDeferred: false,
    })
    await $.command.register({ name: 'keep-open', description: 'Cancel the scheduled close of this Herdr pane' })
    if ((await read($, countdown)) !== null) startTicking($)

    return next(e)
  })

  on('tool.call', { tool: `mcp__${PLUGIN}__${TOOL}` }, async ($, e) => {
    const args = e as unknown as { seconds?: unknown; note?: unknown; pane?: unknown }
    const seconds = typeof args.seconds === 'number' && args.seconds >= 5 ? Math.round(args.seconds) : 60
    const note = typeof args.note === 'string' ? args.note.slice(0, 80) : ''
    const pane =
      typeof args.pane === 'string' && args.pane !== ''
        ? args.pane
        : (await $.process.run(['printenv', 'HERDR_PANE_ID'])).stdout.trim()
    if (pane === '') return { deny: 'Not inside a Herdr pane: HERDR_PANE_ID is unset.' }

    const t = await $.clock.now()
    const c: Countdown = { pane, seconds, note, endsAt: t + seconds * 1000 }
    await update($, now, () => t)
    await update($, countdown, () => c)
    startTicking($)

    return {
      result: `Pane ${pane} closes in ${seconds}s. A message typed into this session, the Keep open button or /keep-open cancels it.`,
    }
  })

  on('prompt.submit', async ($, e, next) => {
    await cancel($, 'a message was typed')

    return next(e)
  })

  on('command.run', { command: 'keep-open' }, async $ => {
    const wasScheduled = await cancel($, '/keep-open')

    return { text: wasScheduled ? 'The pane stays open.' : 'No close was scheduled.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const c = await read($, countdown)
    if (c === null || e.props.hasSurvey) return next(e)

    const left = Math.max(0, Math.ceil((c.endsAt - (await read($, now))) / 1000))
    const width = Math.max(10, Math.min(BAR, e.props.bodyColumns))
    const filled = Math.min(width, Math.round((width * left) / c.seconds))
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Box>
          <Text color="warning">⏻ Closing this pane in {left}s</Text>
          {c.note !== '' && <Text dimColor> · {c.note}</Text>}
          <Text> </Text>
          <Button key="keep-open" label="✋ Keep open" onPress={() => void cancel($, 'Keep open pressed')} />
          <Text> </Text>
          <Button key="close-now" label="❌ Close now" onPress={() => void closeNow($)} />
        </Box>
        <Text color="warning">
          {'█'.repeat(filled)}
          <Text dimColor>{'░'.repeat(width - filled)}</Text>
        </Text>
      </Box>
    )
  })
}

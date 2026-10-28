export type Countdown = {
  pane: string
  seconds: number
  note: string
  endsAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'herdr-rules': { countdown: Shaped<Countdown | null>; now: number }
  }
}

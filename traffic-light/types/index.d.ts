export type Color = 'green' | 'yellow' | 'red'
export type Light = { color: Color; reason: string; headline?: string }
export type Push = { repo: string; branch: string; sha: string; at: string }

declare module 'claude-code' {
  interface PluginState {
    'traffic-light': {
      light: Light | null
      pr: string | null
      workDir: string | null
      lastPush: Push | null
      spent: readonly string[]
      started: boolean
    }
  }
}

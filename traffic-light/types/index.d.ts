export type Color = 'green' | 'yellow' | 'red'
export type Light = { color: Color; reason: string }

declare module 'claude-code' {
  interface PluginState {
    'traffic-light': {
      light: Light | null
      pr: string | null
      workDir: string | null
    }
  }
}

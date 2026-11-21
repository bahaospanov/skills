export type Color = 'green' | 'yellow' | 'red'
export type Light = { color: Color; reason: string; headline?: string }
export type Forge = 'github' | 'gitlab'
// A project on its forge (undefined when the host is neither), and the checkout GitLab credentials are looked up from.
export type Repo = { forge: Forge | undefined; host: string; path: string; dir: string | undefined }
export type Push = { repo: Repo; branch: string; sha: string; at: string }
export type Closing = { pane: string; work: string; endsAt: number }

declare module 'claude-code' {
  interface PluginState {
    'traffic-light': {
      light: Light | null
      pr: string | null
      workDir: string | null
      sides: readonly string[]
      lastPush: Push | null
      spent: readonly string[]
      started: boolean
      closing: Closing | null
      closeClock: number
      keptOpen: string | null
    }
  }
}

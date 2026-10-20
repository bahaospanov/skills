// The prompt's GATE FIRST paragraph as code: a call it would pass with ok=true costs no model call.

const SHELL_EXT = ['.sh', '.bash', '.zsh']
const SCRIPT_EXT = [...SHELL_EXT, '.py', '.cjs', '.mjs', '.js', '.rb', '.pl']
// Where a layout keeps the programs it runs on their own; elsewhere a .py or .js file is a module the app imports.
const SCRIPT_DIR = /\/(scripts?|bin|tools|ops)\//

const extOf = (path: string) => {
  const base = path.slice(path.lastIndexOf('/') + 1)
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot).toLowerCase() : ''
}

export const isScriptPath = (path: string) =>
  SHELL_EXT.includes(extOf(path)) || (SCRIPT_EXT.includes(extOf(path)) && SCRIPT_DIR.test(path))

export const isTestFile = (path: string) =>
  /\/(tests?|__tests__)\//.test(path) ||
  /\/(test_[^/]*|[^/]*_test\.[^/]+|[^/]*\.(test|spec)\.[^/]+)$/.test(path)

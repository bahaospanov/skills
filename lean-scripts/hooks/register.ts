import type { EngineInterface, Register } from 'claude-code'
import { isScriptPath, isTestFile } from './gates'
import { SCRIPT_FILE } from './prompts'
import { dirOf, isDotfileOrTemp, isTrim, MEDIA_CHECK } from './shared/paths'
import { MODEL, promptFor, SYSTEM, verdictOf, type Review, type Verdict } from './shared/verdict'

const SCRIPTS_REVIEW: Review = { name: 'scripts-review', prompt: SCRIPT_FILE, status: 'judging script' }

const checkoutOf = async ($: EngineInterface, path: string) => {
  const run = await $.process.run(['git', '-C', dirOf(path), 'rev-parse', '--show-toplevel'])
  return run.exitCode === 0 ? run.stdout.trim() : undefined
}

// A skill runs its scripts on every use, so they are never the kind typed again on the spot.
const inSkillFolder = async ($: EngineInterface, path: string, root: string) => {
  for (let dir = dirOf(path); dir === root || dir.startsWith(`${root}/`); dir = dirOf(dir)) {
    if (await $.fs.exists(`${dir}/SKILL.md`)) return true
    if (dir === root) break
  }
  return false
}

const isMediaWork = async ($: EngineInterface, path: string) =>
  (await $.process.run(['sh', '-c', MEDIA_CHECK, 'lean', path])).exitCode === 0

// The loader follows $ only into functions of this file, so the model call lives here, not in shared/verdict.ts.
const judge = async ($: EngineInterface, review: Review, input: object): Promise<Verdict | undefined> => {
  $.ui.status(review.status)
  try {
    const result = await $.model.complete({ model: MODEL, system: SYSTEM, prompt: promptFor(review, input) })
    const reply = result.isAnswered ? result.text : `(${result.reason})`
    const verdict = verdictOf(reply)
    if (verdict === undefined) $.ui.log(`lean-scripts/${review.name}: no verdict: ${reply.slice(0, 120)}`)
    return verdict
  } finally {
    $.ui.status(undefined)
  }
}

export const register: Register = (on) => {
  on('tool.call', { tool: ['Write', 'Edit'] }, async ($, e, next) => {
    const path = e.file_path
    if (isTestFile(path) || isDotfileOrTemp(path, await $.env.get('HOME'), await $.env.get('TMPDIR'))) {
      return next(e)
    }
    const result = await next(e)
    if (result.deny !== undefined || result.isError) return result

    if (e.tool === 'Edit' && isTrim(e.new_string, e.old_string)) return result
    const isScript =
      isScriptPath(path) || (e.tool === 'Write' ? e.content : await $.fs.read(path).catch(() => '')).startsWith('#!')
    const root = isScript ? await checkoutOf($, path) : undefined
    if (root === undefined || (await inSkillFolder($, path, root)) || (await isMediaWork($, path))) return result

    const tool_input =
      e.tool === 'Write'
        ? { file_path: path, content: e.content }
        : { file_path: path, old_string: e.old_string, new_string: e.new_string, replace_all: e.replace_all }
    const verdict = await judge($, SCRIPTS_REVIEW, {
      hook_event_name: 'PostToolUse',
      tool_name: e.tool,
      tool_input,
      cwd: await $.session.cwd(),
    })
    if (verdict?.ok !== false) return result
    $.ui.log(`lean-scripts/scripts-review: ${verdict.reason}`)
    return { ...result, context: [...(result.context ?? []), `lean-scripts/scripts-review: ${verdict.reason}`] }
  })
}

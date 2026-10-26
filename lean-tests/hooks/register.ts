import type { EngineInterface, Register } from 'claude-code'
import { STATIC_TEXT } from './prompts'
import { dirOf, isDotfileOrTemp, MEDIA_CHECK } from './shared/paths'
import { MODEL, promptFor, SYSTEM, verdictOf, type Review, type Verdict } from './shared/verdict'
import { isTestPath, literalTextAssertions, newLines, rendersUi, subjectPathsOf } from './static-text'

const STATIC_TEXT_REVIEW: Review = { name: 'static-text', prompt: STATIC_TEXT, status: 'judging test' }
const MAX_SOURCE = 16_000

const checkoutOf = async ($: EngineInterface, path: string) => {
  const run = await $.process.run(['git', '-C', dirOf(path), 'rev-parse', '--show-toplevel'])
  return run.exitCode === 0 ? run.stdout.trim() : undefined
}

const isMediaWork = async ($: EngineInterface, path: string) =>
  (await $.process.run(['sh', '-c', MEDIA_CHECK, 'lean', path])).exitCode === 0

const subjectOf = async ($: EngineInterface, testPath: string) => {
  for (const path of subjectPathsOf(testPath)) {
    const source = await $.fs.read(path).catch(() => undefined)
    if (source !== undefined) return { subject_file: path, subject_source: source.slice(0, MAX_SOURCE) }
  }
  return {}
}

// The loader follows $ only into functions of this file, so the model call lives here, not in shared/verdict.ts.
const judge = async ($: EngineInterface, review: Review, input: object): Promise<Verdict | undefined> => {
  $.ui.status(review.status)
  try {
    const result = await $.model.complete({ model: MODEL, system: SYSTEM, prompt: promptFor(review, input) })
    const reply = result.isAnswered ? result.text : `(${result.reason})`
    const verdict = verdictOf(reply)
    if (verdict === undefined) $.ui.log(`lean-tests/${review.name}: no verdict: ${reply.slice(0, 120)}`)
    return verdict
  } finally {
    $.ui.status(undefined)
  }
}

export const register: Register = (on) => {
  on('tool.call', { tool: ['Write', 'Edit'] }, async ($, e, next) => {
    const path = e.file_path
    if (!isTestPath(path) || isDotfileOrTemp(path, await $.env.get('HOME'), await $.env.get('TMPDIR'))) return next(e)
    const before = await $.fs.read(path).catch(() => '')
    const result = await next(e)
    if (result.deny !== undefined || result.isError) return result

    const assertions =
      e.tool === 'Write'
        ? literalTextAssertions(newLines(e.content, before))
        : literalTextAssertions(newLines(e.new_string, e.old_string))
    if (assertions.length === 0) return result
    const source = e.tool === 'Write' ? e.content : await $.fs.read(path).catch(() => e.new_string)
    if (!rendersUi(path, source) || (await checkoutOf($, path)) === undefined || (await isMediaWork($, path))) {
      return result
    }

    const verdict = await judge($, STATIC_TEXT_REVIEW, {
      test_file: path,
      added_assertions: assertions,
      test_source: source.slice(0, MAX_SOURCE),
      ...(await subjectOf($, path)),
    })
    if (verdict?.ok !== false) return result
    $.ui.log(`lean-tests/static-text: ${verdict.reason}`)
    return { ...result, context: [...(result.context ?? []), `lean-tests/static-text: ${verdict.reason}`] }
  })
}

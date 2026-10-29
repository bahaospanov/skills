import type { EngineInterface, Register } from 'claude-code'
import {
  acknowledgesNoTemplate,
  acknowledgesStyle,
  creditLines,
  descriptionOf,
  descriptionRefused,
  styleRefused,
  templateGaps,
  unreadableRefused,
} from './mr-description'
import { guidanceGaps, guidanceRefused } from './mr-guidance'
import { MR_STYLE } from './prompts'
import { CONTINUATION_ORIGINS, CONTINUATION_PLUGINS } from './shared/continuations'
import { currentTurn } from './shared/git-commands'
import { MODEL, promptFor, SYSTEM, verdictOf, type Review } from './shared/verdict'

const HUMAN_ORIGINS: readonly string[] = ['composer', 'bridge', 'sdk']
const LOOKBACK = 30
const STYLE_REVIEW: Review = { name: 'MR style', prompt: MR_STYLE, status: 'judging MR description' }

type Prompt = { text: string; human: boolean; turnId?: string | undefined }

let prompts: Prompt[] = []

// Transcript rows carry no origin, so the engine's own user-role rows are told apart by their markup.
const ENGINE_ROW = /<task-notification>|<local-command-(caveat|stdout|stderr)>/
const REMINDER = /<system-reminder>[\s\S]*?<\/system-reminder>/g
const HOME = /^(?:~|\$HOME|\$\{HOME\})(?=\/)/

// Tracked prompts are exact; after a reload or resume the transcript stands in, minus the engine's rows.
const recentPrompts = async ($: EngineInterface): Promise<Prompt[]> => {
  if (prompts.length > 0) return prompts
  const messages = await $.session.messages()
  return messages
    .filter((m) => m.role === 'user' && !m.toolResults?.length && !ENGINE_ROW.test(m.text))
    .map((m) => ({ text: m.text.replace(REMINDER, '').trim(), human: true }))
    .filter((p) => p.text !== '')
    .slice(-LOOKBACK)
}

// The loader only admits literal $.env.get names; HOME is all a `~/pr.md` needs.
const expandHome = async ($: EngineInterface, path: string) =>
  HOME.test(path) ? path.replace(HOME, (await $.env.get('HOME')) ?? '~') : path

const readBody = async ($: EngineInterface, file: string, dir: string | undefined) => {
  const path = await expandHome($, file)
  if (path.startsWith('/')) return $.fs.read(path).catch(() => undefined)
  const cwd = await $.session.cwd()
  const base = dir === undefined ? cwd : await expandHome($, dir)
  const root = base.startsWith('/') ? base : `${cwd}/${base}`
  return $.fs.read(`${root.replace(/\/$/, '')}/${path}`).catch(() => undefined)
}

// The playbook's MR.md beside this mod: in the checkout it runs from (--plugin-dir, a directory marketplace),
// in the plugin cache under the same marketplace and version, or among the skills linked into ~/.claude/skills.
const mrGuide = async ($: EngineInterface) => {
  const root = $.plugin.root.replace(/\/$/, '')
  const parent = root.slice(0, root.lastIndexOf('/'))
  const version = root.slice(root.lastIndexOf('/') + 1)
  const home = await $.env.get('HOME')
  const paths = [
    `${parent}/skills/playbook/MR.md`,
    `${parent.slice(0, parent.lastIndexOf('/'))}/bahaospanov-skills/${version}/skills/playbook/MR.md`,
    ...(home === undefined ? [] : [`${home}/.claude/skills/playbook/MR.md`]),
  ]
  for (const path of paths) {
    const text = await $.fs.read(path).catch(() => undefined)
    if (text) return { path, text }
  }
  return undefined
}

// The loader follows $ only into functions of this file, so the model call lives here, not in shared/verdict.ts.
const judge = async ($: EngineInterface, review: Review, input: object) => {
  $.ui.status(review.status)
  try {
    const result = await $.model.complete({ model: MODEL, system: SYSTEM, prompt: promptFor(review, input) })
    const reply = result.isAnswered ? result.text : `(${result.reason})`
    const verdict = verdictOf(reply)
    if (verdict === undefined) $.ui.log(`playbook-rules (${review.name}): no verdict: ${reply.slice(0, 120)}`)
    return verdict
  } finally {
    $.ui.status(undefined)
  }
}

export const register: Register = (on) => {
  on('prompt.submit', ($, e, next) => {
    if (e.origin.kind === 'plugin' && CONTINUATION_PLUGINS.includes(e.origin.name)) return next(e)
    if (CONTINUATION_ORIGINS.includes(e.origin.kind)) return next(e)
    prompts = [...prompts, { text: e.text, human: HUMAN_ORIGINS.includes(e.origin.kind), turnId: e.turnId }].slice(-LOOKBACK)
    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const source = descriptionOf(e.command)
    if (source === undefined) return next(e)
    const typed = currentTurn(await recentPrompts($)).filter((p) => p.human)
    const waived = typed.some((p) => acknowledgesNoTemplate(p.text))
    if ('unreadable' in source) return waived ? next(e) : { deny: unreadableRefused(e.command, source.unreadable) }
    const text = 'text' in source ? source.text : await readBody($, source.file, source.dir)
    if (text === undefined) {
      if (waived) return next(e)
      return { deny: unreadableRefused(e.command, `the body file '${'file' in source ? source.file : ''}' could not be read`) }
    }
    const gaps = waived ? [] : templateGaps(text)
    const credits = creditLines(text)
    if (gaps.length + credits.length > 0) return { deny: descriptionRefused(e.command, gaps, credits) }
    if (waived || typed.some((p) => acknowledgesStyle(p.text))) return next(e)
    const shortfalls = guidanceGaps(text)
    if (shortfalls.length > 0) return { deny: guidanceRefused(e.command, shortfalls) }
    const guide = await mrGuide($)
    if (guide === undefined) {
      $.ui.log(`playbook-rules (${STYLE_REVIEW.name}): no playbook MR.md beside the mod, so the description goes unreviewed`)
      return next(e)
    }
    const verdict = await judge($, STYLE_REVIEW, { mr_md: guide.text, description: text })
    return verdict === undefined || verdict.ok ? next(e) : { deny: styleRefused(e.command, verdict.reason, guide.path) }
  })
}

import type { EngineInterface, Register } from 'claude-code'
import { featureRefused, isFeature, messageOf, waives } from './feature-commit'
import { issueTailInBranch, missingRefViolation, subjectOf, subjectRefs, tailRefInBranch } from './issue-number'
import { commandDir, currentTurn } from './shared/git-commands'
import { refsInBranch, refsInText } from './shared/issue-refs'

const HUMAN_ORIGINS: readonly string[] = ['composer', 'bridge', 'sdk']
const LOOKBACK = 30

type Prompt = { text: string; human: boolean; turnId?: string | undefined }

let prompts: Prompt[] = []

// Transcript rows carry no origin, so the engine's own user-role rows are told apart by their markup.
const ENGINE_ROW = /<task-notification>|<local-command-(caveat|stdout|stderr)>/
const REMINDER = /<system-reminder>[\s\S]*?<\/system-reminder>/g

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

const git = async ($: EngineInterface, args: string[], cwd?: string) => {
  const run = await $.process.run(['git', ...args], cwd === undefined ? undefined : { cwd })
  return run.exitCode === 0 ? run.stdout.trim() : undefined
}

// The loader only admits literal $.env.get names; HOME is all a `cd ~/…` needs.
const repoOf = async ($: EngineInterface, command: string) => {
  const dir = commandDir(command)
  return dir?.startsWith('~') ? `${await $.env.get('HOME')}${dir.slice(1)}` : dir
}

const messageText = async ($: EngineInterface, source: { text: string } | { file: string }, cwd?: string) => {
  if ('text' in source) return source.text
  if (source.file.startsWith('/')) return $.fs.read(source.file).catch(() => undefined)
  const dir = cwd?.startsWith('/') ? cwd : [await $.session.cwd(), cwd].filter(Boolean).join('/')
  return $.fs.read(`${dir}/${source.file}`).catch(() => undefined)
}

const currentBranch = async ($: EngineInterface, cwd?: string) => {
  const branch = await git($, ['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
  return branch && branch !== 'HEAD' ? branch : undefined
}

// Worktrees of one repo share its common dir, so a worktree counts as the session's repo.
const isSessionRepo = async ($: EngineInterface, cwd: string | undefined) => {
  if (cwd === undefined) return true
  const args = ['rev-parse', '--path-format=absolute', '--git-common-dir']
  const [there, here] = await Promise.all([git($, args, cwd), git($, args)])
  return there === undefined || here === undefined || there === here
}

// Refs the user named or the branch carries, newest first.
// What the user typed is about the session's repo, so another repo's commit only answers to its branch.
const mentionedRefs = async ($: EngineInterface, branch: string | undefined, tracked: boolean, cwd?: string) => {
  const typed = (await isSessionRepo($, cwd)) ? (await recentPrompts($)).filter((p) => p.human).reverse() : []
  return {
    required: [
      ...new Set([...(branch ? refsInBranch(branch, tracked) : []), ...typed.flatMap((p) => refsInText(p.text, tracked))]),
    ],
    accepted: branch ? tailRefInBranch(branch, tracked) : [],
  }
}

export const register: Register = (on) => {
  on('prompt.submit', ($, e, next) => {
    prompts = [...prompts, { text: e.text, human: HUMAN_ORIGINS.includes(e.origin.kind), turnId: e.turnId }].slice(-LOOKBACK)
    return next(e)
  })

  // No .catch: a check that throws lets the commit run, which suits a nudge better than blocking every commit.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const source = messageOf(e.command)
    if (source === undefined) return next(e)
    const cwd = await repoOf($, e.command)
    const text = await messageText($, source, cwd)
    if (text === undefined) return next(e)
    const tracked = !!(await git($, ['remote'], cwd))
    const branch = await currentBranch($, cwd)
    const branchIssues = branch ? [...refsInBranch(branch, true), ...issueTailInBranch(branch)] : []
    if (
      tracked &&
      isFeature(text) &&
      subjectRefs(text).length === 0 &&
      branchIssues.length === 0 &&
      !currentTurn(prompts).some((p) => p.human && waives(p.text))
    ) {
      return { deny: featureRefused(subjectOf(text)) }
    }
    const refs = await mentionedRefs($, branch, tracked, cwd)
    const missing = missingRefViolation(text, refs.required, refs.accepted)
    if (missing === undefined) return next(e)
    // A missing issue number is advice, not a block: the user sees it, the model is told to relay it and
    // not to act on it (filing an issue is the user's call).
    const result = await next(e)
    if (result.deny !== undefined) return result
    $.ui.log(`issue-first: committed without an issue number; suggestion: ${missing}`)
    const relay = `issue-first: this commit has no issue number (${missing}). Tell the user as a recommendation; do not file an issue or rewrite the commit unless they ask.`
    return { ...result, context: [...(result.context ?? []), relay] }
  })
}

import type { EngineInterface, Register } from 'claude-code'
import { featureRefused, isFeature, messageOf, subjectOf, waives } from './feature-commit'
import { commandDir, currentTurn } from './shared/git-commands'
import { refsInBranch, refsInText, tailRefInBranch } from './shared/issue-refs'

const HUMAN_ORIGINS: readonly string[] = ['composer', 'bridge', 'sdk']
const LOOKBACK = 10

type Prompt = { text: string; human: boolean; turnId?: string | undefined }

let prompts: Prompt[] = []

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

const branchNamesIssue =async ($: EngineInterface, cwd?: string) => {
  const branch = await git($, ['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
  return branch !== undefined && [...refsInBranch(branch, true), ...tailRefInBranch(branch, true)].length > 0
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
    if (text === undefined || !isFeature(text) || refsInText(text, true).length > 0) return next(e)
    if (!(await git($, ['remote'], cwd))) return next(e)
    if (await branchNamesIssue($, cwd)) return next(e)
    if (currentTurn(prompts).some((p) => p.human && waives(p.text))) return next(e)
    return { deny: featureRefused(subjectOf(text)) }
  })
}

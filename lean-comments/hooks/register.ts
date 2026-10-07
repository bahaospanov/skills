import type { EngineInterface, Register } from 'claude-code'
import { commentsInDiff, commentsInFile, MAX_BLOCKS, reportKey, turnReport, type CommentFinding } from './comments'
import { ADD_LIMIT } from './rules'
import { authorsHistory } from './shared/anchor'
import { baseName, claimedWorktrees, prefixes, splitLines, worktreesOf } from './shared/diff'
import { addedSignal, densitySignal, editGuidance } from './signals'

type Owned = { head: string; seen: string; baseline: Set<string>; status: string; touched: boolean }

const MAX_UNTRACKED_CHARS = 512_000
const INSTALL_ROOTS = ['.agents/skills', '.claude/skills', '.claude/plugins']

let worktrees: string[] | undefined
const owned = new Map<string, Owned>()
const reported = new Set<string>()
let blocks = 0

// Built rather than typed: a literal NUL in this file makes git call it binary and stop diffing it.
const SEP = String.fromCharCode(0)

const keyOf = (path: string, line: string) => `${path}${SEP}${line}`

const git = async ($: EngineInterface, cwd: string | undefined, args: string[]) => {
  const run = await $.process.run(cwd === undefined ? ['git', ...args] : ['git', '-C', cwd, ...args])
  return run.exitCode === 0 ? run.stdout.trim() : undefined
}

const addedComments = async ($: EngineInterface, wt: string, base: string) => {
  const diff = await git($, wt, ['diff', '--unified=0', base])
  const found = diff ? commentsInDiff(diff) : {}
  for (const rel of splitLines((await git($, wt, ['ls-files', '--others', '--exclude-standard'])) ?? '')) {
    if (!prefixes(rel)) continue
    const text = await $.fs.read(`${wt}/${rel}`).catch(() => undefined)
    if (text === undefined || text.length > MAX_UNTRACKED_CHARS) continue
    const comments = commentsInFile(rel, text)
    if (comments.length > 0) (found[rel] ??= []).push(...comments)
  }
  return found
}

// Decided on where the file lands: ~/.claude/skills/<name> may link back into a source checkout, which stays checked.
const isInstalled = async ($: EngineInterface, path: string) => {
  const home = await $.env.get('HOME')
  if (!home) return false
  const real = (await $.fs.stat(path, { resolve: true }).catch(() => undefined))?.realPath ?? path
  return INSTALL_ROOTS.some((root) => real.startsWith(`${home}/${root}/`))
}

const statusOf = async ($: EngineInterface, wt: string) => (await git($, wt, ['status', '--porcelain'])) ?? ''

const anchor = async ($: EngineInterface, wt: string, head: string) => {
  const baseline = new Set<string>()
  for (const [path, lines] of Object.entries(await addedComments($, wt, head))) {
    for (const line of lines) baseline.add(keyOf(path, line))
  }
  return { head, seen: head, baseline, status: await statusOf($, wt) }
}

const claim = async ($: EngineInterface, blob: string) => {
  if (!blob) return
  if (worktrees === undefined) {
    const root = await git($, undefined, ['rev-parse', '--show-toplevel'])
    worktrees = root ? worktreesOf((await git($, root, ['worktree', 'list', '--porcelain'])) ?? '') : []
  }
  for (const wt of claimedWorktrees(blob, worktrees)) {
    if (owned.has(wt)) continue
    const head = await git($, wt, ['rev-parse', 'HEAD'])
    if (!head) continue
    owned.set(wt, { ...(await anchor($, wt, head)), touched: false })
  }
}

// Between two of our own calls another agent sharing the checkout can commit, fast-forward or reset it, and every line
// arriving that way would otherwise read as this turn's work.
const settle = async ($: EngineInterface, command?: string) => {
  for (const [wt, info] of owned) {
    let next = info
    const head = await git($, wt, ['rev-parse', 'HEAD'])
    if (head !== undefined && head !== next.seen) {
      next =
        command !== undefined && authorsHistory(command)
          ? { ...next, seen: head }
          : { ...(await anchor($, wt, head)), touched: next.touched }
    }
    if (!next.touched) {
      const status = await statusOf($, wt)
      if (status !== next.status) next = { ...next, status, touched: true }
    }
    owned.set(wt, next)
  }
}

const markTouched = (path: string) => {
  for (const [wt, info] of owned) {
    if (!info.touched && path.startsWith(`${wt}/`)) owned.set(wt, { ...info, touched: true })
  }
}

const overBudget = async ($: EngineInterface) => {
  const findings: CommentFinding[] = []
  const bases: string[] = []
  for (const [wt, info] of owned) {
    if (!info.touched) continue
    const before = findings.length
    for (const [path, lines] of Object.entries(await addedComments($, wt, info.head))) {
      const fresh = lines.filter((line) => !info.baseline.has(keyOf(path, line)))
      if (fresh.length > ADD_LIMIT && !(await isInstalled($, `${wt}/${path}`))) findings.push({ path, lines: fresh })
    }
    if (findings.length > before) bases.push(info.head)
  }
  if (findings.length === 0) return undefined
  const key = reportKey(findings)
  if (reported.has(key) || blocks >= MAX_BLOCKS) return undefined
  reported.add(key)
  blocks++
  return turnReport(findings, bases)
}

export const register: Register = (on) => {
  on('tool.call', { tool: ['Bash', 'Write', 'Edit'] }, async ($, e, next) => {
    await claim($, e.tool === 'Bash' ? e.command : e.file_path)
    const result = await next(e)
    if (e.tool === 'Bash') await settle($, e.command)
    else if (result.deny === undefined && !result.isError) markTouched(e.file_path)
    return result
  })

  on('tool.call', { tool: ['Write', 'Edit'] }, async ($, e, next) => {
    const result = await next(e)
    if (result.deny !== undefined || result.isError) return result
    const path = e.file_path
    const text = e.tool === 'Write' ? e.content : e.new_string
    const marks = prefixes(path)
    if (!path || !text || !marks || (await isInstalled($, path))) return result
    const body = await $.fs.read(path).catch(() => undefined)
    const findings = [addedSignal(text, marks, path), body === undefined ? undefined : densitySignal(path, body, text, marks)].filter(
      (finding): finding is string => finding !== undefined,
    )
    if (findings.length === 0) return result
    const name = baseName(path)
    $.ui.log(`lean-comments/limit-edits: ${findings.length} signal(s) on ${name}`)
    return { ...result, context: [...(result.context ?? []), editGuidance(name, findings)] }
  })

  // A mod cannot hold a turn open as a Stop hook's block did, so the findings arrive as the next prompt.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined || e.reason !== 'answer' || owned.size === 0) return result
    await settle($)
    const report = await overBudget($)
    if (report !== undefined) {
      $.ui.log("lean-comments/limit-turns: this turn's diff is over budget; a follow-up prompt asks to prune")
      $.clock.after(0, () => {
        $.prompt.submit({ text: report }).catch(() => undefined)
      })
    }
    return result
  })
}

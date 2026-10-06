// Observed 2026-10-05: right after an MR merged, the agent removed its worktree and branch
// and ticked the issue while the pipeline deploying the merge still ran.

export type PipelineState = 'success' | 'running' | 'failed'
export type Pipeline = { id: string; sha: string; state: PipelineState; status: string; url?: string | undefined }
export type Coverage =
  | { kind: 'green' }
  | { kind: 'waiting' | 'failed'; pipeline: Pipeline }
  | { kind: 'unknown'; why: string }
export type Cleanup = { branches: string[]; worktrees: string[] }

const SEPARATORS = ['&&', '||', ';', '|']
// Anything neither success nor in flight (manual, canceled, skipped) did not ship.
const RUNNING = new Set([
  'created', 'waiting_for_resource', 'preparing', 'pending', 'running', 'scheduled',
  'queued', 'in_progress', 'requested', 'waiting',
])
const GITHUB_PASS = new Set(['success', 'skipped', 'neutral'])

const segmentsOf = (command: string) => {
  const tokens = command.replace(/\n/g, ' ; ').split(/\s+/).filter(Boolean)
  const segments: string[][] = [[]]
  for (const token of tokens) {
    if (SEPARATORS.includes(token)) segments.push([])
    else segments.at(-1)?.push(token)
  }
  return segments
}

export const cleanupOf = (command: string): Cleanup | undefined => {
  const cleanup: Cleanup = { branches: [], worktrees: [] }
  for (const [git, sub, ...rest] of segmentsOf(command)) {
    if (git !== 'git') continue
    if (sub === 'branch' && rest.some((t) => t === '-d' || t === '-D' || t === '--delete')) {
      if (rest.some((t) => t === '-r' || t === '--remotes')) continue
      cleanup.branches.push(...rest.filter((t) => !t.startsWith('-')))
    }
    if (sub === 'worktree' && rest[0] === 'remove') cleanup.worktrees.push(...rest.slice(1).filter((t) => !t.startsWith('-')))
  }
  return cleanup.branches.length + cleanup.worktrees.length > 0 ? cleanup : undefined
}

const REST_ISSUE = /\/issues\/(\d+)(?=['"\s?]|$)/g
const REST_BODY = /(?<![\w-])description\s*[=:"']|"description"\s*:|(?<![\w-])body\s*=|"body"\s*:/
const CLI_ISSUE = /(?:^|[\s&;|(])(gh|glab)\s+issue\s+(edit|update)\s+#?(\d+)\b([^&;|\n]*)/g
const CLI_BODY = /--body(?:-file)?\b|--description\b|(?<![\w-])-[bd]\b/

// A rewritten body (checklist ticks, How to test) says the work shipped; closing is the user's, a comment says nothing.
export const issuesEditedBy = (command: string): string[] => {
  const found = new Set<string>()
  if (REST_BODY.test(command)) for (const m of command.matchAll(REST_ISSUE)) found.add(`#${m[1]}`)
  for (const m of command.matchAll(CLI_ISSUE)) if (CLI_BODY.test(m[4] ?? '')) found.add(`#${m[3]}`)
  return [...found]
}

export const remoteOf = (url: string): { host: string; path: string } | undefined => {
  const trimmed = url.trim().replace(/\.git$/, '').replace(/\/$/, '')
  const scp = trimmed.match(/^[\w.-]+@([\w.-]+):(?!\/)(.+)$/)
  if (scp) return { host: scp[1] ?? '', path: scp[2] ?? '' }
  const full = trimmed.match(/^(?:ssh|https?|git):\/\/(?:[^@/]+@)?([\w.-]+)(?::\d+)?\/(.+)$/)
  return full ? { host: full[1] ?? '', path: full[2] ?? '' } : undefined
}

const stateOf = (status: string): PipelineState =>
  status === 'success' ? 'success' : RUNNING.has(status) ? 'running' : 'failed'

const parse = (json: string): unknown => {
  try {
    return JSON.parse(json)
  } catch {
    return undefined
  }
}

const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null && key in value ? (value as Record<string, unknown>)[key] : undefined

export const gitlabPipelines = (json: string): Pipeline[] | undefined => {
  const list = parse(json)
  if (!Array.isArray(list)) return undefined
  return list.flatMap((p) => {
    const id = field(p, 'id')
    const sha = field(p, 'sha')
    const status = field(p, 'status')
    if (typeof sha !== 'string' || typeof status !== 'string') return []
    const url = field(p, 'web_url')
    return [{ id: `#${String(id)}`, sha, state: stateOf(status), status, url: typeof url === 'string' ? url : undefined }]
  })
}

// One entry per workflow run, so a sha is green only when every run on it passed.
export const githubPipelines = (json: string): Pipeline[] | undefined => {
  const list = parse(json)
  if (!Array.isArray(list)) return undefined
  const bySha = new Map<string, Pipeline>()
  for (const run of list) {
    const sha = field(run, 'headSha')
    const status = field(run, 'status')
    if (typeof sha !== 'string' || typeof status !== 'string') continue
    const conclusion = String(field(run, 'conclusion') ?? '')
    const own: PipelineState =
      status !== 'completed' ? 'running' : GITHUB_PASS.has(conclusion) ? 'success' : 'failed'
    const seen = bySha.get(sha)
    if (seen === undefined) {
      const url = field(run, 'url')
      bySha.set(sha, {
        id: `run ${String(field(run, 'databaseId'))}`,
        sha,
        state: own,
        status: status === 'completed' ? conclusion : status,
        url: typeof url === 'string' ? url : undefined,
      })
    } else if (seen.state !== 'failed' && own !== 'success') {
      bySha.set(sha, { ...seen, state: own, status: status === 'completed' ? conclusion : status })
    }
  }
  return [...bySha.values()]
}

// Newest first. None holding the work is a commit CI skipped or one whose pipeline is not created yet,
// which this check cannot tell apart.
export const coverageOf = (pipelines: (Pipeline & { covers: boolean })[]): Coverage => {
  const covering = pipelines.filter((p) => p.covers)
  if (covering.some((p) => p.state === 'success')) return { kind: 'green' }
  const newest = covering[0]
  if (newest === undefined) {
    return { kind: 'unknown', why: pipelines.length === 0 ? 'the branch has no pipelines' : 'no pipeline holds this work' }
  }
  const running = covering.find((p) => p.state === 'running')
  return running !== undefined ? { kind: 'waiting', pipeline: running } : { kind: 'failed', pipeline: newest }
}

const ACKNOWLEDGES =
  /\b(skip|ignore|without(\s+waiting\s+for)?|don'?t\s+wait\s+for|no\s+need\s+to\s+wait\s+for)\s+(the\s+)?(ci|pipeline)\b|\b(ci|pipeline)\s+(doesn'?t\s+matter|is\s+irrelevant)\b/i

export const acknowledgesPipeline = (text: string) => ACKNOWLEDGES.test(text)

const named = (p: Pipeline) => `${p.id}${p.url ? ` (${p.url})` : ''}`

export const pipelineRefused = (command: string, what: string, base: string, coverage: Exclude<Coverage, { kind: 'green' | 'unknown' }>) => {
  const state =
    coverage.kind === 'waiting'
      ? `pipeline ${named(coverage.pipeline)} is still ${coverage.pipeline.status}`
      : `its newest pipeline, ${named(coverage.pipeline)}, ended ${coverage.pipeline.status}`
  const step =
    coverage.kind === 'waiting'
      ? `Wait for it in the background (a loop on its status that exits on success,
failed or canceled), check the change where it deploys, then retry.`
      : `Find out why and get a green pipeline first.`
  return `git-cleanup (pipeline first): blocking '${command}' — ${what} landed in '${base}', and ${state}.

Removing a branch or filling in its issue says the work is done. It is not
until the pipeline that ships it passes and the change is checked live.
${step}

If the user wants it done regardless, they say so ("skip the pipeline") and
this check steps aside.`
}

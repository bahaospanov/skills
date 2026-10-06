export type Verb = 'merge' | 'push' | 'commit'

const MERGE = /(merge_requests\/[0-9]+\/merge|pulls\/[0-9]+\/merge|(^|[\s&;|(])(gh\s+pr|glab\s+mr)\s+merge(\s|$))/m
const PUSH = /(^|[\s&;|(])git\s+push(\s|$)/m
const COMMIT = /(^|[\s&;|(])git\s+commit(\s|$)/m

// With no push policy a repo's integration branches are guessed: the remote's default branch, then these.
export const FALLBACK_BASES: readonly string[] = ['dev', 'develop', 'main', 'master']

// Quotes are stripped first so a message quoting `git push` is not a push.
export const verbOf = (command: string): Verb | undefined => {
  if (MERGE.test(command)) return 'merge'
  const unquoted = command.replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '')
  if (PUSH.test(unquoted)) return 'push'
  if (COMMIT.test(unquoted)) return 'commit'
  return undefined
}

// A prompt typed over a running turn joins the one that opened that turn, so a quick follow-up cannot withdraw its word.
export const currentTurn = <P extends { turnId?: string | undefined }>(prompts: P[]): P[] => {
  const last = prompts.at(-1)
  if (last === undefined) return []
  if (last.turnId === undefined) return [last]
  let start = prompts.length - 1
  while (start > 0 && prompts[start - 1]?.turnId === last.turnId) start--
  return prompts.slice(Math.max(0, start - 1))
}

export const branchesOf = (policy: string): string[] => {
  try {
    const parsed: unknown = JSON.parse(policy)
    const branches = typeof parsed === 'object' && parsed !== null && 'protected_branches' in parsed ? parsed.protected_branches : []
    return Array.isArray(branches) ? branches.filter((b): b is string => typeof b === 'string' && b !== '') : []
  } catch {
    return []
  }
}

export const defaultBranchOf = (symref: string | undefined) => symref?.trim().replace(/^refs\/remotes\/origin\//, '') || undefined

// Every branch the command's `git push`es write to; `*` for --all/--mirror, undefined when one cannot be known.
export const pushTargets = (command: string, current: string | undefined): string[] | undefined => {
  const tokens = command.replace(/\n/g, ' ; ').split(/\s+/).filter(Boolean)
  const targets: string[] = []
  let found = false
  let i = 0
  while (i < tokens.length) {
    if (tokens[i] !== 'git' || tokens[i + 1] !== 'push') {
      i++
      continue
    }
    found = true
    i += 2
    let remoteSeen = false
    let all = false
    const refs: string[] = []
    for (; i < tokens.length; i++) {
      const token = tokens[i] ?? ''
      if (['&&', '||', ';', '|'].includes(token)) break
      if (token === '--all' || token === '--mirror') all = true
      else if (['--repo', '--push-option', '--receive-pack', '--exec', '-o'].includes(token)) i++
      else if (token.startsWith('-')) continue
      else if (!remoteSeen) remoteSeen = true
      else refs.push(token)
    }
    if (all) {
      targets.push('*')
    } else if (refs.length === 0) {
      if (current === undefined) return undefined
      targets.push(current)
    } else {
      for (const ref of refs) {
        let branch = ref.replace(/^\+/, '')
        branch = branch.slice(branch.lastIndexOf(':') + 1).replace(/^refs\/heads\//, '')
        if (branch === 'HEAD') {
          if (current === undefined) return undefined
          branch = current
        }
        if (branch !== '') targets.push(branch)
      }
    }
  }
  return found ? targets : undefined
}

export const deletedBranches = (command: string): string[] | undefined => {
  const tokens = command.replace(/\n/g, ' ; ').split(/\s+/).filter(Boolean)
  const deleted: string[] = []
  let found = false
  let i = 0
  while (i < tokens.length) {
    if (tokens[i] !== 'git' || tokens[i + 1] !== 'push') {
      i++
      continue
    }
    found = true
    i += 2
    let remoteSeen = false
    let deleting = false
    const refs: string[] = []
    for (; i < tokens.length; i++) {
      const token = tokens[i] ?? ''
      if (['&&', '||', ';', '|'].includes(token)) break
      if (token === '--delete' || token === '-d') deleting = true
      else if (['--repo', '--push-option', '--receive-pack', '--exec', '-o'].includes(token)) i++
      else if (token.startsWith('-')) continue
      else if (!remoteSeen) remoteSeen = true
      else refs.push(token)
    }
    if (refs.length === 0) return undefined
    for (const ref of refs) {
      if (!deleting && !ref.startsWith(':')) return undefined
      const branch = ref.replace(/^:/, '').replace(/^refs\/heads\//, '')
      if (branch === '' || branch.includes(':')) return undefined
      deleted.push(branch)
    }
  }
  return found && deleted.length > 0 ? deleted : undefined
}

const DIR = String.raw`("[^"]*"|'[^']*'|[^\s;&|()]+)`
const CD_STEP = new RegExp(String.raw`(?:^|[;&|\n(])\s*cd\s+${DIR}`, 'g')
const GIT_DIR = new RegExp(String.raw`^git\s+-C\s+${DIR}`)

const unquote = (value: string) => value.replace(/^(["'])([\s\S]*)\1$/, '$2')
const joinDir = (base: string | undefined, dir: string) =>
  base === undefined || dir.startsWith('/') || dir.startsWith('~') ? dir : `${base.replace(/\/$/, '')}/${dir}`

// The directory a command's first `git` runs in, from the `cd` steps before it and its `-C`;
// undefined when that is the session's own. `~` is left for the caller to expand.
export const commandDir = (command: string): string | undefined => {
  const at = command.search(/\bgit\s/)
  if (at < 0) return undefined
  let dir: string | undefined
  for (const step of command.slice(0, at).matchAll(CD_STEP)) dir = joinDir(dir, unquote(step[1] ?? ''))
  const flag = command.slice(at).match(GIT_DIR)?.[1]
  return flag === undefined ? dir : joinDir(dir, unquote(flag))
}

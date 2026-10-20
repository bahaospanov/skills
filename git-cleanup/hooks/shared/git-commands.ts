export type Verb = 'merge' | 'push' | 'commit'

const MERGE = /(merge_requests\/[0-9]+\/merge|pulls\/[0-9]+\/merge|(^|[\s&;|(])(gh\s+pr|glab\s+mr)\s+merge(\s|$))/m
// git's own options before the subcommand (`git -C dir push`, `git -c k=v commit`) must not hide it.
const VALUED_GLOBALS = ['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--config-env']
const GLOBALS = String.raw`(?:\s+(?:-[Cc]\s+\S+|--(?:git-dir|work-tree|namespace|exec-path|config-env)(?:=\S+|\s+\S+)?|--?[a-z][a-z-]*))*`
const PUSH = new RegExp(String.raw`(^|[\s&;|(])git${GLOBALS}\s+push(\s|$)`, 'm')
const COMMIT = new RegExp(String.raw`(^|[\s&;|(])git${GLOBALS}\s+commit(\s|$)`, 'm')

// With no push policy a repo's integration branches are guessed: the remote's default branch, then these.
export const FALLBACK_BASES: readonly string[] = ['dev', 'develop', 'main', 'master']

// A quoted string becomes one placeholder word: a message quoting `git push` is not a push, and `-C "a b"` keeps its value.
const unquoted = (command: string) => command.replace(/'[^']*'/g, 'Q').replace(/"[^"]*"/g, 'Q')

export const verbOf = (command: string): Verb | undefined => {
  if (MERGE.test(command)) return 'merge'
  const plain = unquoted(command)
  if (PUSH.test(plain)) return 'push'
  if (COMMIT.test(plain)) return 'commit'
  return undefined
}

const tokensOf = (command: string) =>
  [...command.replace(/\n/g, ' ; ').matchAll(/(?:"[^"]*"|'[^']*'|[^\s"'])+/g)].map((m) => m[0])

const pushAt = (tokens: string[], at: number): number | undefined => {
  if (tokens[at] !== 'git') return undefined
  let i = at + 1
  while ((tokens[i] ?? '').startsWith('-')) i += VALUED_GLOBALS.includes(tokens[i] ?? '') ? 2 : 1
  return tokens[i] === 'push' ? i : undefined
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
  const tokens = tokensOf(command)
  const targets: string[] = []
  let found = false
  let i = 0
  while (i < tokens.length) {
    const push = pushAt(tokens, i)
    if (push === undefined) {
      i++
      continue
    }
    found = true
    i = push + 1
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
  const tokens = tokensOf(command)
  const deleted: string[] = []
  let found = false
  let i = 0
  while (i < tokens.length) {
    const push = pushAt(tokens, i)
    if (push === undefined) {
      i++
      continue
    }
    found = true
    i = push + 1
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

export type MrOpening = { target?: string | undefined; source?: string | undefined }

const GH_CREATE = /(?:^|[\s&;|(])gh\s+pr\s+create\b/
const GLAB_CREATE = /(?:^|[\s&;|(])glab\s+mr\s+create\b/
const CURL = /(?:^|[\s&;|(])curl\s/
// The collection, not one MR (`/merge_requests/42/merge`): only a POST there opens one.
const MR_COLLECTION = /\/merge_requests(?![\w/])/
const METHOD = /(?:^|\s)(?:-X|--request)[\s=]*['"]?([A-Za-z]+)/
const SENDS_BODY = /(?:^|\s)(?:-F|--form|-d|--data(?:-raw|-binary|-urlencode|-ascii)?)[\s=]/

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const flagValue = (command: string, flags: string[]) => {
  for (const flag of flags) {
    const value = command.match(new RegExp(`(?:^|\\s)${escaped(flag)}(?:=|\\s+)['"]?([^\\s'"]+)`))?.[1]
    if (value !== undefined) return value
  }
  return undefined
}

const param = (command: string, name: string) =>
  command.match(new RegExp(`\\b${name}["']?\\s*[=:]\\s*["']?([^\\s"'&,}]+)`))?.[1]

// curl sends POST when it has a body and no other method is named.
const posts = (command: string) => {
  const method = command.match(METHOD)?.[1]
  return method === undefined ? SENDS_BODY.test(command) : method.toUpperCase() === 'POST'
}

// Quotes are stripped to find the command, so a message quoting `gh pr create` is not one; values are read from the whole.
export const mrOpeningOf = (command: string): MrOpening | undefined => {
  const unquoted = command.replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '')
  if (GH_CREATE.test(unquoted)) {
    return { target: flagValue(command, ['--base', '-B']), source: flagValue(command, ['--head', '-H'])?.replace(/^[^:]+:/, '') }
  }
  if (GLAB_CREATE.test(unquoted)) {
    return { target: flagValue(command, ['--target-branch', '-b']), source: flagValue(command, ['--source-branch', '-s']) }
  }
  if (CURL.test(unquoted) && MR_COLLECTION.test(command) && posts(command)) {
    return { target: param(command, 'target_branch'), source: param(command, 'source_branch') }
  }
  return undefined
}

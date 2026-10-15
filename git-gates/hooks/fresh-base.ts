export const FETCH_TIMEOUT_MS = 20_000

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

const ACKNOWLEDGES = /\b(no|skip|without|don'?t)\s+rebas(e|ing)\b|\b(stale|old|behind)\b[^.!?\n]*\b(fine|ok|okay|intended)\b/iu

export const acknowledgesStaleBase = (text: string) => ACKNOWLEDGES.test(text)

export const staleBaseRefused = (command: string, source: string, target: string) =>
  `git-gates (fresh base): blocking '${command}' — '${source}' does not contain the latest '${target}' (origin/${target}, just fetched).

The checks ran against an old '${target}', so whatever the newer commits there
break or conflict with stays hidden until the merge. Rebase onto it
(\`git fetch origin ${target} && git rebase origin/${target}\`), run the checks
again, push with --force-with-lease, then open the merge request. If the old
base is intended, say so, e.g. "no rebase", and this check steps aside.`

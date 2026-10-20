const BRANCH_TAIL = /(?:^|-)[a-z0-9]*[a-z][a-z0-9]*-(\d+)$/i
const ISSUE_TAIL = /(?:^|-)[a-z0-9]*[a-z][a-z0-9]*-[a-z0-9]*[a-z][a-z0-9]*-(\d+)$/i
const TRAILING = /(?:^|\s)((?:\(?#[A-Za-z0-9]+(?:-\d+)?\)?[.,]?\s*)+)$/
const ENDED = /#(\d+|[A-Za-z][A-Za-z0-9]*-\d+)/g

// The issue number a slug ends with (`perf/mobile-lcp-89`). Accepted as a subject's ending, never
// demanded: in `chore/node-22` it is a version.
export const tailRefInBranch = (branch: string, tracked: boolean): string[] => {
  const number = tracked ? branch.split('/').at(-1)?.match(BRANCH_TAIL)?.[1] : undefined
  return number === undefined ? [] : [`#${number}`]
}

// Enough on its own to name a feature's issue only after two or more words (`catalog-menu-107`): after one it is
// usually a version (`react-19`, `node-22`).
export const issueTailInBranch = (branch: string): string[] => {
  const number = branch.split('/').at(-1)?.match(ISSUE_TAIL)?.[1]
  return number === undefined ? [] : [`#${number}`]
}

export const subjectOf = (message: string) => message.trim().split(/\r?\n/)[0]?.trim() ?? ''

// A commit names its issue at the end of its subject: "fix(web): cart total rounding #12", "(#12)", "#88 #BLK-23".
export const subjectRefs = (message: string): string[] => {
  const tail = subjectOf(message).match(TRAILING)?.[1] ?? ''
  return [...tail.matchAll(ENDED)].map((m) => `#${(m[1] ?? '').toUpperCase()}`)
}

export const endSubject = (message: string, ref: string) => `${subjectOf(message)} ${ref}`

export const missingRefViolation = (message: string, refs: string[], accepted: string[] = []): string | undefined => {
  if (refs.length === 0) return undefined
  if (subjectRefs(message).some((ref) => refs.includes(ref) || accepted.includes(ref))) return undefined
  return `end the subject with the issue it is about: "${endSubject(message, refs[0] ?? '')}" (mentioned: ${refs.join(', ')})`
}

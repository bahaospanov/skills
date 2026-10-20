const NUMBER = /(?<![\w&#/])#([1-9]\d*)\b/g
const ISSUE_URL = /\/(?:-\/)?(?:issues|pull|merge_requests)\/(\d+)\b/g
const KEY = /(?<![\w-])#?([A-Z][A-Z0-9]{1,9})-(\d+)(?![\w-])/g
const BRANCH_KEY = /^([a-z][a-z0-9]{1,9})-(\d+)(?:-|$)/i
const BRANCH_NUMBER = /^(\d+)-[a-z]/i

// Shaped like tracker keys but naming standards, so "UTF-8" or "SHA-256" in a message is not a ticket.
const NOT_TRACKERS = new Set([
  'AES', 'ANSI', 'ASCII', 'BASE', 'CP', 'CRC', 'CVE', 'COVID', 'ECMA', 'ES', 'GMT', 'GPT', 'HTTP', 'IEEE', 'IPV',
  'ISO', 'KOI', 'MD', 'PEP', 'RFC', 'RSA', 'SHA', 'SSL', 'TCP', 'TLS', 'UDP', 'USB', 'UTC', 'UTF', 'WCAG', 'WIN',
])

const ticket = (key: string, n: string) => (NOT_TRACKERS.has(key.toUpperCase()) ? undefined : `#${key.toUpperCase()}-${n}`)

const unique = (refs: (string | undefined)[]) => [...new Set(refs.filter((r): r is string => r !== undefined))]

// Claude Code's labels for attachments in a prompt ("[Image #2]", "[Pasted text #1 +12 lines]"), not issues.
const ATTACHMENT = /\[(?:Image|Pasted text)[^\]\n]*\]/g

// `tracked` is whether the repo has a remote: without one, "#87" cannot point at an issue.
export const refsInText = (prompt: string, tracked: boolean): string[] => {
  const text = prompt.replace(ATTACHMENT, ' ')
  const found: { at: number; ref: string | undefined }[] = [...text.matchAll(KEY)].map((m) => ({
    at: m.index,
    ref: ticket(m[1] ?? '', m[2] ?? ''),
  }))
  if (tracked) {
    for (const m of [...text.matchAll(NUMBER), ...text.matchAll(ISSUE_URL)]) found.push({ at: m.index, ref: `#${m[1]}` })
  }
  return unique(found.sort((a, b) => a.at - b.at).map((f) => f.ref))
}

export const refsInBranch = (branch: string, tracked: boolean): string[] =>
  unique(
    branch.split('/').map((segment) => {
      const key = segment.match(BRANCH_KEY)
      // A key is written in capitals or leads a slug (`blk-23-chat`); a bare lowercase `react-19` is a version.
      if (key && (segment.length > key[0].length || /[A-Z]/.test(key[1] ?? ''))) return ticket(key[1] ?? '', key[2] ?? '')
      const number = segment.match(BRANCH_NUMBER)?.[1]
      return tracked && number !== undefined ? `#${number}` : undefined
    }),
  )


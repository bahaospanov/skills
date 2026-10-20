import { endSubject, subjectOf } from './issue-number'

const COMMIT = /(?:^|[;&|\n(])\s*(?:cd\s+\S+\s*&&\s*)*git(?:\s+(?:-[cC]\s+\S+|--?[\w-]+(?:=\S+)?))*\s+commit\b/
const FEATURE = /^feat(\([^)]*\))?!?:\s/
const WAIVER = /\b(no|without(\s+an?)?|skip(\s+the)?)\s+issue\b/i

export type MessageSource = { text: string } | { file: string } | undefined

// Read only after `git commit`. A heredoc covers both `-F -` and Claude Code's `-m "$(cat <<'EOF' …)"`.
export const messageOf = (command: string): MessageSource => {
  const at = command.search(COMMIT)
  if (at < 0) return undefined
  const rest = command.slice(at)
  if (/\s--no-edit\b/.test(rest)) return undefined
  const heredoc = rest.match(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n([\s\S]*?)\n\s*\2\b/)
  if (heredoc?.[3] !== undefined) return { text: heredoc[3] }
  const dashM = [...rest.matchAll(/(?:\s-[a-zA-Z]*m|\s--message)(?:\s*|=)(['"])([\s\S]*?)\1/g)].map((m) => m[2] ?? '')
  if (dashM.length > 0) return { text: dashM.join('\n\n') }
  const file = rest.match(/\s(?:-F|--file)(?:\s+|=)(\S+)/)?.[1]
  return file === undefined || file === '-' ? undefined : { file }
}

export const isFeature = (message: string) => FEATURE.test(subjectOf(message))

export const waives = (text: string) => WAIVER.test(text)

export const featureRefused = (subject: string) =>
  [
    `issue-first: "${subject.slice(0, 70)}" is a feature, and neither its subject's end nor the branch names an issue (#N).`,
    'Before committing:',
    "1. Search the tracker's open issues for the one this work belongs to (AGENTS.md or the repo docs say how to reach it).",
    `2. Found: end the subject with its number: "${endSubject(subject, '#N')}".`,
    '3. None: draft an issue from the diff (title; what and why) and show it to the user. Create it only once they agree, then commit with its number.',
    'Ask the user rather than skipping this: only a message from them saying "no issue" lets the commit through without one.',
  ].join('\n')

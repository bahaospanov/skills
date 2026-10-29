// Observed 2026-10-28, boleiik PR #205: the agent opened a pull request with a free-form body. The playbook's
// MR.md template existed only as text, and the skill list showed the playbook as a bare name, so nothing led there.
import { mrOpeningOf } from './shared/git-commands'

export type DescriptionSource = { text: string } | { file: string; dir?: string } | { unreadable: string }

// As in the template of skills/playbook/MR.md; scripts/check-mr-template.mjs fails when the two drift.
export const SECTIONS = ['Summary', 'Evidence', 'Merge Danger']
export const LABELS = ['Door', 'Blast Radius']
export const PLACEHOLDERS = [
  '<diagram, diff-sketch, or tree>',
  '<screenshot/output/failing test run>',
  '<screenshot/output/passing test run>',
  '<one-way or two-way>',
  '<optional: description>',
  '<one-word description>',
  '<optional: potential ramifications of merge>',
]

const LABEL_VALUE: Record<string, { valid: RegExp; invalid: string }> = {
  Door: { valid: /^(?:one|two)-way\b/i, invalid: '`**Door:**` is not one-way or two-way' },
  'Blast Radius': { valid: /^[^<\s]/, invalid: '`**Blast Radius:**` is empty' },
}

const GH_PR = /(?:^|[\s&;|(])gh\s+pr\s+(create|edit)\b/
const GLAB_MR = /(?:^|[\s&;|(])glab\s+mr\s+(create|update)\b/
const CURL = /(?:^|[\s&;|(])curl\s/
const MR_ENDPOINT = /\/merge_requests(?:\/\d+)?(?![\w/])/
const SEPARATOR = /&&|\|\||[;|]/g
const HEREDOC = /<<-?[ \t]*(['"]?)([A-Za-z_]\w*)\1[^\n]*\n([\s\S]*?)\n[ \t]*\2[ \t]*(?=\n|$)/
const CD_STEP = /(?:^|[;&|\n(])\s*cd\s+("[^"]*"|'[^']*'|[^\s;&|()]+)/g
const JSON_DESCRIPTION = /"description"\s*:\s*"((?:[^"\\]|\\[\s\S])*)"/
const JQ_DESCRIPTION = /(?<![\w."'-])description\s*:\s*\$/
const CURL_BODY_FLAGS = ['-F', '--form', '--form-string', '-d', '--data', '--data-raw', '--data-binary', '--data-urlencode', '--json']

const ASSISTANT = String.raw`(?:claude|anthropic|chatgpt|codex|copilot|cursor)`
const CREDIT = [
  /🤖/u,
  new RegExp(String.raw`\b(?:generated|written|drafted|authored|created)\s+(?:with|by|using|in)\b[^\n]*\b${ASSISTANT}\b`, 'i'),
  new RegExp(String.raw`\bco-authored-by:[^\n]*(?:\b${ASSISTANT}\b|noreply@anthropic\.com)`, 'i'),
]
// A file the MR touches is content, not a byline: "generated from CLAUDE.md".
const TOOL_PATH = /\bclaude\.(?:md|json|ya?ml)\b|\.claude\/\S*/gi

const NO_TEMPLATE = /\b(?:no|skip|skipping|without)\s+(?:the\s+)?(?:(?:mr|pr)\s+)?template\b/i
const STYLE_FINE = /\b(?:description|body|summary|style)\s+(?:is|looks)\s+(?:fine|ok|okay|good)\b(?!\s*\?)/i

export const acknowledgesNoTemplate = (text: string) => NO_TEMPLATE.test(text)

export const acknowledgesStyle = (text: string) => STYLE_FINE.test(text)

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Heredoc bodies and quoted text are blanked at the same length, so a flag is found only where the shell reads one.
const blanked = (command: string) => {
  const heredoc = command.match(HEREDOC)
  let text = command
  if (heredoc?.index !== undefined && heredoc[3] !== undefined) {
    const start = heredoc.index + heredoc[0].indexOf('\n') + 1
    text = text.slice(0, start) + ' '.repeat(heredoc[3].length) + text.slice(start + heredoc[3].length)
  }
  return text.replace(/'[^']*'|"(?:[^"\\]|\\[\s\S])*"/g, (quoted) => `${quoted[0]}${' '.repeat(quoted.length - 2)}${quoted.at(-1)}`)
}

type Span = { command: string; blank: string; from: number; to: number }

const spanAt = (command: string, blank: string, from: number): Span => {
  SEPARATOR.lastIndex = from
  return { command, blank, from, to: SEPARATOR.exec(blank)?.index ?? blank.length }
}

const valueStart = (span: Span, flags: readonly string[]) => {
  const pattern = new RegExp(String.raw`(?:^|\s)(?:${flags.map(escaped).join('|')})(?:=|\s+)`, 'g')
  pattern.lastIndex = span.from
  const found = pattern.exec(span.blank.slice(0, span.to))
  return found === null ? undefined : found.index + found[0].length
}

const allValueStarts = (span: Span, flags: readonly string[]) => {
  const pattern = new RegExp(String.raw`(?:^|\s)(?:${flags.map(escaped).join('|')})(?:=|\s+)`, 'g')
  return [...span.blank.slice(0, span.to).matchAll(pattern)]
    .filter((m) => m.index >= span.from)
    .map((m) => m.index + m[0].length)
}

const hasFlag = (span: Span, flags: readonly string[]) =>
  new RegExp(String.raw`(?:^|\s)(?:${flags.map(escaped).join('|')})(?=\s|$)`).test(span.blank.slice(span.from, span.to))

const SHELL_EXPANSION = /^\$\{?\w+\}?$|\$\(/

const wordAt = (command: string, at: number): { text: string } | { unreadable: string } => {
  const rest = command.slice(at)
  if (/^"\$\(\s*cat\s*<</.test(rest)) {
    const doc = rest.match(HEREDOC)?.[3]
    return doc === undefined ? { unreadable: 'the body heredoc could not be read' } : { text: doc }
  }
  if (rest.startsWith("'")) {
    const end = rest.indexOf("'", 1)
    return end < 0 ? { unreadable: 'the body has no closing quote' } : { text: rest.slice(1, end) }
  }
  const raw = rest.startsWith('"') ? rest.match(/^"((?:[^"\\]|\\[\s\S])*)"/)?.[1] : rest.match(/^\S*/)?.[0]
  if (raw === undefined) return { unreadable: 'the body has no closing quote' }
  if (SHELL_EXPANSION.test(raw)) return { unreadable: `the body comes from a shell variable or command (\`${raw.slice(0, 40)}\`)` }
  return { text: rest.startsWith('"') ? raw.replace(/\\(["\\$`])/g, '$1') : raw }
}

const dirBefore = (command: string, at: number) => {
  let dir: string | undefined
  for (const step of command.slice(0, at).matchAll(CD_STEP)) {
    const next = (step[1] ?? '').replace(/^(["'])([\s\S]*)\1$/, '$2')
    dir = dir === undefined || next.startsWith('/') || next.startsWith('~') ? next : `${dir.replace(/\/$/, '')}/${next}`
  }
  return dir
}

const fileSource = (span: Span, file: string): DescriptionSource => {
  const dir = dirBefore(span.command, span.from)
  return dir === undefined ? { file } : { file, dir }
}

const fileAt = (span: Span, at: number): DescriptionSource => {
  const word = wordAt(span.command, at)
  if ('unreadable' in word) return word
  if (word.text === '-') {
    const doc = span.command.match(HEREDOC)?.[3]
    return doc === undefined ? { unreadable: 'the body is read from stdin' } : { text: doc }
  }
  return fileSource(span, word.text)
}

const ghDescription = (span: Span): DescriptionSource | undefined => {
  if (hasFlag(span, ['--fill', '--fill-first', '--fill-verbose', '-f'])) return { unreadable: 'the body comes from the commits (--fill)' }
  if (hasFlag(span, ['--web', '-w'])) return { unreadable: 'the body is written in the browser (--web)' }
  const file = valueStart(span, ['--body-file', '-F'])
  if (file !== undefined) return fileAt(span, file)
  const body = valueStart(span, ['--body', '-b'])
  if (body !== undefined) return wordAt(span.command, body)
  if (valueStart(span, ['--template', '-T']) !== undefined) return { unreadable: 'the body comes from a template file (--template)' }
  return undefined
}

const glabDescription = (span: Span): DescriptionSource | undefined => {
  if (hasFlag(span, ['--fill', '-f'])) return { unreadable: 'the body comes from the commits (--fill)' }
  if (hasFlag(span, ['--web', '-w'])) return { unreadable: 'the body is written in the browser (--web)' }
  const body = valueStart(span, ['--description', '-d'])
  if (body === undefined) return undefined
  const word = wordAt(span.command, body)
  return 'text' in word && word.text === '-' ? { unreadable: 'the body is written in an editor (-d -)' } : word
}

const unescapeJson = (value: string) =>
  value.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (whole, escape: string) => {
    if (escape.startsWith('u')) return String.fromCharCode(parseInt(escape.slice(1), 16))
    return { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }[escape] ?? escape
  })

const curlDescription = (span: Span): DescriptionSource | undefined => {
  let piped = false
  for (const at of allValueStarts(span, CURL_BODY_FLAGS)) {
    const word = wordAt(span.command, at)
    if ('unreadable' in word) continue
    const value = word.text
    if (value === '@-') piped = true
    else if (value.startsWith('@')) return { unreadable: 'the description sits in a --data @file body' }
    const field = value.match(/^description(=<?|@)([\s\S]*)$/)
    if (field !== null) return field[1] === '=' ? { text: field[2] ?? '' } : fileSource(span, field[2] ?? '')
    const json = value.match(JSON_DESCRIPTION)?.[1]
    if (json !== undefined) return { text: unescapeJson(json) }
  }
  if (piped || JQ_DESCRIPTION.test(span.command)) return { unreadable: 'the description is piped in as JSON' }
  return undefined
}

// Opening a PR/MR with no body sets an empty description; editing one without a body flag leaves it alone.
export const descriptionOf = (command: string): DescriptionSource | undefined => {
  const blank = blanked(command)
  const gh = GH_PR.exec(blank)
  if (gh !== null) return ghDescription(spanAt(command, blank, gh.index)) ?? (gh[1] === 'create' ? { text: '' } : undefined)
  const glab = GLAB_MR.exec(blank)
  if (glab !== null) return glabDescription(spanAt(command, blank, glab.index)) ?? (glab[1] === 'create' ? { text: '' } : undefined)
  const curl = CURL.exec(blank)
  if (curl !== null && MR_ENDPOINT.test(command)) {
    return curlDescription(spanAt(command, blank, curl.index)) ?? (mrOpeningOf(command) !== undefined ? { text: '' } : undefined)
  }
  return undefined
}

const FENCE = /^\s*(?:```|~~~)/
const TAGGED_FENCE = /^\s*(?:```|~~~)\s*[\w+-]/

// `fenced` holds for a fence marker and every line inside one.
export type Line = { line: string; fenced: boolean }

export const linesOf = (text: string): Line[] => {
  let open = false
  return text.split(/\r?\n/).map((line) => {
    if (FENCE.test(line)) {
      open = !open
      return { line, fenced: true }
    }
    return { line, fenced: open }
  })
}

const proseLines = (text: string) =>
  linesOf(text)
    .filter((l) => !l.fenced)
    .map((l) => l.line)

export const sectionsOf = (lines: Line[]) => {
  const sections = new Map<string, Line[]>()
  let current: Line[] | undefined
  for (const l of lines) {
    const heading = l.fenced ? undefined : l.line.match(/^##\s+(.+?)\s*#*\s*$/)?.[1]
    if (heading !== undefined) sections.set(heading.toLowerCase(), (current = []))
    else current?.push(l)
  }
  return sections
}

export const templateGaps = (text: string): string[] => {
  const sections = sectionsOf(linesOf(text))
  const gaps: string[] = []
  const filled = (name: string) => {
    const lines = sections.get(name.toLowerCase())
    if (lines === undefined) gaps.push(`no \`## ${name}\` section`)
    else if (lines.every((l) => l.line.trim() === '')) gaps.push(`\`## ${name}\` is empty`)
    else return lines
    return undefined
  }
  const [summary, evidence, danger] = SECTIONS.map(filled)
  if (summary !== undefined && !summary.some((l) => TAGGED_FENCE.test(l.line))) {
    gaps.push("`## Summary` has no view: a fenced block tagged `diff`, `text`, `mermaid` or the code's language")
  }
  const prose = (lines: Line[]) => lines.filter((l) => !l.fenced).map((l) => l.line).join('\n')
  if (evidence !== undefined && !(/\*\*Before:\*\*\s*\S/.test(prose(evidence)) && /\*\*After:\*\*\s*\S/.test(prose(evidence)))) {
    gaps.push('`## Evidence` has no `**Before:**` and `**After:**`')
  }
  if (danger !== undefined) {
    for (const label of LABELS) {
      const pattern = new RegExp(String.raw`^\s*(?:[-*]\s+)?\*\*${escaped(label)}:?\*\*:?\s*(.*)$`, 'i')
      const value = danger.filter((l) => !l.fenced).map((l) => l.line.match(pattern)?.[1]).find((v) => v !== undefined)
      const rule = LABEL_VALUE[label]
      if (value === undefined) gaps.push(`no \`**${label}:**\` under Merge Danger`)
      else if (rule !== undefined && !rule.valid.test(value.trim())) gaps.push(rule.invalid)
    }
  }
  const joined = proseLines(text).join('\n')
  const left = PLACEHOLDERS.filter((placeholder) => joined.includes(placeholder))
  if (left.length > 0) gaps.push(`template placeholders left in: ${left.join(', ')}`)
  return gaps
}

export const creditLines = (text: string): string[] =>
  proseLines(text)
    .filter((line) => CREDIT.some((pattern) => pattern.test(line.replace(TOOL_PATH, ''))))
    .map((line) => line.trim())

export const head = (command: string) => {
  const first = command.split('\n')[0] ?? ''
  return first.length > 80 || command.includes('\n') ? `${first.slice(0, 80)}…` : first
}

export const descriptionRefused = (command: string, gaps: string[], credits: string[]) =>
  `playbook-rules (MR description): blocking '${head(command)}' — the description does not follow the playbook's MR template:
${[...gaps, ...credits.map((line) => `credits the tool that wrote it: ${line.slice(0, 80)}`)].map((gap) => `  - ${gap}`).join('\n')}

A reviewer reads every MR in the same three parts: what it changes (Summary),
proof that it works (Evidence) and what merging risks (Merge Danger), written
as the author's own. Load the playbook skill, write the body as its MR.md says,
and run the command again; a long body goes in a file passed with --body-file.
If this MR goes out without the template, the user says so, e.g. "no template",
and the template check steps aside; a tool credit is refused either way.`

export const styleRefused = (command: string, reason: string, guide: string) =>
  `playbook-rules (MR style): blocking '${head(command)}' — ${reason}

Haiku read the description against the playbook's MR.md (${guide}), which says
what each section holds: Summary the smallest view that shows the change,
Evidence real output before and after. Rewrite the part it names and run the
command again. If the description is right as it is, the user says so, e.g.
"the description is fine", and this review steps aside.`

export const unreadableRefused = (command: string, reason: string) =>
  `playbook-rules (MR description): blocking '${head(command)}' — ${reason}, so its fit to the playbook's MR template cannot be checked.

Write the body as the playbook skill's MR.md says and pass it where this check
reads it: inline, in a "$(cat <<'EOF' … EOF)" heredoc, with --body-file <file>
(gh) or --form 'description=<file' (GitLab API). If this MR goes out without
the template, the user says so, e.g. "no template", and this check steps aside.`

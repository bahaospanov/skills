// Observed 2026-10-29, boleiik PR #209: the description passed both checks with three paragraphs in its Summary and
// curl headers as its Before. The branch held a test that failed on the base, and it was never run there.
import { head, linesOf, sectionsOf, type Line } from './mr-description'

export const SUMMARY_WORDS = 80

const FAILING_RUN = [
  /[✘✗❌]/u,
  /^\s*(?:[-*]\s+)?×/m,
  /(?<!\b0 )\bfail(?:s|ed|ing|ure)?\b/i,
  /\bnot ok\b/,
  /\bexit(?:ed)?(?:\s+with)?(?:\s+(?:code|status))?\s+[1-9]\d*\b/i,
  /\b\w*Error:/,
  /\bHTTP\/[\d.]+\s+[45]\d\d\b/,
]
const SCREENSHOT = /!\[[^\]]*\]\([^)\s]+\)|<img\b/i
const BEFORE = /\*\*Before:\*\*/
const AFTER = /\*\*After:\*\*/

// Each Before runs from its label to the After that answers it, fenced output included.
const beforesOf = (lines: Line[]) => {
  const befores: string[][] = []
  let open = false
  for (const { line, fenced } of lines) {
    let text = line
    if (!fenced && BEFORE.test(line)) {
      befores.push([])
      open = true
      text = line.slice(line.search(BEFORE))
    }
    if (!open) continue
    const after = fenced ? -1 : text.search(AFTER)
    befores.at(-1)?.push(after < 0 ? text : text.slice(0, after))
    if (after >= 0) open = false
  }
  return befores.map((before) => before.join('\n'))
}

export const guidanceGaps = (text: string): string[] => {
  const sections = sectionsOf(linesOf(text))
  const gaps: string[] = []
  const summary = (sections.get('summary') ?? []).filter((l) => !l.fenced)
  const words = summary.flatMap((l) => l.line.match(/\S+/g) ?? []).length
  if (words > SUMMARY_WORDS) {
    gaps.push(`\`## Summary\` holds ${words} words outside its views, more than ${SUMMARY_WORDS}: keep a short line beside each view`)
  }
  const befores = beforesOf(sections.get('evidence') ?? [])
  if (befores.length > 0 && !befores.some((b) => SCREENSHOT.test(b) || FAILING_RUN.some((run) => run.test(b)))) {
    gaps.push('no `**Before:**` shows a failing run or a screenshot')
  }
  return gaps
}

export const guidanceRefused = (command: string, gaps: string[]) =>
  `playbook-rules (MR guidance): blocking '${head(command)}' — the description misses what the playbook's MR.md asks of its sections:
${gaps.map((gap) => `  - ${gap}`).join('\n')}

Read MR.md again, then rewrite. Its Evidence steps: run the test that pins the
change against the base and paste its failure as the Before, then the same test
passing on the branch as the After; a visual change shows screenshots. The
Summary is its views, each with a short line beside it. If no test or screen can
show this change (docs, config), ask the user: "the description is fine" lets it through.`

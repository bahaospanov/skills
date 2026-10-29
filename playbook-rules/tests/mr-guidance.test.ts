import { describe, expect, test } from 'claude-code/testing'
import { guidanceGaps, SUMMARY_WORDS } from '../hooks/mr-guidance'

const body = (summary: string, evidence: string) =>
  `## Summary\n\n${summary}\n\n## Evidence\n\n${evidence}\n\n## Merge Danger\n\n**Door:** two-way\n\n**Blast Radius:** docs\n`

const VIEW = '```diff\n-a\n+b\n```'
const RED = [
  '- **Before:** on the base',
  '  ```text',
  '  ✘ home is served prerendered',
  '  ```',
  '  **After:** on the branch',
  '  ```text',
  '  ✓ home is served prerendered',
  '  ```',
].join('\n')
const NO_RUN = 'no `**Before:**` shows a failing run or a screenshot'

const before = (output: string) => `- **Before:**\n  \`\`\`console\n  ${output}\n  \`\`\`\n  **After:** passes`

describe('mr-guidance', () => {
  test('a Before showing a failing run, beside a short Summary, has no gaps', () => {
    expect(guidanceGaps(body(`Pages prerender per locale (#208):\n\n${VIEW}`, RED))).toEqual([])
    for (const run of [
      'FAIL src/total.test.ts',
      'Tests  1 failed | 4 passed',
      'not ok 3 - totals',
      'Process exited with code 1',
      'AssertionError: expected 2 to be 3',
      'HTTP/2 404',
      '× rounds the total',
    ]) {
      expect(guidanceGaps(body(VIEW, before(run)))).toEqual([])
    }
  })

  test('a screenshot is a Before too', () => {
    const shots = '- **Before:** ![menu, 390px](https://example.com/a.png)\n  **After:** ![menu, 390px](https://example.com/b.png)'
    expect(guidanceGaps(body(VIEW, shots))).toEqual([])
  })

  test('a Before of output with nothing failing in it is named', () => {
    expect(guidanceGaps(body(VIEW, before('cache-control: private, no-store\n  x-vercel-cache: MISS')))).toEqual([NO_RUN])
    expect(guidanceGaps(body(VIEW, before('Tests  0 failed | 5 passed')))).toEqual([NO_RUN])
    expect(guidanceGaps(body(VIEW, '- **Before:** first paint 2.6 s on a 4× slower CPU\n  **After:** 1.06 s'))).toEqual([NO_RUN])
  })

  test('a failure shown in the After does not count for the Before', () => {
    expect(guidanceGaps(body(VIEW, '- **Before:** MISS **After:** the old check failed'))).toEqual([NO_RUN])
    expect(guidanceGaps(body(VIEW, '- **Before:** MISS\n  **After:**\n  ```text\n  ✘ gone\n  ```'))).toEqual([NO_RUN])
  })

  test('a Summary of paragraphs is named with its word count; words inside its views do not count', () => {
    const paragraph = Array.from({ length: SUMMARY_WORDS + 1 }, () => 'word').join(' ')
    expect(guidanceGaps(body(`${paragraph}\n\n${VIEW}`, RED))).toEqual([
      `\`## Summary\` holds ${SUMMARY_WORDS + 1} words outside its views, more than ${SUMMARY_WORDS}: keep a short line beside each view`,
    ])
    expect(guidanceGaps(body(`The whole flow:\n\n\`\`\`text\n${paragraph}\n\`\`\``, RED))).toEqual([])
  })
})

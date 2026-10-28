import { describe, expect, test } from 'claude-code/testing'
import { acknowledgesNoTemplate, acknowledgesStyle, creditLines, descriptionOf, templateGaps } from '../hooks/mr-description'

const FILLED = [
  '## Summary',
  '',
  'The label file is the vocabulary (#205):',
  '',
  '```diff',
  '-docs/agents/triage-labels.md  role table',
  '+docs/agents/triage-labels.md  base set + recipes',
  '```',
  '',
  '## Evidence',
  '',
  '- **Before:** 15 labels, 5 triage roles',
  '  **After:** the base set; the untriaged recipe lists 10 open issues',
  '',
  '## Merge Danger',
  '',
  '**Door:** two-way',
  '',
  '**Blast Radius:** docs',
].join('\n')

const UNFILLED = [
  '## Summary',
  '',
  '<diagram, diff-sketch, or tree>',
  '',
  '## Evidence',
  '',
  '- **Before:** <screenshot/output/failing test run>',
  '  **After:** <screenshot/output/passing test run>',
  '',
  '## Merge Danger',
  '',
  '**Door:** <one-way or two-way>',
  '',
  '<optional: description>',
  '',
  '**Blast Radius:** <one-word description>',
  '',
  '<optional: potential ramifications of merge>',
].join('\n')

const kind = (source: ReturnType<typeof descriptionOf>) => (source === undefined ? undefined : Object.keys(source)[0])

describe('mr-description', () => {
  test('opening a PR/MR, or editing its description, is recognised; other commands are not', () => {
    expect(descriptionOf('gh pr create --base dev --title t --body "x"')).toEqual({ text: 'x' })
    expect(descriptionOf('gh pr edit 205 --body "x"')).toEqual({ text: 'x' })
    expect(descriptionOf('glab mr update 12 -d "x"')).toEqual({ text: 'x' })
    expect(descriptionOf('gh pr edit 205 --add-label type::bug')).toBeUndefined()
    expect(descriptionOf('gh issue create --title t --body "x"')).toBeUndefined()
    expect(descriptionOf('gh repo create me/x --description "x"')).toBeUndefined()
    expect(descriptionOf('echo "gh pr create --body x"')).toBeUndefined()
    expect(descriptionOf('curl -X PUT "$API/merge_requests/42" --form state_event=close')).toBeUndefined()
    expect(descriptionOf('curl -X POST "$API/merge_requests/42/notes" --form "body=x"')).toBeUndefined()
  })

  test('opening one with no body is an empty description', () => {
    expect(descriptionOf('gh pr create --base dev --title t')).toEqual({ text: '' })
    expect(descriptionOf('curl -X POST "$API/merge_requests" --form source_branch=a --form title=t')).toEqual({ text: '' })
  })

  test('the body comes from a quoted value, a heredoc or a file', () => {
    expect(descriptionOf("gh pr create --body '## Summary\nx'")).toEqual({ text: '## Summary\nx' })
    expect(descriptionOf('gh pr create -b "say \\"hi\\""')).toEqual({ text: 'say "hi"' })
    expect(descriptionOf(`gh pr create --title t --body "$(cat <<'EOF'\n## Summary\nhe said "x"\nEOF\n)"`)).toEqual({
      text: '## Summary\nhe said "x"',
    })
    expect(descriptionOf(`gh pr create --title "drop --body-file" --body 'x'`)).toEqual({ text: 'x' })
    expect(descriptionOf('gh pr create --body-file pr.md')).toEqual({ file: 'pr.md' })
    expect(descriptionOf('gh pr create -F /tmp/pr.md --base dev')).toEqual({ file: '/tmp/pr.md' })
    expect(descriptionOf(`gh pr create --body-file - <<'EOF'\nbody\nEOF`)).toEqual({ text: 'body' })
    expect(descriptionOf('glab mr create -d "x" -b dev')).toEqual({ text: 'x' })
    expect(descriptionOf(`curl -X POST "$API/merge_requests" --form 'description=<pr.md' --form title=t`)).toEqual({ file: 'pr.md' })
    expect(descriptionOf(`curl -X POST "$API/merge_requests" --data '{"title":"t","description":"## Summary\\nwhy"}'`)).toEqual({
      text: '## Summary\nwhy',
    })
  })

  test('a body this check cannot read is named, not waved through', () => {
    expect(kind(descriptionOf('gh pr create --fill'))).toBe('unreadable')
    expect(kind(descriptionOf('gh pr create --web'))).toBe('unreadable')
    expect(kind(descriptionOf('gh pr create --body "$BODY"'))).toBe('unreadable')
    expect(kind(descriptionOf('glab mr create -d -'))).toBe('unreadable')
    expect(kind(descriptionOf(`jq -n --arg d "$BODY" '{description:$d}' | curl -X POST "$API/merge_requests" --data @-`))).toBe('unreadable')
  })

  test('a body following the template has no gaps', () => {
    expect(templateGaps(FILLED)).toEqual([])
  })

  test('each missing part of the template is named', () => {
    expect(templateGaps('Adds the label file.')).toEqual([
      'no `## Summary` section',
      'no `## Evidence` section',
      'no `## Merge Danger` section',
    ])
    expect(templateGaps('## Summary\n\n## Evidence\ny\n## Merge Danger\n**Door:** maybe')).toEqual([
      '`## Summary` is empty',
      '`## Evidence` has no `**Before:**` and `**After:**`',
      '`**Door:**` is not one-way or two-way',
      'no `**Blast Radius:**` under Merge Danger',
    ])
  })

  test('a Summary shows a view: a fenced block tagged with its language', () => {
    const untagged = FILLED.replace('```diff', '```')
    expect(templateGaps(untagged)).toEqual([
      '`## Summary` has no view: a fenced block tagged `diff`, `text`, `mermaid` or the code\'s language',
    ])
    expect(templateGaps(FILLED.replace('```diff', '```mermaid'))).toEqual([])
  })

  test('the template pasted unfilled is not a description', () => {
    expect(templateGaps(UNFILLED)).toEqual([
      '`## Summary` has no view: a fenced block tagged `diff`, `text`, `mermaid` or the code\'s language',
      '`**Door:**` is not one-way or two-way',
      '`**Blast Radius:**` is empty',
      'template placeholders left in: <diagram, diff-sketch, or tree>, <screenshot/output/failing test run>, <screenshot/output/passing test run>, <one-way or two-way>, <optional: description>, <one-word description>, <optional: potential ramifications of merge>',
    ])
  })

  test('a heading inside a code fence is content, not a section', () => {
    expect(templateGaps(FILLED.replace('## Evidence', '```\n## Evidence\n```'))).toContain('no `## Evidence` section')
  })

  test('a byline crediting the tool is found; naming a tool or its files is not a byline', () => {
    expect(creditLines(`${FILLED}\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)`)).toEqual([
      '🤖 Generated with [Claude Code](https://claude.com/claude-code)',
    ])
    expect(creditLines('Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')).toEqual([
      'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>',
    ])
    expect(creditLines('Hooks run in Claude Code 2.1, and Haiku reviews the body; see CLAUDE.md.')).toEqual([])
    expect(creditLines('Receipt items are generated with Gemini vision.')).toEqual([])
    expect(creditLines('The file is generated with /setup-triage-labels from CLAUDE.md.')).toEqual([])
    expect(creditLines('```\nCo-Authored-By: Claude <noreply@anthropic.com>\n```')).toEqual([])
  })

  test('the user waives the template by saying so', () => {
    expect(acknowledgesNoTemplate('no template, just open it')).toBe(true)
    expect(acknowledgesNoTemplate('skip the PR template')).toBe(true)
    expect(acknowledgesNoTemplate('ship')).toBe(false)
    expect(acknowledgesNoTemplate('use the template')).toBe(false)
  })

  test('the user overrules the style review by saying the description is fine', () => {
    expect(acknowledgesStyle('the description is fine, open it')).toBe(true)
    expect(acknowledgesStyle('summary looks good')).toBe(true)
    expect(acknowledgesStyle('ship')).toBe(false)
    expect(acknowledgesStyle('is the description fine?')).toBe(false)
  })
})

// playbook-rules refuses a description that misses the template in skills/playbook/MR.md; this fails when its copy of that template's sections, labels or placeholders drifts.
import { readFileSync } from 'node:fs'

const template = readFileSync('skills/playbook/MR.md', 'utf8').match(/```markdown\n([\s\S]*?)\n```/)?.[1] ?? ''
const hook = readFileSync('playbook-rules/hooks/mr-description.ts', 'utf8')
const listed = (name) =>
  [...(hook.match(new RegExp(`export const ${name}[^=]*=\\s*\\[([^\\]]*)\\]`))?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1])

const pairs = [
  ['SECTIONS', listed('SECTIONS'), [...template.matchAll(/^## (.+)$/gm)].map((m) => m[1])],
  ['PLACEHOLDERS', listed('PLACEHOLDERS'), [...template.matchAll(/<[^>\n]+>/g)].map((m) => m[0])],
]

let drifted = template === ''
if (drifted) console.error('skills/playbook/MR.md has no ```markdown template block')
for (const [name, checked, templated] of pairs) {
  if (JSON.stringify(checked) === JSON.stringify(templated)) continue
  drifted = true
  console.error(`playbook-rules ${name} ${JSON.stringify(checked)} differs from MR.md's template: ${JSON.stringify(templated)}`)
}
for (const label of listed('LABELS')) {
  if (template.includes(`**${label}:**`)) continue
  drifted = true
  console.error(`playbook-rules checks **${label}:**, which MR.md's template does not hold`)
}
process.exit(drifted ? 1 : 0)

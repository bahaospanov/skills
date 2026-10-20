// A mod that sends follow-up prompts must be named in hooks/shared/continuations.ts, or its follow-ups end the user's turn.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const listed = readFileSync('git-gates/hooks/shared/continuations.ts', 'utf8').match(/CONTINUATION_PLUGINS[^=]*=\s*\[([^\]]*)\]/)?.[1] ?? ''
const named = new Set([...listed.matchAll(/'([^']+)'/g)].map((m) => m[1]))

const senders = new Set()
for (const mod of readdirSync('.', { withFileTypes: true })) {
  const dir = join(mod.name, 'hooks')
  if (!mod.isDirectory() || !existsSync(dir)) continue
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    if (/\$\.prompt\.submit\(/.test(readFileSync(join(dir, file), 'utf8'))) senders.add(mod.name)
  }
}

const missing = [...senders].filter((mod) => !named.has(mod))
const stale = [...named].filter((mod) => !senders.has(mod))
for (const mod of missing) console.error(`${mod} sends follow-up prompts but is not in CONTINUATION_PLUGINS`)
for (const mod of stale) console.error(`${mod} is in CONTINUATION_PLUGINS but sends no follow-up prompt`)
process.exit(missing.length + stale.length > 0 ? 1 : 0)

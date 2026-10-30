// usage: node check.mjs <story.canvas>  -> "ok", or one problem per line and exit code 1
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const file = process.argv[2]
const board = JSON.parse(readFileSync(file, 'utf8'))
const nodes = board.nodes ?? []
const edges = board.edges ?? []
const NODE_KEYS = ['id', 'type', 'x', 'y', 'width', 'height', 'color', 'text', 'file', 'subpath', 'url', 'label', 'background', 'backgroundStyle']
const EDGE_KEYS = ['id', 'fromNode', 'fromSide', 'fromEnd', 'toNode', 'toSide', 'toEnd', 'color', 'label']
const REQUIRED = { text: 'text', file: 'file', link: 'url', group: null }
const SIDES = ['top', 'right', 'bottom', 'left']
const problems = []

for (const key of Object.keys(board)) if (key !== 'nodes' && key !== 'edges') problems.push(`"${key}" is not JSON Canvas`)

const nodeIds = new Set()
for (const n of nodes) {
  if (nodeIds.has(n.id)) problems.push(`${n.id}: duplicate id`)
  nodeIds.add(n.id)
  for (const key of Object.keys(n)) if (!NODE_KEYS.includes(key)) problems.push(`${n.id}: "${key}" is not JSON Canvas`)
  for (const key of ['x', 'y', 'width', 'height']) if (!Number.isFinite(n[key])) problems.push(`${n.id}: ${key} is not a number`)
  if (!(n.type in REQUIRED)) problems.push(`${n.id}: type "${n.type}"`)
  else if (REQUIRED[n.type] && !n[REQUIRED[n.type]]) problems.push(`${n.id}: ${n.type} card without "${REQUIRED[n.type]}"`)
  if (n.type === 'file' && n.file && !existsSync(resolve(dirname(file), n.file))) problems.push(`${n.id}: ${n.file} is missing`)
}

const edgeIds = new Set()
for (const e of edges) {
  if (edgeIds.has(e.id)) problems.push(`${e.id}: duplicate id`)
  edgeIds.add(e.id)
  for (const key of Object.keys(e)) if (!EDGE_KEYS.includes(key)) problems.push(`${e.id}: "${key}" is not JSON Canvas`)
  for (const end of ['fromNode', 'toNode']) if (!nodeIds.has(e[end])) problems.push(`${e.id}: ${end} "${e[end]}" is no node`)
  for (const side of ['fromSide', 'toSide']) if (e[side] !== undefined && !SIDES.includes(e[side])) problems.push(`${e.id}: ${side} "${e[side]}"`)
}

const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
const holds = (g, n) => n.x >= g.x && n.y >= g.y && n.x + n.width <= g.x + g.width && n.y + n.height <= g.y + g.height
const pairs = (list, each) => list.forEach((a, i) => list.slice(i + 1).forEach((b) => each(a, b)))
const groups = nodes.filter((n) => n.type === 'group')
const cards = nodes.filter((n) => n.type !== 'group')
pairs(cards, (a, b) => overlaps(a, b) && problems.push(`${a.id} and ${b.id} overlap`))
pairs(groups, (a, b) => overlaps(a, b) && !holds(a, b) && !holds(b, a) && problems.push(`groups ${a.id} and ${b.id} overlap`))
for (const g of groups) for (const c of cards) if (overlaps(g, c) && !holds(g, c)) problems.push(`${c.id} sticks out of group ${g.id}`)

console.log(problems.join('\n') || 'ok')
process.exitCode = problems.length ? 1 : 0

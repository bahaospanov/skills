const SAYS_MERGED = /(^|[^\p{L}])(merged|смержен[аоы]?|смержил[аи]?|влит[аоы]?|влил[аи]?)(?!\p{L})/iu
const DENIES_MERGED = /(\bnot|n't|\bnever|\bun)[\s-]*(yet\s+)?merged|не\s+(смерж|влит|влил)/iu
const LETS_GO = /\b(abandon(ed)?|discard(ed)?|throw (it )?away|delete (it )?(anyway|unmerged))\b|выброс|не нужн/iu

export const saysMerged = (text: string) => (SAYS_MERGED.test(text) && !DENIES_MERGED.test(text)) || LETS_GO.test(text)

export const listsAny = (json: string) => {
  try {
    const parsed: unknown = JSON.parse(json)
    return Array.isArray(parsed) && parsed.length > 0
  } catch {
    return false
  }
}

export const unmergedRefused = (command: string, branch: string, bases: string[]) =>
  `git-cleanup (merged first): blocking '${command}' — nothing says '${branch}' is merged.

Its commits are not in ${bases.map((b) => `origin/${b}`).join(', ') || 'any integration branch'}, and no merged
PR or MR has it as its source branch. Removing it loses that work.

If it is merged where git cannot see it (a squash merge), or the user wants it
gone anyway, they say so ("it's merged", "abandon it") and this check steps aside.`

const SAYS_MERGED = /(^|[^\p{L}])(merged)(?!\p{L})/iu
const DENIES_MERGED = /(\bnot|n't|\bnever|\bun)[\s-]*(yet\s+)?merged/iu
const LETS_GO = /\b(abandon(ed)?|discard(ed)?|throw (it )?away|delete (it )?(anyway|unmerged))\b/iu

export const saysMerged = (text: string) => (SAYS_MERGED.test(text) && !DENIES_MERGED.test(text)) || LETS_GO.test(text)

const shaIn = (value: unknown) => (typeof value === 'string' && value !== '' ? value : undefined)

// A forge's list of merged PRs or MRs for one branch: undefined when it lists none, else the commit the merge
// landed as, a squash merge's new commit included, when the forge says.
export const forgeMergeOf = (json: string): { sha: string | undefined } | undefined => {
  try {
    const parsed: unknown = JSON.parse(json)
    if (!Array.isArray(parsed) || parsed.length === 0) return undefined
    const first: unknown = parsed[0]
    if (typeof first !== 'object' || first === null) return { sha: undefined }
    const fields = first as Record<string, unknown>
    const commit = fields.mergeCommit
    const oid = typeof commit === 'object' && commit !== null ? (commit as Record<string, unknown>).oid : undefined
    return { sha: shaIn(fields.squash_commit_sha) ?? shaIn(fields.merge_commit_sha) ?? shaIn(oid) }
  } catch {
    return undefined
  }
}

export const unmergedRefused = (command: string, branch: string, bases: string[]) =>
  `git-cleanup (merged first): blocking '${command}' — nothing says '${branch}' is merged.

Its commits are not in ${bases.map((b) => `origin/${b}`).join(', ') || 'any integration branch'}, and no merged
PR or MR has it as its source branch. Removing it loses that work.

If it is merged where git cannot see it (a squash merge), or the user wants it
gone anyway, they say so ("it's merged", "abandon it") and this check steps aside.`

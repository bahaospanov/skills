// Observed 2026-10-05: a merged, checked branch kept its worktree, its local branch and its origin branch,
// and nothing in the session's flow ever came back for them.

export type Worktree = { path: string; branch?: string | undefined }

export type Stale = { branch: string; base: string; worktree?: string | undefined; local: boolean; remote: boolean }

export const worktreesOf = (porcelain: string): Worktree[] =>
  porcelain
    .split(/\n\s*\n/)
    .map((block): Worktree | undefined => {
      const lines = block.split('\n')
      const path = lines.find((line) => line.startsWith('worktree '))?.slice('worktree '.length)
      const branch = lines.find((line) => line.startsWith('branch refs/heads/'))?.slice('branch refs/heads/'.length)
      return path === undefined ? undefined : { path, branch }
    })
    .filter((wt): wt is Worktree => wt !== undefined)

const quote = (path: string) => (/^[\w./~-]+$/.test(path) ? path : `'${path.replace(/'/g, `'\\''`)}'`)

export const staleReport = (items: Stale[], main: string) => {
  const lines = items.map((s) => {
    const where = [s.worktree ? `worktree ${s.worktree}` : undefined, s.local ? 'local branch' : undefined, s.remote ? 'on origin' : undefined]
    return `  - ${s.branch}: in origin/${s.base}; ${where.filter(Boolean).join(', ')}`
  })
  const commands = [
    `cd ${quote(main)}`,
    ...items.flatMap((s) => [
      ...(s.worktree ? [`git worktree remove ${quote(s.worktree)}`] : []),
      ...(s.local ? [`git branch -d ${s.branch}`] : []),
      ...(s.remote ? [`git push origin --delete ${s.branch}`] : []),
    ]),
  ]
  return `git-gates (stale work): this session's work below is merged and its worktree is clean:
${lines.join('\n')}

If it is finished and checked (deployed where it deploys, verified, its ticket
closed out), remove it now, from the main checkout:
${commands.map((c) => `  ${c}`).join('\n')}

\`branch -d\` may call a branch unmerged when the local base lags behind
origin; its head is in origin, so -D is safe then. Deleting a landed branch on
origin needs no keyword. If a check is still pending, say what is left
instead and clean up when it passes: this note does not repeat.`
}

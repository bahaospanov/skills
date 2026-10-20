// Observed 2026-10-05: a merged, checked branch kept its worktree, its local branch and its origin branch,
// and nothing in the session's flow ever came back for them.

export type Worktree = { path: string; branch?: string | undefined }

export type Stale = { branch: string; base: string; worktree?: string | undefined; local: boolean; remote: boolean }

export type BehindBase = { base: string; checkout?: string | undefined }

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

// `git fetch origin b:b` refuses a branch checked out in any worktree; that one moves by a merge in its checkout.
const syncCommand = (behind: BehindBase, main: string) =>
  behind.checkout === undefined
    ? `git fetch origin ${behind.base}:${behind.base}`
    : behind.checkout === main
      ? `git merge --ff-only origin/${behind.base}`
      : `git -C ${quote(behind.checkout)} merge --ff-only origin/${behind.base}`

export const staleReport = (items: Stale[], main: string, behind: BehindBase[] = []) => {
  const lines = items.map((s) => {
    const where = [s.worktree ? `worktree ${s.worktree}` : undefined, s.local ? 'local branch' : undefined, s.remote ? 'on origin' : undefined]
    return `  - ${s.branch}: in origin/${s.base}; ${where.filter(Boolean).join(', ')}`
  })
  const commands = [
    `cd ${quote(main)}`,
    ...behind.map((b) => syncCommand(b, main)),
    ...items.flatMap((s) => [
      ...(s.worktree ? [`git worktree remove ${quote(s.worktree)}`] : []),
      ...(s.local ? [`git branch -d ${s.branch}`] : []),
      ...(s.remote ? [`git push origin --delete ${s.branch}`] : []),
    ]),
  ]
  const sync = behind.length > 0 ? ` and bring the local ${behind.map((b) => b.base).join(', ')} up to origin` : ''
  return `git-cleanup (stale work): the user saw a one-line note that this session's work below is merged and its worktree is clean:
${lines.join('\n')}

When the user asks to clean up, remove it${sync}, from the main checkout:
${commands.map((c) => `  ${c}`).join('\n')}

\`branch -d\` may call a branch unmerged when the local base lags behind
origin or the merge rebased it; its commits are in origin, so -D is safe then.`
}

export const staleNotice = (branches: string[]) =>
  `git-cleanup: ${branches.join(', ')} ${branches.length === 1 ? 'is' : 'are'} merged; say "clean up" when it's checked`

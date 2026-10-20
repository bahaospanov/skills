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

export type Step = { argv: string[]; cwd: string; branch?: string | undefined }

// The git calls that remove merged, clean work and bring a local base that lags behind up to origin.
// `branch -D`: a rebase merge leaves copies in the base, so `-d` would call the branch unmerged.
export const cleanupSteps = (items: Stale[], main: string, behind: BehindBase[] = []): Step[] => [
  // `git fetch origin b:b` refuses a branch checked out in any worktree; that one moves by a merge in its checkout.
  ...behind.map((b) =>
    b.checkout === undefined
      ? { argv: ['git', 'fetch', 'origin', `${b.base}:${b.base}`], cwd: main }
      : { argv: ['git', 'merge', '--ff-only', `origin/${b.base}`], cwd: b.checkout },
  ),
  ...items.flatMap((s) => [
    ...(s.worktree ? [{ argv: ['git', 'worktree', 'remove', s.worktree], cwd: main, branch: s.branch }] : []),
    ...(s.local ? [{ argv: ['git', 'branch', '-D', s.branch], cwd: main, branch: s.branch }] : []),
    ...(s.remote ? [{ argv: ['git', 'push', 'origin', '--delete', s.branch], cwd: main, branch: s.branch }] : []),
  ]),
]

export const removedNotice = (removed: string[], failed: string[]) =>
  [
    removed.length > 0 ? `git-cleanup: removed ${removed.join(', ')}` : undefined,
    failed.length > 0 ? `git-cleanup: could not remove ${failed.join(', ')}` : undefined,
  ]
    .filter(Boolean)
    .join('\n')

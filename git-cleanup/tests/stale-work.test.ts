import { describe, expect, test } from 'claude-code/testing'
import { defaultBranchOf, deletedBranches } from '../hooks/shared/git-commands'
import { staleReport, worktreesOf } from '../hooks/stale-work'

describe('stale work', () => {
  test('a push that only deletes names the branches it deletes', () => {
    expect(deletedBranches('git push origin --delete fix/a')).toEqual(['fix/a'])
    expect(deletedBranches('git -C /repo push origin --delete fix/a')).toBeUndefined()
    expect(deletedBranches('cd /repo && git push -d origin fix/a fix/b')).toEqual(['fix/a', 'fix/b'])
    expect(deletedBranches('git push origin :fix/a')).toEqual(['fix/a'])
    expect(deletedBranches('git push origin refs/heads/x:refs/heads/y')).toBeUndefined()
  })

  test('a push that writes anywhere is not a deletion', () => {
    expect(deletedBranches('git push origin fix/a')).toBeUndefined()
    expect(deletedBranches('git push')).toBeUndefined()
    expect(deletedBranches('git push origin --delete fix/a && git push origin fix/b')).toBeUndefined()
    expect(deletedBranches('git status')).toBeUndefined()
  })

  test('worktrees come with their branch, the main checkout first', () => {
    const porcelain = [
      'worktree /repo\nHEAD 1111\nbranch refs/heads/dev',
      'worktree /repo/.claude/worktrees/a\nHEAD 2222\nbranch refs/heads/fix/a-9',
      'worktree /repo/.claude/worktrees/b\nHEAD 3333\ndetached',
    ].join('\n\n')
    expect(worktreesOf(porcelain)).toEqual([
      { path: '/repo', branch: 'dev' },
      { path: '/repo/.claude/worktrees/a', branch: 'fix/a-9' },
      { path: '/repo/.claude/worktrees/b', branch: undefined },
    ])
    expect(worktreesOf('')).toEqual([])
  })

  test("the remote's default branch is read off its symbolic ref", () => {
    expect(defaultBranchOf('refs/remotes/origin/main\n')).toBe('main')
    expect(defaultBranchOf(undefined)).toBeUndefined()
    expect(defaultBranchOf('')).toBeUndefined()
  })

  test('the report lists each place the branch lives and the command that removes it', () => {
    const text = staleReport(
      [
        { branch: 'fix/a-9', base: 'dev', worktree: '/repo/.claude/worktrees/a', local: true, remote: true },
        { branch: 'fix/b', base: 'dev', local: true, remote: false },
      ],
      '/my repo',
    )
    expect(text).toContain('fix/a-9: in origin/dev; worktree /repo/.claude/worktrees/a, local branch, on origin')
    expect(text).toContain("cd '/my repo'\n  git worktree remove /repo/.claude/worktrees/a\n  git branch -d fix/a-9")
    expect(text).toContain('git push origin --delete fix/a-9')
    expect(text).toContain('git branch -d fix/b')
    expect(text).not.toContain('push origin --delete fix/b')
    expect(text).toContain('If a check is still pending')
  })
})

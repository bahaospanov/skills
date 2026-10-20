import { describe, expect, test } from 'claude-code/testing'
import { defaultBranchOf, deletedBranches } from '../hooks/shared/git-commands'
import { cleanupSteps, removedNotice, worktreesOf } from '../hooks/stale-work'

describe('stale work', () => {
  test('a push that only deletes names the branches it deletes', () => {
    expect(deletedBranches('git push origin --delete fix/a')).toEqual(['fix/a'])
    expect(deletedBranches('git -C /repo push origin --delete fix/a')).toEqual(['fix/a'])
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

  test('cleanup removes each place the branch lives, forcing a rebase-merged branch', () => {
    const steps = cleanupSteps(
      [
        { branch: 'fix/a-9', base: 'dev', worktree: '/repo/.claude/worktrees/a', local: true, remote: true },
        { branch: 'fix/b', base: 'dev', local: true, remote: false },
      ],
      '/my repo',
    )
    expect(steps.map((s) => [s.argv.join(' '), s.cwd])).toEqual([
      ['git worktree remove /repo/.claude/worktrees/a', '/my repo'],
      ['git branch -D fix/a-9', '/my repo'],
      ['git push origin --delete fix/a-9', '/my repo'],
      ['git branch -D fix/b', '/my repo'],
    ])
  })

  test('a local base behind origin moves first, by merge where it is checked out', () => {
    const item = { branch: 'fix/a', base: 'dev', local: true, remote: false }
    expect(cleanupSteps([item], '/repo', [{ base: 'dev', checkout: '/repo' }])[0]).toEqual({
      argv: ['git', 'merge', '--ff-only', 'origin/dev'],
      cwd: '/repo',
    })
    expect(cleanupSteps([item], '/repo', [{ base: 'dev' }])[0]?.argv).toEqual(['git', 'fetch', 'origin', 'dev:dev'])
  })

  test('the notice is one line, plus one for what could not go', () => {
    expect(removedNotice(['fix/a'], [])).toBe('git-cleanup: removed fix/a')
    expect(removedNotice([], ['push origin --delete fix/b (rejected)'])).toBe('git-cleanup: could not remove push origin --delete fix/b (rejected)')
    expect(removedNotice([], [])).toBe('')
  })
})

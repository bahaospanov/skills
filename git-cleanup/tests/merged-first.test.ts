import { describe, expect, test } from 'claude-code/testing'
import { forgeMergeOf, saysMerged, unmergedRefused } from '../hooks/merged-first'

describe('merged first', () => {
  test('the user saying it merged, or letting it go, counts', () => {
    expect(saysMerged('merged')).toBe(true)
    expect(saysMerged('merged, release and install')).toBe(true)
    expect(saysMerged('PR merged, clean up')).toBe(true)
    expect(saysMerged('abandon it')).toBe(true)
    expect(saysMerged('delete it anyway')).toBe(true)
  })

  test('saying it is not merged, or nothing about it, does not', () => {
    expect(saysMerged('not merged yet')).toBe(false)
    expect(saysMerged("it isn't merged")).toBe(false)
    expect(saysMerged('unmerged work, keep it')).toBe(false)
    expect(saysMerged('ship')).toBe(false)
    expect(saysMerged('clean up the branches')).toBe(false)
  })

  test('a forge list with one merged request is enough', () => {
    expect(forgeMergeOf('[{"number":2}]')).toEqual({ sha: undefined })
    expect(forgeMergeOf('[{"number":2,"mergeCommit":{"oid":"abc"}}]')).toEqual({ sha: 'abc' })
    expect(forgeMergeOf('[{"iid":5,"merge_commit_sha":null,"squash_commit_sha":"def"}]')).toEqual({ sha: 'def' })
    expect(forgeMergeOf('[]')).toBeUndefined()
    expect(forgeMergeOf('{"message":"401 Unauthorized"}')).toBeUndefined()
    expect(forgeMergeOf('not json')).toBeUndefined()
  })

  test('the refusal names the branch, where it looked and the way out', () => {
    const reason = unmergedRefused('git branch -D fix/b', 'fix/b', ['main'])
    expect(reason).toContain("nothing says 'fix/b' is merged")
    expect(reason).toContain('origin/main')
    expect(reason).toContain("\"it's merged\"")
  })
})

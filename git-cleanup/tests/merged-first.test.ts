import { describe, expect, test } from 'claude-code/testing'
import { listsAny, saysMerged, unmergedRefused } from '../hooks/merged-first'

describe('merged first', () => {
  test('the user saying it merged, or letting it go, counts', () => {
    expect(saysMerged('merged')).toBe(true)
    expect(saysMerged('merged, release and install')).toBe(true)
    expect(saysMerged('PR merged, clean up')).toBe(true)
    expect(saysMerged('смержил, удаляй')).toBe(true)
    expect(saysMerged('abandon it')).toBe(true)
    expect(saysMerged('delete it anyway')).toBe(true)
  })

  test('saying it is not merged, or nothing about it, does not', () => {
    expect(saysMerged('not merged yet')).toBe(false)
    expect(saysMerged("it isn't merged")).toBe(false)
    expect(saysMerged('unmerged work, keep it')).toBe(false)
    expect(saysMerged('ещё не смержен')).toBe(false)
    expect(saysMerged('ship')).toBe(false)
    expect(saysMerged('clean up the branches')).toBe(false)
  })

  test('a forge list with one merged request is enough', () => {
    expect(listsAny('[{"number":2}]')).toBe(true)
    expect(listsAny('[]')).toBe(false)
    expect(listsAny('{"message":"401 Unauthorized"}')).toBe(false)
    expect(listsAny('not json')).toBe(false)
  })

  test('the refusal names the branch, where it looked and the way out', () => {
    const reason = unmergedRefused('git branch -D fix/b', 'fix/b', ['main'])
    expect(reason).toContain("nothing says 'fix/b' is merged")
    expect(reason).toContain('origin/main')
    expect(reason).toContain("\"it's merged\"")
  })
})

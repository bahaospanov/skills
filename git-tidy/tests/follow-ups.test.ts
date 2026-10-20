import { describe, expect, test } from 'claude-code/testing'
import { acknowledgesSplit, markedFollowUp } from '../hooks/follow-ups'

describe('follow-ups', () => {
  test("git's fold markers name the commit they belong in", () => {
    expect(markedFollowUp(['feat: menu', 'fixup! feat: menu'])).toBe("'fixup! feat: menu' is marked to fold into 'feat: menu'")
    expect(markedFollowUp(['feat: menu', 'squash! feat: menu'])).toContain("fold into 'feat: menu'")
    expect(markedFollowUp(['feat: menu', 'amend! feat: menu'])).toContain("fold into 'feat: menu'")
  })

  test('a subject that only mentions a fixup is not marked', () => {
    expect(markedFollowUp(['feat: menu', 'fix: menu fixup on mobile'])).toBeUndefined()
    expect(markedFollowUp(['chore: drop fixup! commits from the guide'])).toBeUndefined()
  })

  test('the user can keep the commits apart', () => {
    expect(acknowledgesSplit('push, keep the commits')).toBe(true)
    expect(acknowledgesSplit('leave both commits and ship')).toBe(true)
    expect(acknowledgesSplit('the commits are separate on purpose')).toBe(true)
    expect(acknowledgesSplit('ship')).toBe(false)
    expect(acknowledgesSplit('squash the commits and push')).toBe(false)
  })
})

import { describe, expect, test } from 'claude-code/testing'
import { issueTailInBranch, missingRefViolation, tailRefInBranch } from '../hooks/issue-number'

describe('issue-number', () => {
  test('a slug ending in a number offers it as an issue', () => {
    expect(tailRefInBranch('chore/nuxt4-ui4-89', true)).toEqual(['#89'])
    expect(tailRefInBranch('perf/mobile-lcp-89', true)).toEqual(['#89'])
    expect(tailRefInBranch('perf/mobile-lcp-89', false)).toEqual([])
    expect(tailRefInBranch('feat/session-chat', true)).toEqual([])
    expect(tailRefInBranch('release/2026-09', true)).toEqual([])
  })

  test("a slug's number names a feature's issue only after two or more words", () => {
    expect(issueTailInBranch('feat/catalog-menu-107')).toEqual(['#107'])
    expect(issueTailInBranch('perf/nuxt4-ui4-89')).toEqual(['#89'])
    expect(issueTailInBranch('feat/react-19')).toEqual([])
    expect(issueTailInBranch('chore/node-22')).toEqual([])
  })

  test('an accepted ref may end the subject but is never demanded', () => {
    expect(missingRefViolation('chore(web): upgrade #89', ['#82'], ['#89'])).toBeUndefined()
    expect(missingRefViolation('chore(web): upgrade', ['#82'], ['#89'])).toBeDefined()
    expect(missingRefViolation('chore: bump node', [], ['#22'])).toBeUndefined()
  })

  test('with nothing mentioned any message passes', () => {
    expect(missingRefViolation('feat: chat', [])).toBeUndefined()
  })

  test('the subject must end with one of the mentioned refs', () => {
    const refs = ['#160', '#BLK-23']
    expect(missingRefViolation('feat(chat): session chat #160\n\nwhy it broke', refs)).toBeUndefined()
    expect(missingRefViolation('feat(chat): session chat (#160)', refs)).toBeUndefined()
    expect(missingRefViolation('fix: login #blk-23', refs)).toBeUndefined()
    expect(missingRefViolation('fix: login #88 #BLK-23', refs)).toBeUndefined()
    expect(missingRefViolation('feat(chat): session chat', refs)).toBe(
      'end the subject with the issue it is about: "feat(chat): session chat #160" (mentioned: #160, #BLK-23)',
    )
    expect(missingRefViolation('feat(chat): session chat\n\n#160', refs)).toBeDefined()
    expect(missingRefViolation('fix: #160 edge case\n\nwhy it broke', refs)).toBeDefined()
    expect(missingRefViolation('fix: login #88', refs)).toBeDefined()
  })
})

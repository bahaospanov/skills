import { describe, expect, test } from 'claude-code/testing'
import { acknowledgesStaleBase, staleBaseRefused } from '../hooks/fresh-base'
import { mrOpeningOf } from '../hooks/shared/git-commands'

describe('fresh base', () => {
  test('gh and glab name the target and source with their own flags', () => {
    expect(mrOpeningOf('gh pr create --base dev --head feat/x --title x')).toEqual({ target: 'dev', source: 'feat/x' })
    expect(mrOpeningOf('cd /repo && gh pr create -B main -H me:feat/x -b "body"')).toEqual({ target: 'main', source: 'feat/x' })
    expect(mrOpeningOf('gh pr create --fill')).toEqual({ target: undefined, source: undefined })
    expect(mrOpeningOf('glab mr create --target-branch dev -s feat/x')).toEqual({ target: 'dev', source: 'feat/x' })
  })

  test('a GitLab API POST to the merge request collection opens one, by form, data or JSON', () => {
    expect(
      mrOpeningOf(
        'curl -sS -X POST "$API/merge_requests" --header "PRIVATE-TOKEN: $T" --form source_branch=feat/x --form target_branch=dev --form "description=<body.md"',
      ),
    ).toEqual({ target: 'dev', source: 'feat/x' })
    expect(mrOpeningOf(`curl "$API/merge_requests" --data 'source_branch=feat/x&target_branch=dev'`)).toEqual({
      target: 'dev',
      source: 'feat/x',
    })
    expect(
      mrOpeningOf(`curl -X POST "$API/merge_requests" -H 'Content-Type: application/json' -d '{"source_branch": "feat/x", "target_branch": "dev"}'`),
    ).toEqual({ target: 'dev', source: 'feat/x' })
  })

  test('listing, reading or merging merge requests is not opening one', () => {
    expect(mrOpeningOf('curl -sS "$API/merge_requests?source_branch=feat/x&state=merged"')).toBeUndefined()
    expect(mrOpeningOf('curl -X PUT "$API/merge_requests/42/merge" --data sha=abc')).toBeUndefined()
    expect(mrOpeningOf('curl -X PUT "$API/merge_requests/42" --form "description=<body.md"')).toBeUndefined()
    expect(mrOpeningOf('gh pr list --base dev')).toBeUndefined()
    expect(mrOpeningOf('git commit -m "docs: run gh pr create later"')).toBeUndefined()
  })

  test('saying the old base is intended steps the check aside', () => {
    expect(acknowledgesStaleBase('ship')).toBe(false)
    expect(acknowledgesStaleBase('open the MR, no rebase')).toBe(true)
    expect(acknowledgesStaleBase("don't rebase, just open it")).toBe(true)
    expect(acknowledgesStaleBase('dev is behind, that is fine')).toBe(true)
  })

  test('the refusal names both branches and the way out', () => {
    const reason = staleBaseRefused('gh pr create', 'feat/x', 'dev')
    expect(reason).toContain("'feat/x' does not contain the latest 'dev'")
    expect(reason).toContain('git rebase origin/dev')
    expect(reason).toContain('no rebase')
  })
})

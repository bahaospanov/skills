import { describe, expect, test } from 'claude-code/testing'
import {
  authorizes,
  authorizesMerge,
  authorizesOpening,
  authorizesPush,
  forbids,
  grantRequest,
  namesBranch,
  protectedHit,
} from '../hooks/consent'
import { branchesOf, currentTurn, pushTargets, verbOf } from '../hooks/shared/git-commands'

describe('consent', () => {
  test('prompts typed over a running turn join the prompt that opened it; an idle prompt stands alone', () => {
    type Typed = { text: string; turnId?: string }
    const release: Typed = { text: 'update the skill and release' }
    const quick: Typed = { text: 'ask questions again', turnId: 't1' }
    const quicker: Typed = { text: 'and the D2 ones', turnId: 't1' }
    const idle: Typed = { text: 'next task' }
    const quickAfterIdle: Typed = { text: 'quick', turnId: 't2' }
    expect(currentTurn([release, quick, quicker])).toEqual([release, quick, quicker])
    expect(currentTurn([release, quick, idle])).toEqual([idle])
    expect(currentTurn([release, idle, quickAfterIdle])).toEqual([idle, quickAfterIdle])
    expect(currentTurn([quick])).toEqual([quick])
    expect(currentTurn<Typed>([])).toEqual([])
  })

  test('the verb is read outside quotes, merge first', () => {
    expect(verbOf('git commit -m "fix: x"')).toBe('commit')
    expect(verbOf('cd /repo && git push origin main')).toBe('push')
    expect(verbOf('gh pr merge 12 --squash')).toBe('merge')
    expect(verbOf('curl -X PUT "$API/merge_requests/7/merge"')).toBe('merge')
    expect(verbOf('echo "run git push later"')).toBeUndefined()
    expect(verbOf('git status && git log')).toBeUndefined()
  })

  test("git's own options before the verb do not hide it", () => {
    expect(verbOf('git -C /repo commit -m "fix: x"')).toBe('commit')
    expect(verbOf('git -C "/a b" push origin feat/a')).toBe('push')
    expect(verbOf('git -c core.hooksPath=/dev/null commit -m x')).toBe('commit')
    expect(verbOf('git --git-dir=/r/.git --work-tree=/r push')).toBe('push')
    expect(verbOf('git --no-pager -C /r push')).toBe('push')
    expect(verbOf("echo 'git -C /r push'")).toBeUndefined()
    expect(verbOf('git -C /r log --oneline')).toBeUndefined()
    expect(pushTargets('git -C /r push origin feat/b', 'feat/a')).toEqual(['feat/b'])
    expect(pushTargets('git -C "/a b" push origin HEAD:dev', 'feat/a')).toEqual(['dev'])
  })

  test('a negated keyword is the user saying no', () => {
    expect(authorizes("don't commit")).toBe(false)
    expect(authorizes('do not push yet')).toBe(false)
    expect(authorizes('no need to commit')).toBe(false)
    expect(authorizes('never push this')).toBe(false)
    expect(authorizes('don’t ship')).toBe(false)
    expect(authorizes("commit, don't push")).toBe(true)
    expect(authorizes("you said don't commit, now commit it")).toBe(true)
    expect(authorizes('no tests needed so commit')).toBe(true)
    expect(authorizesMerge('не смерживай пока')).toBe(false)
    expect(authorizesMerge("don't merge it")).toBe(false)
    expect(authorizesMerge('open a merge request')).toBe(false)
    expect(authorizesMerge('merge the merge request')).toBe(true)
  })

  test('an explicit "don\'t <verb>" forbids that verb unless the turn also asks for it', () => {
    expect(forbids(["commit, don't push"], 'push')).toBe(true)
    expect(forbids(["commit, don't push"], 'commit')).toBe(false)
    expect(forbids(['never commit this'], 'commit')).toBe(true)
    expect(forbids(["don't push to main, push to the feature branch"], 'push')).toBe(false)
    expect(forbids(['ship it', "wait, don't push"], 'push')).toBe(true)
    expect(forbids(["don't merge yet"], 'merge')).toBe(true)
  })

  test('opening an MR or PR needs it asked for', () => {
    expect(authorizesOpening('open an MR')).toBe(true)
    expect(authorizesOpening('ship it')).toBe(true)
    expect(authorizesOpening('create a pull request')).toBe(true)
    expect(authorizesOpening('push it')).toBe(false)
    expect(authorizesOpening('commit')).toBe(false)
    expect(authorizesOpening('no rebase, open it')).toBe(false)
    expect(authorizesOpening("don't open a PR")).toBe(false)
  })

  test('a push needs a word for shipping the branch; "commit" authorizes the commit only', () => {
    expect(authorizesPush('push it')).toBe(true)
    expect(authorizesPush('ship')).toBe(true)
    expect(authorizesPush('open an MR')).toBe(true)
    expect(authorizesPush('tag and release')).toBe(true)
    expect(authorizesPush('looks good, commit it')).toBe(false)
    expect(authorizesPush("commit, don't push")).toBe(false)
  })

  test('keywords authorize as whole words; merge needs its own', () => {
    expect(authorizes('ship it')).toBe(true)
    expect(authorizes('open an MR')).toBe(true)
    expect(authorizes('commit')).toBe(true)
    expect(authorizes('tag and release')).toBe(true)
    expect(authorizes('shipping container')).toBe(false)
    expect(authorizes('amend it')).toBe(false)
    expect(authorizes('a catchy tagline')).toBe(false)
    expect(authorizes('what was released last week?')).toBe(false)
    expect(authorizesMerge('merge it')).toBe(true)
    expect(authorizesMerge('смержи в dev')).toBe(true)
    expect(authorizesMerge('ship it')).toBe(false)
  })

  test('a message asking for repeated commits opens a grant of that size', () => {
    expect(grantRequest('do it, commit x3')).toBe(3)
    expect(grantRequest('split into 4 separate commits')).toBe(4)
    expect(grantRequest('коммит х2')).toBe(2)
    expect(grantRequest('keep committing for the rest of the session')).toBe(10)
    expect(grantRequest('commit after each task')).toBe(5)
    expect(grantRequest('commit this')).toBeUndefined()
  })

  test('push targets follow refspecs, the tracked branch and --all', () => {
    expect(pushTargets('git push', 'feat/a')).toEqual(['feat/a'])
    expect(pushTargets('git push -u origin feat/a', 'main')).toEqual(['feat/a'])
    expect(pushTargets('git push origin +HEAD:refs/heads/dev', 'feat/a')).toEqual(['dev'])
    expect(pushTargets('git push origin HEAD', 'feat/a')).toEqual(['feat/a'])
    expect(pushTargets('git push --all origin', 'feat/a')).toEqual(['*'])
    expect(pushTargets('git push -o ci.skip origin a && git push origin dev', 'x')).toEqual(['a', 'dev'])
    expect(pushTargets('git push origin', undefined)).toBeUndefined()
  })

  test('a protected branch is hit by name or by --all', () => {
    expect(protectedHit(['feat/a', 'dev'], ['dev', 'main'])).toBe('dev')
    expect(protectedHit(['*'], ['dev', 'main'])).toBe('dev')
    expect(protectedHit(['feat/a'], ['dev', 'main'])).toBeUndefined()
    expect(branchesOf('{"protected_branches": ["dev", 3, "main"]}')).toEqual(['dev', 'main'])
    expect(branchesOf('not json')).toEqual([])
  })

  test('a direct push is authorized only when the branch is named near the verb', () => {
    expect(namesBranch('push to dev', 'dev')).toBe(true)
    expect(namesBranch('запушь в dev', 'dev')).toBe(true)
    expect(namesBranch('push it', 'dev')).toBe(false)
    expect(namesBranch('push to dev-2', 'dev')).toBe(false)
  })
})

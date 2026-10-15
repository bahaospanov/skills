import { describe, expect, test } from 'claude-code/testing'
import { isFeature, messageOf, waives } from '../hooks/feature-commit'

describe('feature-commit', () => {
  test('the message is read from -m, a heredoc or -F', () => {
    expect(messageOf(`git commit -m 'feat: a' -m 'body'`)).toEqual({ text: 'feat: a\n\nbody' })
    expect(messageOf('git commit -am "feat: a"')).toEqual({ text: 'feat: a' })
    expect(messageOf('git commit --message="feat: a"')).toEqual({ text: 'feat: a' })
    expect(messageOf("git commit -F - <<'EOF'\nfeat: b\n\nwhy\nEOF")).toEqual({ text: 'feat: b\n\nwhy' })
    expect(messageOf('git commit -m "$(cat <<\'EOF\'\nfeat(web): c\n\nwhy\nEOF\n)"')).toEqual({ text: 'feat(web): c\n\nwhy' })
    expect(messageOf('git commit -F msg.txt')).toEqual({ file: 'msg.txt' })
    expect(messageOf('cd /repo && git -C wt commit -m "feat: d"')).toEqual({ text: 'feat: d' })
    expect(messageOf('git -c user.name=t --no-pager commit -m "feat: e"')).toEqual({ text: 'feat: e' })
  })

  test('no message to read: not a commit, an editor, or --no-edit', () => {
    expect(messageOf('git status')).toBeUndefined()
    expect(messageOf('echo git commit -m "feat: a"')).toBeUndefined()
    expect(messageOf('git commit')).toBeUndefined()
    expect(messageOf('git commit --amend --no-edit')).toBeUndefined()
    expect(messageOf("cat > notes <<'EOF'\nfeat: a\nEOF")).toBeUndefined()
  })

  test('a feature is a feat subject, scoped, multi-scoped or breaking', () => {
    expect(isFeature('feat: a')).toBe(true)
    expect(isFeature('feat(web): a')).toBe(true)
    expect(isFeature('feat(api-py,web)!: a\n\nbody')).toBe(true)
    expect(isFeature('fix(web): a')).toBe(false)
    expect(isFeature('chore: feat flag')).toBe(false)
    expect(isFeature('feature: a')).toBe(false)
  })

  test('the user waives the issue in their own words', () => {
    expect(waives('no issue, just commit')).toBe(true)
    expect(waives('commit it without an issue')).toBe(true)
    expect(waives('skip the issue')).toBe(true)
    expect(waives('ship')).toBe(false)
    expect(waives('create the issue')).toBe(false)
  })
})

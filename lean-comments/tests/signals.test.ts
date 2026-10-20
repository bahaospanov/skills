import { describe, expect, test } from 'claude-code/testing'
import { addedSignal, densitySignal } from '../hooks/signals'

const code = (n: number, name = 'x') => Array.from({ length: n }, (_, i) => `${name}${i} = ${i}`)

describe('signals', () => {
  test('more than three added comment lines is a signal', () => {
    expect(addedSignal('# a\n# b\n# c\n# d\nx = 1', ['#'], 'a.py')).toBe('This edit adds 4 comment-only lines (soft limit 3).')
    expect(addedSignal('# a\n# b\n# c\nx = 1', ['#'], 'a.py')).toBeUndefined()
  })

  test('a five-line comment block near an edit adding a comment is a signal even at low density', () => {
    const body = [...code(9), '# why x9', 'x9 = 9', '# n1', '# n2', '# n3', '# n4', '# n5', ...code(4, 'y')].join('\n')
    expect(densitySignal('a.py', body, '# why x9\nx9 = 9', ['#'])).toBe(
      'The region you edited (a.py:1-20) carries a 5-line comment block at line 12 (region is 30% comment), and this edit adds 1 comment line to it. ' +
        'Cut yours to what earns its place; the comments you did not write are not yours to prune.',
    )
  })

  test('a region over 30% comments is a signal; an edit not found in the file is not', () => {
    const body = ['a = 1', '# c1', 'b = 2  # c0', '# c2', 'c = 3', '# c3', 'd = 4', '# c4'].join('\n')
    expect(densitySignal('a.py', body, '# c2', ['#'])).toContain('(a.py:1-8) carries 50% comment - 4 comment lines against 4 of code')
    expect(densitySignal('a.py', body, '# z9', ['#'])).toBeUndefined()
  })

  test('an edit adding no comment is not held to the comments around it', () => {
    const body = [...code(10), '# n1', '# n2', '# n3', '# n4', '# n5', ...code(5, 'y')].join('\n')
    expect(densitySignal('a.py', body, 'x9 = 9', ['#'])).toBeUndefined()
  })
})

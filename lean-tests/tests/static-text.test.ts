import { describe, expect, test } from 'claude-code/testing'
import { isTestPath, literalTextAssertions, newLines, rendersUi, subjectPathsOf } from '../hooks/static-text'

describe('static-text', () => {
  test('UI tests are JSX test files or ones that render a DOM; other tests and source are not', () => {
    expect(isTestPath('/repo/src/app/page.test.tsx')).toBe(true)
    expect(isTestPath('/repo/e2e/home.spec.ts')).toBe(true)
    expect(isTestPath('/repo/src/app/page.tsx')).toBe(false)
    expect(rendersUi('/repo/src/app/page.test.tsx', '')).toBe(true)
    expect(rendersUi('/repo/e2e/home.spec.ts', "import { test } from '@playwright/test'")).toBe(true)
    expect(rendersUi('/repo/src/Card.spec.ts', 'const wrapper = mount(Card)')).toBe(true)
    expect(rendersUi('/repo/src/lib/money.test.ts', "expect(format(4620)).toBe('$46.20')")).toBe(false)
  })

  test('only lines an edit adds count, and only those checking literal text', () => {
    const old = "expect(screen.getByText('Cheesecake')).toBeInTheDocument()\nexpect(total).toBe(1)"
    const added = "expect(screen.getByText('Tea')).toBeInTheDocument()\nexpect(total).toBe(1)\n"
    expect(newLines(added, old)).toEqual(["expect(screen.getByText('Tea')).toBeInTheDocument()"])
    expect(
      literalTextAssertions([
        "expect(screen.getByText('Welcome')).toBeInTheDocument()",
        "expect(screen.getByRole('button', { name: 'Get started' })).toBeInTheDocument()",
        "expect(screen.getByTestId('total')).toHaveTextContent('$46.20')",
        "await expect(page.getByRole('heading')).toHaveText(/Welcome/)",
        "expect(wrapper.text()).toContain('Total')",
        'expect(container).toMatchSnapshot()',
        'expect(screen.getByText(name)).toBeInTheDocument()',
        "fireEvent.click(screen.getByTestId('ready'))",
        'expect(props.onReady).toHaveBeenCalledOnce()',
      ]),
    ).toEqual([
      "expect(screen.getByText('Welcome')).toBeInTheDocument()",
      "expect(screen.getByRole('button', { name: 'Get started' })).toBeInTheDocument()",
      "expect(screen.getByTestId('total')).toHaveTextContent('$46.20')",
      "await expect(page.getByRole('heading')).toHaveText(/Welcome/)",
      "expect(wrapper.text()).toContain('Total')",
      'expect(container).toMatchSnapshot()',
    ])
  })

  test('the component under test sits beside the test, or one folder up from __tests__', () => {
    expect(subjectPathsOf('/repo/src/app/page.test.tsx').slice(0, 2)).toEqual(['/repo/src/app/page.tsx', '/repo/src/app/page.jsx'])
    expect(subjectPathsOf('/repo/src/ui/__tests__/Card.spec.ts')).toContain('/repo/src/ui/Card.vue')
  })
})

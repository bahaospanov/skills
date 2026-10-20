import { describe, expect, test } from 'claude-code/testing'
import { isScriptPath, isTestFile } from '../hooks/gates'

describe('gates', () => {
  test('scripts are recognised by extension; application source and tests are not scripts to review', () => {
    expect(isScriptPath('/repo/scripts/deploy.sh')).toBe(true)
    expect(isScriptPath('/repo/deploy.sh')).toBe(true)
    expect(isScriptPath('/repo/scripts/deploy.py')).toBe(true)
    expect(isScriptPath('/repo/apps/api/tools/seed.mjs')).toBe(true)
    expect(isScriptPath('/repo/web/page.ts')).toBe(false)
    expect(isScriptPath('/repo/apps/api/app/main.py')).toBe(false)
    expect(isScriptPath('/repo/lib/money.js')).toBe(false)
    expect(isTestFile('/repo/tests/check.py')).toBe(true)
    expect(isTestFile('/repo/pkg/test_money.py')).toBe(true)
    expect(isTestFile('/repo/web/money.spec.ts')).toBe(true)
    expect(isTestFile('/repo/scripts/deploy.py')).toBe(false)
  })
})

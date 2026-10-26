// Observed 2026-10-25: a home page test asserted the page's fixed demo copy, so two copy changes each retyped the new
// strings into it; it could fail only when the wording changed on purpose.
// The prompt's gate as code: a write adding no literal-text assertion to a UI test costs no model call.

const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/
const JSX_FILE = /x$/
const DOM_TEST = /@testing-library\/|@playwright\/test|@vue\/test-utils|\b(render|mount|shallowMount)\(/

const LITERAL = String.raw`\s*['"\x60/]`
const TEXT_ASSERTION = new RegExp(
  [
    String.raw`By(Text|LabelText|PlaceholderText|DisplayValue|AltText|Title)\(${LITERAL}`,
    String.raw`ByRole\([^)]*\bname:${LITERAL}`,
    String.raw`\.(toHaveTextContent|toHaveText|toContainText|toHaveAccessibleName)\(${LITERAL}`,
    String.raw`\.text\(\)\)\.(toBe|toEqual|toContain)\(${LITERAL}`,
    String.raw`\.toMatch(Inline)?Snapshot\(`,
  ].join('|'),
)

const SUBJECT_EXT = ['.tsx', '.jsx', '.ts', '.js', '.vue', '.svelte', '/index.tsx', '/index.jsx']

export const isTestPath = (path: string) => TEST_FILE.test(path)

export const rendersUi = (path: string, source: string) =>
  isTestPath(path) && (JSX_FILE.test(path) || DOM_TEST.test(source))

export const newLines = (added: string, removed: string) => {
  const kept = new Set(removed.split('\n').map((line) => line.trim()))
  return added
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !kept.has(line))
}

export const literalTextAssertions = (lines: string[]) => lines.filter((line) => TEXT_ASSERTION.test(line))

export const subjectPathsOf = (testPath: string) => {
  const slash = testPath.lastIndexOf('/')
  const dir = testPath.slice(0, slash)
  const stem = testPath.slice(slash + 1).replace(TEST_FILE, '')
  const dirs = dir.endsWith('/__tests__') ? [dir, dir.slice(0, -'/__tests__'.length)] : [dir]
  return dirs.flatMap((at) => SUBJECT_EXT.map((ext) => `${at}/${stem}${ext}`))
}

// usage: node shoot.mjs <shots.json> <out dir>  -> <out dir>/<name>.png per shot; shots.json: SKILL.md beside this folder, step 2
// env: PLAYWRIGHT_CORE, path to a playwright-core install when none resolves from the current directory
import { mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(join(process.cwd(), 'noop.js'))
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core')
const [configFile, outDir] = process.argv.slice(2)
const config = JSON.parse(readFileSync(configFile, 'utf8'))
mkdirSync(outDir, { recursive: true })

const locate = (page, target) =>
  target.role ? page.getByRole(target.role, { name: target.name }) : target.css ? page.locator(target.css) : page.getByText(target.text, { exact: target.exact })

const browser = await chromium.launch({ channel: 'chrome' })
for (const shot of config.shots) {
  const page = await browser.newPage({ viewport: { width: shot.width ?? 1440, height: shot.height ?? 900 } })
  const response = await page.goto(config.base + shot.path, { waitUntil: 'load' })
  await page.waitForTimeout(2000)
  for (const step of shot.steps ?? []) {
    if (step.click) await locate(page, step.click).first().click()
    if (step.press) await page.keyboard.press(step.press)
    await page.waitForTimeout(step.wait ?? 800)
  }
  await page.screenshot({ path: join(outDir, `${shot.name}.png`), fullPage: shot.fullPage ?? false })
  console.log(`${shot.name}.png  ${response?.status()}  ${config.base}${shot.path}`)
  await page.close()
}
await browser.close()

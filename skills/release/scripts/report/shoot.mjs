// usage: node shoot.mjs <shots.json> <out dir>
// shots.json: [{ "name", "url", "anchor"?: CSS/text selector to scroll to, "desktop"?: true, "clip"?: {x,y,width,height} }]
// env: PLAYWRIGHT_CORE, path to a playwright-core install when none resolves from the current directory
import { mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(join(process.cwd(), 'noop.js'))
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core')
const [shotsFile, outDir] = process.argv.slice(2)
const shots = JSON.parse(readFileSync(shotsFile, 'utf8'))
mkdirSync(outDir, { recursive: true })

const phone = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
}
const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }

const browser = await chromium.launch({ channel: 'chrome' })
for (const s of shots) {
  const ctx = await browser.newContext(s.desktop ? desktop : phone)
  const page = await ctx.newPage()
  await page.goto(s.url, { waitUntil: 'load' })
  await page.waitForTimeout(2000)
  const accept = page.getByRole('button', { name: /accept/i })
  if (await accept.count()) await accept.first().click().catch(() => {})
  // Lazy images below the fold load only once scrolled past.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(1500)
  const top = s.anchor ? await page.locator(s.anchor).first().evaluate((el) => el.getBoundingClientRect().top + window.scrollY) : 0
  await page.evaluate((y) => window.scrollTo(0, Math.max(0, y - 72)), top)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: join(outDir, `${s.name}.png`), ...(s.clip ? { clip: s.clip } : {}) })
  await ctx.close()
  console.log(`${s.name}.png  ${s.url}`)
}
await browser.close()

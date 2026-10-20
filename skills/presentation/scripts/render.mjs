// usage: node render.mjs <presentation.html> <out dir>  -> <out dir>/1.png, 2.png, ... one per .slide, 1080x1350
// env: PLAYWRIGHT_CORE, path to a playwright-core install when none resolves from the current directory
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

const require = createRequire(join(process.cwd(), 'noop.js'))
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core')
const [html, outDir] = process.argv.slice(2)
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 600, height: 800 }, deviceScaleFactor: 2 })
await page.goto('file://' + resolve(html), { waitUntil: 'load' })
await page.evaluate(() => document.fonts.ready)
const slides = await page.$$('.slide')
for (const [i, s] of slides.entries()) await s.screenshot({ path: join(outDir, `${i + 1}.png`) })
await browser.close()
console.log(`${slides.length} slides -> ${outDir}`)

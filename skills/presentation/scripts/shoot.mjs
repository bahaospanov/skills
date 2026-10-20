// usage: node shoot.mjs <shots.json> <out dir> [before|after]  -> <out dir>/<name>-before.png, <name>-after.png
// shots.json: SHOTS.md beside SKILL.md. env: PLAYWRIGHT_CORE, path to a playwright-core install when none resolves from the current directory
import { mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(join(process.cwd(), 'noop.js'))
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core')
const [configFile, outDir, onlySide] = process.argv.slice(2)
const config = JSON.parse(readFileSync(configFile, 'utf8'))
mkdirSync(outDir, { recursive: true })

const VIEWPORT = { width: 1440, height: 900 }
// A slide's shot frame is about 480×190 CSS px under a before shot, 480×400 alone.
const ASPECT = config.before ? 480 / 190 : 480 / 400
const MIN_WIDTH = 760
const PAD = 48
const OUTLINE = { before: '4px dashed #ff5c5c', after: `4px solid ${config.accent ?? '#b8f23c'}` }

const mark = (page, finds, outline) =>
  page.evaluate(
    ({ finds, outline }) => {
      const small = (el, f) => el.getBoundingClientRect().width < (f.minWidth ?? 0) || el.getBoundingClientRect().height < (f.minHeight ?? 0)
      const byText = (f) => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        for (let node; (node = walker.nextNode()); ) {
          const text = node.textContent.trim()
          if ((f.exact ? text === f.text : text.includes(f.text)) && node.parentElement.getClientRects().length) return [node.parentElement]
        }
        return []
      }
      const found = (f) =>
        f.css ? (f.all ? [...document.querySelectorAll(f.css)] : [document.querySelector(f.css)]) : f.point ? [document.elementFromPoint(...f.point)] : byText(f)
      const boxes = []
      for (const f of finds) {
        for (let el of found(f)) {
          while (el && small(el, f)) el = el.parentElement
          if (el && f.closest) el = el.closest(f.closest)
          for (let i = 0; el && i < (f.up ?? 0); i++) el = el.parentElement
          if (!el) continue
          if (f.reveal) el.scrollIntoView({ block: 'nearest' })
          if (outline && !f.plain && f.overlay) {
            if (getComputedStyle(el).position === 'static') el.style.position = 'relative'
            const frame = document.createElement('div')
            frame.style.cssText = `position:absolute;inset:6px;border:${outline};z-index:2147483647;pointer-events:none`
            el.appendChild(frame)
          } else if (outline && !f.plain) {
            el.style.outline = outline
            el.style.outlineOffset = f.inset ? '-6px' : '4px'
          }
          const r = el.getBoundingClientRect()
          boxes.push({ x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height })
        }
      }
      return boxes
    },
    { finds, outline },
  )

const topStrip = (aspect) => ({ x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.width / aspect })

const cropAround = (boxes, height, aspect) => {
  if (!boxes.length) return topStrip(aspect)
  const left = Math.min(...boxes.map((b) => b.x)) - PAD
  const top = Math.min(...boxes.map((b) => b.y)) - PAD
  const right = Math.max(...boxes.map((b) => b.x + b.w)) + PAD
  const bottom = Math.max(...boxes.map((b) => b.y + b.h)) + PAD
  const width = Math.min(VIEWPORT.width, Math.max(MIN_WIDTH, right - left, (bottom - top) * aspect))
  const clipHeight = width / aspect
  const x = Math.min(VIEWPORT.width - width, Math.max(0, (left + right) / 2 - width / 2))
  const y = bottom - top > clipHeight ? top : (top + bottom) / 2 - clipHeight / 2
  return { x, y: Math.max(0, Math.min(y, height - clipHeight)), width, height: clipHeight }
}

const locate = (page, target) =>
  target.role ? page.getByRole(target.role, { name: target.name }) : target.css ? page.locator(target.css) : page.getByText(target.text, { exact: target.exact })

const run = async (page, steps = []) => {
  for (const step of steps) {
    if (step.click) await locate(page, step.click).first().click()
    if (step.press) await page.keyboard.press(step.press)
    await page.waitForTimeout(step.wait ?? 800)
  }
}

const settle = async (page) => {
  await page.waitForTimeout(2000)
  const accept = page.getByRole('button', { name: /accept/i })
  if (await accept.count()) await accept.first().click().catch(() => {})
  // Lazy images below the fold load only once scrolled past.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(1200)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(800)
}

const browser = await chromium.launch({ channel: 'chrome' })
for (const shot of config.shots) {
  for (const side of ['before', 'after']) {
    if (!config[side] || (onlySide && side !== onlySide)) continue
    const own = shot[side] ?? {}
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    const response = await page.goto(config[side] + shot.path, { waitUntil: 'load' })
    await settle(page)
    await run(page, shot.steps)
    await run(page, own.steps)
    await page.waitForTimeout(1200)
    const boxes = await mark(page, own.mark ?? [], OUTLINE[side])
    // A viewport capture crops in viewport coordinates, a full-page one in document coordinates.
    const [scrolled, height] = shot.viewport
      ? [await page.evaluate(() => scrollY), VIEWPORT.height]
      : [0, await page.evaluate(() => document.documentElement.scrollHeight)]
    const inFrame = (list) => list.map((b) => ({ ...b, y: b.y - scrolled }))
    const spec = own.clip ?? shot.clip
    const aspect = shot.aspect ?? ASPECT
    const clip =
      spec === 'top' ? topStrip(aspect)
      : spec?.around ? cropAround(inFrame(await mark(page, spec.around, null)), height, aspect)
      : (spec ?? cropAround(inFrame(boxes), height, aspect))
    await page.screenshot({ path: join(outDir, `${shot.name}-${side}.png`), fullPage: !shot.viewport, clip })
    console.log(`${shot.name}-${side}.png  ${response?.status()}  ${config[side]}${shot.path}  outlined ${boxes.length}`)
    await ctx.close()
  }
}
await browser.close()

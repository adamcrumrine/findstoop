// Capture live screenshots of Stoop's public marketing pages from the running
// dev server. Authenticated screens are blocked here (Supabase egress denied),
// so this covers the no-login surfaces only.
const { chromium } = require('playwright')
const path = require('path')

const OUT = path.join(__dirname, '..', 'marketing', 'screenshots')
const BASE = 'http://localhost:5173'

// route -> {name, fullPage}
const ROUTES = [
  ['/', 'home', true],
  ['/pricing', 'pricing', true],
  ['/tenability', 'tenability', true],
  ['/features', 'features', true],
  ['/how-it-works', 'how-it-works', true],
  ['/renter-check', 'renter-check', false],
]

;(async () => {
  const fs = require('fs')
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  })
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  })
  const page = await ctx.newPage()
  for (const [route, name, full] of ROUTES) {
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 20000 })
    } catch (e) {
      // networkidle may never settle if a backend call hangs; fall back
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 20000 })
    }
    await page.waitForTimeout(1500)
    const file = path.join(OUT, `${name}.png`)
    await page.screenshot({ path: file, fullPage: full })
    // also a 1200x1200-ish above-the-fold crop for square posts
    await page.screenshot({ path: path.join(OUT, `${name}-fold.png`), fullPage: false })
    console.log('captured', name)
  }
  await browser.close()
})().catch(e => { console.error(e); process.exit(1) })

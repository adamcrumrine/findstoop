#!/usr/bin/env node
// Brand smoke test: builds each brand and asserts the built output actually
// carries that brand — static metadata, PWA manifest, and (when a Chromium
// binary is available) the rendered homepage. Zero dependencies.
//
//   node scripts/brand-smoke.mjs            # build + verify all brands
//   node scripts/brand-smoke.mjs --no-build # verify current dist only (one brand)
//
// The static checks (index.html metadata + PWA manifest) are the default and
// take ~10s per brand (one vite build each). The rendered-DOM check needs a
// Chromium binary AND working network to your Supabase project, so it's
// opt-in: SMOKE_DOM=1 (auto-detects CHROME_BIN / Playwright cache paths).

import { execSync, execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, resolve } from 'node:path'

const WEB_DIR = resolve(import.meta.dirname, '../apps/web')
const DIST = join(WEB_DIR, 'dist')
const NO_BUILD = process.argv.includes('--no-build')

// Expectations per brand. Keep in sync with apps/web/src/lib/brand.ts.
const BRANDS = [
  { id: 'stoop', name: 'Stoop', shortName: 'Stoop', logoNeedle: 'stoop_logo_horizontal_trans.png' },
  { id: 'hawk', name: 'Hawk Investments', shortName: 'Hawk', logoNeedle: '/brands/hawk/logo-horizontal.svg' },
]

const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  '/opt/pw-browsers/chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)
const CHROME = process.env.SMOKE_DOM === '1' ? (CHROME_CANDIDATES.find((p) => existsSync(p)) ?? null) : null

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }

function serveDist() {
  const server = createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    let file = join(DIST, urlPath === '/' ? 'index.html' : urlPath.slice(1))
    if (!existsSync(file)) file = join(DIST, 'index.html') // SPA fallback
    res.setHeader('content-type', MIME[extname(file)] ?? 'application/octet-stream')
    res.end(readFileSync(file))
  })
  return new Promise((ok) => server.listen(0, () => ok(server)))
}

let failures = 0
function check(brand, label, pass, detail = '') {
  console.log(`  ${pass ? '✓' : '✗'} [${brand}] ${label}${pass || !detail ? '' : ` — ${detail}`}`)
  if (!pass) failures++
}

for (const brand of BRANDS) {
  console.log(`\n── ${brand.id} ${'─'.repeat(50 - brand.id.length)}`)

  if (!NO_BUILD) {
    execSync('npx vite build', {
      cwd: WEB_DIR,
      stdio: 'pipe',
      env: {
        ...process.env,
        VITE_BRAND: brand.id,
        VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? 'https://placeholder.supabase.co',
        VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ?? 'placeholder',
      },
    })
  }

  const indexHtml = readFileSync(join(DIST, 'index.html'), 'utf8')
  const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.webmanifest'), 'utf8'))

  check(brand.id, 'index.html title carries brand', indexHtml.includes(`<title>${brand.name}`))
  check(brand.id, `og:site_name is ${brand.name}`, indexHtml.includes(`property="og:site_name" content="${brand.name}"`))
  check(brand.id, `manifest short_name is ${brand.shortName}`, manifest.short_name === brand.shortName, `got ${manifest.short_name}`)

  if (CHROME) {
    const server = await serveDist()
    const url = `http://127.0.0.1:${server.address().port}/`
    try {
      // --timeout forces the dump even if the page never settles (the app's
      // API calls point at a placeholder Supabase and hang forever), and the
      // execFileSync timeout is the hard backstop — this step can never wedge.
      const dom = execFileSync(
        CHROME,
        ['--headless', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=8000', '--timeout=10000', '--dump-dom', url],
        { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 30_000, killSignal: 'SIGKILL', stdio: ['ignore', 'pipe', 'ignore'] },
      )
      check(brand.id, 'rendered homepage shows brand logo', dom.includes(brand.logoNeedle))
      check(brand.id, 'rendered homepage names the brand', dom.includes(brand.name))
    } catch (err) {
      check(brand.id, 'rendered homepage DOM check', false, `chromium failed or timed out (${err.code ?? err.status ?? 'unknown'})`)
    } finally {
      server.close()
    }
  } else {
    console.log(`  - [${brand.id}] DOM check skipped (opt in with SMOKE_DOM=1; needs Chromium + network)`)
  }

  if (NO_BUILD) break // dist only holds one brand's output
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll brand smoke checks passed')
process.exit(failures ? 1 : 0)

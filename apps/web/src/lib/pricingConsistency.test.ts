import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  PER_UNIT_MONTHLY, PER_UNIT_ANNUAL, ANNUAL_DISCOUNT_PCT,
} from '@findstoop/shared/lib/pricing'

// The subscription price was declared in three separate places — SubscribeModal,
// the Pricing page, and the manager's own Billing page — plus hardcoded into
// roughly twenty marketing strings and the SEO manifest that feeds prerendered
// titles and FAQ schema.
//
// Dropping $9 to $5 missed the Billing page and the SEO manifest, so the app
// quoted $9 on the billing screen and in Google results while Stripe charged
// $5. This test makes that class of miss fail here instead of in front of a
// landlord.

const ROOT = join(__dirname, '..', '..', '..', '..')
const SEARCH_DIRS = [
  join(ROOT, 'apps', 'web', 'src'),
  join(ROOT, 'packages', 'shared', 'src'),
]
const EXTS = ['.ts', '.tsx', '.mjs']
const SKIP = new Set(['node_modules', 'dist', 'build'])

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (EXTS.some((e) => entry.endsWith(e)) && !entry.includes('.test.')) out.push(full)
  }
  return out
}

// index.html is not under a source dir and has no watched extension, so the
// walk above never saw it — and it carried "$9 per unit per month" in the
// description, the og:description, the twitter:description AND twice in the
// SoftwareApplication JSON-LD long after the rate moved to $5. Those strings
// are the ones search engines and every shared link actually show, which makes
// it the worst file in the repo to have missed.
const EXTRA_FILES = [join(ROOT, 'apps', 'web', 'index.html')]

const files = [...SEARCH_DIRS.flatMap((d) => walk(d)), ...EXTRA_FILES]

describe('subscription price is stated in exactly one voice', () => {
  it('finds source files to check', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('no file hardcodes a superseded price', () => {
    // Matches "$9", "$9/unit", "$90 per unit" — the old rates — while leaving
    // unrelated figures ($9.99 plans, $90,000) alone.
    const stale = /\$9(?!\d|\.)|\$90(?!\d|\.)/
    const offenders: string[] = []
    for (const f of files) {
      const text = readFileSync(f, 'utf8')
      for (const [i, line] of text.split('\n').entries()) {
        if (stale.test(line)) offenders.push(`${f.replace(ROOT, '')}:${i + 1}  ${line.trim().slice(0, 90)}`)
      }
    }
    expect(offenders, `stale price still written out:\n${offenders.join('\n')}`).toEqual([])
  })

  it('the current price appears only via the shared constants in app code', () => {
    // A literal "$5 per unit" in a component is how the last drift started.
    // Marketing prose is allowed to spell it out; components are not.
    const componentDirs = ['components', 'pages/manager', 'pages/tenant']
    const offenders: string[] = []
    for (const f of files) {
      const rel = f.replace(ROOT, '').replace(/\\/g, '/')
      if (!componentDirs.some((d) => rel.includes(`/src/${d}`))) continue
      if (rel.includes('/pages/marketing')) continue
      const text = readFileSync(f, 'utf8')
      for (const [i, line] of text.split('\n').entries()) {
        // Comments can't mislead anyone — only rendered strings matter.
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue
        if (/\$5 per (active )?unit|\$5\/unit|\$50\/unit|\$50 per unit/.test(line)) {
          offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 90)}`)
        }
      }
    }
    expect(offenders, `hardcoded price in app UI — import from lib/pricing instead:\n${offenders.join('\n')}`).toEqual([])
  })
})

describe('the pricing constants agree with each other', () => {
  it('annual is a genuine discount on twelve months', () => {
    expect(PER_UNIT_ANNUAL).toBeLessThan(PER_UNIT_MONTHLY * 12)
  })

  it('the advertised discount matches the actual one', () => {
    // Copy says "save 16.7%" in six places; if the rates move and the claim
    // doesn't, that's a false advertising problem, not a rounding one.
    expect(ANNUAL_DISCOUNT_PCT).toBe(16.7)
  })

  it('current rates are $5 and $50', () => {
    expect(PER_UNIT_MONTHLY).toBe(5)
    expect(PER_UNIT_ANNUAL).toBe(50)
  })
})

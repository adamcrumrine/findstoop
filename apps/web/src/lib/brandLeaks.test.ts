// Guards the white-label system against regressions: no source file may
// hardcode Stoop branding in user-visible code — it must read from the BRAND
// config (src/lib/brand.ts) instead. Code comments are fine; deliberate
// platform attribution ("Powered by Stoop") is fine.
//
// If this test fails on your new code, import { BRAND } from 'lib/brand' and
// use BRAND.name / BRAND.logo.* / BRAND.supportEmail / BRAND.domain — or, if
// the string is intentionally the platform (not the storefront brand), add a
// narrowly-scoped allowance below with a comment saying why.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const SRC_ROOT = join(__dirname, '..')

/** Files that are allowed to mention Stoop wholesale. */
const ALLOWED_FILES = [
  'lib/brand.ts',                          // the brand registry itself
  'components/shared/PoweredByStoop.tsx',  // platform attribution badge
  'components/manager/RenterToolsShare.tsx', // explains the platform attribution to landlords
]

/** Line-level allowances — identifiers and intentional platform credits. */
const ALLOWED_SUBSTRINGS = [
  '@findstoop/shared',      // workspace package name
  'findstoop_session',      // analytics localStorage keys
  'findstoop:billing',      // sessionStorage key
  'PoweredByStoop',         // component identifier
  'Powered by Stoop',       // intentional attribution copy
]

const LEAK_PATTERNS = [/\bStoop\b/, /findstoop/i, /stoop_logo/]

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return listSourceFiles(full)
    if (!/\.(ts|tsx)$/.test(entry) || /\.test\.tsx?$/.test(entry)) return []
    return [full]
  })
}

/** Drop block comments and line comments (without eating https:// URLs). */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[\s{(])\/\/.*$/gm, '$1')
}

describe('white-label brand hygiene', () => {
  it('no user-visible Stoop branding hardcoded outside the brand registry', () => {
    const violations: string[] = []

    for (const file of listSourceFiles(SRC_ROOT)) {
      const rel = relative(SRC_ROOT, file).replace(/\\/g, '/')
      if (ALLOWED_FILES.includes(rel)) continue

      const lines = stripComments(readFileSync(file, 'utf8')).split('\n')
      lines.forEach((line, i) => {
        if (!LEAK_PATTERNS.some((p) => p.test(line))) return
        if (ALLOWED_SUBSTRINGS.some((s) => line.includes(s))) return
        violations.push(`${rel}:${i + 1}  ${line.trim().slice(0, 120)}`)
      })
    }

    expect(
      violations,
      `Hardcoded Stoop branding found — read it from BRAND (src/lib/brand.ts) instead:\n${violations.join('\n')}`,
    ).toEqual([])
  })
})

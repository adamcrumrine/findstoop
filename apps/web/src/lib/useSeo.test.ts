import { describe, it, expect } from 'vitest'
import { isCanonicalHost } from './useSeo'

// Duplicate-content guard: only findstoop.com and www.findstoop.com are
// indexable. Every other host that can serve this build — landlord portal
// slugs, university co-brand subdomains, my.findstoop.com, white-label
// custom domains, previews, localhost — must resolve to false so useSeo()
// forces noindex. See the CANONICAL_HOSTS comment in useSeo.ts.
describe('isCanonicalHost', () => {
  it('allows the apex and www host', () => {
    expect(isCanonicalHost('findstoop.com')).toBe(true)
    expect(isCanonicalHost('www.findstoop.com')).toBe(true)
  })

  it('rejects the resident-portal front door', () => {
    expect(isCanonicalHost('my.findstoop.com')).toBe(false)
  })

  it('rejects landlord portal slugs', () => {
    expect(isCanonicalHost('acme.findstoop.com')).toBe(false)
  })

  it('rejects university co-brand subdomains', () => {
    expect(isCanonicalHost('osu.findstoop.com')).toBe(false)
  })

  it('rejects white-label custom domains', () => {
    expect(isCanonicalHost('hawkinvestments.com')).toBe(false)
  })

  it('rejects local/preview hosts', () => {
    expect(isCanonicalHost('localhost')).toBe(false)
    expect(isCanonicalHost('preview.findstoop.com')).toBe(false)
    expect(isCanonicalHost('findstoop-git-develop-xyz.vercel.app')).toBe(false)
  })
})

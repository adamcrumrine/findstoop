import { describe, it, expect } from 'vitest'
import { scopeBarVisibleOn } from '../components/manager/ScopeBar'

// The bar is an allowlist of pages that actually read useScope() and narrow
// themselves. It matched with startsWith, so every detail route nested under a
// list page inherited it: /manager/tenants/:id rendered "All properties" and
// "All units" above a page about one named person. A control that visibly does
// nothing teaches a manager to distrust the ones that do.

describe('where the portfolio scope bar belongs', () => {
  it('shows on the list pages that consume the scope', () => {
    for (const p of ['/manager/payments', '/manager/tenants', '/manager/leases',
                     '/manager/maintenance', '/manager/documents', '/manager/messages',
                     '/manager/applications', '/manager/screening', '/manager/reports']) {
      expect(scopeBarVisibleOn(p), p).toBe(true)
    }
  })

  it('does not follow a list page down into its detail routes', () => {
    expect(scopeBarVisibleOn('/manager/tenants/cb3afbbb-4726-4478-86f1-7e8127434972')).toBe(false)
    expect(scopeBarVisibleOn('/manager/documents/new')).toBe(false)
    expect(scopeBarVisibleOn('/manager/leases/attach')).toBe(false)
  })

  it('tolerates a trailing slash', () => {
    expect(scopeBarVisibleOn('/manager/tenants/')).toBe(true)
  })

  it('stays off pages that are about the account, not a property', () => {
    for (const p of ['/manager/settings', '/manager/billing', '/manager/import', '/manager/dashboard']) {
      expect(scopeBarVisibleOn(p), p).toBe(false)
    }
  })
})

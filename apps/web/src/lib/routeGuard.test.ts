import { describe, it, expect } from 'vitest'
import { defaultPathForRole, loginPathForRole } from './roleRouting'

// Refreshing the browser on /manager/payments should leave you on
// /manager/payments. It didn't: AuthProvider swallowed a failed profile fetch,
// so `loading` flipped false with `profile` still null, and ProtectedRoute
// read a missing profile as the WRONG role.
//
// The redirect target made it worse — defaultPathForRole(undefined) returns
// the manager dashboard, so a tenant whose profile failed to load was thrown
// into the manager portal, then bounced again by the role check there.
//
// These pin the decision table the guard now follows.

type Decision =
  | { kind: 'spinner' }
  | { kind: 'login'; to: string }
  | { kind: 'recover' }
  | { kind: 'redirect'; to: string }
  | { kind: 'render' }

/** Mirrors ProtectedRoute. */
function decide(
  { loading, hasUser, profile }: {
    loading: boolean
    hasUser: boolean
    profile: { role: string; must_set_password?: boolean } | null
  },
  requiredRole: 'manager' | 'tenant' | 'admin',
): Decision {
  if (loading) return { kind: 'spinner' }
  if (!hasUser) return { kind: 'login', to: loginPathForRole(requiredRole) }
  // The change: a missing profile is "we don't know", not "wrong role".
  if (!profile) return { kind: 'recover' }
  if (profile.must_set_password) return { kind: 'redirect', to: '/set-password' }
  if (requiredRole === 'admin') {
    return profile.role === 'admin'
      ? { kind: 'render' }
      : { kind: 'redirect', to: defaultPathForRole(profile.role) }
  }
  if (profile.role === 'admin') return { kind: 'redirect', to: '/admin/dashboard' }
  if (profile.role !== requiredRole) return { kind: 'redirect', to: defaultPathForRole(profile.role) }
  return { kind: 'render' }
}

describe('a refresh keeps you where you were', () => {
  it('waits rather than deciding while auth is still resolving', () => {
    expect(decide({ loading: true, hasUser: false, profile: null }, 'manager')).toEqual({ kind: 'spinner' })
  })

  it('offers recovery when the profile fetch failed, instead of redirecting', () => {
    // The regression: this used to return a redirect to /manager/dashboard.
    expect(decide({ loading: false, hasUser: true, profile: null }, 'manager')).toEqual({ kind: 'recover' })
  })

  it('never throws a tenant into the manager portal on a failed fetch', () => {
    // defaultPathForRole(undefined) is the manager dashboard — which is why
    // treating "unknown" as "wrong role" was so much worse for tenants.
    expect(defaultPathForRole(undefined)).toBe('/manager/dashboard')
    expect(decide({ loading: false, hasUser: true, profile: null }, 'tenant').kind).toBe('recover')
  })

  it('renders the page once the profile arrives', () => {
    expect(decide({ loading: false, hasUser: true, profile: { role: 'manager' } }, 'manager'))
      .toEqual({ kind: 'render' })
  })
})

describe('genuine mismatches still redirect', () => {
  it('sends a tenant out of manager routes', () => {
    expect(decide({ loading: false, hasUser: true, profile: { role: 'tenant' } }, 'manager'))
      .toEqual({ kind: 'redirect', to: '/tenant/dashboard' })
  })

  it('sends an admin back to admin-land', () => {
    expect(decide({ loading: false, hasUser: true, profile: { role: 'admin' } }, 'manager'))
      .toEqual({ kind: 'redirect', to: '/admin/dashboard' })
  })

  it('keeps non-admins out of admin routes', () => {
    expect(decide({ loading: false, hasUser: true, profile: { role: 'manager' } }, 'admin'))
      .toEqual({ kind: 'redirect', to: '/manager/dashboard' })
  })

  it('still forces password creation on an invite link', () => {
    // A bearer magic link must not open the portal without a real credential;
    // the recovery screen must not have weakened that.
    expect(decide({ loading: false, hasUser: true, profile: { role: 'manager', must_set_password: true } }, 'manager'))
      .toEqual({ kind: 'redirect', to: '/set-password' })
  })

  it('sends a signed-out visitor to the right sign-in screen', () => {
    expect(decide({ loading: false, hasUser: false, profile: null }, 'tenant'))
      .toEqual({ kind: 'login', to: '/login/renter' })
    expect(decide({ loading: false, hasUser: false, profile: null }, 'manager'))
      .toEqual({ kind: 'login', to: '/login' })
  })
})

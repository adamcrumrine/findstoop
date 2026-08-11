// Who gets copied on a tenant-facing email.
//
// Edge functions can't import from apps/web, so the helper lives in
// supabase/functions/_shared and is imported here by path — same arrangement
// as rentEstimate.test.ts.
//
// The cases that matter are the ones that say NO. A false positive here means
// a landlord receives a working sign-in link to their tenant's account.

import { describe, it, expect } from 'vitest'
import {
  managerCc,
  safeManagerCc,
  containsSignInLink,
} from '../../../../supabase/functions/_shared/managerCopy.ts'

describe('managerCc', () => {
  it('copies the landlord on a tenant email', () => {
    expect(managerCc('adam@hawk.com', 'tenant@osu.edu')).toEqual(['adam@hawk.com'])
  })

  it('returns undefined when the landlord has no address on file', () => {
    expect(managerCc(null, 'tenant@osu.edu')).toBeUndefined()
    expect(managerCc(undefined, 'tenant@osu.edu')).toBeUndefined()
    expect(managerCc('   ', 'tenant@osu.edu')).toBeUndefined()
  })

  it('does not copy the landlord onto their own email', () => {
    // A landlord testing with their own address, or one who also holds a
    // lease, would otherwise get the message twice.
    expect(managerCc('adam@hawk.com', 'adam@hawk.com')).toBeUndefined()
  })

  it('treats addresses case- and whitespace-insensitively when de-duping', () => {
    expect(managerCc('Adam@Hawk.com', '  adam@hawk.COM ')).toBeUndefined()
  })

  it('normalizes the address it returns', () => {
    expect(managerCc('  Adam@Hawk.com  ', 'tenant@osu.edu')).toEqual(['adam@hawk.com'])
  })
})

describe('containsSignInLink', () => {
  // Real shapes of a Supabase action_link.
  it.each([
    'https://x.supabase.co/auth/v1/verify?token=abc&type=invite&redirect_to=https://findstoop.com',
    '<a href="https://x.supabase.co/auth/v1/verify?token=pkce_9f&type=magiclink">Sign in</a>',
    'click <a href="https://findstoop.com/reset?token=xyz">here</a>',
    'https://x.supabase.co/auth/v1/verify?token=t&type=recovery',
    'https://x.supabase.co/auth/v1/verify?token=t&type=signup',
  ])('detects a bearer link in %s', (html) => {
    expect(containsSignInLink(html)).toBe(true)
  })

  it('does not flag ordinary app links', () => {
    expect(containsSignInLink(
      '<a href="https://findstoop.com/tenant/documents">View document</a>',
    )).toBe(false)
    expect(containsSignInLink(
      '<a href="https://findstoop.com/tenant/pay-rent">Pay again now</a>',
    )).toBe(false)
    expect(containsSignInLink(
      '<a href="https://findstoop.com/login/renter">Sign in to Stoop</a>',
    )).toBe(false)
  })
})

describe('safeManagerCc', () => {
  it('suppresses the copy when the body carries a sign-in link', () => {
    const html = 'Welcome! <a href="https://x.supabase.co/auth/v1/verify?token=abc&type=invite">Set up</a>'
    expect(safeManagerCc('adam@hawk.com', 'tenant@osu.edu', html)).toBeUndefined()
  })

  it('copies normally when the body has no sign-in link', () => {
    const html = '<a href="https://findstoop.com/tenant/documents">View</a>'
    expect(safeManagerCc('adam@hawk.com', 'tenant@osu.edu', html))
      .toEqual(['adam@hawk.com'])
  })

  it('still respects the self-copy rule even without a link', () => {
    expect(safeManagerCc('adam@hawk.com', 'adam@hawk.com', 'plain')).toBeUndefined()
  })
})

import { describe, it, expect, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))

import { sendForSignatureMessages } from './leaseSigning'

describe('sendForSignatureMessages', () => {
  it('names everyone emailed on a 2-roommate lease', () => {
    expect(sendForSignatureMessages({ sent: ['Maya Weber', 'Clare Cahill'] }, 'Maya Weber').success)
      .toBe('Lease sent to Maya Weber and Clare Cahill for signature')
  })

  it('counts tenants once there are more than two', () => {
    const r = sendForSignatureMessages({ sent: ['A', 'B', 'C', 'D'] }, 'A')
    expect(r.success).toBe('Lease sent to 4 tenants for signature')
    expect(r.warning).toBeNull()
  })

  it('falls back to the known name when the function returns no list', () => {
    expect(sendForSignatureMessages({}, 'Maya Weber').success).toBe('Lease sent to Maya Weber for signature')
  })

  it('warns about tenants who were not emailed', () => {
    const r = sendForSignatureMessages({ sent: ['A'], noEmail: ['B'], failed: ['C: bounced'] }, 'A')
    expect(r.warning).toBe('Not sent to everyone: B has no email on file; couldn\'t email C: bounced')
  })
})

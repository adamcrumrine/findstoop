// Clause 6 (Utility and Service Responsibility) must reflect the landlord's
// per-tenancy utility split.
//
// The regression this file exists for: `utility_notes` was declared on
// LeaseInputs, collected by the Lease Wizard, stored on `leases`, and passed to
// generateLeaseText by every caller — but never referenced in the template
// body. Every generated lease therefore stated the same default allocation
// regardless of what the landlord had agreed, which surfaced as a tenant
// spotting a contradiction between their real lease and the Stoop copy.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { generateLeaseText } from '@findstoop/shared/lib/leaseTemplates'

const BASE = {
  landlord_name: 'Adam Crumrine',
  landlord_entity: 'Hawk Pig LLC',
  tenant_name: 'Sample Tenant',
  tenant_email: 'tenant@example.com',
  property_address: '301 E 14th Ave',
  unit_label: '301',
  city: 'Columbus',
  state: 'OH',
  zip: '43201',
  start_date: '2026-08-01',
  end_date: '2027-07-23',
  rent_amount: 2100,
  security_deposit: 2100,
  payment_due_day: 1,
}

// The default allocation Clause 6 falls back to when nothing is recorded.
const DEFAULT_SPLIT = 'The Lessee is responsible for arranging and paying for the following services'

describe('Clause 6 — utility notes', () => {
  it('renders the landlord-recorded split verbatim', () => {
    const notes = 'Landlord pays water and sewer. Tenants pay electric and gas only.'
    const text = generateLeaseText({ ...BASE, utility_notes: notes })
    expect(text).toContain(notes)
  })

  it('marks the recorded split as controlling over the default allocation', () => {
    const text = generateLeaseText({ ...BASE, utility_notes: 'Landlord pays trash.' })
    // Both paragraphs appear, and the tenancy-specific one says which wins —
    // otherwise the document contradicts itself.
    expect(text).toContain(DEFAULT_SPLIT)
    expect(text).toMatch(/control over the allocation stated above/)
    expect(text.indexOf(DEFAULT_SPLIT)).toBeLessThan(text.indexOf('Landlord pays trash.'))
  })

  it('keeps the recorded split inside Clause 6, ahead of Clause 7', () => {
    const text = generateLeaseText({ ...BASE, utility_notes: 'Landlord pays trash.' })
    const clause6 = text.indexOf('6. Utility and Service Responsibility')
    const clause7 = text.indexOf('7. Use and Occupancy')
    const notesAt = text.indexOf('Landlord pays trash.')
    expect(clause6).toBeGreaterThan(-1)
    expect(notesAt).toBeGreaterThan(clause6)
    expect(notesAt).toBeLessThan(clause7)
  })

  it('adds nothing when no notes are recorded', () => {
    for (const utility_notes of [null, undefined, '', '   ']) {
      const text = generateLeaseText({ ...BASE, utility_notes })
      expect(text).toContain(DEFAULT_SPLIT)
      expect(text).not.toMatch(/control over the allocation stated above/)
    }
  })
})

// Edge functions can't import from apps/web, so supabase/functions/_shared
// carries a hand-synced copy of the template. draft-reply, ask-lease and
// application-decision all generate lease text from it — if the copies drift on
// this clause, a tenant asking "who pays water?" gets the boilerplate answer.
describe('edge-function template copy', () => {
  it('interpolates the utility notes clause too', () => {
    const src = readFileSync(
      resolve(__dirname, '../../../../supabase/functions/_shared/leaseTemplates.ts'),
      'utf8',
    )
    expect(src).toContain('const utilityNotesClause')
    expect(src).toContain('${utilityNotesClause}')
  })
})

import { supabase } from '../lib/supabase'

// A rent roll is a per-unit snapshot of the portfolio: every unit, its current
// lease/tenant(s), term, rent, deposit, and occupancy. Vacant units are
// included. RLS scopes all of this to the calling manager.
export interface RentRollRow {
  propertyId: string
  propertyName: string
  propertyAddress: string
  unitId: string
  unitNumber: string
  bedrooms: number | null
  bathrooms: number | null
  status: 'occupied' | 'vacant'
  tenants: string
  leaseStart: string | null
  leaseEnd: string | null
  monthlyRent: number
  securityDeposit: number | null
}

export async function getRentRoll(managerId: string, propertyId?: string): Promise<RentRollRow[]> {
  let pq = supabase.from('properties').select('id,name,address,city,state,zip').eq('manager_id', managerId).order('name')
  if (propertyId) pq = pq.eq('id', propertyId)
  const { data: props, error: pErr } = await pq
  if (pErr) throw new Error(pErr.message)
  const propIds = (props ?? []).map((p) => p.id)
  if (propIds.length === 0) return []

  const { data: units, error: uErr } = await supabase
    .from('units')
    .select('id,property_id,unit_number,bedrooms,bathrooms,rent_amount,status')
    .in('property_id', propIds)
  if (uErr) throw new Error(uErr.message)
  const unitIds = (units ?? []).map((u) => u.id)
  if (unitIds.length === 0) return []

  const { data: leases } = await supabase
    .from('leases')
    .select('id,unit_id,tenant_id,status,start_date,end_date,rent_amount,security_deposit')
    .in('unit_id', unitIds)
  const active = (leases ?? []).filter((l) => l.status === 'active' || l.status === 'upcoming')

  const leaseIds = active.map((l) => l.id)
  const { data: cot } = leaseIds.length
    ? await supabase.from('lease_tenants').select('lease_id,tenant_id').in('lease_id', leaseIds)
    : { data: [] as { lease_id: string; tenant_id: string }[] }

  const tenantIds = new Set<string>()
  for (const l of active) if (l.tenant_id) tenantIds.add(l.tenant_id)
  for (const c of cot ?? []) tenantIds.add(c.tenant_id)
  const { data: profs } = tenantIds.size
    ? await supabase.from('profiles').select('id,full_name').in('id', [...tenantIds])
    : { data: [] as { id: string; full_name: string | null }[] }
  const nameById = Object.fromEntries((profs ?? []).map((p) => [p.id, p.full_name]))

  const propById = Object.fromEntries((props ?? []).map((p) => [p.id, p]))
  // first active lease per unit
  const leaseByUnit = new Map<string, typeof active[number]>()
  for (const l of active) if (!leaseByUnit.has(l.unit_id)) leaseByUnit.set(l.unit_id, l)
  const coByLease = new Map<string, string[]>()
  for (const c of cot ?? []) coByLease.set(c.lease_id, [...(coByLease.get(c.lease_id) ?? []), c.tenant_id])

  const rows: RentRollRow[] = (units ?? []).map((u) => {
    const p = propById[u.property_id]
    const lease = leaseByUnit.get(u.id)
    const ids = new Set<string>()
    if (lease) {
      if (lease.tenant_id) ids.add(lease.tenant_id)
      for (const t of coByLease.get(lease.id) ?? []) ids.add(t)
    }
    const tenants = [...ids].map((id) => nameById[id]).filter(Boolean).join(', ')
    return {
      propertyId: u.property_id,
      propertyName: p?.name ?? '',
      propertyAddress: [p?.address, p?.city, p?.state, p?.zip].filter(Boolean).join(', '),
      unitId: u.id,
      unitNumber: u.unit_number,
      bedrooms: u.bedrooms,
      bathrooms: u.bathrooms,
      status: lease ? 'occupied' : 'vacant',
      tenants: tenants || (lease ? '—' : ''),
      leaseStart: lease?.start_date ?? null,
      leaseEnd: lease?.end_date ?? null,
      monthlyRent: Number(lease?.rent_amount ?? u.rent_amount ?? 0),
      securityDeposit: lease?.security_deposit != null ? Number(lease.security_deposit) : null,
    }
  })

  rows.sort((a, b) =>
    a.propertyName.localeCompare(b.propertyName) ||
    a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }))
  return rows
}

export interface RentRollSummary {
  units: number
  occupied: number
  vacant: number
  occupiedRent: number   // monthly rent from occupied units
  potentialRent: number  // monthly rent across all units (occupied lease rent or unit market rent)
  occupancyRate: number  // 0–100
}

export function summarizeRentRoll(rows: RentRollRow[]): RentRollSummary {
  const occupied = rows.filter((r) => r.status === 'occupied')
  const occupiedRent = occupied.reduce((s, r) => s + r.monthlyRent, 0)
  const potentialRent = rows.reduce((s, r) => s + r.monthlyRent, 0)
  return {
    units: rows.length,
    occupied: occupied.length,
    vacant: rows.length - occupied.length,
    occupiedRent,
    potentialRent,
    occupancyRate: rows.length ? Math.round((occupied.length / rows.length) * 100) : 0,
  }
}

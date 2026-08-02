import { supabase } from '../lib/supabase'
import type { Payment } from '../types/payment'

// Tenant payment history — only payments that have actually been attempted
// (completed or failed). Pending/upcoming rows are surfaced separately via
// getNextDuePayment / getTenantUpcomingPayments. Sorted most-recent-first.
export async function getTenantPayments(tenantId: string, limit = 5): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('status', ['completed', 'failed'])
    .order('paid_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return data ?? []
}

// Upcoming pending payments (today or later), soonest first.
export async function getTenantUpcomingPayments(tenantId: string, limit = 5): Promise<Payment[]> {
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')
    .gte('due_date', today)
    .order('due_date', { ascending: true })
    .limit(limit)
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getNextDuePayment(tenantId: string): Promise<Payment | null> {
  // A month can carry more than one charge for the same tenant (rent plus a
  // recurring pet fee, say). Ordering by due_date alone made which one came
  // back arbitrary, so a tenant could open Pay Rent and see "$5.00 due"
  // instead of their rent. Take the earliest due date, then prefer rent.
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')
    .order('due_date', { ascending: true })
    .limit(10)
  if (error || !data || data.length === 0) return null
  const earliest = (data[0] as Payment).due_date
  const sameDate = (data as Payment[]).filter((p) => p.due_date === earliest)
  return sameDate.find((p) => p.type === 'rent') ?? sameDate[0]
}

/** Every other pending charge sharing a due date with `payment` — the pet fee
 *  and any one-off items the tenant still owes for that period. Lets the Pay
 *  Rent screen show the true monthly total rather than just the rent line. */
export async function getSiblingChargesDue(tenantId: string, payment: Payment): Promise<Payment[]> {
  if (!payment.due_date) return []
  const { data } = await supabase
    .from('payments')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')
    .eq('due_date', payment.due_date)
  return ((data ?? []) as Payment[]).filter((p) => p.id !== payment.id)
}

// Manager-side "Recent Payments" widget — only actually-attempted payments
// (completed / processing / failed). Pending and upcoming rows belong in
// the donut + the tenant's pay-rent page, not here. Sorted most-recent-first
// by when the money actually moved (paid_at), falling back to initiated_at.
//
// Pass only the lease ids you want on the feed; the caller decides scope. The
// dashboard passes active leases only, because paid_at is the recording time
// and back-dated history recorded today would otherwise outrank live activity.
export async function getRecentPayments(leaseIds: string[], limit = 5): Promise<Payment[]> {
  if (leaseIds.length === 0) return []
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .in('lease_id', leaseIds)
    .in('status', ['completed', 'processing', 'failed'])
    .order('paid_at', { ascending: false, nullsFirst: false })
    .order('initiated_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getPaymentsByLeaseIds(leaseIds: string[]): Promise<Payment[]> {
  if (leaseIds.length === 0) return []
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .in('lease_id', leaseIds)
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getAllPayments(leaseIds: string[]): Promise<Payment[]> {
  if (leaseIds.length === 0) return []
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .in('lease_id', leaseIds)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function createPayment(
  data: Omit<Payment, 'id' | 'created_at'>
): Promise<Payment> {
  const { data: result, error } = await supabase
    .from('payments')
    .insert(data)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return result
}

export async function markPaymentPaid(id: string): Promise<Payment> {
  const { data, error } = await supabase
    .from('payments')
    .update({ status: 'completed', paid_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

// Manager-side override on a single payment row. Used when a multi-primary
// lease's even split isn't what the parties agreed to ("Maya pays $800,
// Savannah pays $700 this month"). Server-side RLS keeps managers scoped
// to their own units.
export async function updatePayment(
  id: string,
  patch: Partial<Pick<Payment, 'amount' | 'due_date' | 'status' | 'type'>>
): Promise<Payment> {
  const { data, error } = await supabase
    .from('payments')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

// Rebuilds future pending rent rows on an already-active lease after the
// manager has toggled which tenants are primary. Past + non-pending rows
// are preserved by the SQL function. Returns counts for the toast message.
export async function regenerateRentSchedule(
  leaseId: string
): Promise<{ created: number; skippedPaid: number }> {
  const { data, error } = await supabase.rpc('regenerate_rent_schedule', { p_lease_id: leaseId })
  if (error) throw new Error(error.message)
  const row = Array.isArray(data) ? data[0] : data
  return {
    created: Number(row?.created_count ?? 0),
    skippedPaid: Number(row?.skipped_paid_count ?? 0),
  }
}

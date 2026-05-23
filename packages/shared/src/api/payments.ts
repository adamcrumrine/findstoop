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
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')
    .order('due_date', { ascending: true })
    .limit(1)
    .single()
  if (error) return null
  return data
}

// Manager-side "Recent Payments" widget — only actually-attempted payments
// (completed / processing / failed). Pending and upcoming rows belong in
// the donut + the tenant's pay-rent page, not here. Sorted most-recent-first
// by when the money actually moved (paid_at), falling back to initiated_at.
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

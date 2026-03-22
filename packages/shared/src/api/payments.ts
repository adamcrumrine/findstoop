import { supabase } from '../lib/supabase'
import type { Payment } from '../types/payment'

export async function getTenantPayments(tenantId: string, limit = 3): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
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

export async function getRecentPayments(leaseIds: string[], limit = 5): Promise<Payment[]> {
  if (leaseIds.length === 0) return []
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .in('lease_id', leaseIds)
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

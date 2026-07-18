import { useForegroundRefresh } from './useForegroundRefresh'
import { useState, useEffect, useCallback } from 'react'
import {
  getAllPayments, createPayment, markPaymentPaid,
  updatePayment, regenerateRentSchedule,
} from '../api/payments'
import type { Payment, PaymentType, PaymentStatus } from '../types/payment'

export interface PaymentFilters {
  status: PaymentStatus | 'all'
  type: PaymentType | 'all'
  search: string
}

export function usePayments(leaseIds: string[]) {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const key = leaseIds.join(',')

  const load = useCallback(async () => {
    if (leaseIds.length === 0) { setPayments([]); setLoading(false); return }
    try {
      setLoading(true)
      setError(null)
      const data = await getAllPayments(leaseIds)
      setPayments(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payments')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => { load() }, [load])
  useForegroundRefresh(load)

  const add = async (data: Omit<Payment, 'id' | 'created_at'>) => {
    const payment = await createPayment(data)
    setPayments((prev) => [payment, ...prev])
    return payment
  }

  const markPaid = async (id: string) => {
    const payment = await markPaymentPaid(id)
    setPayments((prev) => prev.map((p) => (p.id === id ? payment : p)))
    return payment
  }

  const update = async (id: string, patch: Partial<Pick<Payment, 'amount' | 'due_date' | 'status' | 'type'>>) => {
    const payment = await updatePayment(id, patch)
    setPayments((prev) => prev.map((p) => (p.id === id ? payment : p)))
    return payment
  }

  // Calls the regenerate_rent_schedule RPC and reloads payments so the
  // grouped Payments view picks up the new tenant rows immediately.
  const regenerateSchedule = async (leaseId: string) => {
    const result = await regenerateRentSchedule(leaseId)
    await load()
    return result
  }

  const filterPayments = (filters: PaymentFilters) =>
    payments.filter((p) => {
      if (filters.status !== 'all' && p.status !== filters.status) return false
      if (filters.type !== 'all' && p.type !== filters.type) return false
      return true
    })

  const totalCollected = payments
    .filter((p) => p.status === 'completed')
    .reduce((sum, p) => sum + Number(p.amount), 0)

  const totalOutstanding = payments
    .filter((p) => p.status === 'pending')
    .reduce((sum, p) => sum + Number(p.amount), 0)

  return { payments, loading, error, add, markPaid, update, regenerateSchedule, filterPayments, totalCollected, totalOutstanding, reload: load }
}

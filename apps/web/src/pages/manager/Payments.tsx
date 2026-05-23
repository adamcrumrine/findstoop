import { useState, useMemo } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useProperties } from '@findstoop/shared/hooks/useProperties'
import { useUnits } from '@findstoop/shared/hooks/useUnits'
import { useLeases } from '@findstoop/shared/hooks/useLeases'
import { usePayments } from '@findstoop/shared/hooks/usePayments'
import { formatUsd, formatUsdCents } from '@findstoop/shared/lib/format'
import { rowStatus, paymentAnchor } from '@findstoop/shared/lib/paymentRails'
import MonthlyDonut from '../../components/manager/MonthlyDonut'
import type { Payment, PaymentType, PaymentStatus } from '@findstoop/shared/types/payment'
import type { LeaseWithTenant } from '@findstoop/shared/hooks/useLeases'
import Modal from '../../components/shared/Modal'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import FormField, { inputClass, selectClass } from '../../components/shared/FormField'
import { CreditCard, CalendarClock, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'



function Skeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse space-y-2">
      <div className="h-4 bg-gray-200 rounded w-1/2" />
      <div className="h-4 bg-gray-200 rounded w-1/3" />
    </div>
  )
}

// ── CSV export ────────────────────────────────────────────────────────────────
function exportCSV(payments: Payment[], leaseMap: Record<string, LeaseWithTenant | undefined>) {
  const rows = [
    ['Date', 'Tenant', 'Type', 'Amount', 'Status', 'Due Date', 'Paid At'].join(','),
    ...payments.map((p) => {
      const tenant = leaseMap[p.lease_id]?.profile?.full_name ?? leaseMap[p.lease_id]?.profile?.email ?? '—'
      return [
        new Date(p.created_at).toLocaleDateString(),
        `"${tenant}"`,
        p.type,
        p.amount,
        p.status,
        p.due_date ? new Date(p.due_date).toLocaleDateString() : '',
        p.paid_at ? new Date(p.paid_at).toLocaleDateString() : '',
      ].join(',')
    }),
  ]
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `payments-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Add payment form ──────────────────────────────────────────────────────────
interface AddPaymentFormData {
  lease_id: string
  amount: string
  type: PaymentType
  status: PaymentStatus
  due_date: string
  memo: string
}

interface AddPaymentFormProps {
  leases: LeaseWithTenant[]
  onSubmit: (data: AddPaymentFormData) => Promise<void>
  onCancel: () => void
  submitting: boolean
}

function AddPaymentForm({ leases, onSubmit, onCancel, submitting }: AddPaymentFormProps) {
  const [form, setForm] = useState<AddPaymentFormData>({
    lease_id: leases[0]?.id ?? '',
    amount: '',
    type: 'fee',
    status: 'pending',
    due_date: '',
    memo: '',
  })
  const [errors, setErrors] = useState<Partial<Record<keyof AddPaymentFormData, string>>>({})

  const set = (field: keyof AddPaymentFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setForm((f) => ({ ...f, [field]: e.target.value }))
      setErrors((err) => ({ ...err, [field]: undefined }))
    }

  const validate = () => {
    const e: Partial<Record<keyof AddPaymentFormData, string>> = {}
    if (!form.lease_id)                         e.lease_id = 'Select a lease'
    if (!form.amount || Number(form.amount) <= 0) e.amount  = 'Valid amount required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    await onSubmit(form)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormField label="Lease / Tenant" required error={errors.lease_id}>
        <select className={selectClass} value={form.lease_id} onChange={set('lease_id')}>
          {leases.map((l) => (
            <option key={l.id} value={l.id}>
              {l.profile?.full_name ?? l.profile?.email ?? l.id}
            </option>
          ))}
        </select>
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Amount ($)" required error={errors.amount}>
          <input className={inputClass} type="number" min="0" step="0.01" value={form.amount} onChange={set('amount')} placeholder="1500" />
        </FormField>
        <FormField label="Type">
          <select className={selectClass} value={form.type} onChange={set('type')}>
            <option value="rent">Rent</option>
            <option value="fee">Fee</option>
            <option value="fine">Fine</option>
            <option value="late_fee">Late Fee</option>
            <option value="utility">Utility</option>
            <option value="pet_fee">Pet Fee</option>
            <option value="pet_deposit">Pet Deposit</option>
            <option value="other">Other / Misc</option>
          </select>
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Status">
          <select className={selectClass} value={form.status} onChange={set('status')}>
            <option value="pending">Pending (tenant owes)</option>
            <option value="completed">Completed (already paid)</option>
            <option value="failed">Failed</option>
          </select>
        </FormField>
        <FormField label="Due Date">
          <input className={inputClass} type="date" value={form.due_date} onChange={set('due_date')} />
        </FormField>
      </div>
      <FormField label="Memo / reason">
        <input
          className={inputClass}
          type="text"
          value={form.memo}
          onChange={set('memo')}
          placeholder="e.g., December water bill, dog walking deposit, lock-out fee"
        />
        <p className="text-xs text-mute mt-1">Shown on the payment row and on the tenant's portal.</p>
      </FormField>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={submitting} className="flex-1 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors">
          {submitting ? 'Saving…' : 'Record Payment'}
        </button>
      </div>
    </form>
  )
}

// ── Payment row ───────────────────────────────────────────────────────────────
interface PaymentRowProps {
  payment: Payment
  tenantName: string
  // Tenant has auto-pay turned on. Shown as a small recurring-arrow icon
  // on Upcoming / Scheduled rows so the manager can tell at a glance that
  // a future charge is set up to run automatically.
  tenantAutopay: boolean
  onMarkPaid: (id: string) => void
  onApplyCredit: (payment: Payment) => void
}

function PaymentRow({ payment, tenantName, tenantAutopay, onMarkPaid, onApplyCredit }: PaymentRowProps) {
  const status = rowStatus(payment)
  // Mark Paid + Credit available on any pending row — managers regularly
  // collect off-platform (cash, check, Venmo) and need to flip future months,
  // and they may want to credit a future month for in-kind work (mulch, etc.).
  const isCreditable = payment.status === 'pending' && (payment.type === 'rent' || payment.type === 'utility' || payment.type === 'fee' || payment.type === 'fine' || payment.type === 'other')
  const showMarkPaid = payment.status === 'pending'
  // Status badges — monochrome icons next to the pill.
  //   • CalendarClock → tenant has explicitly scheduled this exact payment
  //   • RefreshCw    → tenant has autopay enabled (will recur automatically)
  const isScheduled = !!(payment as Payment & { scheduled_for?: string | null }).scheduled_for
  const showScheduledIcon = isScheduled
  const showRecurringIcon = tenantAutopay && payment.status === 'pending'
  const anchor = paymentAnchor(payment)
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0 gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-gray-800 capitalize">{payment.type.replace(/_/g, ' ')}</p>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${status.cls}`}>
            {status.label}
          </span>
          {showScheduledIcon && (
            <CalendarClock className="w-3.5 h-3.5 text-gray-500" strokeWidth={1.75} aria-label="Scheduled by tenant" />
          )}
          {showRecurringIcon && (
            <RefreshCw className="w-3.5 h-3.5 text-gray-500" strokeWidth={1.75} aria-label="Tenant auto-pay" />
          )}
        </div>
        <p className="text-xs text-gray-400 mt-0.5">{tenantName} · {new Date(anchor).toLocaleDateString()}</p>
        {payment.memo && (
          <p className="text-xs text-gray-500 mt-1 whitespace-pre-line italic">{payment.memo}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <p className="text-sm font-semibold text-gray-900">{formatUsdCents(Number(payment.amount))}</p>
        {isCreditable && (
          <button
            onClick={() => onApplyCredit(payment)}
            className="text-xs font-medium text-amber-700 border border-amber-200 px-2 py-1 rounded-lg hover:bg-amber-50 transition-colors"
          >
            Credit
          </button>
        )}
        {showMarkPaid && (
          <button
            onClick={() => onMarkPaid(payment.id)}
            className="text-xs font-medium text-brand-600 border border-brand-200 px-2 py-1 rounded-lg hover:bg-brand-50 transition-colors"
          >
            Mark Paid
          </button>
        )}
      </div>
    </div>
  )
}

// ── Manager Payments page ─────────────────────────────────────────────────────
export default function ManagerPayments() {
  const { profile } = useAuth()
  const { properties } = useProperties(profile?.id)
  const propertyIds = useMemo(() => properties.map((p) => p.id), [properties])
  const { units } = useUnits(propertyIds)
  const unitIds = useMemo(() => units.map((u) => u.id), [units])
  const { leases } = useLeases(unitIds)
  const leaseIds = useMemo(() => leases.map((l) => l.id), [leases])
  const { payments, loading, add, markPaid, reload } = usePayments(leaseIds)

  const [filterStatus, setFilterStatus] = useState<PaymentStatus | 'all'>('all')
  const [filterType, setFilterType] = useState<PaymentType | 'all'>('all')
  const [filterPropertyId, setFilterPropertyId] = useState<string | 'all'>('all')
  const [filterLeaseStatus, setFilterLeaseStatus] = useState<'all' | 'active' | 'pending' | 'expired' | 'terminated'>('all')
  const [addOpen, setAddOpen] = useState(false)
  const [markPaidTarget, setMarkPaidTarget] = useState<Payment | null>(null)
  const [creditTarget, setCreditTarget] = useState<Payment | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // tenant_id → autopay_enabled. Populated once when leases load.
  const [tenantAutopay, setTenantAutopay] = useState<Record<string, boolean>>({})
  const tenantIds = useMemo(
    () => Array.from(new Set(leases.map((l) => l.tenant_id).filter(Boolean))),
    [leases]
  )
  const tenantIdsKey = tenantIds.join(',')
  useMemo(() => {
    if (tenantIds.length === 0) { setTenantAutopay({}); return }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, autopay_enabled')
        .in('id', tenantIds)
      if (cancelled) return
      const map: Record<string, boolean> = {}
      for (const row of (data as Array<{ id: string; autopay_enabled: boolean | null }> | null) ?? []) {
        map[row.id] = !!row.autopay_enabled
      }
      setTenantAutopay(map)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantIdsKey])

  const leaseMap = useMemo(
    () => Object.fromEntries(leases.map((l) => [l.id, l])),
    [leases]
  )
  const unitToProperty = useMemo(
    () => Object.fromEntries(units.map((u) => [u.id, u.property_id])),
    [units]
  )

  const filtered = useMemo(() =>
    payments.filter((p) => {
      if (filterStatus !== 'all' && p.status !== filterStatus) return false
      if (filterType !== 'all' && p.type !== filterType) return false
      const lease = leaseMap[p.lease_id]
      if (filterLeaseStatus !== 'all' && lease?.status !== filterLeaseStatus) return false
      if (filterPropertyId !== 'all') {
        const propId = lease ? unitToProperty[lease.unit_id] : undefined
        if (propId !== filterPropertyId) return false
      }
      return true
    }),
    [payments, filterStatus, filterType, filterLeaseStatus, filterPropertyId, leaseMap, unitToProperty]
  )

  // Summary tiles: scope to the current calendar month + the active filter
  // set so the numbers reflect what's actually visible below.
  const monthlyTotals = useMemo(() => {
    const today = new Date()
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 1)
    let collected = 0
    let outstanding = 0
    for (const p of filtered) {
      const ref = (p as Payment & { scheduled_for?: string | null }).scheduled_for
        ?? p.paid_at ?? p.due_date ?? p.created_at
      const d = new Date(ref)
      if (d < start || d >= end) continue
      if (p.status === 'completed') collected += Number(p.amount)
      else if (p.status === 'pending' && !(p as Payment & { scheduled_for?: string | null }).scheduled_for) outstanding += Number(p.amount)
    }
    return { collected, outstanding }
  }, [filtered])

  const handleAdd = async (data: AddPaymentFormData) => {
    setSubmitting(true)
    try {
      const lease = leases.find((l) => l.id === data.lease_id)
      if (!lease) throw new Error('Lease not found')
      await add({
        lease_id: data.lease_id,
        tenant_id: lease.tenant_id,
        amount: parseFloat(data.amount),
        type: data.type,
        status: data.status,
        stripe_payment_id: null,
        due_date: data.due_date || null,
        paid_at: data.status === 'completed' ? new Date().toISOString() : null,
        memo: data.memo.trim() || null,
        scheduled_for: null,
        original_due_date: data.due_date || null,
        initiated_at: null,
      })
      toast.success('Payment recorded')
      setAddOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record payment')
    } finally {
      setSubmitting(false)
    }
  }

  const handleMarkPaid = async () => {
    if (!markPaidTarget) return
    try {
      await markPaid(markPaidTarget.id)
      toast.success('Payment marked as paid')
      setMarkPaidTarget(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update payment')
    }
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Rent, utilities, fees, fines, and tenant credits — {filtered.length} of {payments.length} shown.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportCSV(filtered, leaseMap)}
            disabled={filtered.length === 0}
            className="px-3 py-2 text-sm font-medium border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            Export CSV
          </button>
          <button
            onClick={() => setAddOpen(true)}
            disabled={leases.length === 0}
            className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-40 transition-colors"
          >
            + Record Payment
          </button>
        </div>
      </div>

      {/* Donut on the left, Collected + Outstanding tiles stacked on the
          right. Both the donut and the tiles run against the same `filtered`
          set, so changing the filter selects below updates everything in
          place. */}
      {!loading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2">
            <MonthlyDonut payments={filtered} loading={loading} />
          </div>
          <div className="grid gap-3">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Collected · this month</p>
              <p className="text-2xl font-bold text-brand-700 mt-1">{formatUsd(monthlyTotals.collected)}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Outstanding · this month</p>
              <p className={`text-2xl font-bold mt-1 ${monthlyTotals.outstanding > 0 ? 'text-red-700' : 'text-gray-800'}`}>
                {formatUsd(monthlyTotals.outstanding)}
              </p>
              <p className="text-[11px] text-mute mt-0.5">Not scheduled or paid yet</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      {!loading && payments.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <select
            value={filterPropertyId}
            onChange={(e) => setFilterPropertyId(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">All Properties</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            value={filterLeaseStatus}
            onChange={(e) => setFilterLeaseStatus(e.target.value as 'all' | 'active' | 'pending' | 'expired' | 'terminated')}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">All Lease Statuses</option>
            <option value="active">Active lease</option>
            <option value="pending">Pending lease</option>
            <option value="expired">Expired lease</option>
            <option value="terminated">Terminated lease</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as PaymentStatus | 'all')}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">All Payment Statuses</option>
            <option value="pending">Upcoming / Scheduled</option>
            <option value="processing">Processing</option>
            <option value="completed">Paid</option>
            <option value="failed">Failed</option>
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as PaymentType | 'all')}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">All Types</option>
            <option value="rent">Rent</option>
            <option value="fee">Fee</option>
            <option value="fine">Fine</option>
            <option value="late_fee">Late Fee</option>
            <option value="utility">Utility</option>
            <option value="pet_fee">Pet Fee</option>
            <option value="pet_deposit">Pet Deposit</option>
            <option value="credit">Credit</option>
            <option value="other">Other / Misc</option>
          </select>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2"><Skeleton /><Skeleton /><Skeleton /><Skeleton /><Skeleton /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <CreditCard className="w-12 h-12 mx-auto mb-3 text-mute-400" strokeWidth={1.5} />
          <p className="font-semibold text-gray-700">{payments.length === 0 ? 'No payments yet' : 'No payments match filters'}</p>
          <p className="text-sm text-gray-400 mt-1">
            {payments.length === 0 ? 'Record your first payment to get started' : 'Try adjusting the filters'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 px-4">
          {filtered.map((p) => (
            <PaymentRow
              key={p.id}
              payment={p}
              tenantName={leaseMap[p.lease_id]?.profile?.full_name ?? leaseMap[p.lease_id]?.profile?.email ?? '—'}
              tenantAutopay={!!tenantAutopay[p.tenant_id]}
              onMarkPaid={(id) => setMarkPaidTarget(payments.find((pay) => pay.id === id) ?? null)}
              onApplyCredit={(payment) => setCreditTarget(payment)}
            />
          ))}
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Record Payment">
        <AddPaymentForm
          leases={leases}
          onSubmit={handleAdd}
          onCancel={() => setAddOpen(false)}
          submitting={submitting}
        />
      </Modal>

      <ConfirmDialog
        open={!!markPaidTarget}
        title="Mark as Paid"
        message={`Mark $${Number(markPaidTarget?.amount ?? 0).toFixed(2)} payment as completed?`}
        confirmLabel="Mark Paid"
        onConfirm={handleMarkPaid}
        onCancel={() => setMarkPaidTarget(null)}
      />

      <Modal open={!!creditTarget} onClose={() => setCreditTarget(null)} title="Apply credit">
        {creditTarget && (
          <ApplyCreditForm
            target={creditTarget}
            tenantName={leaseMap[creditTarget.lease_id]?.profile?.full_name ?? leaseMap[creditTarget.lease_id]?.profile?.email ?? '—'}
            onClose={() => setCreditTarget(null)}
            onDone={async () => { setCreditTarget(null); await reload() }}
          />
        )}
      </Modal>
    </div>
  )
}

// ── Apply credit form ─────────────────────────────────────────────────────────
function ApplyCreditForm({
  target,
  tenantName,
  onClose,
  onDone,
}: {
  target: Payment
  tenantName: string
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const numAmount = Number(amount)
  const valid = amount && numAmount > 0 && numAmount <= Number(target.amount) && memo.trim().length > 0
  const newTotal = Math.max(Number(target.amount) - numAmount, 0)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    setSubmitting(true)
    setError(null)
    try {
      const { error: rpcErr } = await supabase.rpc('apply_rent_credit', {
        target_payment_id: target.id,
        credit_amount: numAmount,
        memo_text: memo.trim(),
      })
      if (rpcErr) throw rpcErr
      toast.success(`Credit of $${numAmount.toLocaleString()} applied`)
      await onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not apply credit')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm">
        <p className="font-semibold text-ink capitalize">{target.type.replace(/_/g, ' ')} · {tenantName}</p>
        <p className="text-mute mt-0.5">
          Current amount: <strong>${Number(target.amount).toLocaleString()}</strong>
          {target.due_date && <> · Due {new Date(target.due_date).toLocaleDateString()}</>}
        </p>
      </div>

      <FormField label="Credit amount ($)" required>
        <input
          className={inputClass}
          type="number"
          min="0.01"
          step="0.01"
          max={Number(target.amount)}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="99.23"
          autoFocus
        />
      </FormField>

      <FormField label="Memo / reason" required>
        <input
          className={inputClass}
          type="text"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="e.g., Tenant paid for mulch this month — $99.23"
        />
        <p className="text-xs text-mute mt-1">
          Stored permanently on the payment and visible to the tenant. An audit row is also written.
        </p>
      </FormField>

      {amount && numAmount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
          New balance for this payment:{' '}
          <strong>${newTotal.toLocaleString()}</strong>{' '}
          <span className="text-mute">
            (${Number(target.amount).toLocaleString()} − ${numAmount.toLocaleString()})
          </span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">
          Cancel
        </button>
        <button type="submit" disabled={!valid || submitting} className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
          {submitting ? 'Applying…' : 'Apply credit'}
        </button>
      </div>
    </form>
  )
}

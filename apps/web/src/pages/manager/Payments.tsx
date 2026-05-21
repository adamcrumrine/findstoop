import { useState, useMemo } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useProperties } from '@findstoop/shared/hooks/useProperties'
import { useUnits } from '@findstoop/shared/hooks/useUnits'
import { useLeases } from '@findstoop/shared/hooks/useLeases'
import { usePayments } from '@findstoop/shared/hooks/usePayments'
import type { Payment, PaymentType, PaymentStatus } from '@findstoop/shared/types/payment'
import type { LeaseWithTenant } from '@findstoop/shared/hooks/useLeases'
import Modal from '../../components/shared/Modal'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import FormField, { inputClass, selectClass } from '../../components/shared/FormField'
import { CreditCard } from 'lucide-react'

function Skeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse space-y-2">
      <div className="h-4 bg-gray-200 rounded w-1/2" />
      <div className="h-4 bg-gray-200 rounded w-1/3" />
    </div>
  )
}

const statusColors: Record<PaymentStatus, string> = {
  pending:   'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  failed:    'bg-red-100 text-red-700',
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
    type: 'rent',
    status: 'completed',
    due_date: '',
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
            <option value="late_fee">Late Fee</option>
            <option value="pet_fee">Pet Fee</option>
            <option value="pet_deposit">Pet Deposit</option>
            <option value="utility">Utility</option>
            <option value="other">Other</option>
          </select>
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Status">
          <select className={selectClass} value={form.status} onChange={set('status')}>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </FormField>
        <FormField label="Due Date">
          <input className={inputClass} type="date" value={form.due_date} onChange={set('due_date')} />
        </FormField>
      </div>
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
  onMarkPaid: (id: string) => void
}

function PaymentRow({ payment, tenantName, onMarkPaid }: PaymentRowProps) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0 gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-gray-800 capitalize">{payment.type.replace(/_/g, ' ')}</p>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[payment.status]}`}>
            {payment.status}
          </span>
        </div>
        <p className="text-xs text-gray-400 mt-0.5">{tenantName} · {new Date(payment.created_at).toLocaleDateString()}</p>
        {payment.due_date && (
          <p className="text-xs text-gray-400">Due: {new Date(payment.due_date).toLocaleDateString()}</p>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <p className="text-sm font-semibold text-gray-900">${Number(payment.amount).toLocaleString()}</p>
        {payment.status === 'pending' && (
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
  const { payments, loading, add, markPaid, totalCollected, totalOutstanding } = usePayments(leaseIds)

  const [filterStatus, setFilterStatus] = useState<PaymentStatus | 'all'>('all')
  const [filterType, setFilterType] = useState<PaymentType | 'all'>('all')
  const [addOpen, setAddOpen] = useState(false)
  const [markPaidTarget, setMarkPaidTarget] = useState<Payment | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const leaseMap = useMemo(
    () => Object.fromEntries(leases.map((l) => [l.id, l])),
    [leases]
  )

  const filtered = useMemo(() =>
    payments.filter((p) => {
      if (filterStatus !== 'all' && p.status !== filterStatus) return false
      if (filterType !== 'all' && p.type !== filterType) return false
      return true
    }),
    [payments, filterStatus, filterType]
  )

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
          <p className="text-sm text-gray-500 mt-0.5">{payments.length} total payment{payments.length !== 1 ? 's' : ''}</p>
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

      {/* Summary cards */}
      {!loading && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-xs font-medium text-green-600 uppercase tracking-wide">Collected</p>
            <p className="text-2xl font-bold text-green-700 mt-1">${totalCollected.toLocaleString()}</p>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <p className="text-xs font-medium text-yellow-600 uppercase tracking-wide">Outstanding</p>
            <p className="text-2xl font-bold text-yellow-700 mt-1">${totalOutstanding.toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      {!loading && payments.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as PaymentStatus | 'all')}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as PaymentType | 'all')}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">All Types</option>
            <option value="rent">Rent</option>
            <option value="late_fee">Late Fee</option>
            <option value="pet_fee">Pet Fee</option>
            <option value="pet_deposit">Pet Deposit</option>
            <option value="utility">Utility</option>
            <option value="other">Other</option>
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
              onMarkPaid={(id) => setMarkPaidTarget(payments.find((pay) => pay.id === id) ?? null)}
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
    </div>
  )
}

import { useState, useMemo } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useProperties } from '@findstoop/shared/hooks/useProperties'
import { useUnits } from '@findstoop/shared/hooks/useUnits'
import { useLeases } from '@findstoop/shared/hooks/useLeases'
import { getProfileByEmail } from '@findstoop/shared/api/profiles'
import type { LeaseWithTenant } from '@findstoop/shared/hooks/useLeases'
import type { LeaseStatus } from '@findstoop/shared/types/lease'
import type { Property } from '@findstoop/shared/types/property'
import type { Unit } from '@findstoop/shared/types/unit'
import Modal from '../../components/shared/Modal'
import FormField, { inputClass, selectClass } from '../../components/shared/FormField'
import { FileText, FileSignature } from 'lucide-react'
import { Link } from 'react-router-dom'

function Skeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse space-y-2">
      <div className="h-5 bg-gray-200 rounded w-1/2" />
      <div className="h-4 bg-gray-200 rounded w-1/3" />
      <div className="h-4 bg-gray-200 rounded w-2/3" />
    </div>
  )
}

const statusColors: Record<LeaseStatus, string> = {
  active:     'bg-green-100 text-green-700',
  pending:    'bg-yellow-100 text-yellow-700',
  expired:    'bg-gray-100 text-gray-600',
  terminated: 'bg-red-100 text-red-700',
}

// ── Lease form ────────────────────────────────────────────────────────────────
interface LeaseFormData {
  unit_id: string
  tenant_email: string
  start_date: string
  end_date: string
  rent_amount: string
  security_deposit: string
  pet_deposit: string
  utility_notes: string
  status: LeaseStatus
}

interface LeaseFormProps {
  units: Unit[]
  properties: Property[]
  onSubmit: (data: LeaseFormData) => Promise<void>
  onCancel: () => void
  submitting: boolean
}

function LeaseForm({ units, properties, onSubmit, onCancel, submitting }: LeaseFormProps) {
  const [form, setForm] = useState<LeaseFormData>({
    unit_id: units[0]?.id ?? '',
    tenant_email: '',
    start_date: '',
    end_date: '',
    rent_amount: '',
    security_deposit: '',
    pet_deposit: '',
    utility_notes: '',
    status: 'pending',
  })
  const [errors, setErrors] = useState<Partial<Record<keyof LeaseFormData, string>>>({})

  const propertyMap = Object.fromEntries(properties.map((p) => [p.id, p.name]))

  const set = (field: keyof LeaseFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((f) => ({ ...f, [field]: e.target.value }))
      setErrors((err) => ({ ...err, [field]: undefined }))
    }

  const validate = () => {
    const e: Partial<Record<keyof LeaseFormData, string>> = {}
    if (!form.unit_id)                          e.unit_id      = 'Select a unit'
    if (!form.tenant_email.trim() || !/\S+@\S+\.\S+/.test(form.tenant_email))
                                                e.tenant_email = 'Valid tenant email required'
    if (!form.start_date)                       e.start_date   = 'Start date required'
    if (!form.end_date)                         e.end_date     = 'End date required'
    if (form.start_date && form.end_date && form.end_date <= form.start_date)
                                                e.end_date     = 'End date must be after start date'
    if (!form.rent_amount || Number(form.rent_amount) <= 0)
                                                e.rent_amount  = 'Valid rent amount required'
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
      <FormField label="Unit" required error={errors.unit_id}>
        <select className={selectClass} value={form.unit_id} onChange={set('unit_id')}>
          <option value="">Select a unit…</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {propertyMap[u.property_id] ?? ''} — Unit {u.unit_number}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Tenant Email" required error={errors.tenant_email}>
        <input className={inputClass} type="email" value={form.tenant_email} onChange={set('tenant_email')} placeholder="tenant@example.com" />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Start Date" required error={errors.start_date}>
          <input className={inputClass} type="date" value={form.start_date} onChange={set('start_date')} />
        </FormField>
        <FormField label="End Date" required error={errors.end_date}>
          <input className={inputClass} type="date" value={form.end_date} onChange={set('end_date')} />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Monthly Rent ($)" required error={errors.rent_amount}>
          <input className={inputClass} type="number" min="0" step="0.01" value={form.rent_amount} onChange={set('rent_amount')} placeholder="1500" />
        </FormField>
        <FormField label="Status">
          <select className={selectClass} value={form.status} onChange={set('status')}>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="terminated">Terminated</option>
          </select>
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Security Deposit ($)">
          <input className={inputClass} type="number" min="0" step="0.01" value={form.security_deposit} onChange={set('security_deposit')} placeholder="0" />
        </FormField>
        <FormField label="Pet Deposit ($)">
          <input className={inputClass} type="number" min="0" step="0.01" value={form.pet_deposit} onChange={set('pet_deposit')} placeholder="0" />
        </FormField>
      </div>
      <FormField label="Utility Notes">
        <textarea
          className={`${inputClass} resize-none`}
          rows={2}
          value={form.utility_notes}
          onChange={set('utility_notes')}
          placeholder="Water included, tenant pays electric…"
        />
      </FormField>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={submitting} className="flex-1 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors">
          {submitting ? 'Creating…' : 'Create Lease'}
        </button>
      </div>
    </form>
  )
}

// ── Lease card ────────────────────────────────────────────────────────────────
interface LeaseCardProps {
  lease: LeaseWithTenant
  unitNumber: string
  propertyName: string
  onUpdateStatus: (id: string, status: LeaseStatus) => void
}

function LeaseCard({ lease, unitNumber, propertyName, onUpdateStatus }: LeaseCardProps) {
  const tenantName = lease.profile?.full_name ?? lease.profile?.email ?? 'Unknown tenant'
  const daysLeft = Math.ceil((new Date(lease.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900">{tenantName}</h3>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[lease.status]}`}>
              {lease.status}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">{propertyName} — Unit {unitNumber}</p>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs text-gray-500">
            <div><span className="text-gray-400">Start:</span> {new Date(lease.start_date).toLocaleDateString()}</div>
            <div><span className="text-gray-400">End:</span> {new Date(lease.end_date).toLocaleDateString()}</div>
            <div><span className="text-gray-400">Rent:</span> ${Number(lease.rent_amount).toLocaleString()}/mo</div>
            {lease.status === 'active' && (
              <div className={daysLeft < 30 ? 'text-yellow-600 font-medium' : ''}>
                {daysLeft > 0 ? `${daysLeft}d left` : 'Expired'}
              </div>
            )}
          </div>
        </div>
        <select
          value={lease.status}
          onChange={(e) => onUpdateStatus(lease.id, e.target.value as LeaseStatus)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white shrink-0 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="pending">Pending</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="terminated">Terminated</option>
        </select>
      </div>
      {lease.utility_notes && (
        <p className="mt-2 text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">{lease.utility_notes}</p>
      )}
      <div className="mt-3 flex items-center justify-between">
        <div className="text-xs text-mute inline-flex items-center gap-1.5">
          {lease.signed_at ? (
            <>
              <FileSignature className="w-3.5 h-3.5 text-green-600" strokeWidth={1.75} />
              Fully signed
            </>
          ) : (
            <>
              <FileSignature className="w-3.5 h-3.5" strokeWidth={1.75} />
              Awaiting signatures
            </>
          )}
        </div>
        {!lease.signed_at && (
          <Link
            to={`/manager/sign-lease/${lease.id}`}
            className="text-xs font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"
          >
            Sign now →
          </Link>
        )}
      </div>
    </div>
  )
}

// ── Leases page ───────────────────────────────────────────────────────────────
export default function ManagerLeases() {
  const { profile } = useAuth()
  const { properties } = useProperties(profile?.id)
  const propertyIds = useMemo(() => properties.map((p) => p.id), [properties])
  const { units } = useUnits(propertyIds)
  const unitIds = useMemo(() => units.map((u) => u.id), [units])
  const { leases, loading, add, update } = useLeases(unitIds)

  const [filterStatus, setFilterStatus] = useState<LeaseStatus | 'all'>('all')
  const [addOpen, setAddOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const unitMap = useMemo(() => Object.fromEntries(units.map((u) => [u.id, u])), [units])
  const propertyMap = useMemo(() => Object.fromEntries(properties.map((p) => [p.id, p])), [properties])

  const filtered = filterStatus === 'all' ? leases : leases.filter((l) => l.status === filterStatus)

  const handleCreate = async (data: {
    unit_id: string
    tenant_email: string
    start_date: string
    end_date: string
    rent_amount: string
    security_deposit: string
    pet_deposit: string
    utility_notes: string
    status: LeaseStatus
  }) => {
    setSubmitting(true)
    try {
      const tenantProfile = await getProfileByEmail(data.tenant_email)

      if (!tenantProfile) {
        toast.error('Tenant not found. Make sure the tenant has registered first.')
        setSubmitting(false)
        return
      }

      await add({
        unit_id: data.unit_id,
        tenant_id: tenantProfile.id,
        start_date: data.start_date,
        end_date: data.end_date,
        rent_amount: parseFloat(data.rent_amount),
        security_deposit: data.security_deposit ? parseFloat(data.security_deposit) : null,
        pet_deposit: data.pet_deposit ? parseFloat(data.pet_deposit) : null,
        utility_notes: data.utility_notes || null,
        status: data.status,
        signed_at: null,
        document_url: null,
      })
      toast.success('Lease created')
      setAddOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create lease')
    } finally {
      setSubmitting(false)
    }
  }

  const handleStatusUpdate = async (id: string, status: LeaseStatus) => {
    try {
      await update(id, { status })
      toast.success('Lease status updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update lease')
    }
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leases</h1>
          <p className="text-sm text-gray-500 mt-0.5">{filtered.length} lease{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          disabled={units.length === 0}
          className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-40 transition-colors"
        >
          + New Lease
        </button>
      </div>

      {!loading && leases.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {(['all', 'active', 'pending', 'expired', 'terminated'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                filterStatus === s
                  ? 'bg-brand-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {s} {s === 'all' ? `(${leases.length})` : `(${leases.filter((l) => l.status === s).length})`}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-3"><Skeleton /><Skeleton /><Skeleton /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <FileText className="w-12 h-12 mx-auto mb-3 text-mute-400" strokeWidth={1.5} />
          <p className="font-semibold text-gray-700">
            {leases.length === 0 ? 'No leases yet' : 'No leases match this filter'}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            {leases.length === 0 ? 'Create your first lease to get started' : 'Try a different status filter'}
          </p>
          {leases.length === 0 && units.length > 0 && (
            <button onClick={() => setAddOpen(true)} className="mt-4 bg-brand-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors">
              Create Lease
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((lease) => {
            const unit = unitMap[lease.unit_id]
            const property = unit ? propertyMap[unit.property_id] : undefined
            return (
              <LeaseCard
                key={lease.id}
                lease={lease}
                unitNumber={unit?.unit_number ?? '—'}
                propertyName={property?.name ?? '—'}
                onUpdateStatus={handleStatusUpdate}
              />
            )
          })}
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Create Lease">
        <LeaseForm
          units={units}
          properties={properties}
          onSubmit={handleCreate}
          onCancel={() => setAddOpen(false)}
          submitting={submitting}
        />
      </Modal>
    </div>
  )
}

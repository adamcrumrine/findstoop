import { useState, useMemo } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useProperties } from '@findstoop/shared/hooks/useProperties'
import { useUnits } from '@findstoop/shared/hooks/useUnits'
import type { Unit, UnitStatus } from '@findstoop/shared/types/unit'
import type { Property } from '@findstoop/shared/types/property'
import Modal from '../../components/shared/Modal'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import FormField, { inputClass, selectClass } from '../../components/shared/FormField'
import { DoorOpen, Copy } from 'lucide-react'

function Skeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2 animate-pulse">
      <div className="h-5 bg-gray-200 rounded w-1/3" />
      <div className="h-4 bg-gray-200 rounded w-1/2" />
      <div className="h-4 bg-gray-200 rounded w-1/4" />
    </div>
  )
}

const statusColors: Record<UnitStatus, string> = {
  occupied:    'bg-green-100 text-green-700',
  vacant:      'bg-yellow-100 text-yellow-700',
  maintenance: 'bg-red-100 text-red-700',
}

// ── Unit form ─────────────────────────────────────────────────────────────────
interface UnitFormData {
  property_id: string
  unit_number: string
  bedrooms: string
  bathrooms: string
  square_feet: string
  rent_amount: string
  status: UnitStatus
}

const emptyUnitForm = (propertyId = ''): UnitFormData => ({
  property_id: propertyId,
  unit_number: '',
  bedrooms: '',
  bathrooms: '',
  square_feet: '',
  rent_amount: '',
  status: 'vacant',
})

interface UnitFormProps {
  initial?: UnitFormData
  properties: Property[]
  onSubmit: (data: UnitFormData) => Promise<void>
  onCancel: () => void
  submitting: boolean
}

function UnitForm({ initial, properties, onSubmit, onCancel, submitting }: UnitFormProps) {
  const [form, setForm] = useState<UnitFormData>(initial ?? emptyUnitForm(properties[0]?.id ?? ''))
  const [errors, setErrors] = useState<Partial<Record<keyof UnitFormData, string>>>({})

  const set = (field: keyof UnitFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setForm((f) => ({ ...f, [field]: e.target.value }))
      setErrors((err) => ({ ...err, [field]: undefined }))
    }

  const validate = () => {
    const e: Partial<Record<keyof UnitFormData, string>> = {}
    if (!form.property_id)            e.property_id  = 'Select a property'
    if (!form.unit_number.trim())     e.unit_number  = 'Unit number is required'
    if (!form.rent_amount || isNaN(Number(form.rent_amount)) || Number(form.rent_amount) <= 0)
      e.rent_amount = 'Enter a valid rent amount'
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
      <FormField label="Property" required error={errors.property_id}>
        <select className={selectClass} value={form.property_id} onChange={set('property_id')}>
          {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Unit Number" required error={errors.unit_number}>
          <input className={inputClass} value={form.unit_number} onChange={set('unit_number')} placeholder="1A" />
        </FormField>
        <FormField label="Status">
          <select className={selectClass} value={form.status} onChange={set('status')}>
            <option value="vacant">Vacant</option>
            <option value="occupied">Occupied</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Bedrooms">
          <input className={inputClass} type="number" inputMode="decimal" min="0" value={form.bedrooms} onChange={set('bedrooms')} placeholder="2" />
        </FormField>
        <FormField label="Bathrooms">
          <input className={inputClass} type="number" inputMode="decimal" min="0" step="0.5" value={form.bathrooms} onChange={set('bathrooms')} placeholder="1" />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Square Feet">
          <input className={inputClass} type="number" inputMode="decimal" min="0" value={form.square_feet} onChange={set('square_feet')} placeholder="750" />
        </FormField>
        <FormField label="Rent Amount" required error={errors.rent_amount}>
          <input className={inputClass} type="number" inputMode="decimal" min="0" step="0.01" value={form.rent_amount} onChange={set('rent_amount')} placeholder="1500" />
        </FormField>
      </div>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={submitting} className="flex-1 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors">
          {submitting ? 'Saving\u2026' : 'Save Unit'}
        </button>
      </div>
    </form>
  )
}

// ── Unit card ─────────────────────────────────────────────────────────────────
interface UnitCardProps {
  unit: Unit
  propertyName: string
  onEdit: (u: Unit) => void
  onDelete: (u: Unit) => void
}

function UnitCard({ unit, propertyName, onEdit, onDelete }: UnitCardProps) {
  const copyApplyLink = () => {
    const link = `${window.location.origin}/apply/${unit.id}`
    navigator.clipboard.writeText(link).then(() => toast.success('Apply link copied'))
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900">Unit {unit.unit_number}</h3>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[unit.status]}`}>
              {unit.status}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">{propertyName}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 flex-wrap">
            {unit.bedrooms != null && <span>{unit.bedrooms} bd</span>}
            {unit.bathrooms != null && <span>{unit.bathrooms} ba</span>}
            {unit.square_feet != null && <span>{unit.square_feet.toLocaleString()} sqft</span>}
            <span className="text-gray-700 font-semibold">${Number(unit.rent_amount).toLocaleString()}/mo</span>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={copyApplyLink}
            className="text-xs font-medium text-brand-700 hover:text-brand-800 px-2 py-1 border border-gray-200 rounded-lg hover:border-brand-300 transition-colors inline-flex items-center gap-1"
            title="Copy public apply link"
          >
            <Copy className="w-3.5 h-3.5" strokeWidth={1.75} /> Apply link
          </button>
          <button
            onClick={() => onEdit(unit)}
            className="text-xs font-medium text-gray-500 hover:text-brand-600 px-2 py-1 border border-gray-200 rounded-lg hover:border-brand-300 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(unit)}
            className="text-xs font-medium text-gray-500 hover:text-red-600 px-2 py-1 border border-gray-200 rounded-lg hover:border-red-200 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Units page ────────────────────────────────────────────────────────────────
export default function ManagerUnits() {
  const { profile } = useAuth()
  const { properties, loading: propsLoading } = useProperties(profile?.id)
  const propertyIds = useMemo(() => properties.map((p) => p.id), [properties])
  const { units, loading: unitsLoading, add, update, remove } = useUnits(propertyIds)

  const [filterProperty, setFilterProperty] = useState<string>('all')
  const [filterStatus, setFilterStatus]     = useState<string>('all')
  const [addOpen, setAddOpen]               = useState(false)
  const [editTarget, setEditTarget]         = useState<Unit | null>(null)
  const [deleteTarget, setDeleteTarget]     = useState<Unit | null>(null)
  const [submitting, setSubmitting]         = useState(false)

  const loading = propsLoading || unitsLoading

  const propertyMap = useMemo(() =>
    Object.fromEntries(properties.map((p) => [p.id, p.name])),
    [properties]
  )

  const filtered = useMemo(() =>
    units.filter((u) => {
      if (filterProperty !== 'all' && u.property_id !== filterProperty) return false
      if (filterStatus !== 'all' && u.status !== filterStatus) return false
      return true
    }),
    [units, filterProperty, filterStatus]
  )

  const handleAdd = async (data: UnitFormData) => {
    setSubmitting(true)
    try {
      await add({
        property_id: data.property_id,
        unit_number: data.unit_number,
        bedrooms: data.bedrooms ? parseInt(data.bedrooms) : null,
        bathrooms: data.bathrooms ? parseFloat(data.bathrooms) : null,
        square_feet: data.square_feet ? parseInt(data.square_feet) : null,
        rent_amount: parseFloat(data.rent_amount),
        status: data.status,
      })
      toast.success('Unit added')
      setAddOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add unit')
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = async (data: UnitFormData) => {
    if (!editTarget) return
    setSubmitting(true)
    try {
      await update(editTarget.id, {
        property_id: data.property_id,
        unit_number: data.unit_number,
        bedrooms: data.bedrooms ? parseInt(data.bedrooms) : null,
        bathrooms: data.bathrooms ? parseFloat(data.bathrooms) : null,
        square_feet: data.square_feet ? parseInt(data.square_feet) : null,
        rent_amount: parseFloat(data.rent_amount),
        status: data.status,
      })
      toast.success('Unit updated')
      setEditTarget(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update unit')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await remove(deleteTarget.id)
      toast.success('Unit deleted')
      setDeleteTarget(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete unit')
    }
  }

  const editInitial: UnitFormData | undefined = editTarget ? {
    property_id: editTarget.property_id,
    unit_number: editTarget.unit_number,
    bedrooms: editTarget.bedrooms?.toString() ?? '',
    bathrooms: editTarget.bathrooms?.toString() ?? '',
    square_feet: editTarget.square_feet?.toString() ?? '',
    rent_amount: editTarget.rent_amount.toString(),
    status: editTarget.status,
  } : undefined

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Units</h1>
          <p className="text-sm text-gray-500 mt-0.5">{filtered.length} of {units.length} unit{units.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          disabled={properties.length === 0}
          className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-40 transition-colors"
        >
          + Add Unit
        </button>
      </div>

      {/* Filters */}
      {!loading && units.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <select
            value={filterProperty}
            onChange={(e) => setFilterProperty(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">All Properties</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">All Statuses</option>
            <option value="occupied">Occupied</option>
            <option value="vacant">Vacant</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3"><Skeleton /><Skeleton /><Skeleton /></div>
      ) : properties.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <DoorOpen className="w-12 h-12 mx-auto mb-3 text-mute-400" strokeWidth={1.5} />
          <p className="font-semibold text-gray-700">No properties yet</p>
          <p className="text-sm text-gray-500 mt-1">Add a property before adding units</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <DoorOpen className="w-12 h-12 mx-auto mb-3 text-mute-400" strokeWidth={1.5} />
          <p className="font-semibold text-gray-700">No units found</p>
          <p className="text-sm text-gray-500 mt-1">
            {units.length === 0 ? 'Add your first unit to get started' : 'Try adjusting your filters'}
          </p>
          {units.length === 0 && (
            <button onClick={() => setAddOpen(true)} className="mt-4 bg-brand-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors">
              Add Unit
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((u) => (
            <UnitCard
              key={u.id}
              unit={u}
              propertyName={propertyMap[u.property_id] ?? '\u2014'}
              onEdit={setEditTarget}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Unit">
        <UnitForm properties={properties} onSubmit={handleAdd} onCancel={() => setAddOpen(false)} submitting={submitting} />
      </Modal>

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Unit">
        {editTarget && (
          <UnitForm
            initial={editInitial}
            properties={properties}
            onSubmit={handleEdit}
            onCancel={() => setEditTarget(null)}
            submitting={submitting}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Unit"
        message={`Delete Unit ${deleteTarget?.unit_number}? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

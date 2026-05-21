import { useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useProperties } from '@findstoop/shared/hooks/useProperties'
import { useUnitsByProperty } from '@findstoop/shared/hooks/useUnits'
import type { Property } from '@findstoop/shared/types/property'
import Modal from '../../components/shared/Modal'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import FormField, { inputClass } from '../../components/shared/FormField'
import { Building2 } from 'lucide-react'

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2 animate-pulse">
      <div className="h-5 bg-gray-200 rounded w-1/2" />
      <div className="h-4 bg-gray-200 rounded w-3/4" />
      <div className="h-4 bg-gray-200 rounded w-1/3" />
    </div>
  )
}

// ── Property form ─────────────────────────────────────────────────────────────
interface PropertyFormData {
  name: string
  address: string
  city: string
  state: string
  zip: string
}

const emptyForm: PropertyFormData = { name: '', address: '', city: '', state: '', zip: '' }

interface PropertyFormProps {
  initial?: PropertyFormData
  onSubmit: (data: PropertyFormData) => Promise<void>
  onCancel: () => void
  submitting: boolean
}

function PropertyForm({ initial = emptyForm, onSubmit, onCancel, submitting }: PropertyFormProps) {
  const [form, setForm] = useState<PropertyFormData>(initial)
  const [errors, setErrors] = useState<Partial<PropertyFormData>>({})

  const set = (field: keyof PropertyFormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [field]: e.target.value }))
    setErrors((err) => ({ ...err, [field]: undefined }))
  }

  const validate = (): boolean => {
    const e: Partial<PropertyFormData> = {}
    if (!form.name.trim())    e.name    = 'Name is required'
    if (!form.address.trim()) e.address = 'Address is required'
    if (!form.city.trim())    e.city    = 'City is required'
    if (!form.state.trim())   e.state   = 'State is required'
    if (!form.zip.trim())     e.zip     = 'ZIP is required'
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
      <FormField label="Property Name" required error={errors.name}>
        <input className={inputClass} value={form.name} onChange={set('name')} placeholder="Sunset Apartments" />
      </FormField>
      <FormField label="Street Address" required error={errors.address}>
        <input className={inputClass} value={form.address} onChange={set('address')} placeholder="123 Main St" />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="City" required error={errors.city}>
          <input className={inputClass} value={form.city} onChange={set('city')} placeholder="Brooklyn" />
        </FormField>
        <FormField label="State" required error={errors.state}>
          <input className={inputClass} value={form.state} onChange={set('state')} placeholder="NY" maxLength={2} />
        </FormField>
      </div>
      <FormField label="ZIP Code" required error={errors.zip}>
        <input className={inputClass} value={form.zip} onChange={set('zip')} placeholder="11201" maxLength={10} />
      </FormField>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={submitting} className="flex-1 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors">
          {submitting ? 'Saving\u2026' : 'Save Property'}
        </button>
      </div>
    </form>
  )
}

// ── Unit count badge ───────────────────────────────────────────────────────────
function UnitCountBadge({ propertyId }: { propertyId: string }) {
  const { units, loading } = useUnitsByProperty(propertyId)
  if (loading) return <span className="text-xs text-gray-400">\u2026</span>
  const occupied = units.filter((u) => u.status === 'occupied').length
  return (
    <span className="text-xs text-gray-500">
      {units.length} unit{units.length !== 1 ? 's' : ''} · {occupied} occupied
    </span>
  )
}

// ── Property card ─────────────────────────────────────────────────────────────
interface PropertyCardProps {
  property: Property
  onEdit: (p: Property) => void
  onDelete: (p: Property) => void
}

function PropertyCard({ property, onEdit, onDelete }: PropertyCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:border-brand-300 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{property.name}</h3>
          <p className="text-sm text-gray-500 mt-0.5 truncate">{property.address}</p>
          <p className="text-sm text-gray-500 truncate">{property.city}, {property.state} {property.zip}</p>
          <div className="mt-2">
            <UnitCountBadge propertyId={property.id} />
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => onEdit(property)}
            className="text-xs font-medium text-gray-500 hover:text-brand-600 px-2 py-1 border border-gray-200 rounded-lg hover:border-brand-300 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(property)}
            className="text-xs font-medium text-gray-500 hover:text-red-600 px-2 py-1 border border-gray-200 rounded-lg hover:border-red-200 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Properties page ───────────────────────────────────────────────────────────
export default function ManagerProperties() {
  const { profile } = useAuth()
  const { properties, loading, add, update, remove } = useProperties(profile?.id)

  const [addOpen, setAddOpen]       = useState(false)
  const [editTarget, setEditTarget] = useState<Property | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Property | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleAdd = async (data: Omit<Property, 'id' | 'manager_id' | 'created_at'>) => {
    setSubmitting(true)
    try {
      await add(data)
      toast.success('Property added')
      setAddOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add property')
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = async (data: Omit<Property, 'id' | 'manager_id' | 'created_at'>) => {
    if (!editTarget) return
    setSubmitting(true)
    try {
      await update(editTarget.id, data)
      toast.success('Property updated')
      setEditTarget(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update property')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await remove(deleteTarget.id)
      toast.success('Property deleted')
      setDeleteTarget(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete property')
    }
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Properties</h1>
          <p className="text-sm text-gray-500 mt-0.5">{properties.length} propert{properties.length !== 1 ? 'ies' : 'y'}</p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
        >
          + Add Property
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton /><Skeleton /><Skeleton />
        </div>
      ) : properties.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Building2 className="w-12 h-12 mx-auto mb-3 text-mute-400" strokeWidth={1.5} />
          <p className="font-semibold text-gray-700">No properties yet</p>
          <p className="text-sm text-gray-400 mt-1">Add your first property to get started</p>
          <button
            onClick={() => setAddOpen(true)}
            className="mt-4 bg-brand-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            Add Property
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {properties.map((p) => (
            <PropertyCard
              key={p.id}
              property={p}
              onEdit={setEditTarget}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      {/* Add modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Property">
        <PropertyForm onSubmit={handleAdd} onCancel={() => setAddOpen(false)} submitting={submitting} />
      </Modal>

      {/* Edit modal */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Property">
        {editTarget && (
          <PropertyForm
            initial={{ name: editTarget.name, address: editTarget.address, city: editTarget.city, state: editTarget.state, zip: editTarget.zip }}
            onSubmit={handleEdit}
            onCancel={() => setEditTarget(null)}
            submitting={submitting}
          />
        )}
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Property"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This will also delete all associated units and data.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

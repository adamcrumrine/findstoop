import { useState } from 'react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useProperties } from '@findstoop/shared/hooks/useProperties'
import { useUnitsByProperty } from '@findstoop/shared/hooks/useUnits'
import type { Property } from '@findstoop/shared/types/property'
import Modal from '../../components/shared/Modal'
import FormField, { inputClass } from '../../components/shared/FormField'
import ImageUploader from '../../components/shared/ImageUploader'
import { Building2, ChevronRight } from 'lucide-react'
import { isBlockedState, blockedStateName, BLOCKED_STATES_DISPLAY } from '../../lib/blockedStates'

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
  thumbnail_url: string | null
}

const emptyForm: PropertyFormData = { name: '', address: '', city: '', state: '', zip: '', thumbnail_url: null }

interface PropertyFormProps {
  initial?: PropertyFormData
  onSubmit: (data: PropertyFormData) => Promise<void>
  onCancel: () => void
  submitting: boolean
  /** For thumbnail upload path — needs an existing property id (edit mode) or a temp slug (add mode). */
  pathPrefixSeed: string
}

function PropertyForm({ initial = emptyForm, onSubmit, onCancel, submitting, pathPrefixSeed }: PropertyFormProps) {
  const [form, setForm] = useState<PropertyFormData>(initial)
  const [errors, setErrors] = useState<Partial<Record<keyof PropertyFormData, string>>>({})

  const set = (field: keyof PropertyFormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [field]: e.target.value }))
    setErrors((err) => ({ ...err, [field]: undefined }))
  }

  const validate = (): boolean => {
    const e: Partial<Record<keyof PropertyFormData, string>> = {}
    if (!form.name.trim())    e.name    = 'Name is required'
    if (!form.address.trim()) e.address = 'Address is required'
    if (!form.city.trim())    e.city    = 'City is required'
    if (!form.state.trim())   e.state   = 'State is required'
    if (!form.zip.trim())     e.zip     = 'ZIP is required'
    // Geo-block: certain states require state-specific compliance work
    // we haven't completed yet. Manager can still operate properties in
    // other states from the same account.
    if (form.state.trim() && isBlockedState(form.state)) {
      e.state = `FindStoop isn't yet available for properties in ${blockedStateName(form.state)}. Currently paused in: ${BLOCKED_STATES_DISPLAY}.`
    }
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
      <ImageUploader
        currentUrl={form.thumbnail_url}
        onChange={(url) => setForm((f) => ({ ...f, thumbnail_url: url }))}
        pathPrefix={`property-thumbnails/${pathPrefixSeed}`}
        variant="square"
        size={80}
        label="Thumbnail photo"
      />
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
          {submitting ? 'Saving…' : 'Save Property'}
        </button>
      </div>
    </form>
  )
}

// ── Unit count badge ───────────────────────────────────────────────────────────
function UnitCountBadge({ propertyId }: { propertyId: string }) {
  const { units, loading } = useUnitsByProperty(propertyId)
  if (loading) return <span className="text-xs text-gray-500">…</span>
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
  onOpen: (p: Property) => void
}

function PropertyCard({ property, onOpen }: PropertyCardProps) {
  return (
    <div
      className="bg-white rounded-xl border border-gray-200 p-4 hover:border-brand-300 hover:shadow-sm transition cursor-pointer group focus:outline-none focus:ring-2 focus:ring-brand-500"
      onClick={() => onOpen(property)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(property) }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open ${property.name}`}
    >
      <div className="flex items-start gap-4">
        <div className="w-16 h-16 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center">
          {property.thumbnail_url ? (
            <img src={property.thumbnail_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <Building2 className="w-7 h-7 text-mute-400" strokeWidth={1.5} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate group-hover:text-brand-700">{property.name}</h3>
          <p className="text-sm text-gray-500 mt-0.5 truncate">{property.address}</p>
          <p className="text-sm text-gray-500 truncate">{property.city}, {property.state} {property.zip}</p>
          <div className="mt-2">
            <UnitCountBadge propertyId={property.id} />
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-mute-400 group-hover:text-brand-600 shrink-0 self-center" strokeWidth={1.75} />
      </div>
    </div>
  )
}

// ── Properties page ───────────────────────────────────────────────────────────
export default function ManagerProperties() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { properties, loading, add } = useProperties(profile?.id)

  const [addOpen, setAddOpen]       = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleAdd = async (data: PropertyFormData) => {
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
          <p className="text-sm text-gray-500 mt-1">Add your first property to get started</p>
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
              onOpen={(prop) => navigate(`/manager/properties/${prop.id}`)}
            />
          ))}
        </div>
      )}

      {/* Add modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Property">
        <PropertyForm
          onSubmit={handleAdd}
          onCancel={() => setAddOpen(false)}
          submitting={submitting}
          pathPrefixSeed={`new-${profile?.id ?? 'anon'}-${Date.now()}`}
        />
      </Modal>

    </div>
  )
}

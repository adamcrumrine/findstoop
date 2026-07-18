import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useProperties } from '@findstoop/shared/hooks/useProperties'
import { useUnits } from '@findstoop/shared/hooks/useUnits'
import { useTenants } from '@findstoop/shared/hooks/useLeases'
import { inviteTenant } from '@findstoop/shared/api/profiles'
import { formatPhone } from '@findstoop/shared/lib/format'
import type { Profile } from '@findstoop/shared/types/profile'
import type { Lease, LeaseStatus } from '@findstoop/shared/types/lease'
import Modal from '../../components/shared/Modal'
import FormField, { inputClass, selectClass } from '../../components/shared/FormField'
import Avatar from '../../components/shared/Avatar'
import { Users, ChevronRight, Phone } from 'lucide-react'
import { BRAND } from '../../lib/brand'

function Skeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse space-y-2">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gray-200" />
        <div className="flex-1 space-y-1">
          <div className="h-4 bg-gray-200 rounded w-1/3" />
          <div className="h-3 bg-gray-200 rounded w-1/2" />
        </div>
      </div>
    </div>
  )
}

interface TenantCardProps {
  tenant: Profile
  lease: Lease | null
  unitNumber: string | undefined
  propertyName: string | undefined
}

// Status indicator — pill on sm+ (room to spell out the label), tiny
// colored dot on mobile (same hue family, much less space). Matches the
// pattern we use on the lease card so the visual language is consistent
// across the manager surfaces.
const STATUS_PILL: Record<LeaseStatus | 'no_lease', { label: string; cls: string }> = {
  active:     { label: 'Active',       cls: 'bg-green-100 text-green-700' },
  upcoming:   { label: 'Upcoming',     cls: 'bg-blue-100 text-blue-700' },
  pending:    { label: 'Pending',      cls: 'bg-yellow-100 text-yellow-700' },
  expired:    { label: 'Expired',      cls: 'bg-gray-100 text-gray-600' },
  terminated: { label: 'Terminated',   cls: 'bg-red-100 text-red-700' },
  no_lease:   { label: 'No lease',     cls: 'bg-gray-100 text-gray-600' },
}

const STATUS_DOT: Record<LeaseStatus | 'no_lease', string> = {
  active:     'bg-green-500',
  upcoming:   'bg-blue-500',
  pending:    'bg-yellow-500',
  expired:    'bg-gray-400',
  terminated: 'bg-red-500',
  no_lease:   'bg-gray-300',
}

function TenantCard({ tenant, lease, unitNumber, propertyName }: TenantCardProps) {
  const name = tenant.full_name ?? tenant.email ?? 'Unknown'
  const statusKey = lease?.status ?? 'no_lease'
  const pill = STATUS_PILL[statusKey]
  // Stitched single-line metadata: property · unit · rent. Pieces drop
  // out gracefully if any are missing (e.g. tenant with no lease yet).
  const meta = [
    propertyName,
    unitNumber ? `Unit ${unitNumber}` : null,
    lease ? `$${Number(lease.rent_amount).toLocaleString()}/mo` : null,
  ].filter(Boolean).join(' · ')
  return (
    <Link
      to={`/manager/tenants/${tenant.id}`}
      className="block bg-white rounded-xl border border-gray-200 px-4 py-3 hover:border-brand-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-center gap-3">
        <Avatar name={tenant.full_name} email={tenant.email} url={tenant.avatar_url} size={40} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-900 truncate">{name}</p>
            {/* Pill on sm+, dot on mobile. */}
            <span
              className={`hidden sm:inline-flex text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${pill.cls}`}
            >
              {pill.label}
            </span>
            <span
              className={`sm:hidden inline-block w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[statusKey]}`}
              aria-label={pill.label}
              title={pill.label}
            />
          </div>
          <p className="text-xs text-gray-500 truncate">{tenant.email}</p>
          {/* Property · unit · rent on a single inline line below contact
              info. Replaces the 3-column grid + divider so each card
              loses ~40px of vertical real estate. */}
          {meta && <p className="text-xs text-gray-600 truncate mt-0.5">{meta}</p>}
          {tenant.phone && (
            <p className="text-[11px] text-gray-400 mt-0.5 inline-flex items-center gap-1">
              <Phone className="w-3 h-3" strokeWidth={1.75} />
              {formatPhone(tenant.phone)}
            </p>
          )}
        </div>
        <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" strokeWidth={2} aria-hidden="true" />
      </div>
    </Link>
  )
}

// Pick the "best" lease to display per tenant: active first, then upcoming,
// then pending, then most-recently-created. Keeps the card consistent for
// tenants whose only lease is future-dated or still in draft.
function pickPrimaryLease(leases: Lease[]): Lease | null {
  if (leases.length === 0) return null
  const order: LeaseStatus[] = ['active', 'upcoming', 'pending', 'expired', 'terminated']
  for (const s of order) {
    const hit = leases.find((l) => l.status === s)
    if (hit) return hit
  }
  return leases[0] ?? null
}

interface InviteFormData { email: string; fullName: string; applyUnitId: string }

export default function ManagerTenants() {
  const { profile } = useAuth()
  const { properties } = useProperties(profile?.id)
  const propertyIds = useMemo(() => properties.map((p) => p.id), [properties])
  const { units } = useUnits(propertyIds)
  const { tenants, leases, loading, getLeasesForTenant } = useTenants(
    useMemo(() => units.map((u) => u.id), [units])
  )

  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteForm, setInviteForm] = useState<InviteFormData>({ email: '', fullName: '', applyUnitId: '' })
  const [inviteErrors, setInviteErrors] = useState<Partial<InviteFormData>>({})
  const [inviting, setInviting] = useState(false)
  // Filter state: property dropdown + lease-status dropdown + free-text
  // search across name/email/phone.
  const [filterPropertyId, setFilterPropertyId] = useState<'all' | string>('all')
  // Default to "active" — landlords almost always want to see current
  // renters on first load. They can switch to "Any" to see upcoming/expired.
  const [filterStatus, setFilterStatus] = useState<'all' | LeaseStatus | 'no_lease'>('active')
  const [filterQuery, setFilterQuery] = useState('')

  const unitMap = useMemo(() => Object.fromEntries(units.map((u) => [u.id, u])), [units])
  const propertyMap = useMemo(() => Object.fromEntries(properties.map((p) => [p.id, p])), [properties])

  // suppress unused variable warning — leases isn't read directly here,
  // but useTenants returns it for callers that need the raw list
  void leases

  // Apply property + status + text filters. Property match resolves via
  // any lease the tenant is on → its unit → property, so tenants on
  // upcoming/pending leases still match the property filter.
  const filteredTenants = useMemo(() => {
    const q = filterQuery.trim().toLowerCase()
    return tenants.filter((t) => {
      const tenantLeases = getLeasesForTenant(t.id)
      // Property filter — tenant matches if any of their leases is on
      // a unit at the selected property.
      if (filterPropertyId !== 'all') {
        const anyLeaseAtProp = tenantLeases.some((l) => {
          const unit = unitMap[l.unit_id]
          return unit && unit.property_id === filterPropertyId
        })
        if (!anyLeaseAtProp) return false
      }
      // Status filter — "no_lease" means tenant exists but has zero leases
      // (e.g., invited but never assigned). Otherwise match if any lease
      // on the tenant has the selected status.
      if (filterStatus !== 'all') {
        if (filterStatus === 'no_lease') {
          if (tenantLeases.length > 0) return false
        } else {
          if (!tenantLeases.some((l) => l.status === filterStatus)) return false
        }
      }
      if (q) {
        const hay = `${t.full_name ?? ''} ${t.email ?? ''} ${t.phone ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [tenants, filterPropertyId, filterStatus, filterQuery, getLeasesForTenant, unitMap])

  const validateInvite = () => {
    const e: Partial<InviteFormData> = {}
    if (!inviteForm.email.trim() || !/\S+@\S+\.\S+/.test(inviteForm.email)) e.email = 'Valid email required'
    if (!inviteForm.fullName.trim()) e.fullName = 'Full name required'
    setInviteErrors(e)
    return Object.keys(e).length === 0
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateInvite()) return
    setInviting(true)
    try {
      const result = await inviteTenant(inviteForm.email, inviteForm.fullName, inviteForm.applyUnitId || undefined)
      if (result.alreadyExists) {
        const who = result.name && result.name !== inviteForm.email ? `${result.name} (${inviteForm.email})` : inviteForm.email
        toast(`${who} is already on ${BRAND.name} — no invite email sent. Add them to a lease from the Leases page.`, {
          icon: 'ℹ️',
          duration: 6000,
        })
      } else {
        toast.success(`Invite sent to ${inviteForm.email}`)
      }
      setInviteOpen(false)
      setInviteForm({ email: '', fullName: '', applyUnitId: '' })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send invite')
    } finally {
      setInviting(false)
    }
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tenants</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filteredTenants.length === tenants.length
              ? `${tenants.length} tenant${tenants.length !== 1 ? 's' : ''}`
              : `${filteredTenants.length} of ${tenants.length} tenant${tenants.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={() => setInviteOpen(true)}
          className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors shrink-0"
        >
          + Invite Tenant
        </button>
      </div>

      {/* Filters — property dropdown + name/email search. Hide when the
          tenant list is empty so the empty state isn't cluttered. */}
      {!loading && tenants.length > 0 && (
        <div className="flex gap-2 flex-wrap items-center bg-white border border-gray-200 rounded-xl p-2.5">
          <select
            value={filterPropertyId}
            onChange={(e) => setFilterPropertyId(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">All properties</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name ?? p.address}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'all' | LeaseStatus | 'no_lease')}
            className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">Any lease status</option>
            <option value="active">Active</option>
            <option value="upcoming">Upcoming</option>
            <option value="pending">Pending</option>
            <option value="expired">Expired</option>
            <option value="terminated">Terminated</option>
            <option value="no_lease">No lease yet</option>
          </select>
          <input
            type="search"
            placeholder="Search by name, email, or phone…"
            enterKeyHint="search"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="flex-1 min-w-[200px] text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {(filterPropertyId !== 'all' || filterStatus !== 'all' || filterQuery) && (
            <button
              type="button"
              onClick={() => { setFilterPropertyId('all'); setFilterStatus('all'); setFilterQuery('') }}
              className="text-xs text-mute hover:text-ink px-2"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-3"><Skeleton /><Skeleton /><Skeleton /></div>
      ) : tenants.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Users className="w-12 h-12 mx-auto mb-3 text-mute-400" strokeWidth={1.5} />
          <p className="font-semibold text-gray-700">No tenants yet</p>
          <p className="text-sm text-gray-500 mt-1">Invite a tenant or create a lease to get started</p>
          <button
            onClick={() => setInviteOpen(true)}
            className="mt-4 bg-brand-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            Invite Tenant
          </button>
        </div>
      ) : filteredTenants.length === 0 ? (
        <div className="text-center py-10 bg-white rounded-xl border border-gray-200">
          <p className="text-sm text-gray-500">No tenants match the current filter.</p>
          <button
            type="button"
            onClick={() => { setFilterPropertyId('all'); setFilterStatus('all'); setFilterQuery('') }}
            className="mt-2 text-sm font-medium text-brand-700 hover:text-brand-800"
          >
            Clear filter
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTenants.map((tenant) => {
            const lease = pickPrimaryLease(getLeasesForTenant(tenant.id))
            const unit = lease ? unitMap[lease.unit_id] : undefined
            const property = unit ? propertyMap[unit.property_id] : undefined
            return (
              <TenantCard
                key={tenant.id}
                tenant={tenant}
                lease={lease}
                unitNumber={unit?.unit_number}
                propertyName={property?.name}
              />
            )
          })}
        </div>
      )}

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite Tenant">
        <form onSubmit={handleInvite} className="space-y-4">
          <p className="text-sm text-gray-500">
            The tenant will receive an email to set up their account and access the tenant portal.
          </p>
          <FormField label="Full Name" required error={inviteErrors.fullName}>
            <input
              className={inputClass}
              value={inviteForm.fullName}
              onChange={(e) => { setInviteForm((f) => ({ ...f, fullName: e.target.value })); setInviteErrors((err) => ({ ...err, fullName: undefined })) }}
              placeholder="Jane Smith"
            />
          </FormField>
          <FormField label="Email Address" required error={inviteErrors.email}>
            <input
              className={inputClass}
              type="email"
              value={inviteForm.email}
              onChange={(e) => { setInviteForm((f) => ({ ...f, email: e.target.value })); setInviteErrors((err) => ({ ...err, email: undefined })) }}
              placeholder="jane@example.com"
            />
          </FormField>
          <FormField label="Send rental application link (optional)">
            {units.length === 0 ? (
              <p className="text-xs text-mute italic">
                Add a property and unit first to share an application link in the invite email.
              </p>
            ) : (
              <>
                <select
                  className={selectClass}
                  value={inviteForm.applyUnitId}
                  onChange={(e) => setInviteForm((f) => ({ ...f, applyUnitId: e.target.value }))}
                >
                  <option value="">Don't include an application link</option>
                  {units.map((u) => {
                    const propName = propertyMap[u.property_id]?.name ?? 'Property'
                    return (
                      <option key={u.id} value={u.id}>
                        {propName} — Unit {u.unit_number} (${Number(u.rent_amount).toLocaleString()}/mo) · {u.status}
                      </option>
                    )
                  })}
                </select>
                <p className="text-xs text-mute mt-1.5">
                  Pick a unit to embed a public rental-application link in the invite email.
                </p>
              </>
            )}
          </FormField>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setInviteOpen(false)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={inviting} className="flex-1 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors">
              {inviting ? 'Sending…' : 'Send Invite'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

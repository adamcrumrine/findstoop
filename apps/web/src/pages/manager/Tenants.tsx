import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useProperties } from '@findstoop/shared/hooks/useProperties'
import { useUnits } from '@findstoop/shared/hooks/useUnits'
import { useTenants } from '@findstoop/shared/hooks/useLeases'
import { inviteTenant } from '@findstoop/shared/api/profiles'
import type { Profile } from '@findstoop/shared/types/profile'
import type { Lease } from '@findstoop/shared/types/lease'
import Modal from '../../components/shared/Modal'
import FormField, { inputClass, selectClass } from '../../components/shared/FormField'
import Avatar from '../../components/shared/Avatar'
import { Users } from 'lucide-react'

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
  activeLease: Lease | null
  unitNumber: string | undefined
  propertyName: string | undefined
}

function TenantCard({ tenant, activeLease, unitNumber, propertyName }: TenantCardProps) {
  const name = tenant.full_name ?? tenant.email ?? 'Unknown'
  return (
    <Link to={`/manager/tenants/${tenant.id}`} className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all">
      <div className="flex items-center gap-3">
        <Avatar name={tenant.full_name} email={tenant.email} url={tenant.avatar_url} size={40} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{name}</p>
          <p className="text-sm text-gray-500 truncate">{tenant.email}</p>
          {tenant.phone && <p className="text-sm text-gray-500">{tenant.phone}</p>}
        </div>
        {activeLease && (
          <span className="text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full shrink-0">
            Active
          </span>
        )}
      </div>
      {activeLease && (
        <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-3 gap-2 text-xs text-gray-500">
          <div>
            <p className="text-gray-500 uppercase tracking-wide">Unit</p>
            <p className="font-medium text-gray-700 mt-0.5">{unitNumber ?? '—'}</p>
          </div>
          <div>
            <p className="text-gray-500 uppercase tracking-wide">Property</p>
            <p className="font-medium text-gray-700 mt-0.5 truncate">{propertyName ?? '—'}</p>
          </div>
          <div>
            <p className="text-gray-500 uppercase tracking-wide">Rent</p>
            <p className="font-medium text-gray-700 mt-0.5">${Number(activeLease.rent_amount).toLocaleString()}/mo</p>
          </div>
        </div>
      )}
    </Link>
  )
}

interface InviteFormData { email: string; fullName: string; applyUnitId: string }

export default function ManagerTenants() {
  const { profile } = useAuth()
  const { properties } = useProperties(profile?.id)
  const propertyIds = useMemo(() => properties.map((p) => p.id), [properties])
  const { units } = useUnits(propertyIds)
  const { tenants, leases, loading, getActiveLease } = useTenants(
    useMemo(() => units.map((u) => u.id), [units])
  )

  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteForm, setInviteForm] = useState<InviteFormData>({ email: '', fullName: '', applyUnitId: '' })
  const [inviteErrors, setInviteErrors] = useState<Partial<InviteFormData>>({})
  const [inviting, setInviting] = useState(false)

  const unitMap = useMemo(() => Object.fromEntries(units.map((u) => [u.id, u])), [units])
  const propertyMap = useMemo(() => Object.fromEntries(properties.map((p) => [p.id, p])), [properties])

  // suppress unused variable warning — leases is used via getActiveLease
  void leases

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
        toast(`${who} is already on FindStoop — no invite email sent. Add them to a lease from the Leases page.`, {
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tenants</h1>
          <p className="text-sm text-gray-500 mt-0.5">{tenants.length} tenant{tenants.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setInviteOpen(true)}
          className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
        >
          + Invite Tenant
        </button>
      </div>

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
      ) : (
        <div className="space-y-3">
          {tenants.map((tenant) => {
            const activeLease = getActiveLease(tenant.id)
            const unit = activeLease ? unitMap[activeLease.unit_id] : undefined
            const property = unit ? propertyMap[unit.property_id] : undefined
            return (
              <TenantCard
                key={tenant.id}
                tenant={tenant}
                activeLease={activeLease}
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

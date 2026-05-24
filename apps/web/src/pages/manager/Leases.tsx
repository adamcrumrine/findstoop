import { useState, useMemo, useEffect } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useProperties } from '@findstoop/shared/hooks/useProperties'
import { useUnits } from '@findstoop/shared/hooks/useUnits'
import { useLeases } from '@findstoop/shared/hooks/useLeases'
import type { LeaseWithTenant } from '@findstoop/shared/hooks/useLeases'
import type { LeaseStatus } from '@findstoop/shared/types/lease'
import { supabase } from '../../lib/supabase'
import { FileText, FileSignature, Send, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import LeaseWizard from '../../components/manager/LeaseWizard'

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

// ── Lease card ────────────────────────────────────────────────────────────────
interface LeaseCardProps {
  lease: LeaseWithTenant
  unitNumber: string
  propertyName: string
  signedRoles?: Set<string>
  onUpdateStatus: (id: string, status: LeaseStatus) => void
  onSendForSignature: (lease: LeaseWithTenant) => Promise<void>
  sendingId: string | null
}

function LeaseCard({ lease, unitNumber, propertyName, signedRoles, onUpdateStatus, onSendForSignature, sendingId }: LeaseCardProps) {
  const tenantName = lease.profile?.full_name ?? lease.profile?.email ?? 'Unknown tenant'
  const daysLeft = Math.ceil((new Date(lease.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  const sending = sendingId === lease.id
  const sentLabel = lease.sent_for_signature_at
    ? `Sent ${new Date(lease.sent_for_signature_at).toLocaleDateString()}`
    : null
  const tenantSigned = !!signedRoles?.has('tenant')
  const managerSigned = !!(signedRoles?.has('manager') || signedRoles?.has('admin'))

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
            <div><span className="text-gray-500">Start:</span> {new Date(lease.start_date).toLocaleDateString()}</div>
            <div><span className="text-gray-500">End:</span> {new Date(lease.end_date).toLocaleDateString()}</div>
            <div><span className="text-gray-500">Rent:</span> ${Number(lease.rent_amount).toLocaleString()}/mo</div>
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
      <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs text-mute inline-flex items-center gap-1.5">
          {lease.signed_at || (tenantSigned && managerSigned) ? (
            <>
              <FileSignature className="w-3.5 h-3.5 text-green-600" strokeWidth={1.75} />
              Fully signed
            </>
          ) : tenantSigned ? (
            <>
              <FileSignature className="w-3.5 h-3.5 text-amber-600" strokeWidth={1.75} />
              Tenant signed · awaiting your signature
            </>
          ) : sentLabel ? (
            <>
              <Send className="w-3.5 h-3.5 text-brand-600" strokeWidth={1.75} />
              {sentLabel} · awaiting tenant signature
            </>
          ) : (
            <>
              <FileSignature className="w-3.5 h-3.5" strokeWidth={1.75} />
              Draft — not yet sent
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {!lease.signed_at && lease.status === 'pending' && (
            <button
              type="button"
              onClick={() => onSendForSignature(lease)}
              disabled={sending}
              className="text-xs font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
              title={sentLabel ? 'Re-send the signature email to the tenant' : 'Email the tenant a link to review and sign'}
            >
              {sending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
                : <Send className="w-3.5 h-3.5" strokeWidth={1.75} />}
              {sentLabel ? 'Re-send for signature' : 'Send for signature'}
            </button>
          )}
          <Link
            to={`/manager/review-lease/${lease.id}`}
            className="text-xs font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"
          >
            {lease.signed_at || (tenantSigned && managerSigned) ? 'View →' : 'Review →'}
          </Link>
        </div>
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
  const { leases, loading, update, reload } = useLeases(unitIds)

  const [filterStatus, setFilterStatus] = useState<LeaseStatus | 'all'>('all')
  const [wizardOpen, setWizardOpen] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)
  // Map of leaseId → roles that have signed. Lets us distinguish
  // "awaiting tenant" from "awaiting your countersignature".
  const [signedRoles, setSignedRoles] = useState<Record<string, Set<string>>>({})

  const leaseIdsKey = leases.map((l) => l.id).sort().join(',')

  useEffect(() => {
    if (!leases.length) { setSignedRoles({}); return }
    let cancelled = false
    ;(async () => {
      const ids = leases.map((l) => l.id)
      const { data } = await supabase
        .from('lease_signatures')
        .select('lease_id, signer_role')
        .in('lease_id', ids)
      if (cancelled) return
      const map: Record<string, Set<string>> = {}
      for (const s of (data ?? []) as Array<{ lease_id: string; signer_role: string }>) {
        if (!map[s.lease_id]) map[s.lease_id] = new Set()
        map[s.lease_id].add(s.signer_role)
      }
      setSignedRoles(map)
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaseIdsKey])

  const unitMap = useMemo(() => Object.fromEntries(units.map((u) => [u.id, u])), [units])
  const propertyMap = useMemo(() => Object.fromEntries(properties.map((p) => [p.id, p])), [properties])

  const filtered = filterStatus === 'all' ? leases : leases.filter((l) => l.status === filterStatus)

  const handleStatusUpdate = async (id: string, status: LeaseStatus) => {
    try {
      await update(id, { status })
      toast.success('Lease status updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update lease')
    }
  }

  const handleSendForSignature = async (lease: LeaseWithTenant) => {
    setSendingId(lease.id)
    const toastId = toast.loading('Sending lease to tenant…')
    const { data, error } = await supabase.functions.invoke('notify-tenant-lease-ready', {
      body: { leaseId: lease.id },
    })
    setSendingId(null)
    if (error || data?.error) {
      toast.error((error?.message ?? data?.error) || 'Could not send lease', { id: toastId })
      return
    }
    const who = lease.profile?.full_name ?? lease.profile?.email ?? 'tenant'
    toast.success(`Lease sent to ${who} for signature`, { id: toastId })
    reload()
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leases</h1>
          <p className="text-sm text-gray-500 mt-0.5">{filtered.length} lease{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setWizardOpen(true)}
          disabled={units.length === 0}
          className="inline-flex items-center gap-1.5 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-40 transition-colors"
        >
          + Add
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
          <p className="text-sm text-gray-500 mt-1">
            {leases.length === 0 ? 'Create your first lease to get started' : 'Try a different status filter'}
          </p>
          {leases.length === 0 && units.length > 0 && (
            <button onClick={() => setWizardOpen(true)} className="mt-4 bg-brand-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors">
              + Add lease
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
                signedRoles={signedRoles[lease.id]}
                onUpdateStatus={handleStatusUpdate}
                onSendForSignature={handleSendForSignature}
                sendingId={sendingId}
              />
            )
          })}
        </div>
      )}

      <LeaseWizard open={wizardOpen} onClose={() => setWizardOpen(false)} onCreated={() => reload()} />
    </div>
  )
}

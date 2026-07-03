import { useState, useMemo, useEffect } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useProperties } from '@findstoop/shared/hooks/useProperties'
import { useUnits } from '@findstoop/shared/hooks/useUnits'
import { useLeases } from '@findstoop/shared/hooks/useLeases'
import type { LeaseWithTenant } from '@findstoop/shared/hooks/useLeases'
import type { LeaseStatus } from '@findstoop/shared/types/lease'
import type { Profile } from '@findstoop/shared/types/profile'
import { supabase } from '../../lib/supabase'
import { FileText, FileSignature, Send, Loader2, CheckCircle2, ChevronRight, Pencil } from 'lucide-react'
import Avatar from '../../components/shared/Avatar'
import { Link, useSearchParams } from 'react-router-dom'
import LeaseWizard from '../../components/manager/LeaseWizard'
import RenewalAdvisor from '../../components/manager/RenewalAdvisor'
import DepositReturnAdvisor from '../../components/manager/DepositReturnAdvisor'
import DepositReturnWizard from '../../components/manager/DepositReturnWizard'

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
  upcoming:   'bg-blue-100 text-blue-700',
  pending:    'bg-yellow-100 text-yellow-700',
  expired:    'bg-gray-100 text-gray-600',
  terminated: 'bg-red-100 text-red-700',
}

// Solid dot color for the footer status indicator — same hue as the pill
// background, but bumped two shades darker so it pops against white.
const statusDot: Record<LeaseStatus, string> = {
  active:     'bg-green-500',
  upcoming:   'bg-blue-500',
  pending:    'bg-yellow-500',
  expired:    'bg-gray-400',
  terminated: 'bg-red-500',
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
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const startDate = new Date(lease.start_date); startDate.setHours(0, 0, 0, 0)
  const daysLeft = Math.ceil((new Date(lease.end_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  const daysUntilStart = Math.ceil((startDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  // Derived display states:
  //   isUpcoming:     status is 'upcoming' (signed lease, hasn't started yet)
  //   isMonthToMonth: active lease whose original term has lapsed
  //   daysUntilMoveOut: M2M-only — count down to the manager-entered
  //                     tentative_move_out_date when the tenant gives soft
  //                     notice they're moving out.
  const isUpcoming     = lease.status === 'upcoming'
  const isMonthToMonth = !!lease.month_to_month || (lease.status === 'active' && daysLeft <= 0)
  const moveOutDate    = lease.tentative_move_out_date
    ? (() => { const d = new Date(lease.tentative_move_out_date); d.setHours(0, 0, 0, 0); return d })()
    : null
  const daysUntilMoveOut = moveOutDate
    ? Math.ceil((moveOutDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    : null
  const sending = sendingId === lease.id
  const [statusEditing, setStatusEditing] = useState(false)
  const sentLabel = lease.sent_for_signature_at
    ? `Sent ${new Date(lease.sent_for_signature_at).toLocaleDateString()}`
    : null
  const tenantSigned = !!signedRoles?.has('tenant')
  const managerSigned = !!(signedRoles?.has('manager') || signedRoles?.has('admin'))
  // All tenants for the avatar stack (primary + co-tenants). Falls back to
  // just the legacy primary if the hook didn't populate all_tenants.
  const tenants: Profile[] = (lease.all_tenants && lease.all_tenants.length > 0)
    ? lease.all_tenants
    : (lease.profile ? [lease.profile] : [])
  // Display label for the lease — first primary's name, falling back to
  // the first tenant if no primary is set in the join table.
  const primaryName = lease.profile?.full_name ?? lease.profile?.email ?? tenants[0]?.full_name ?? tenants[0]?.email ?? 'Unknown tenant'
  // "Executed externally" means: the lease has been recorded as active but
  // Stoop's e-sign flow never ran. We can't always distinguish from
  // here without fetching documents, so we approximate: status='active'
  // and no signed_at means the lease was either imported, M2M, or had its
  // PDF attached out-of-band. All cases should NOT read "Draft — not yet
  // sent." We use the more accurate "Signed lease on file" label.
  const looksExecutedExternally =
    (lease.status === 'active' || lease.status === 'upcoming'
      || lease.status === 'expired' || lease.status === 'terminated')
    && !lease.signed_at && !tenantSigned && !managerSigned && !sentLabel

  // Right-column countdown copy. Empty string when there's nothing to
  // surface for this lease state (e.g., expired / terminated).
  const countdown: { label: string; tone: string } | null = (() => {
    if (lease.status !== 'active' && lease.status !== 'upcoming') return null
    if (isUpcoming) {
      const d = Math.max(0, daysUntilStart)
      return { label: `Starts in ${d}d`, tone: d < 30 ? 'text-yellow-600 font-medium' : 'text-gray-700' }
    }
    if (isMonthToMonth) {
      if (daysUntilMoveOut != null) {
        const d = daysUntilMoveOut
        if (d < 0)  return { label: `${Math.abs(d)}d past move-out`, tone: 'text-red-600 font-medium' }
        if (d === 0) return { label: 'Move-out today', tone: 'text-red-600 font-medium' }
        return { label: `${d}d to move-out`, tone: d < 30 ? 'text-yellow-600 font-medium' : 'text-gray-700' }
      }
      return null
    }
    if (daysLeft > 0) {
      return { label: `${daysLeft}d left`, tone: daysLeft < 30 ? 'text-yellow-600 font-medium' : 'text-gray-700' }
    }
    return null
  })()

  const fullySigned = lease.signed_at || (tenantSigned && managerSigned)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      {/* ── Header: avatar stack + name (truncate) + status pill + an
          icon-only Review/View button anchored to the top-right corner.
          The icon replaces the old footer link to keep the action visible
          but unobtrusive on mobile. */}
      <div className="flex items-start gap-3">
        {tenants.length > 0 && (
          <div className="flex -space-x-2 shrink-0">
            {tenants.slice(0, 5).map((t) => (
              <span
                key={t.id}
                title={t.full_name ?? t.email ?? 'Tenant'}
                className="inline-block ring-2 ring-white rounded-full"
              >
                <Avatar name={t.full_name} email={t.email} url={t.avatar_url} size={28} />
              </span>
            ))}
            {tenants.length > 5 && (
              <span
                title={tenants.slice(5).map((t) => t.full_name ?? t.email).join(', ')}
                className="inline-flex items-center justify-center w-7 h-7 ring-2 ring-white rounded-full bg-gray-200 text-[10px] font-semibold text-gray-700"
              >
                +{tenants.length - 5}
              </span>
            )}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 truncate">
              {tenants.length > 1 ? `${primaryName} +${tenants.length - 1}` : primaryName}
            </h3>
            {/* Status pill — hidden on mobile (footer dropdown shows the
                same info), shown on sm+ where there's room. */}
            <span className={`hidden sm:inline-flex text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded ${statusColors[lease.status]}`}>
              {lease.status}
            </span>
            {/* M2M is a derived state not surfaced elsewhere — keep it
                visible on every breakpoint so the manager can tell at a
                glance that the original term has lapsed. */}
            {isMonthToMonth && (
              <span
                className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded text-amber-800 bg-amber-100"
                title={`Original term ended ${new Date(lease.end_date).toLocaleDateString()} — now month-to-month`}
              >
                M2M
              </span>
            )}
          </div>
        </div>
        <Link
          to={`/manager/review-lease/${lease.id}`}
          aria-label={fullySigned ? 'View lease' : 'Review lease'}
          title={fullySigned ? 'View lease' : 'Review lease'}
          className="shrink-0 -mt-1 -mr-1 p-2 rounded-lg text-brand-600 hover:bg-brand-50 transition-colors"
        >
          <ChevronRight className="w-5 h-5" strokeWidth={2} />
        </Link>
      </div>

      {/* Property — flush to the card's left edge, full width below the
          header so the address has the whole card to breathe in. */}
      <p className="text-xs text-gray-500 mt-2 truncate">{propertyName} — Unit {unitNumber}</p>

      {/* ── Term + Rent on one row, separated by a dot. Countdown gets
          its own line so the days-left/move-out signal stays visible. ── */}
      <div className="mt-3 text-xs">
        <p className="text-gray-700 tabular-nums flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span>
            <span className="text-gray-400 mr-1.5">Term</span>
            {new Date(lease.start_date).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: '2-digit' })}
            {' – '}
            {new Date(lease.end_date).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: '2-digit' })}
            {/* An active lease showing a long-past term reads like a data bug —
                say explicitly that it rolled over to month-to-month. */}
            {isMonthToMonth && daysLeft <= 0 && (
              <span className="text-gray-500"> · now month-to-month</span>
            )}
          </span>
          <span className="text-gray-300">·</span>
          <span>
            <span className="text-gray-400 mr-1.5">Rent</span>
            ${Number(lease.rent_amount).toLocaleString()}/mo
          </span>
        </p>
        {countdown && (
          <p className={`tabular-nums mt-1 ${countdown.tone}`}>{countdown.label}</p>
        )}
      </div>

      {/* ── Footer: signature state + admin controls (Review icon lives
          in the header now, so the footer is just signature copy + the
          status dropdown + send-for-signature when relevant). */}
      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs text-mute inline-flex items-center gap-1.5">
          {fullySigned ? (
            <>
              <FileSignature className="w-3.5 h-3.5 text-green-600" strokeWidth={1.75} />
              Fully signed
            </>
          ) : tenantSigned ? (
            <>
              <FileSignature className="w-3.5 h-3.5 text-amber-600" strokeWidth={1.75} />
              Tenant signed · awaiting yours
            </>
          ) : sentLabel ? (
            <>
              <Send className="w-3.5 h-3.5 text-brand-600" strokeWidth={1.75} />
              {sentLabel}
            </>
          ) : looksExecutedExternally ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" strokeWidth={1.75} />
              Signed lease on file
            </>
          ) : (
            <>
              <FileSignature className="w-3.5 h-3.5" strokeWidth={1.75} />
              Draft — not yet sent
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
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
              {sentLabel ? 'Re-send' : 'Send'}
            </button>
          )}
          {/* Status dot — same hue family as the (now hidden on mobile)
              pill; tiny enough to live inline without crowding. */}
          <span
            className={`inline-block w-2 h-2 rounded-full shrink-0 ${statusDot[lease.status]}`}
            aria-hidden="true"
          />
          {/* Status is a mostly-derived state — a permanently-live select on
              every card invited accidental edits while scrolling. Read-only
              until the pencil is clicked; the select closes on change/blur. */}
          {statusEditing ? (
            <select
              autoFocus
              value={lease.status}
              onChange={(e) => { onUpdateStatus(lease.id, e.target.value as LeaseStatus); setStatusEditing(false) }}
              onBlur={() => setStatusEditing(false)}
              className="text-xs border border-gray-200 rounded-lg px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
              title="Change lease status"
            >
              <option value="pending">Pending</option>
              <option value="upcoming">Upcoming</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="terminated">Terminated</option>
            </select>
          ) : (
            <button
              type="button"
              onClick={() => setStatusEditing(true)}
              className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-ink px-1.5 py-1 rounded-lg hover:bg-gray-50 transition-colors"
              title="Change lease status"
            >
              <span className="capitalize">{lease.status}</span>
              <Pencil className="w-3 h-3 text-gray-400" strokeWidth={1.75} />
            </button>
          )}
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
  // Lease currently open in the Deposit Return wizard (null = closed).
  const [depositLease, setDepositLease] = useState<LeaseWithTenant | null>(null)
  // Deep link: /manager/leases?deposit=<leaseId> opens the Deposit Return
  // wizard directly — the turnover checklist links here. Param is cleared
  // once consumed so closing the wizard doesn't re-open it.
  const [searchParams, setSearchParams] = useSearchParams()
  const depositParam = searchParams.get('deposit')
  useEffect(() => {
    if (!depositParam || loading) return
    const target = leases.find((l) => l.id === depositParam)
    if (target) setDepositLease(target)
    const next = new URLSearchParams(searchParams)
    next.delete('deposit')
    setSearchParams(next, { replace: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depositParam, loading])
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
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leases</h1>
          <p className="text-sm text-gray-500 mt-0.5">{filtered.length} lease{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/manager/leases/attach"
            className="inline-flex items-center gap-1.5 border border-gray-300 hover:bg-gray-50 text-ink px-3 py-2 rounded-lg text-sm font-medium transition-colors"
            title="Attach signed-lease PDFs to existing leases"
          >
            <FileText className="w-4 h-4" strokeWidth={1.75} />
            Attach signed leases
          </Link>
          <button
            onClick={() => setWizardOpen(true)}
            disabled={units.length === 0}
            className="inline-flex items-center gap-1.5 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-40 transition-colors"
          >
            + Add
          </button>
        </div>
      </div>

      {/* Renewal advisor — active leases ending soon, with a suggested
          renewal rent and a one-click prefilled offer letter. */}
      {!loading && (
        <RenewalAdvisor leases={leases} unitMap={unitMap} propertyMap={propertyMap} />
      )}

      {/* Deposit return advisor — tenancies that just ended (or end soon)
          with a held deposit: statutory-deadline countdown + wizard entry. */}
      {!loading && (
        <DepositReturnAdvisor
          leases={leases}
          unitMap={unitMap}
          propertyMap={propertyMap}
          onStart={setDepositLease}
        />
      )}

      {/* Filter — native dropdown on mobile (compact + native picker UX),
          pill row on sm+ where horizontal room is no problem. */}
      {!loading && leases.length > 0 && (() => {
        const opts = (['all', 'active', 'upcoming', 'pending', 'expired', 'terminated'] as const)
        const countFor = (s: LeaseStatus | 'all') =>
          s === 'all' ? leases.length : leases.filter((l) => l.status === s).length
        return (
          <>
            {/* Mobile — single select */}
            <div className="sm:hidden">
              <label className="sr-only" htmlFor="lease-filter">Filter leases by status</label>
              <div className="relative inline-flex items-center">
                {filterStatus !== 'all' && (
                  <span
                    className={`absolute left-3 w-2 h-2 rounded-full ${statusDot[filterStatus as LeaseStatus]} pointer-events-none`}
                    aria-hidden="true"
                  />
                )}
                <select
                  id="lease-filter"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as LeaseStatus | 'all')}
                  className={`text-sm font-medium border border-gray-200 rounded-lg py-2 pr-8 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 capitalize ${filterStatus !== 'all' ? 'pl-7' : 'pl-3'}`}
                >
                  {opts.map((s) => (
                    <option key={s} value={s} className="capitalize">
                      {s} ({countFor(s)})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* sm+ — full pill row */}
            <div className="hidden sm:flex gap-2 flex-wrap">
              {opts.map((s) => {
                const active = filterStatus === s
                return (
                  <button
                    key={s}
                    onClick={() => setFilterStatus(s)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize whitespace-nowrap ${
                      active
                        ? 'bg-brand-600 text-white border border-brand-600'
                        : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {s !== 'all' && (
                      <span
                        className={`inline-block w-1.5 h-1.5 rounded-full ${active ? 'bg-white/80' : statusDot[s as LeaseStatus]}`}
                        aria-hidden="true"
                      />
                    )}
                    <span>{s} <span className={active ? 'text-white/80' : 'text-gray-400'}>({countFor(s)})</span></span>
                  </button>
                )
              })}
            </div>
          </>
        )
      })()}

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

      {depositLease && (
        <DepositReturnWizard
          lease={depositLease}
          unit={unitMap[depositLease.unit_id]}
          property={unitMap[depositLease.unit_id] ? propertyMap[unitMap[depositLease.unit_id].property_id] : undefined}
          onClose={() => setDepositLease(null)}
        />
      )}
    </div>
  )
}

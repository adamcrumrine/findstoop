import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { FileSignature, ChevronRight, CreditCard } from 'lucide-react'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useManagerDashboard } from '@findstoop/shared/hooks/useManagerDashboard'
import { formatUsd, formatUsdCents } from '@findstoop/shared/lib/format'
import { rowStatus, paymentAnchor } from '@findstoop/shared/lib/paymentRails'
import MonthlyDonut from '../../components/manager/MonthlyDonut'
import type { Payment } from '@findstoop/shared/types/payment'
import type { MaintenanceRequest } from '@findstoop/shared/types/maintenance'
import type { Lease } from '@findstoop/shared/types/lease'

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className ?? ''}`} />
}

// ── Stat card ─────────────────────────────────────────────────────────────────
// Neutral white cards by default. The optional `accent` lets us put a brand
// dot on the label or color the value text for emphasis without painting the
// whole container green.
interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  accent?: 'brand' | 'red' | 'amber' | 'none'
  loading: boolean
}

function StatCard({ label, value, sub, accent = 'none', loading }: StatCardProps) {
  const valueCls =
    accent === 'brand' ? 'text-brand-700' :
    accent === 'red'   ? 'text-red-700' :
    accent === 'amber' ? 'text-amber-700' : 'text-gray-800'
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      {loading ? (
        <Skeleton className="h-8 w-24 mt-2" />
      ) : (
        <p className={`text-2xl font-bold mt-1 ${valueCls}`}>{value}</p>
      )}
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}


// ── Payment row ───────────────────────────────────────────────────────────────
function PaymentRow({ payment }: { payment: Payment }) {
  const status = rowStatus(payment)
  const anchor = paymentAnchor(payment)
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <div>
        <p className="text-sm font-medium text-gray-800 capitalize">{payment.type.replace(/_/g, ' ')}</p>
        <p className="text-xs text-gray-500">{new Date(anchor).toLocaleDateString()}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${status.cls}`}>
          {status.label}
        </span>
        <span className="text-sm font-semibold text-gray-800">{formatUsdCents(Number(payment.amount))}</span>
      </div>
    </div>
  )
}

// ── Maintenance row ───────────────────────────────────────────────────────────
function MaintenanceRow({ request }: { request: MaintenanceRequest }) {
  const priorityColor =
    request.priority === 'emergency' ? 'bg-red-100 text-red-700' :
    request.priority === 'high'      ? 'bg-orange-100 text-orange-700' :
    request.priority === 'medium'    ? 'bg-yellow-100 text-yellow-700' :
    'bg-gray-100 text-gray-600'

  const statusColor =
    request.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
    'bg-gray-100 text-gray-600'

  return (
    <div className="flex items-start justify-between py-3 border-b border-gray-100 last:border-0 gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{request.title}</p>
        <p className="text-xs text-gray-500 mt-0.5">{new Date(request.created_at).toLocaleDateString()}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor}`}>
          {request.status.replace('_', ' ')}
        </span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${priorityColor}`}>
          {request.priority}
        </span>
      </div>
    </div>
  )
}

// ── Renewal row ───────────────────────────────────────────────────────────────
function RenewalRow({ lease }: { lease: Lease }) {
  const daysLeft = Math.ceil(
    (new Date(lease.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )
  const urgency = daysLeft <= 14 ? 'text-red-600' : daysLeft <= 30 ? 'text-yellow-600' : 'text-gray-600'

  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <div>
        <p className="text-sm font-medium text-gray-800">Lease ending {new Date(lease.end_date).toLocaleDateString()}</p>
        <p className="text-xs text-gray-500">${Number(lease.rent_amount).toFixed(0)}/mo</p>
      </div>
      <span className={`text-sm font-semibold ${urgency}`}>{daysLeft}d left</span>
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, children, loading, empty, emptyText }: {
  title: string
  children: React.ReactNode
  loading: boolean
  empty: boolean
  emptyText: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{title}</h2>
      </div>
      <div className="px-4">
        {loading ? (
          <div className="py-4 space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : empty ? (
          <p className="text-sm text-gray-500 py-6 text-center">{emptyText}</p>
        ) : children}
      </div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function ManagerDashboard() {
  const { profile } = useAuth()
  const { stats, recentPayments, allPayments, openMaintenance, upcomingRenewals, awaitingManagerSignature, needsBillingSetup, loading, error } =
    useManagerDashboard(profile?.id)

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  // Time-of-day greeting in the user's local timezone.
  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? 'Good morning' :
    hour < 17 ? 'Good afternoon' :
                'Good evening'

  // Outstanding for the current month = pending payments that aren't paid
  // and haven't been scheduled (the tenant hasn't picked a pay-on date yet).
  // Same rail the donut uses — "Upcoming" + "Past due" buckets — but
  // restricted to the live calendar month.
  const outstandingThisMonth = useMemo(() => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return allPayments
      .filter((p) => {
        if (p.status !== 'pending') return false
        const sched = (p as Payment & { scheduled_for?: string | null }).scheduled_for
        if (sched) return false
        const ref = p.due_date ?? p.created_at
        const d = new Date(ref)
        return d >= start && d < end
      })
      .reduce((sum, p) => sum + Number(p.amount), 0)
  }, [allPayments])

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-center">
        <p className="text-red-700 font-medium">Failed to load dashboard</p>
        <p className="text-red-500 text-sm mt-1">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{greeting}, {firstName}</h1>
        <p className="text-gray-500 text-sm mt-1">Here&apos;s what&apos;s happening with your properties.</p>
      </div>

      {/* Billing setup required — surfaces once the manager has any executed lease but no active subscription. */}
      {!loading && needsBillingSetup && (
        <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
              <CreditCard className="w-5 h-5 text-red-700" strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-red-900">Action required — set up FindStoop billing</p>
              <p className="text-sm text-red-800 mt-0.5 leading-relaxed">
                You have at least one signed lease. To unlock the formatted lease PDF, open your tenant's portal (rent payments, maintenance, documents), and start collecting rent through FindStoop, set up your subscription now.
                $9/unit per month, billed only on active units.
              </p>
              <Link
                to="/manager/billing"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg"
              >
                Set up billing now
                <ChevronRight className="w-4 h-4" strokeWidth={2} />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Awaiting your signature — surfaces when a tenant has signed but the manager hasn't */}
      {!loading && awaitingManagerSignature.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
              <FileSignature className="w-5 h-5 text-amber-700" strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-amber-900">
                {awaitingManagerSignature.length === 1
                  ? '1 lease is waiting for your signature'
                  : `${awaitingManagerSignature.length} leases are waiting for your signature`}
              </p>
              <p className="text-xs text-amber-800 mt-0.5">
                The tenant has signed. Add your countersignature to finalize and activate{awaitingManagerSignature.length === 1 ? ' it' : ' them'}.
              </p>
              <div className="mt-3 space-y-1.5">
                {awaitingManagerSignature.slice(0, 3).map((l) => (
                  <Link
                    key={l.id}
                    to={`/manager/sign-lease/${l.id}`}
                    className="flex items-center justify-between gap-2 text-sm text-amber-900 bg-white border border-amber-200 rounded-lg px-3 py-2 hover:border-amber-400 transition-colors"
                  >
                    <span className="truncate">
                      Lease starting {new Date(l.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      <span className="text-amber-700"> · ${Number(l.rent_amount).toLocaleString()}/mo</span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-medium shrink-0">
                      Sign now <ChevronRight className="w-3.5 h-3.5" strokeWidth={2} />
                    </span>
                  </Link>
                ))}
                {awaitingManagerSignature.length > 3 && (
                  <Link
                    to="/manager/leases"
                    className="text-xs font-medium text-amber-800 hover:text-amber-900 inline-block pt-0.5"
                  >
                    + {awaitingManagerSignature.length - 3} more — view all in Leases →
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top row — donut on the left, 2×2 quadrant of stats on the right. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <MonthlyDonut payments={allPayments} loading={loading} />
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Rent Collected" value={formatUsd(stats.rentCollectedThisMonth)} loading={loading} accent="brand" sub="this month" />
          <StatCard label="Total Units"    value={stats.totalUnits} loading={loading} />
          <StatCard label="Outstanding"    value={formatUsd(outstandingThisMonth)} loading={loading} accent={outstandingThisMonth > 0 ? 'red' : 'none'} sub="not scheduled or paid · this month" />
          <StatCard label="Occupied"       value={stats.occupiedUnits} loading={loading} accent="brand"
            sub={stats.totalUnits ? `${Math.round(stats.occupiedUnits / stats.totalUnits * 100)}% occupancy` : undefined} />
        </div>
      </div>

      {/* Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Recent Payments" loading={loading} empty={recentPayments.length === 0} emptyText="No payments yet">
          {recentPayments.map((p) => <PaymentRow key={p.id} payment={p} />)}
        </Section>

        <Section title="Open Maintenance" loading={loading} empty={openMaintenance.length === 0} emptyText="No open requests">
          {openMaintenance.map((r) => <MaintenanceRow key={r.id} request={r} />)}
        </Section>
      </div>

      <Section title="Upcoming Lease Renewals (next 60 days)" loading={loading} empty={upcomingRenewals.length === 0} emptyText="No leases expiring in the next 60 days">
        {upcomingRenewals.map((l) => <RenewalRow key={l.id} lease={l} />)}
      </Section>
    </div>
  )
}


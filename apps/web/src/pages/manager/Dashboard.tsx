import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  FileSignature, ChevronRight, CreditCard, CheckCircle2,
  Plus, Link2, CalendarClock, AlertTriangle, DoorOpen, type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useManagerDashboard } from '@findstoop/shared/hooks/useManagerDashboard'
import { formatUsd, formatUsdCents } from '@findstoop/shared/lib/format'
import { rowStatus, paymentAnchor } from '@findstoop/shared/lib/paymentRails'
import MonthlyDonut from '../../components/manager/MonthlyDonut'
import type { Payment } from '@findstoop/shared/types/payment'
import type { MaintenanceRequest } from '@findstoop/shared/types/maintenance'
import type { Lease } from '@findstoop/shared/types/lease'
import { BRAND } from '../../lib/brand'

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
function PaymentRow({ payment, context }: { payment: Payment; context?: string }) {
  const status = rowStatus(payment)
  const anchor = paymentAnchor(payment)
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-800 capitalize truncate">
          {payment.type.replace(/_/g, ' ')}
          {context && <span className="font-normal text-gray-500 normal-case"> · {context}</span>}
        </p>
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
function RenewalRow({ lease, context }: { lease: Lease; context?: string }) {
  const daysLeft = Math.ceil(
    (new Date(lease.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )
  const urgency = daysLeft <= 14 ? 'text-red-600' : daysLeft <= 30 ? 'text-yellow-600' : 'text-gray-600'

  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0 gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">
          {context ?? `Lease ending ${new Date(lease.end_date).toLocaleDateString()}`}
        </p>
        <p className="text-xs text-gray-500">
          ${Number(lease.rent_amount).toFixed(0)}/mo · ends {new Date(lease.end_date).toLocaleDateString()}
        </p>
      </div>
      <span className={`text-sm font-semibold shrink-0 ${urgency}`}>{daysLeft}d left</span>
    </div>
  )
}

// ── Insight card ──────────────────────────────────────────────────────────────
// Proactive "here's what to do next" cards — the dashboard suggests, not just
// reports. Derived entirely from data already loaded for the stats row.
interface Insight {
  key: string
  Icon: LucideIcon
  tone: 'red' | 'amber' | 'brand'
  title: string
  body: string
  to: string
  cta: string
}

const INSIGHT_TONES: Record<Insight['tone'], { chip: string; icon: string }> = {
  red:   { chip: 'bg-red-50',   icon: 'text-red-600' },
  amber: { chip: 'bg-amber-50', icon: 'text-amber-600' },
  brand: { chip: 'bg-brand-50', icon: 'text-brand-600' },
}

function InsightCard({ insight }: { insight: Insight }) {
  const tone = INSIGHT_TONES[insight.tone]
  return (
    <Link
      to={insight.to}
      className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3 hover:border-brand-300 transition-colors group"
    >
      <div className={`w-9 h-9 rounded-lg ${tone.chip} flex items-center justify-center shrink-0`}>
        <insight.Icon className={`w-[18px] h-[18px] ${tone.icon}`} strokeWidth={1.75} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">{insight.title}</p>
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{insight.body}</p>
        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-brand-600 mt-1.5 group-hover:text-brand-700">
          {insight.cta} <ChevronRight className="w-3 h-3" strokeWidth={2} />
        </span>
      </div>
    </Link>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, children, loading, empty, emptyText }: {
  title: string
  children: React.ReactNode
  loading: boolean
  empty: boolean
  emptyText: React.ReactNode
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
          <div className="text-sm text-gray-500 py-6 text-center">{emptyText}</div>
        ) : children}
      </div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function ManagerDashboard() {
  const { profile } = useAuth()
  const { stats, recentPayments, allPayments, openMaintenance, upcomingRenewals, awaitingManagerSignature, needsBillingSetup, properties, units, leases, loading, error } =
    useManagerDashboard(profile?.id)

  // "301 E 14th Ave · Unit 303" labels so list rows answer "which rental?"
  // without a click-through. Single-unit properties skip the unit suffix.
  const unitLabelById = useMemo(() => {
    const propById = new Map(properties.map((p) => [p.id, p]))
    const unitsPerProp = new Map<string, number>()
    for (const u of units) unitsPerProp.set(u.property_id, (unitsPerProp.get(u.property_id) ?? 0) + 1)
    const out = new Map<string, string>()
    for (const u of units) {
      const prop = propById.get(u.property_id)
      const base = prop?.name || prop?.address || 'Property'
      out.set(u.id, (unitsPerProp.get(u.property_id) ?? 0) > 1 ? `${base} · Unit ${u.unit_number}` : base)
    }
    return out
  }, [properties, units])

  const leaseContextById = useMemo(() => {
    const out = new Map<string, string>()
    for (const l of leases) {
      const label = unitLabelById.get(l.unit_id)
      if (label) out.set(l.id, label)
    }
    return out
  }, [leases, unitLabelById])

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
  // Two distinct buckets, framed honestly: rent that's simply not due yet is
  // "Upcoming" (neutral — nothing is wrong), rent past its due date is
  // "Past due" (red — needs attention). One alarm color, reserved for alarms.
  const { upcomingThisMonth, pastDueThisMonth } = useMemo(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    let upcoming = 0
    let pastDue = 0
    for (const p of allPayments) {
      if (p.status !== 'pending') continue
      const sched = (p as Payment & { scheduled_for?: string | null }).scheduled_for
      if (sched) continue
      const ref = p.due_date ?? p.created_at
      const d = new Date(ref)
      if (d < start || d >= end) continue
      if (p.due_date && new Date(p.due_date) < today) pastDue += Number(p.amount)
      else upcoming += Number(p.amount)
    }
    return { upcomingThisMonth: upcoming, pastDueThisMonth: pastDue }
  }, [allPayments])

  // Up to three "do this next" suggestions, ordered by urgency: money that's
  // late, units earning nothing, then the renewal with the shortest runway.
  const insights = useMemo<Insight[]>(() => {
    const out: Insight[] = []
    if (pastDueThisMonth > 0) {
      out.push({
        key: 'past-due', Icon: AlertTriangle, tone: 'red',
        title: `${formatUsd(pastDueThisMonth)} is past due`,
        body: 'Rent has slipped past its due date — review the rows and nudge the tenant.',
        to: '/manager/payments', cta: 'Review payments',
      })
    }
    const vacant = stats.totalUnits - stats.occupiedUnits
    if (vacant > 0) {
      out.push({
        key: 'vacant', Icon: DoorOpen, tone: 'amber',
        title: `${vacant} vacant unit${vacant === 1 ? '' : 's'}`,
        body: 'Every vacant month is lost rent — share your apply link to start showings.',
        to: '/manager/applications', cta: 'Share apply link',
      })
    }
    const next = upcomingRenewals.slice().sort((a, b) => +new Date(a.end_date) - +new Date(b.end_date))[0]
    if (next) {
      const d = Math.ceil((new Date(next.end_date).getTime() - Date.now()) / 86_400_000)
      const where = unitLabelById.get(next.unit_id) ?? 'A lease'
      out.push({
        key: 'renewal', Icon: CalendarClock, tone: 'brand',
        title: `${where} — lease ends in ${d}d`,
        body: 'Renewals land best with 30+ days of runway. Start the conversation now.',
        to: '/manager/leases', cta: 'View lease',
      })
    }
    return out.slice(0, 3)
  }, [pastDueThisMonth, stats.totalUnits, stats.occupiedUnits, upcomingRenewals, unitLabelById])

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
      {/* Greeting + quick actions — the dashboard's verbs live up top so the
          most common jobs are one click from landing. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{greeting}, {firstName}</h1>
          <p className="text-gray-500 text-sm mt-1">Here&apos;s what&apos;s happening with your properties.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { to: '/manager/payments', Icon: CreditCard, label: 'Record payment' },
            { to: '/manager/properties', Icon: Plus, label: 'Add property' },
            { to: '/manager/leases', Icon: FileSignature, label: 'Create lease' },
            { to: '/manager/applications', Icon: Link2, label: 'Share apply link' },
          ].map(({ to, Icon, label }) => (
            <Link
              key={to}
              to={to}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 hover:border-brand-300 hover:text-brand-700 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* Billing setup required — surfaces once the manager has any executed lease but no active subscription. */}
      {!loading && needsBillingSetup && (
        <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
              <CreditCard className="w-5 h-5 text-red-700" strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-red-900">Action required — set up {BRAND.name} billing</p>
              <p className="text-sm text-red-800 mt-0.5 leading-relaxed">
                You have at least one signed lease. To unlock the formatted lease PDF, open your tenant's portal (rent payments, maintenance, documents), and start collecting rent through {BRAND.name}, set up your subscription now.
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
          {pastDueThisMonth > 0 ? (
            <StatCard label="Past Due" value={formatUsd(pastDueThisMonth)} loading={loading} accent="red" sub="needs attention · this month" />
          ) : (
            <StatCard label="Upcoming" value={formatUsd(upcomingThisMonth)} loading={loading} sub="expected this month · not due yet" />
          )}
          <StatCard label="Occupied"       value={stats.occupiedUnits} loading={loading} accent="brand"
            sub={stats.totalUnits ? `${Math.round(stats.occupiedUnits / stats.totalUnits * 100)}% occupancy` : undefined} />
        </div>
      </div>

      {/* Insights — what to do next */}
      {!loading && insights.length > 0 && (
        <div className={`grid grid-cols-1 gap-3 ${insights.length === 2 ? 'md:grid-cols-2' : insights.length >= 3 ? 'md:grid-cols-3' : ''}`}>
          {insights.map((i) => <InsightCard key={i.key} insight={i} />)}
        </div>
      )}

      {/* Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Recent Payments" loading={loading} empty={recentPayments.length === 0} emptyText="No payments yet">
          {recentPayments.map((p) => <PaymentRow key={p.id} payment={p} context={leaseContextById.get(p.lease_id)} />)}
        </Section>

        <Section
          title="Open Maintenance"
          loading={loading}
          empty={openMaintenance.length === 0}
          emptyText={
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-brand-500" strokeWidth={1.75} />
              All quiet — no open requests
            </span>
          }
        >
          {openMaintenance.map((r) => <MaintenanceRow key={r.id} request={r} />)}
        </Section>
      </div>

      <Section title="Upcoming Lease Renewals (next 60 days)" loading={loading} empty={upcomingRenewals.length === 0} emptyText="No leases expiring in the next 60 days">
        {upcomingRenewals.map((l) => <RenewalRow key={l.id} lease={l} context={unitLabelById.get(l.unit_id)} />)}
      </Section>
    </div>
  )
}


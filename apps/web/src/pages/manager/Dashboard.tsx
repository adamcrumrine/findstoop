import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useManagerDashboard } from '@findstoop/shared/hooks/useManagerDashboard'
import type { Payment } from '@findstoop/shared/types/payment'
import type { MaintenanceRequest } from '@findstoop/shared/types/maintenance'
import type { Lease } from '@findstoop/shared/types/lease'

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className ?? ''}`} />
}

// ── Stat card ─────────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  color: 'gray' | 'green' | 'yellow' | 'red' | 'blue'
  loading: boolean
}

const colorMap = {
  gray:   'bg-gray-50 border-gray-200',
  green:  'bg-green-50 border-green-200',
  yellow: 'bg-yellow-50 border-yellow-200',
  red:    'bg-red-50 border-red-200',
  blue:   'bg-blue-50 border-blue-200',
}
const valueColorMap = {
  gray:   'text-gray-800',
  green:  'text-green-700',
  yellow: 'text-yellow-700',
  red:    'text-red-700',
  blue:   'text-blue-700',
}

function StatCard({ label, value, sub, color, loading }: StatCardProps) {
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color]}`}>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      {loading ? (
        <Skeleton className="h-8 w-24 mt-2" />
      ) : (
        <p className={`text-2xl font-bold mt-1 ${valueColorMap[color]}`}>{value}</p>
      )}
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

// ── Payment row ───────────────────────────────────────────────────────────────
function PaymentRow({ payment }: { payment: Payment }) {
  const statusColor =
    payment.status === 'completed' ? 'bg-green-100 text-green-700' :
    payment.status === 'failed'    ? 'bg-red-100 text-red-700' :
    'bg-yellow-100 text-yellow-700'

  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <div>
        <p className="text-sm font-medium text-gray-800 capitalize">{payment.type.replace('_', ' ')}</p>
        <p className="text-xs text-gray-400">{new Date(payment.created_at).toLocaleDateString()}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor}`}>
          {payment.status}
        </span>
        <span className="text-sm font-semibold text-gray-800">${Number(payment.amount).toFixed(2)}</span>
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
        <p className="text-xs text-gray-400 mt-0.5">{new Date(request.created_at).toLocaleDateString()}</p>
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
        <p className="text-xs text-gray-400">${Number(lease.rent_amount).toFixed(0)}/mo</p>
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
          <p className="text-sm text-gray-400 py-6 text-center">{emptyText}</p>
        ) : children}
      </div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function ManagerDashboard() {
  const { profile } = useAuth()
  const { stats, recentPayments, openMaintenance, upcomingRenewals, loading, error } =
    useManagerDashboard(profile?.id)

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

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
        <h1 className="text-2xl font-bold text-gray-900">Good morning, {firstName} 👋</h1>
        <p className="text-gray-500 text-sm mt-1">Here&apos;s what&apos;s happening with your properties.</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard label="Total Units"       value={stats.totalUnits}       color="gray"   loading={loading} />
        <StatCard label="Occupied"          value={stats.occupiedUnits}    color="green"  loading={loading}
          sub={stats.totalUnits ? `${Math.round(stats.occupiedUnits / stats.totalUnits * 100)}% occupancy` : undefined} />
        <StatCard label="Vacant"            value={stats.vacantUnits}      color={stats.vacantUnits > 0 ? 'yellow' : 'green'} loading={loading} />
        <StatCard label="Rent Collected"    value={`$${stats.rentCollectedThisMonth.toLocaleString()}`} color="green"  loading={loading} sub="this month" />
        <StatCard label="Outstanding"       value={`$${stats.outstandingPayments.toLocaleString()}`}    color={stats.outstandingPayments > 0 ? 'red' : 'green'} loading={loading} />
        <StatCard label="Open Maintenance"  value={stats.openMaintenanceRequests} color={stats.openMaintenanceRequests > 0 ? 'yellow' : 'green'} loading={loading} />
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

import { useNavigate } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useTenantDashboard } from '@findstoop/shared/hooks/useTenantDashboard'
import type { Payment } from '@findstoop/shared/types/payment'
import type { MaintenanceRequest } from '@findstoop/shared/types/maintenance'
import { MessageSquare, ChevronRight, FileSignature } from 'lucide-react'

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded-lg ${className ?? ''}`} />
}

function PaymentRow({ payment }: { payment: Payment }) {
  const statusColor =
    payment.status === 'completed' ? 'text-green-600' :
    payment.status === 'failed'    ? 'text-red-600' :
    'text-yellow-600'
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <div>
        <p className="text-sm font-medium text-gray-800 capitalize">{payment.type.replace('_', ' ')}</p>
        <p className="text-xs text-gray-400">{new Date(payment.created_at).toLocaleDateString()}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold text-gray-800">${Number(payment.amount).toFixed(2)}</p>
        <p className={`text-xs font-medium capitalize ${statusColor}`}>{payment.status}</p>
      </div>
    </div>
  )
}

function MaintenanceRow({ request }: { request: MaintenanceRequest }) {
  const priorityColor =
    request.priority === 'emergency' ? 'bg-red-100 text-red-700' :
    request.priority === 'high'      ? 'bg-orange-100 text-orange-700' :
    request.priority === 'medium'    ? 'bg-yellow-100 text-yellow-700' :
    'bg-gray-100 text-gray-600'
  const statusColor =
    request.status === 'resolved' || request.status === 'closed' ? 'bg-green-100 text-green-700' :
    request.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
    'bg-gray-100 text-gray-600'
  return (
    <div className="flex items-start justify-between py-3 border-b border-gray-100 last:border-0 gap-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{request.title}</p>
        <p className="text-xs text-gray-400 mt-0.5">{new Date(request.created_at).toLocaleDateString()}</p>
      </div>
      <div className="flex gap-1.5 shrink-0">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}>
          {request.status.replace('_', ' ')}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityColor}`}>
          {request.priority}
        </span>
      </div>
    </div>
  )
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-200 overflow-hidden ${className ?? ''}`}>
      {children}
    </div>
  )
}

function CardHeader({ title }: { title: string }) {
  return (
    <div className="px-4 py-3 border-b border-gray-100">
      <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">{title}</h2>
    </div>
  )
}

export default function TenantDashboard() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { lease, nextPayment, recentPayments, recentMaintenance, unreadMessages, loading, error } =
    useTenantDashboard(profile?.id)

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  const daysUntilDue = nextPayment?.due_date
    ? Math.ceil((new Date(nextPayment.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  const rentUrgency =
    daysUntilDue === null ? 'blue' :
    daysUntilDue < 0      ? 'red' :
    daysUntilDue <= 3     ? 'red' :
    daysUntilDue <= 7     ? 'yellow' : 'green'

  const urgencyStyles = {
    blue:   { card: 'bg-brand-600',   text: 'text-brand-100', amount: 'text-white', btn: 'bg-white text-brand-700 hover:bg-brand-50' },
    green:  { card: 'bg-green-600',   text: 'text-green-100', amount: 'text-white', btn: 'bg-white text-green-700 hover:bg-green-50' },
    yellow: { card: 'bg-yellow-500',  text: 'text-yellow-100', amount: 'text-white', btn: 'bg-white text-yellow-700 hover:bg-yellow-50' },
    red:    { card: 'bg-red-600',     text: 'text-red-100',  amount: 'text-white', btn: 'bg-white text-red-700 hover:bg-red-50' },
  }
  const s = urgencyStyles[rentUrgency]

  if (error) {
    return (
      <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-center">
        <p className="text-red-700 font-medium">Failed to load dashboard</p>
        <p className="text-red-500 text-sm mt-1">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-xl mx-auto">
      {/* Greeting */}
      <div className="pt-1">
        <h1 className="text-2xl font-bold text-gray-900">Hi, {firstName}!</h1>
        <p className="text-gray-500 text-sm mt-0.5">Welcome to your home portal.</p>
      </div>

      {/* Lease awaiting signature */}
      {!loading && lease && !lease.signed_at && (
        <button
          onClick={() => navigate(`/tenant/sign-lease/${lease.id}`)}
          className="w-full bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center justify-between hover:bg-amber-100 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <FileSignature className="w-5 h-5 text-amber-700" strokeWidth={1.75} />
            <div>
              <p className="text-sm font-semibold text-amber-900">Your lease is ready to sign</p>
              <p className="text-xs text-amber-700">Review the terms and add your signature.</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-amber-600" strokeWidth={2} />
        </button>
      )}

      {/* Rent CTA card */}
      {loading ? (
        <Skeleton className="h-44" />
      ) : (
        <div className={`rounded-2xl p-5 ${s.card}`}>
          <p className={`text-sm font-medium ${s.text}`}>
            {nextPayment
              ? daysUntilDue !== null && daysUntilDue < 0
                ? 'Payment overdue'
                : `Due ${nextPayment.due_date ? new Date(nextPayment.due_date).toLocaleDateString() : 'soon'}`
              : 'No payment due'}
          </p>
          <p className={`text-4xl font-bold mt-1 ${s.amount}`}>
            {nextPayment ? `$${Number(nextPayment.amount).toFixed(2)}` : '—'}
          </p>
          <p className={`text-sm mt-1 ${s.text}`}>
            {daysUntilDue !== null
              ? daysUntilDue < 0
                ? `${Math.abs(daysUntilDue)} days overdue`
                : daysUntilDue === 0
                ? 'Due today'
                : `${daysUntilDue} days remaining`
              : 'All payments up to date'}
          </p>
          <button
            onClick={() => navigate('/tenant/pay-rent')}
            className={`mt-4 w-full py-3 rounded-xl font-semibold text-sm transition-colors ${s.btn}`}
          >
            {nextPayment ? 'Pay Now' : 'View Payments'}
          </button>
        </div>
      )}

      {/* Lease summary */}
      <Card>
        <CardHeader title="Current Lease" />
        <div className="px-4 py-3">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-5 w-2/3" />
            </div>
          ) : lease ? (
            <div className="grid grid-cols-2 gap-y-3 text-sm">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Start</p>
                <p className="font-medium text-gray-800 mt-0.5">{new Date(lease.start_date).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">End</p>
                <p className="font-medium text-gray-800 mt-0.5">{new Date(lease.end_date).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Monthly Rent</p>
                <p className="font-medium text-gray-800 mt-0.5">${Number(lease.rent_amount).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Status</p>
                <span className="inline-block bg-green-100 text-green-700 text-xs font-medium px-2 py-0.5 rounded-full mt-0.5 capitalize">
                  {lease.status}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-3 text-center">No active lease found</p>
          )}
        </div>
      </Card>

      {/* Messages badge */}
      {!loading && unreadMessages > 0 && (
        <button
          onClick={() => navigate('/tenant/messages')}
          className="w-full bg-brand-50 border border-brand-200 rounded-2xl px-4 py-3 flex items-center justify-between hover:bg-brand-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <MessageSquare className="w-5 h-5 text-brand-700" strokeWidth={1.75} />
            <div className="text-left">
              <p className="text-sm font-semibold text-brand-700">New messages</p>
              <p className="text-xs text-brand-500">You have {unreadMessages} unread message{unreadMessages > 1 ? 's' : ''}</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-brand-400" strokeWidth={2} />
        </button>
      )}

      {/* Recent payments */}
      <Card>
        <CardHeader title="Recent Payments" />
        <div className="px-4">
          {loading ? (
            <div className="py-3 space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : recentPayments.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">No payment history yet</p>
          ) : (
            recentPayments.map((p) => <PaymentRow key={p.id} payment={p} />)
          )}
        </div>
      </Card>

      {/* Maintenance */}
      <Card>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Maintenance</h2>
          <button
            onClick={() => navigate('/tenant/maintenance')}
            className="text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            + New request
          </button>
        </div>
        <div className="px-4">
          {loading ? (
            <div className="py-3 space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : recentMaintenance.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">No maintenance requests</p>
          ) : (
            recentMaintenance.map((r) => <MaintenanceRow key={r.id} request={r} />)
          )}
        </div>
      </Card>
    </div>
  )
}

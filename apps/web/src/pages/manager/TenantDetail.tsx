import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, UserCircle, Phone, Mail, BadgeCheck, AlertCircle, Briefcase, ShieldAlert, Home, Calendar, FileText, MessageSquare, Wrench, type LucideIcon } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatUsd, formatUsdCents, formatPhone } from '@findstoop/shared/lib/format'
import { rowStatus, paymentAnchor, upcomingPaymentWindow } from '@findstoop/shared/lib/paymentRails'
import type { Profile } from '@findstoop/shared/types/profile'
import type { Lease } from '@findstoop/shared/types/lease'
import type { Payment } from '@findstoop/shared/types/payment'
import type { MaintenanceRequest } from '@findstoop/shared/types/maintenance'

interface LeaseWithProperty extends Lease {
  unit?: {
    unit_number: string | null
    properties?: { name: string | null; address: string | null; city: string | null; state: string | null; zip: string | null } | null
  } | null
}

export default function TenantDetail() {
  const { id } = useParams<{ id: string }>()
  const [tenant, setTenant] = useState<Profile | null>(null)
  const [leases, setLeases] = useState<LeaseWithProperty[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [openRequests, setOpenRequests] = useState<MaintenanceRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [profileRes, leasesRes] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', id).eq('role', 'tenant').maybeSingle(),
          supabase.from('leases').select('*, unit:units(unit_number, properties(name, address, city, state, zip))').eq('tenant_id', id).order('created_at', { ascending: false }),
        ])
        if (cancelled) return
        if (profileRes.error) throw profileRes.error
        if (!profileRes.data) throw new Error('Tenant not found or you don\'t have permission to view this profile.')
        setTenant(profileRes.data as Profile)
        if (leasesRes.error) throw leasesRes.error
        const leaseRows = (leasesRes.data ?? []) as unknown as LeaseWithProperty[]
        setLeases(leaseRows)

        // Activity context — the tenancy's money + maintenance at a glance,
        // so the manager doesn't have to hop to Payments/Maintenance and
        // re-filter by this person. Non-fatal: the page still renders if
        // either query fails.
        const unitIds = Array.from(new Set(leaseRows.map((l) => l.unit_id).filter(Boolean)))
        const [payRes, maintRes] = await Promise.all([
          supabase.from('payments').select('*').eq('tenant_id', id).order('created_at', { ascending: false }),
          unitIds.length > 0
            ? supabase.from('maintenance_requests').select('*').in('unit_id', unitIds).in('status', ['open', 'in_progress']).order('created_at', { ascending: false })
            : Promise.resolve({ data: [], error: null }),
        ])
        if (cancelled) return
        if (!payRes.error) setPayments((payRes.data ?? []) as Payment[])
        if (!maintRes.error) setOpenRequests((maintRes.data ?? []) as MaintenanceRequest[])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load tenant')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-mute">
        <Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} />
      </div>
    )
  }

  if (error || !tenant) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <AlertCircle className="w-8 h-8 text-mute mx-auto mb-2" strokeWidth={1.5} />
        <p className="text-mute">{error ?? 'Tenant not found.'}</p>
        <Link to="/manager/tenants" className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 mt-4">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
          Back to tenants
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Link to="/manager/tenants" className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink mb-4">
        <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
        Back to tenants
      </Link>

      {/* Header card with avatar */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6 mb-4">
        <div className="flex items-start gap-4">
          <div className="shrink-0">
            {tenant.avatar_url ? (
              <img
                src={tenant.avatar_url}
                alt={tenant.full_name ?? 'Tenant'}
                className="w-20 h-20 rounded-full object-cover border-2 border-gray-200"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-brand-50 border-2 border-gray-200 inline-flex items-center justify-center">
                <UserCircle className="w-10 h-10 text-brand-500" strokeWidth={1.5} />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-ink">{tenant.full_name ?? '—'}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-mute">
              {tenant.email && (
                <a href={`mailto:${tenant.email}`} className="inline-flex items-center gap-1 hover:text-ink">
                  <Mail className="w-3.5 h-3.5" strokeWidth={1.75} /> {tenant.email}
                </a>
              )}
              {tenant.phone && (
                <a href={`tel:${tenant.phone}`} className="inline-flex items-center gap-1 hover:text-ink">
                  <Phone className="w-3.5 h-3.5" strokeWidth={1.75} /> {formatPhone(tenant.phone)}
                </a>
              )}
            </div>
            {tenant.about_me && (
              <p className="text-sm text-ink mt-3 leading-relaxed whitespace-pre-line">{tenant.about_me}</p>
            )}
          </div>
          <Link
            to={`/manager/messages?tenantId=${tenant.id}`}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium"
            title="Open 1:1 chat"
          >
            <MessageSquare className="w-4 h-4" strokeWidth={1.75} />
            Message
          </Link>
        </div>
      </section>

      {/* Bio */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6 mb-4">
        <h2 className="text-xs uppercase tracking-wider text-mute font-semibold mb-4">Tenant bio</h2>
        {/* A grid of seven "—" placeholders tells the manager nothing — when
            the bio is empty, show only the one-line explanation. */}
        {hasAnyBio(tenant) ? (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <InfoRow Icon={Calendar} label="Date of birth" value={fmtDate(tenant.date_of_birth ?? null)} />
            <InfoRow Icon={BadgeCheck} label="Monthly income" value={tenant.monthly_income != null ? formatUsd(Number(tenant.monthly_income)) : null} />
            <InfoRow Icon={Briefcase} label="Employer" value={tenant.employer ?? null} />
            <InfoRow Icon={Phone} label="Employer phone" value={tenant.employer_phone ?? null} />
            <InfoRow Icon={ShieldAlert} label="Emergency contact" value={tenant.emergency_contact_name ?? null}
              sub={tenant.emergency_contact_relationship ?? null} />
            <InfoRow Icon={Phone} label="Emergency phone" value={tenant.emergency_contact_phone ?? null} />
            <InfoRow Icon={Home} label="Previous address" value={tenant.previous_address ?? null} fullWidth />
          </dl>
        ) : (
          <p className="text-sm text-mute italic">
            This tenant hasn't filled in any bio fields yet. They can add details from their tenant Settings page.
          </p>
        )}
      </section>

      {/* Payments — the tenancy's money at a glance */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs uppercase tracking-wider text-mute font-semibold">Payments</h2>
          <Link to="/manager/payments" className="text-xs font-medium text-brand-600 hover:text-brand-700">View all</Link>
        </div>
        {payments.length === 0 ? (
          <p className="text-sm text-mute">No payments recorded yet.</p>
        ) : (() => {
          const today = new Date(); today.setHours(0, 0, 0, 0)
          const pastDue = payments
            .filter((p) => p.status === 'pending' && p.due_date && new Date(p.due_date) < today)
            .reduce((s, p) => s + Number(p.amount), 0)
          const lastPaid = payments
            .filter((p) => p.status === 'completed' && p.paid_at)
            .sort((a, b) => +new Date(b.paid_at!) - +new Date(a.paid_at!))[0]
          // Forward-looking: oldest unsettled first (past due leads), then
          // into the future. Sorting descending here showed the far end of a
          // year's generated schedule and hid the payment actually due now.
          const recent = upcomingPaymentWindow(payments, 5)
          return (
            <>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-mute font-semibold">Past due</p>
                  <p className={`text-lg font-bold mt-0.5 ${pastDue > 0 ? 'text-red-700' : 'text-ink'}`}>
                    {formatUsd(pastDue)}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-mute font-semibold">Last payment</p>
                  <p className="text-lg font-bold text-ink mt-0.5">
                    {lastPaid ? formatUsd(Number(lastPaid.amount)) : '—'}
                  </p>
                  {lastPaid?.paid_at && (
                    <p className="text-[11px] text-mute">{new Date(lastPaid.paid_at).toLocaleDateString()}</p>
                  )}
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {recent.map((p) => {
                  const status = rowStatus(p)
                  return (
                    <div key={p.id} className="flex items-center justify-between py-2 gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-ink capitalize truncate">{p.type.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-mute">{new Date(paymentAnchor(p)).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${status.cls}`}>{status.label}</span>
                        <span className="text-sm font-semibold text-ink">{formatUsdCents(Number(p.amount))}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )
        })()}
      </section>

      {/* Open maintenance for this tenant's unit(s) — only when there is any */}
      {openRequests.length > 0 && (
        <section className="bg-white rounded-2xl border border-gray-200 p-6 mb-4">
          <h2 className="text-xs uppercase tracking-wider text-mute font-semibold mb-3">Open maintenance</h2>
          <div className="divide-y divide-gray-100">
            {openRequests.map((r) => (
              <Link key={r.id} to="/manager/maintenance" className="flex items-center justify-between py-2 gap-3 hover:bg-gray-50 rounded-lg px-1 -mx-1">
                <div className="min-w-0 inline-flex items-center gap-2">
                  <Wrench className="w-3.5 h-3.5 text-mute shrink-0" strokeWidth={1.75} />
                  <p className="text-sm text-ink truncate">{r.title}</p>
                </div>
                <span className="text-xs text-mute shrink-0 capitalize">{r.status.replace('_', ' ')} · {r.priority}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Leases */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-xs uppercase tracking-wider text-mute font-semibold mb-3">Leases</h2>
        {leases.length === 0 ? (
          <p className="text-sm text-mute">No leases yet.</p>
        ) : (
          <div className="space-y-2">
            {leases.map((l) => {
              const prop = l.unit?.properties
              return (
                <Link
                  key={l.id}
                  to={`/manager/review-lease/${l.id}`}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-gray-100 hover:bg-gray-50 hover:border-gray-200"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink truncate">
                      {prop?.name ?? 'Property'} · Unit {l.unit?.unit_number ?? '—'}
                    </p>
                    <p className="text-xs text-mute mt-0.5">
                      {fmtDate(l.start_date)} → {fmtDate(l.end_date)} · {formatUsd(Number(l.rent_amount))}/mo · {l.status}
                    </p>
                  </div>
                  <FileText className="w-4 h-4 text-mute shrink-0" strokeWidth={1.75} />
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function InfoRow({
  Icon,
  label,
  value,
  sub,
  fullWidth,
}: {
  Icon: LucideIcon
  label: string
  value: string | null | undefined
  sub?: string | null
  fullWidth?: boolean
}) {
  return (
    <div className={fullWidth ? 'sm:col-span-2' : ''}>
      <dt className="text-xs uppercase tracking-wider text-mute font-semibold inline-flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
        {label}
      </dt>
      <dd className="text-ink mt-1">
        {value ? (
          <>
            {value}
            {sub && <span className="text-mute text-xs ml-1.5">({sub})</span>}
          </>
        ) : (
          <span className="text-mute italic">—</span>
        )}
      </dd>
    </div>
  )
}

function hasAnyBio(p: Profile): boolean {
  return !!(p.date_of_birth || p.employer || p.employer_phone || p.monthly_income ||
    p.emergency_contact_name || p.emergency_contact_phone || p.previous_address || p.about_me)
}

function fmtDate(d: string | null): string | null {
  if (!d) return null
  // Treat YYYY-MM-DD as a local date, not UTC, so we don't drift a day.
  const [y, m, day] = d.split('-').map(Number)
  if (!y || !m || !day) return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

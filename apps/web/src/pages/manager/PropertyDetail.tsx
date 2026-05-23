// Property detail page — top-level tabs for one property.
// Tabs: Overview · Units · Leases · Tenants · Maintenance · Payments

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useUnitsByProperty } from '@findstoop/shared/hooks/useUnits'
import { useLeases, useTenants } from '@findstoop/shared/hooks/useLeases'
import { usePayments } from '@findstoop/shared/hooks/usePayments'
import type { Property } from '@findstoop/shared/types/property'
import type { Unit } from '@findstoop/shared/types/unit'
import type { Lease, LeaseStatus } from '@findstoop/shared/types/lease'
import {
  ArrowLeft, Building2, Loader2, Home, FileText, Users, Wrench, CreditCard,
  CheckCircle2, Calendar, DollarSign, Copy, AlertCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../../components/shared/Modal'
import FormField, { inputClass } from '../../components/shared/FormField'

type TabId = 'overview' | 'units' | 'leases' | 'tenants' | 'maintenance' | 'payments'

const tabs: { id: TabId; label: string; Icon: typeof Home }[] = [
  { id: 'overview',    label: 'Overview',    Icon: Home },
  { id: 'units',       label: 'Units',       Icon: Building2 },
  { id: 'leases',      label: 'Leases',      Icon: FileText },
  { id: 'tenants',     label: 'Tenants',     Icon: Users },
  { id: 'maintenance', label: 'Maintenance', Icon: Wrench },
  { id: 'payments',    label: 'Payments',    Icon: CreditCard },
]

export default function ManagerPropertyDetail() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [property, setProperty] = useState<Property | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabId>('overview')

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase.from('properties').select('*').eq('id', id).single()
      if (cancelled) return
      if (error || !data) {
        setProperty(null)
      } else {
        setProperty(data as Property)
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [id])

  const { units } = useUnitsByProperty(id ?? null)
  const unitIds = useMemo(() => units.map((u) => u.id), [units])
  const { leases } = useLeases(unitIds)
  const { tenants, getActiveLease } = useTenants(unitIds)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-mute">
        <Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} />
      </div>
    )
  }

  if (!property) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <Building2 className="w-10 h-10 mx-auto mb-3 text-mute-400" strokeWidth={1.5} />
        <p className="font-semibold text-ink">Property not found</p>
        <button
          onClick={() => navigate('/manager/properties')}
          className="mt-4 text-sm font-medium text-brand-600 hover:underline"
        >
          ← Back to properties
        </button>
      </div>
    )
  }

  // Verify manager owns this property (defensive — RLS should already block, but this gives a clean error).
  if (profile && property.manager_id !== profile.id && profile.role !== 'admin') {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <p className="text-mute">You don't have access to this property.</p>
      </div>
    )
  }

  const activeLeases = leases.filter((l) => l.status === 'active')
  const occupiedCount = units.filter((u) => u.status === 'occupied').length
  const totalRent = activeLeases.reduce((sum, l) => sum + Number(l.rent_amount), 0)

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <button
        onClick={() => navigate('/manager/properties')}
        className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink mb-4"
      >
        <ArrowLeft className="w-4 h-4" strokeWidth={1.75} /> Properties
      </button>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-4 flex items-start gap-5">
        <div className="w-20 h-20 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center">
          {property.thumbnail_url ? (
            <img src={property.thumbnail_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <Building2 className="w-8 h-8 text-mute-400" strokeWidth={1.5} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold text-ink">{property.name}</h1>
          <p className="text-sm text-mute mt-0.5">{property.address}</p>
          <p className="text-sm text-mute">{property.city}, {property.state} {property.zip}</p>
          <div className="mt-3 flex gap-6 text-xs">
            <Stat label="Units" value={units.length} />
            <Stat label="Occupied" value={`${occupiedCount}/${units.length}`} />
            <Stat label="Active leases" value={activeLeases.length} />
            <Stat label="Monthly rent" value={`$${totalRent.toLocaleString()}`} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-gray-200 p-2 mb-4 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {tabs.map(({ id: tid, label, Icon }) => (
            <button
              key={tid}
              onClick={() => setTab(tid)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === tid ? 'bg-brand-600 text-white' : 'text-mute hover:bg-gray-50 hover:text-ink'
              }`}
            >
              <Icon className="w-4 h-4" strokeWidth={1.75} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {tab === 'overview' && <OverviewTab property={property} units={units} leases={leases} />}
      {tab === 'units' && <UnitsTab units={units} property={property} />}
      {tab === 'leases' && <LeasesTab leases={leases} units={units} property={property} />}
      {tab === 'tenants' && <TenantsTab tenants={tenants} getActiveLease={getActiveLease} units={units} />}
      {tab === 'maintenance' && <MaintenanceTab unitIds={unitIds} units={units} />}
      {tab === 'payments' && <PaymentsTab leases={leases} units={units} />}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-mute uppercase tracking-wider font-semibold text-[10px]">{label}</p>
      <p className="text-ink font-semibold text-sm mt-0.5">{value}</p>
    </div>
  )
}

// ── Overview tab ──────────────────────────────────────────────────────────────
function OverviewTab({ property, units, leases }: { property: Property; units: Unit[]; leases: ReturnType<typeof useLeases>['leases'] }) {
  const vacantUnits = units.filter((u) => u.status === 'vacant')
  const expiringSoon = leases.filter((l) => {
    if (l.status !== 'active') return false
    const days = (new Date(l.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    return days > 0 && days <= 60
  })

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <Card title="Vacant units" empty={vacantUnits.length === 0 ? 'All units leased' : undefined}>
        <ul className="space-y-2 text-sm">
          {vacantUnits.map((u) => (
            <li key={u.id} className="flex items-center justify-between">
              <span className="text-ink">Unit {u.unit_number}</span>
              <span className="text-mute">${Number(u.rent_amount).toLocaleString()}/mo</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Leases expiring (next 60 days)" empty={expiringSoon.length === 0 ? 'No leases expiring' : undefined}>
        <ul className="space-y-2 text-sm">
          {expiringSoon.map((l) => {
            const unit = units.find((u) => u.id === l.unit_id)
            const days = Math.ceil((new Date(l.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            const name = l.profile?.full_name ?? l.profile?.email ?? 'Tenant'
            return (
              <li key={l.id} className="flex items-center justify-between">
                <span className="text-ink">{name} · Unit {unit?.unit_number ?? '—'}</span>
                <span className={`text-xs ${days < 30 ? 'text-yellow-700 font-medium' : 'text-mute'}`}>{days}d</span>
              </li>
            )
          })}
        </ul>
      </Card>

      <Card title="Property details">
        <dl className="text-sm space-y-2">
          <Row label="Name" value={property.name} />
          <Row label="Address" value={property.address} />
          <Row label="City" value={`${property.city}, ${property.state} ${property.zip}`} />
          <Row label="Added" value={new Date(property.created_at).toLocaleDateString()} />
        </dl>
      </Card>

      <Card title="Quick actions">
        <div className="flex flex-col gap-2 text-sm">
          <Link to="/manager/leases" className="text-brand-700 font-medium hover:underline inline-flex items-center gap-1.5">
            <FileText className="w-4 h-4" strokeWidth={1.75} /> Create lease
          </Link>
          <Link to="/manager/listings" className="text-brand-700 font-medium hover:underline inline-flex items-center gap-1.5">
            <Building2 className="w-4 h-4" strokeWidth={1.75} /> Manage listings
          </Link>
          <Link to="/manager/applications" className="text-brand-700 font-medium hover:underline inline-flex items-center gap-1.5">
            <Users className="w-4 h-4" strokeWidth={1.75} /> View applications
          </Link>
        </div>
      </Card>
    </div>
  )
}

function Card({ title, children, empty }: { title: string; children: React.ReactNode; empty?: string }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5">
      <h2 className="text-xs uppercase tracking-wider text-mute font-semibold mb-3">{title}</h2>
      {empty ? <p className="text-sm text-mute">{empty}</p> : children}
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-mute">{label}</dt>
      <dd className="text-ink text-right">{value}</dd>
    </div>
  )
}

// ── Units tab ─────────────────────────────────────────────────────────────────
function UnitsTab({ units, property }: { units: Unit[]; property: Property }) {
  const copyApplyLink = (unitId: string) => {
    const link = `${window.location.origin}/apply/${unitId}`
    navigator.clipboard.writeText(link).then(() => toast.success('Apply link copied'))
  }

  if (units.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
        <Building2 className="w-10 h-10 mx-auto mb-2 text-mute-400" strokeWidth={1.5} />
        <p className="font-semibold text-ink">No units yet</p>
        <p className="text-sm text-mute mt-1">Add units to {property.name} from the Units page.</p>
        <Link to="/manager/units" className="mt-4 inline-block bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700">
          Manage units
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {units.map((u) => (
        <div key={u.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-ink">Unit {u.unit_number}</p>
            <div className="text-xs text-mute mt-0.5 flex gap-3 flex-wrap">
              {u.bedrooms != null && <span>{u.bedrooms} bd</span>}
              {u.bathrooms != null && <span>{u.bathrooms} ba</span>}
              {u.square_feet && <span>{u.square_feet} sqft</span>}
              <span>${Number(u.rent_amount).toLocaleString()}/mo</span>
            </div>
          </div>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
            u.status === 'occupied' ? 'bg-green-100 text-green-700'
              : u.status === 'vacant' ? 'bg-yellow-100 text-yellow-700'
              : 'bg-gray-100 text-gray-700'
          }`}>{u.status}</span>
          <button
            onClick={() => copyApplyLink(u.id)}
            className="text-xs font-medium text-brand-700 inline-flex items-center gap-1 px-2 py-1 border border-gray-200 rounded-lg hover:border-brand-300"
            title="Copy public apply link"
          >
            <Copy className="w-3.5 h-3.5" strokeWidth={1.75} /> Apply link
          </button>
        </div>
      ))}
    </div>
  )
}

// ── Leases tab ────────────────────────────────────────────────────────────────
function LeasesTab({ leases, units, property }: { leases: ReturnType<typeof useLeases>['leases']; units: Unit[]; property: Property }) {
  const unitMap = Object.fromEntries(units.map((u) => [u.id, u]))

  if (leases.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
        <FileText className="w-10 h-10 mx-auto mb-2 text-mute-400" strokeWidth={1.5} />
        <p className="font-semibold text-ink">No leases yet for {property.name}</p>
        <Link to="/manager/leases" className="mt-4 inline-block bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700">
          Create lease
        </Link>
      </div>
    )
  }

  const statusColors: Record<LeaseStatus, string> = {
    active:     'bg-green-100 text-green-700',
    pending:    'bg-yellow-100 text-yellow-700',
    expired:    'bg-gray-100 text-gray-600',
    terminated: 'bg-red-100 text-red-700',
  }

  return (
    <div className="space-y-3">
      {leases.map((l) => {
        const unit = unitMap[l.unit_id]
        const name = l.profile?.full_name ?? l.profile?.email ?? 'Unknown'
        return (
          <div key={l.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-ink">{name}</h3>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[l.status]}`}>{l.status}</span>
                </div>
                <p className="text-sm text-mute mt-0.5">Unit {unit?.unit_number ?? '—'}</p>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs text-mute">
                  <div><span className="text-mute-400">Start:</span> {new Date(l.start_date).toLocaleDateString()}</div>
                  <div><span className="text-mute-400">End:</span> {new Date(l.end_date).toLocaleDateString()}</div>
                  <div><span className="text-mute-400">Rent:</span> ${Number(l.rent_amount).toLocaleString()}/mo</div>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Tenants tab ───────────────────────────────────────────────────────────────
function TenantsTab({ tenants, getActiveLease, units }: {
  tenants: ReturnType<typeof useTenants>['tenants']
  getActiveLease: ReturnType<typeof useTenants>['getActiveLease']
  units: Unit[]
}) {
  if (tenants.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
        <Users className="w-10 h-10 mx-auto mb-2 text-mute-400" strokeWidth={1.5} />
        <p className="font-semibold text-ink">No tenants at this property yet</p>
      </div>
    )
  }
  const unitMap = Object.fromEntries(units.map((u) => [u.id, u]))

  return (
    <div className="space-y-3">
      {tenants.map((t) => {
        const lease = getActiveLease(t.id)
        const unit = lease ? unitMap[lease.unit_id] : undefined
        const name = t.full_name ?? t.email ?? 'Unknown'
        const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
        return (
          <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            {t.avatar_url ? (
              <img src={t.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-bold shrink-0">
                {initials || '?'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-ink truncate">{name}</p>
              <p className="text-xs text-mute truncate">{t.email}</p>
              {unit && <p className="text-xs text-mute mt-0.5">Unit {unit.unit_number} · ${Number(lease!.rent_amount).toLocaleString()}/mo</p>}
            </div>
            {lease && <span className="text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Active</span>}
          </div>
        )
      })}
    </div>
  )
}

// ── Maintenance tab ───────────────────────────────────────────────────────────
function MaintenanceTab({ unitIds, units }: { unitIds: string[]; units: Unit[] }) {
  const [requests, setRequests] = useState<Array<{ id: string; title: string; status: string; priority: string; unit_id: string; created_at: string }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (unitIds.length === 0) { setRequests([]); setLoading(false); return }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('maintenance_requests')
        .select('id, title, status, priority, unit_id, created_at')
        .in('unit_id', unitIds)
        .order('created_at', { ascending: false })
      if (!cancelled) {
        setRequests((data ?? []) as any)
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitIds.join(',')])

  const unitMap = Object.fromEntries(units.map((u) => [u.id, u]))

  if (loading) return <div className="text-mute py-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" strokeWidth={1.75} /></div>

  if (requests.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
        <Wrench className="w-10 h-10 mx-auto mb-2 text-mute-400" strokeWidth={1.5} />
        <p className="font-semibold text-ink">No maintenance requests</p>
        <Link to="/manager/maintenance" className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline">
          Open Maintenance →
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {requests.map((r) => {
        const unit = unitMap[r.unit_id]
        return (
          <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink truncate">{r.title}</p>
                <p className="text-xs text-mute mt-0.5">Unit {unit?.unit_number ?? '—'} · {new Date(r.created_at).toLocaleDateString()}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 capitalize">{r.priority}</span>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 capitalize">{r.status.replace('_', ' ')}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Payments tab ──────────────────────────────────────────────────────────────
function PaymentsTab({ leases, units }: { leases: ReturnType<typeof useLeases>['leases']; units: Unit[] }) {
  const leaseIds = useMemo(() => leases.map((l) => l.id), [leases])
  const { payments, loading, markPaid } = usePayments(leaseIds)
  const [scheduleTarget, setScheduleTarget] = useState<Lease | null>(null)

  const unitMap = Object.fromEntries(units.map((u) => [u.id, u]))
  const leaseMap = Object.fromEntries(leases.map((l) => [l.id, l]))

  const upcoming = payments.filter((p) => p.status === 'pending').sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
  const completed = payments.filter((p) => p.status === 'completed').slice(0, 5)

  return (
    <div className="space-y-6">
      {/* Per-lease payment schedule */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-mute">Payment schedules</h2>
            <p className="text-xs text-mute mt-1">
              Rent payments auto-generate when a lease is activated. Click a lease to adjust the due-day.
            </p>
          </div>
        </div>

        {leases.length === 0 ? (
          <p className="text-sm text-mute">No leases at this property yet.</p>
        ) : (
          <div className="space-y-2">
            {leases.map((l) => {
              const unit = unitMap[l.unit_id]
              const name = l.profile?.full_name ?? l.profile?.email ?? 'Tenant'
              const dueDay = (l as any).payment_due_day ?? 1
              const generated = (l as any).payment_schedule_generated_at != null
              return (
                <button
                  key={l.id}
                  onClick={() => setScheduleTarget(l)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 text-left border border-gray-100"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink truncate">{name} · Unit {unit?.unit_number ?? '—'}</p>
                    <p className="text-xs text-mute mt-0.5">
                      Due day {dueDay} · ${Number(l.rent_amount).toLocaleString()}/mo
                      {l.status === 'active'
                        ? (generated ? ' · schedule live' : ' · schedule pending')
                        : ` · ${l.status}`}
                    </p>
                  </div>
                  <Calendar className="w-4 h-4 text-mute" strokeWidth={1.75} />
                </button>
              )
            })}
          </div>
        )}
      </section>

      {/* Upcoming */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-mute mb-3">Upcoming payments</h2>
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin text-mute" strokeWidth={1.75} />
        ) : upcoming.length === 0 ? (
          <p className="text-sm text-mute">No upcoming payments scheduled.</p>
        ) : (
          <div className="space-y-2">
            {upcoming.slice(0, 10).map((p) => {
              const l = leaseMap[p.lease_id]
              const unit = l ? unitMap[l.unit_id] : undefined
              return (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="text-ink truncate">{l?.profile?.full_name ?? l?.profile?.email ?? '—'} · Unit {unit?.unit_number ?? '—'}</p>
                    <p className="text-xs text-mute">Due {p.due_date ? new Date(p.due_date).toLocaleDateString() : '—'} · {p.type}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-ink">${Number(p.amount).toLocaleString()}</p>
                    <button
                      onClick={() => markPaid(p.id).then(() => toast.success('Marked paid')).catch((e) => toast.error(e.message))}
                      className="text-xs text-brand-700 font-medium hover:underline"
                    >
                      Mark paid
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Recent paid */}
      {completed.length > 0 && (
        <section className="bg-white rounded-2xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-mute mb-3">Recently paid</h2>
          <div className="space-y-2 text-sm">
            {completed.map((p) => {
              const l = leaseMap[p.lease_id]
              const unit = l ? unitMap[l.unit_id] : undefined
              return (
                <div key={p.id} className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-ink truncate">{l?.profile?.full_name ?? '—'} · Unit {unit?.unit_number ?? '—'}</p>
                    <p className="text-xs text-mute">Paid {p.paid_at ? new Date(p.paid_at).toLocaleDateString() : '—'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-ink">${Number(p.amount).toLocaleString()}</p>
                    <span className="text-xs text-green-700 inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" strokeWidth={2} /> {p.type}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <Modal open={!!scheduleTarget} onClose={() => setScheduleTarget(null)} title="Payment schedule">
        {scheduleTarget && (
          <PaymentScheduleEditor
            lease={scheduleTarget}
            onClose={() => setScheduleTarget(null)}
          />
        )}
      </Modal>
    </div>
  )
}

// ── Payment schedule editor ───────────────────────────────────────────────────
function PaymentScheduleEditor({ lease, onClose }: { lease: Lease; onClose: () => void }) {
  const [dueDay, setDueDay] = useState<number>((lease as any).payment_due_day ?? 1)
  const [saving, setSaving] = useState(false)
  const generated = (lease as any).payment_schedule_generated_at != null

  const handleSave = async () => {
    setSaving(true)
    const { error } = await supabase
      .from('leases')
      .update({ payment_due_day: dueDay })
      .eq('id', lease.id)
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Payment schedule updated')
    onClose()
  }

  return (
    <div className="space-y-4">
      <div className="bg-gray-50 rounded-lg p-3 text-xs text-mute">
        <p className="font-medium text-ink mb-1 inline-flex items-center gap-1.5">
          <DollarSign className="w-3.5 h-3.5" strokeWidth={1.75} />
          ${Number(lease.rent_amount).toLocaleString()} / mo
        </p>
        <p>Lease runs {new Date(lease.start_date).toLocaleDateString()} → {new Date(lease.end_date).toLocaleDateString()}</p>
        {generated ? (
          <p className="text-green-700 mt-1 inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.75} /> Schedule already generated</p>
        ) : lease.status === 'active' ? (
          <p className="text-yellow-700 mt-1 inline-flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" strokeWidth={1.75} /> Schedule will generate next activation</p>
        ) : (
          <p className="text-mute mt-1">Schedule generates when lease becomes active.</p>
        )}
      </div>

      <FormField label="Rent due-day (1–28)">
        <input
          type="number"
          min={1}
          max={28}
          value={dueDay}
          onChange={(e) => setDueDay(Math.min(28, Math.max(1, Number(e.target.value))))}
          className={inputClass}
        />
      </FormField>

      <p className="text-xs text-mute">
        Day of month rent comes due. Capped at 28 to keep schedules consistent through February.
      </p>

      <div className="flex gap-3 pt-2">
        <button onClick={onClose} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium text-mute hover:bg-gray-50">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save schedule'}
        </button>
      </div>
    </div>
  )
}

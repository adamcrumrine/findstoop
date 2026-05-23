// Property detail page — top-level tabs for one property.
// Tabs: Overview · Units · Leases · Tenants · Maintenance · Payments

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useUnitsByProperty } from '@findstoop/shared/hooks/useUnits'
import { useLeases, useTenants } from '@findstoop/shared/hooks/useLeases'
import { usePayments } from '@findstoop/shared/hooks/usePayments'
import { formatUsdCents } from '@findstoop/shared/lib/format'
import { rowStatus, paymentAnchor } from '@findstoop/shared/lib/paymentRails'
import type { Property } from '@findstoop/shared/types/property'
import type { Unit } from '@findstoop/shared/types/unit'
import type { Lease, LeaseStatus } from '@findstoop/shared/types/lease'
import {
  ArrowLeft, Building2, Loader2, Home, FileText, Users, Wrench, CreditCard,
  CheckCircle2, Calendar, DollarSign, Copy, AlertCircle, Pencil, Trash2, MessageSquare,
  ShieldCheck, IdCard,
} from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../../components/shared/Modal'
import FormField, { inputClass } from '../../components/shared/FormField'
import ImageUploader from '../../components/shared/ImageUploader'
import Avatar from '../../components/shared/Avatar'

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
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

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
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-2xl font-semibold text-ink">{property.name}</h1>
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-mute hover:text-brand-700 border border-gray-200 hover:border-brand-300 px-2.5 py-1 rounded-lg transition-colors shrink-0"
            >
              <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} /> Edit
            </button>
          </div>
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

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit property">
        <PropertyEditForm
          property={property}
          onSaved={(next) => { setProperty(next); setEditOpen(false) }}
          onCancel={() => setEditOpen(false)}
        />
      </Modal>

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
      {tab === 'overview' && <OverviewTab property={property} units={units} leases={leases} onPropertyUpdate={setProperty} />}
      {tab === 'units' && <UnitsTab units={units} property={property} />}
      {tab === 'leases' && <LeasesTab leases={leases} units={units} property={property} />}
      {tab === 'tenants' && <TenantsTab tenants={tenants} getActiveLease={getActiveLease} units={units} />}
      {tab === 'maintenance' && <MaintenanceTab unitIds={unitIds} units={units} />}
      {tab === 'payments' && <PaymentsTab leases={leases} units={units} />}

      {/* Danger zone — separated from the rest of the screen so it's hard to hit by accident. */}
      <section className="mt-10 pt-6 border-t border-red-100">
        <h2 className="text-xs uppercase tracking-wider text-red-600 font-semibold mb-2">Danger zone</h2>
        <div className="bg-white border border-red-200 rounded-2xl p-5 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="font-semibold text-ink">Delete this property</p>
            <p className="text-sm text-mute mt-0.5 max-w-md">
              Permanently removes <strong>{property.name}</strong>, all of its units, leases,
              payments, maintenance requests, and documents. This cannot be undone.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-red-700 border border-red-300 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" strokeWidth={1.75} /> Delete property
          </button>
        </div>
      </section>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete property">
        <PropertyDeleteForm
          property={property}
          onDeleted={() => navigate('/manager/properties')}
          onCancel={() => setDeleteOpen(false)}
        />
      </Modal>
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
function OverviewTab({ property, units, leases, onPropertyUpdate }: {
  property: Property
  units: Unit[]
  leases: ReturnType<typeof useLeases>['leases']
  onPropertyUpdate: (p: Property) => void
}) {
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

      <div className="sm:col-span-2">
        <ScreeningPrefsCard property={property} onUpdate={onPropertyUpdate} />
      </div>
    </div>
  )
}

// ── Screening preferences card (Overview tab) ────────────────────────────
// v1: pre-qual (base $5) + selfie ID match (+$2) are live — both run on our
// own Claude vision pipeline, no external vendor needed. Credit / criminal /
// eviction stay "Coming Soon" until vendor onboarding completes.
function ScreeningPrefsCard({ property, onUpdate }: { property: Property; onUpdate: (p: Property) => void }) {
  const setSelfie = async (value: boolean) => {
    const prior = property.require_selfie_screening
    onUpdate({ ...property, require_selfie_screening: value })
    const { error } = await supabase.from('properties').update({ require_selfie_screening: value }).eq('id', property.id)
    if (error) {
      onUpdate({ ...property, require_selfie_screening: prior })
      toast.error(error.message)
    }
  }

  const selfieOn = property.require_selfie_screening
  const total = 5 + (selfieOn ? 2 : 0)

  const comingSoon = [
    { label: 'Credit report',       price: 15, sub: 'Credit history + score from a regulated consumer reporting agency.', Icon: CreditCard },
    { label: 'Criminal background', price: 25, sub: 'National criminal + sex offender + global watchlist.', Icon: ShieldCheck },
    { label: 'Eviction history',    price: 10, sub: 'Eviction court records nationwide.', Icon: AlertCircle },
  ]

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs uppercase tracking-wider text-mute font-semibold">Screening required for applicants</h2>
        <span className="text-xs text-mute">Applicant pays <strong className="text-ink">${total}</strong></span>
      </div>
      <p className="text-xs text-mute mb-4">
        Every applicant completes <strong className="text-ink">verified pre-qualification</strong> — income (paystub OCR), identity (driver's license OCR), and an AI rentability score — for $5. Add the selfie ID match below for stronger fraud protection.
      </p>

      {/* Live: selfie toggle */}
      <button
        type="button"
        onClick={() => setSelfie(!selfieOn)}
        className={`w-full flex items-start gap-3 px-4 py-3 rounded-xl border-2 text-left transition-colors mb-2 ${
          selfieOn ? 'border-brand-400 bg-brand-50/40' : 'border-gray-200 bg-white hover:border-gray-300'
        }`}
      >
        <div className={`shrink-0 w-9 h-9 rounded-lg inline-flex items-center justify-center ${selfieOn ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-mute'}`}>
          <IdCard className="w-4 h-4" strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-ink">Selfie ID match</p>
            <span className="text-[10px] font-bold uppercase tracking-wider text-mute bg-gray-100 px-1.5 py-0.5 rounded">+$2</span>
          </div>
          <p className="text-xs text-mute mt-0.5 leading-relaxed">
            Applicant snaps a selfie; we match it to their license photo. Catches identity fraud cleanly.
          </p>
        </div>
        <div className={`shrink-0 w-10 h-6 rounded-full transition-colors relative ${selfieOn ? 'bg-brand-500' : 'bg-gray-300'}`}>
          <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${selfieOn ? 'left-[18px]' : 'left-0.5'}`} />
        </div>
      </button>

      {/* Coming soon: credit / criminal / eviction */}
      <div className="space-y-2">
        {comingSoon.map(({ label, price, sub, Icon }) => (
          <div
            key={label}
            className="w-full flex items-start gap-3 px-4 py-3 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 text-left opacity-75"
          >
            <div className="shrink-0 w-9 h-9 rounded-lg inline-flex items-center justify-center bg-gray-100 text-mute">
              <Icon className="w-4 h-4" strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-ink">{label}</p>
                <span className="text-[10px] font-bold uppercase tracking-wider text-mute bg-gray-100 px-1.5 py-0.5 rounded">+${price}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">Coming soon</span>
              </div>
              <p className="text-xs text-mute mt-0.5 leading-relaxed">{sub}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
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
  const [localUnits, setLocalUnits] = useState<Unit[]>(units)

  useEffect(() => { setLocalUnits(units) }, [units])

  const copyApplyLink = (unitId: string) => {
    const link = `${window.location.origin}/apply/${unitId}`
    navigator.clipboard.writeText(link).then(() => toast.success('Apply link copied'))
  }

  const setStatus = async (unit: Unit, next: Unit['status']) => {
    const prior = unit.status
    setLocalUnits((arr) => arr.map((u) => u.id === unit.id ? { ...u, status: next } : u))
    const { error } = await supabase.from('units').update({ status: next }).eq('id', unit.id)
    if (error) {
      setLocalUnits((arr) => arr.map((u) => u.id === unit.id ? { ...u, status: prior } : u))
      toast.error(error.message)
    } else {
      toast.success(`Unit ${unit.unit_number} → ${next}`)
    }
  }

  if (localUnits.length === 0) {
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

  const statusColor = (s: Unit['status']) =>
    s === 'occupied' ? 'bg-green-100 text-green-700 border-green-200'
      : s === 'vacant' ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
      : 'bg-gray-100 text-gray-700 border-gray-200'

  return (
    <div className="space-y-3">
      {localUnits.map((u) => (
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
          <select
            value={u.status}
            onChange={(e) => setStatus(u, e.target.value as Unit['status'])}
            className={`text-xs font-medium px-2 py-1 rounded-full capitalize border bg-white focus:outline-none focus:ring-1 focus:ring-brand-500 ${statusColor(u.status)}`}
            aria-label={`Status for unit ${u.unit_number}`}
            title="Set occupancy status"
          >
            <option value="vacant">vacant</option>
            <option value="occupied">occupied</option>
            <option value="maintenance">maintenance</option>
          </select>
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
          <Link
            key={l.id}
            to={`/manager/review-lease/${l.id}`}
            className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all"
          >
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
          </Link>
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
        return (
          <Link
            key={t.id}
            to={`/manager/tenants/${t.id}`}
            className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all"
          >
            <div className="flex items-center gap-3">
              <Avatar name={t.full_name} email={t.email} url={t.avatar_url} size={40} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-ink truncate">{name}</p>
                <p className="text-xs text-mute truncate">{t.email}</p>
                {unit && <p className="text-xs text-mute mt-0.5">Unit {unit.unit_number} · ${Number(lease!.rent_amount).toLocaleString()}/mo</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                {lease && (
                  <Link
                    to={`/manager/messages?tenantId=${t.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="p-2 rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors"
                    title={`Message ${name}`}
                  >
                    <MessageSquare className="w-4 h-4" strokeWidth={1.75} />
                  </Link>
                )}
                {lease && <span className="text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Active</span>}
              </div>
            </div>
          </Link>
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

  // Same buckets the Payments page + Dashboard use. Sorted by paymentAnchor()
  // ascending for upcoming (next due first) and descending for completed.
  const upcoming = payments
    .filter((p) => p.status === 'pending')
    .sort((a, b) => paymentAnchor(a).localeCompare(paymentAnchor(b)))
  const completed = payments
    .filter((p) => p.status === 'completed' || p.status === 'processing' || p.status === 'failed')
    .sort((a, b) => paymentAnchor(b).localeCompare(paymentAnchor(a)))
    .slice(0, 5)

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
              const tenantName = l.profile?.full_name ?? l.profile?.email ?? 'Tenant'
              const dueDay = (l as any).payment_due_day ?? 1
              const generated = (l as any).payment_schedule_generated_at != null
              return (
                <div
                  key={l.id}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink truncate">
                      {l.profile?.id ? (
                        <Link to={`/manager/tenants/${l.profile.id}`} className="hover:underline">
                          {tenantName}
                        </Link>
                      ) : tenantName}
                      <span className="text-mute font-normal"> · Unit {unit?.unit_number ?? '—'}</span>
                    </p>
                    <Link
                      to={`/manager/review-lease/${l.id}`}
                      className="text-xs text-mute mt-0.5 hover:text-brand-700 hover:underline block"
                    >
                      Due day {dueDay} · ${Number(l.rent_amount).toLocaleString()}/mo
                      {l.status === 'active'
                        ? (generated ? ' · schedule live' : ' · schedule pending')
                        : ` · ${l.status}`}
                      <span className="ml-1 text-brand-700">· open lease</span>
                    </Link>
                  </div>
                  <button
                    type="button"
                    onClick={() => setScheduleTarget(l)}
                    className="shrink-0 p-1.5 rounded-md text-mute hover:text-ink hover:bg-gray-100"
                    title="Edit payment schedule"
                  >
                    <Calendar className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Upcoming — same row layout the Payments page uses */}
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
              const status = rowStatus(p)
              return (
                <div key={p.id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-ink truncate">{l?.profile?.full_name ?? l?.profile?.email ?? '—'} · Unit {unit?.unit_number ?? '—'}</p>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${status.cls}`}>
                        {status.label}
                      </span>
                    </div>
                    <p className="text-xs text-mute capitalize">{p.type.replace(/_/g, ' ')} · {new Date(paymentAnchor(p)).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right shrink-0 flex items-center gap-2">
                    <p className="font-semibold text-ink">{formatUsdCents(Number(p.amount))}</p>
                    <button
                      onClick={() => markPaid(p.id).then(() => toast.success('Marked paid')).catch((e) => toast.error(e.message))}
                      className="text-xs font-medium text-brand-600 border border-brand-200 px-2 py-1 rounded-lg hover:bg-brand-50 transition-colors"
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

      {/* Recently moved (completed / processing / failed) */}
      {completed.length > 0 && (
        <section className="bg-white rounded-2xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-mute mb-3">Recent activity</h2>
          <div className="space-y-2 text-sm">
            {completed.map((p) => {
              const l = leaseMap[p.lease_id]
              const unit = l ? unitMap[l.unit_id] : undefined
              const status = rowStatus(p)
              return (
                <div key={p.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-ink truncate">{l?.profile?.full_name ?? '—'} · Unit {unit?.unit_number ?? '—'}</p>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${status.cls}`}>
                        {status.label}
                      </span>
                    </div>
                    <p className="text-xs text-mute capitalize">{p.type.replace(/_/g, ' ')} · {new Date(paymentAnchor(p)).toLocaleDateString()}</p>
                  </div>
                  <p className="font-semibold text-ink shrink-0">{formatUsdCents(Number(p.amount))}</p>
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


// ── Property edit form (rendered inside Modal in the header) ─────────────────
function PropertyEditForm({
  property,
  onSaved,
  onCancel,
}: {
  property: Property
  onSaved: (next: Property) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    name: property.name,
    address: property.address,
    city: property.city,
    state: property.state,
    zip: property.zip,
    thumbnail_url: property.thumbnail_url ?? null as string | null,
  })
  const [saving, setSaving] = useState(false)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.name.trim() || !form.address.trim() || !form.city.trim() || !form.state.trim() || !form.zip.trim()) {
      toast.error('Name, address, city, state, and ZIP are required')
      return
    }
    setSaving(true)
    const { data, error } = await supabase
      .from('properties')
      .update({
        name: form.name.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        zip: form.zip.trim(),
        thumbnail_url: form.thumbnail_url,
      })
      .eq('id', property.id)
      .select()
      .single()
    setSaving(false)
    if (error || !data) {
      toast.error(error?.message ?? 'Could not save property')
      return
    }
    toast.success('Property saved')
    onSaved(data as Property)
  }

  return (
    <div className="space-y-4">
      <ImageUploader
        currentUrl={form.thumbnail_url}
        onChange={(url) => setForm((f) => ({ ...f, thumbnail_url: url }))}
        pathPrefix={`property-thumbnails/${property.id}`}
        variant="square"
        size={80}
        label="Thumbnail"
      />
      <FormField label="Property name" required>
        <input className={inputClass} value={form.name} onChange={set('name')} />
      </FormField>
      <FormField label="Street address" required>
        <input className={inputClass} value={form.address} onChange={set('address')} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="City" required>
          <input className={inputClass} value={form.city} onChange={set('city')} />
        </FormField>
        <FormField label="State" required>
          <input className={inputClass} value={form.state} onChange={set('state')} maxLength={2} />
        </FormField>
      </div>
      <FormField label="ZIP" required>
        <input className={inputClass} value={form.zip} onChange={set('zip')} maxLength={10} />
      </FormField>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} disabled={saving} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium text-mute hover:bg-gray-50 disabled:opacity-50">
          Cancel
        </button>
        <button type="button" onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// ── Property delete form (type DELETE to confirm) ────────────────────────────
function PropertyDeleteForm({
  property,
  onDeleted,
  onCancel,
}: {
  property: Property
  onDeleted: () => void
  onCancel: () => void
}) {
  const [typed, setTyped] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const armed = typed.trim() === 'DELETE'

  const handleConfirm = async () => {
    if (!armed) return
    setSubmitting(true)
    const { error } = await supabase.from('properties').delete().eq('id', property.id)
    setSubmitting(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Property deleted')
    onDeleted()
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-900">
        <p className="font-semibold mb-1">This cannot be undone.</p>
        <p>
          Deleting <strong>{property.name}</strong> will also remove all of its units, leases, payments, maintenance requests, and documents.
        </p>
      </div>

      <div>
        <label className="block text-xs uppercase tracking-wider text-mute font-semibold mb-1.5">
          Type DELETE to confirm
        </label>
        <input
          autoFocus
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="DELETE"
          className={inputClass}
          autoComplete="off"
        />
      </div>

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!armed || submitting}
          className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Deleting…' : 'Delete property'}
        </button>
      </div>
    </div>
  )
}

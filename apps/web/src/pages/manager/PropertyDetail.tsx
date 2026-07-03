// Property detail page — top-level tabs for one property.
// Tabs: Overview · Units · Turnover · Leases · Tenants · Maintenance · Payments · Compliance

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useUnitsByProperty } from '@findstoop/shared/hooks/useUnits'
import { useLeases, useTenants } from '@findstoop/shared/hooks/useLeases'
import { usePayments } from '@findstoop/shared/hooks/usePayments'
import { regenerateRentSchedule } from '@findstoop/shared/api/payments'
import { formatUsdCents, formatLocalDate } from '@findstoop/shared/lib/format'
import { rowStatus, paymentAnchor } from '@findstoop/shared/lib/paymentRails'
import type { Property } from '@findstoop/shared/types/property'
import type { Unit } from '@findstoop/shared/types/unit'
import type { Lease, LeaseStatus } from '@findstoop/shared/types/lease'
import type { Payment } from '@findstoop/shared/types/payment'
import {
  ArrowLeft, Building2, Loader2, Home, FileText, Users, Wrench, CreditCard,
  CheckCircle2, Calendar, DollarSign, Copy, AlertCircle, Pencil, Trash2, MessageSquare,
  ShieldCheck, RefreshCw, ChevronDown, GraduationCap, Scale,
} from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../../components/shared/Modal'
import MonthlyDonut from '../../components/manager/MonthlyDonut'
import CompliancePanel from '../../components/manager/CompliancePanel'
import TurnoverPanel from '../../components/manager/TurnoverPanel'
import SeasonalMaintenanceCard from '../../components/manager/SeasonalMaintenanceCard'
import VacancyCostTicker from '../../components/manager/VacancyCostTicker'
import { vacancyCostForUnit } from '../../lib/turnover'
import { isBlockedState, blockedStateName } from '../../lib/blockedStates'
import FormField, { inputClass } from '../../components/shared/FormField'
import ImageUploader from '../../components/shared/ImageUploader'
import Avatar from '../../components/shared/Avatar'
import { BRAND, brandColor } from '../../lib/brand'

type TabId = 'overview' | 'units' | 'turnover' | 'leases' | 'tenants' | 'maintenance' | 'payments' | 'compliance'

const tabs: { id: TabId; label: string; Icon: typeof Home }[] = [
  { id: 'overview',    label: 'Overview',    Icon: Home },
  { id: 'units',       label: 'Units',       Icon: Building2 },
  { id: 'turnover',    label: 'Turnover',    Icon: RefreshCw },
  { id: 'leases',      label: 'Leases',      Icon: FileText },
  { id: 'tenants',     label: 'Tenants',     Icon: Users },
  { id: 'maintenance', label: 'Maintenance', Icon: Wrench },
  { id: 'payments',    label: 'Payments',    Icon: CreditCard },
  { id: 'compliance',  label: 'Compliance',  Icon: Scale },
]

export default function ManagerPropertyDetail() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [property, setProperty] = useState<Property | null>(null)
  const [loading, setLoading] = useState(true)
  // Deep-linkable tab (?tab=turnover) — dashboard insight cards land here.
  const [tab, setTab] = useState<TabId>(() => {
    const t = searchParams.get('tab')
    return tabs.some((x) => x.id === t) ? (t as TabId) : 'overview'
  })
  // Lease-status filter for the Payments tab — lifted here so it can sit inline
  // with the unit "Viewing" selector instead of taking its own row.
  const [leaseStatusFilter, setLeaseStatusFilter] = useState<'all' | 'past' | 'active' | 'upcoming'>('active')
  const [selectedUnitId, setSelectedUnitId] = useState<string>('all')
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

  // Keep the selected tab visible when the tab strip overflows on mobile.
  // Declared before the early returns below (rules of hooks).
  const tabsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    tabsRef.current?.querySelector(`[data-tab="${tab}"]`)
      ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [tab])

  // Per-unit scope. When a property has more than one unit, the manager can
  // narrow every tab + the header stats to a single unit. 'all' = whole property.
  const multiUnit = units.length > 1
  const effectiveUnitId = selectedUnitId !== 'all' && units.some((u) => u.id === selectedUnitId)
    ? selectedUnitId : 'all'
  const scopedUnits = useMemo(
    () => (effectiveUnitId === 'all' ? units : units.filter((u) => u.id === effectiveUnitId)),
    [units, effectiveUnitId],
  )
  const scopedLeases = useMemo(
    () => (effectiveUnitId === 'all' ? leases : leases.filter((l) => l.unit_id === effectiveUnitId)),
    [leases, effectiveUnitId],
  )
  const scopedTenants = useMemo(() => {
    if (effectiveUnitId === 'all') return tenants
    const ids = new Set(scopedLeases.map((l) => l.tenant_id))
    return tenants.filter((t) => ids.has(t.id))
  }, [tenants, scopedLeases, effectiveUnitId])
  const scopedUnitIds = useMemo(() => scopedUnits.map((u) => u.id), [scopedUnits])

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

  const activeLeases = scopedLeases.filter((l) => l.status === 'active')
  const occupiedCount = scopedUnits.filter((u) => u.status === 'occupied').length
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

      {/* Header — on mobile the stats break OUT of the thumbnail row so they
          get the card's full width instead of being squeezed beside the image. */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 mb-4">
        <div className="flex items-start gap-4 sm:gap-5">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center">
            {property.thumbnail_url ? (
              <img src={property.thumbnail_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <Building2 className="w-8 h-8 text-mute-400" strokeWidth={1.5} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h1 className="text-xl sm:text-2xl font-semibold text-ink leading-snug">{property.name}</h1>
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                aria-label="Edit property"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-mute hover:text-brand-700 border border-gray-200 hover:border-brand-300 p-2 sm:px-2.5 sm:py-1 rounded-lg transition-colors shrink-0"
              >
                <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span className="hidden sm:inline">Edit</span>
              </button>
            </div>
            <p className="text-sm text-mute mt-0.5">{property.address}</p>
            <p className="text-sm text-mute">{property.city}, {property.state} {property.zip}</p>
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-gray-100 grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:flex sm:gap-6">
          <Stat label="Units" value={scopedUnits.length} />
          <Stat label="Occupied" value={`${occupiedCount}/${scopedUnits.length}`} />
          <Stat label="Active leases" value={activeLeases.length} />
          <Stat label="Monthly rent" value={`$${totalRent.toLocaleString()}`} />
        </div>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit property">
        <PropertyEditForm
          property={property}
          onSaved={(next) => { setProperty(next); setEditOpen(false) }}
          onCancel={() => setEditOpen(false)}
        />
      </Modal>

      {/* Controls row — unit scope selector (multi-unit only) + the Payments
          lease-status filter, kept on one line to save vertical space. */}
      {(multiUnit || tab === 'payments') && (
        <div className="flex items-center justify-end gap-3 mb-3 flex-wrap">
          {tab === 'payments' && (
            <div className="flex items-center gap-2">
              <label htmlFor="lease-status" className="text-xs uppercase tracking-wider text-mute font-semibold">Leases</label>
              <select
                id="lease-status"
                value={leaseStatusFilter}
                onChange={(e) => setLeaseStatusFilter(e.target.value as typeof leaseStatusFilter)}
                className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 capitalize"
              >
                <option value="active">Active</option>
                <option value="all">All</option>
                <option value="past">Past</option>
                <option value="upcoming">Upcoming</option>
              </select>
            </div>
          )}
          {multiUnit && (
            <div className="flex items-center gap-2">
              <label htmlFor="unit-scope" className="text-xs uppercase tracking-wider text-mute font-semibold">Viewing</label>
              <select
                id="unit-scope"
                value={effectiveUnitId}
                onChange={(e) => setSelectedUnitId(e.target.value)}
                className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="all">All units ({units.length})</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>Unit {u.unit_number}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Tabs — horizontal scroll on narrow screens; a right-edge fade hints
          at more tabs (otherwise a half-clipped pill looks broken), and the
          active tab auto-scrolls into view. */}
      <div className="relative mb-4">
        <div ref={tabsRef} className="bg-white rounded-2xl border border-gray-200 p-2 overflow-x-auto no-scrollbar">
          <div className="flex gap-1 min-w-max">
            {tabs.map(({ id: tid, label, Icon }) => (
              <button
                key={tid}
                data-tab={tid}
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
        <div aria-hidden className="pointer-events-none absolute inset-y-px right-px w-10 rounded-r-2xl bg-gradient-to-l from-white to-transparent sm:hidden" />
      </div>

      {/* Tab content */}
      {tab === 'overview' && <OverviewTab property={property} units={scopedUnits} leases={scopedLeases} onPropertyUpdate={setProperty} />}
      {tab === 'overview' && <SeasonalMaintenanceCard property={property} units={scopedUnits} leases={scopedLeases} />}
      {tab === 'units' && <UnitsTab units={scopedUnits} property={property} leases={scopedLeases} />}
      {tab === 'turnover' && <TurnoverPanel property={property} units={scopedUnits} leases={scopedLeases} />}
      {tab === 'leases' && <LeasesTab leases={scopedLeases} units={scopedUnits} property={property} />}
      {tab === 'tenants' && <TenantsTab tenants={scopedTenants} getActiveLease={getActiveLease} units={scopedUnits} />}
      {tab === 'maintenance' && <MaintenanceTab unitIds={scopedUnitIds} units={scopedUnits} />}
      {tab === 'payments' && <PaymentsTab leases={scopedLeases} units={scopedUnits} leaseStatusFilter={leaseStatusFilter} />}
      {tab === 'compliance' && <CompliancePanel property={property} leases={scopedLeases} />}

      {/* Danger zone — Overview only. Rendering it under every tab put a
          permanent red "Delete property" next to routine work (checking a
          unit, reading payments); destructive actions live on one screen. */}
      {tab === 'overview' && (
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
      )}

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
        <ul className="space-y-2.5 text-sm">
          {vacantUnits.map((u) => {
            const cost = vacancyCostForUnit(u, leases, new Date().toISOString().slice(0, 10))
            return (
              <li key={u.id}>
                <div className="flex items-center justify-between">
                  <span className="text-ink">Unit {u.unit_number}</span>
                  <span className="text-mute">${Number(u.rent_amount).toLocaleString()}/mo</span>
                </div>
                {cost && <VacancyCostTicker cost={cost} className="mt-0.5" />}
              </li>
            )
          })}
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
        <StudentHousingCard property={property} onUpdate={onPropertyUpdate} />
      </div>

      <div className="sm:col-span-2">
        <ScreeningPrefsCard property={property} onUpdate={onPropertyUpdate} />
      </div>
    </div>
  )
}

// ── Student housing toggle (Overview tab) ──────────────────────────────────
// Self-serve "Student Housing mode": flips on the renter-help tools for this
// property's tenants. No university partnership required.
function StudentHousingCard({ property, onUpdate }: { property: Property; onUpdate: (p: Property) => void }) {
  const on = !!property.student_housing
  const toggle = async () => {
    const next = !on
    onUpdate({ ...property, student_housing: next })
    const { error } = await supabase.from('properties').update({ student_housing: next }).eq('id', property.id)
    if (error) {
      onUpdate({ ...property, student_housing: on })
      toast.error(error.message)
    } else {
      toast.success(next ? 'Student housing mode on' : 'Student housing mode off')
    }
  }
  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-brand-600" strokeWidth={1.75} />
            <h2 className="text-sm font-semibold text-ink">Student housing</h2>
          </div>
          <p className="text-xs text-mute mt-1.5 leading-relaxed">
            Turn this on for a student / off-campus rental. Your tenants get free renter tools in
            their portal — a plain-English lease explainer, their Ohio tenant rights, move-in
            documentation, and deposit protection. Powered by {BRAND.name}.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Student housing mode"
          onClick={toggle}
          className={`shrink-0 mt-1 relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${on ? 'bg-brand-600' : 'bg-gray-300'}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>
    </section>
  )
}

// ── Tenability™ tier selector (Overview tab) ──────────────────────────────
// Two tiers, single source of truth:
//   Tenability™       ($5)  — require_credit_self_disclosed=false, require_selfie_screening=false
//   Tenability™ Pro   ($25) — require_credit_self_disclosed=true,  require_selfie_screening=true
// The selfie ID match is bundled FREE with Pro (its $2 cost is absorbed by
// the Pro tier so applicants see a clean +$20 over Standard rather than +$22).
function ScreeningPrefsCard({ property, onUpdate }: { property: Property; onUpdate: (p: Property) => void }) {
  const isPro = property.require_credit_self_disclosed
  const total = isPro ? 25 : 5

  // Single-call tier switch. Either both flags go on, or both go off.
  const setTier = async (pro: boolean) => {
    if (pro === isPro) return
    const priorCS = property.require_credit_self_disclosed
    const priorSelfie = property.require_selfie_screening
    onUpdate({ ...property, require_credit_self_disclosed: pro, require_selfie_screening: pro })
    const { error } = await supabase.from('properties').update({
      require_credit_self_disclosed: pro,
      require_selfie_screening: pro,
    }).eq('id', property.id)
    if (error) {
      onUpdate({ ...property, require_credit_self_disclosed: priorCS, require_selfie_screening: priorSelfie })
      toast.error(error.message)
    }
  }

  const comingSoon = [
    { label: 'Bureau credit report',  price: 15, sub: 'Credit history + score from a regulated consumer reporting agency.', Icon: CreditCard },
    { label: 'Criminal background',   price: 25, sub: 'National criminal + sex offender + global watchlist.', Icon: ShieldCheck },
    { label: 'Eviction history',      price: 10, sub: 'Eviction court records nationwide.', Icon: AlertCircle },
  ]

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs uppercase tracking-wider text-mute font-semibold">Tenability™ tier</h2>
        <span className="text-xs text-mute">Applicant pays <strong className="text-ink">${total}</strong></span>
      </div>
      <p className="text-xs text-mute mb-4">
        Pick the screening depth required for applicants to this property. The score is the same 0–100
        Tenability™ either way — Pro just looks deeper.
      </p>

      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        {/* Standard */}
        <button
          type="button"
          onClick={() => setTier(false)}
          className={`text-left rounded-xl border-2 p-4 transition-colors ${
            !isPro ? 'border-brand-500 bg-brand-50/50' : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-sm font-semibold text-ink">Tenability™</p>
            <span className="text-sm font-bold text-ink">$5</span>
          </div>
          <p className="text-[11px] text-mute leading-relaxed">
            Verified income, verified ID, and the 0–100 score.
          </p>
        </button>

        {/* Pro */}
        <button
          type="button"
          onClick={() => setTier(true)}
          className={`text-left rounded-xl border-2 p-4 transition-colors relative ${
            isPro ? 'border-brand-500 bg-brand-50/50' : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <span className="absolute -top-2.5 right-3 inline-flex text-[9px] font-bold uppercase tracking-wider text-white bg-brand-600 px-1.5 py-0.5 rounded-full">Best value</span>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-sm font-semibold text-ink">Tenability™ Pro</p>
            <span className="text-sm font-bold text-ink">$25</span>
          </div>
          <p className="text-[11px] text-mute leading-relaxed">
            Adds selfie ID match (free) + applicant-provided credit + authenticity scoring.
          </p>
        </button>
      </div>

      <div className="bg-brand-50/60 border border-brand-200/60 rounded-lg px-3 py-2 mb-3 text-[11px] text-ink leading-relaxed">
        <strong className="text-brand-700">What Pro adds:</strong> applicant uploads their free
        AnnualCreditReport.gov PDF and signs an attestation; our AI cross-checks it against the ID and pay
        stubs and surfaces an authenticity score. Selfie ID match is included free.
      </div>

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
function UnitsTab({ units, property, leases }: { units: Unit[]; property: Property; leases: ReturnType<typeof useLeases>['leases'] }) {
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
      {localUnits.map((u) => {
        const vacancy = vacancyCostForUnit(u, leases, new Date().toISOString().slice(0, 10))
        return (
        <div key={u.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-ink">Unit {u.unit_number}</p>
            <div className="text-xs text-mute mt-0.5 flex gap-3 flex-wrap">
              {u.bedrooms != null && <span>{u.bedrooms} bd</span>}
              {u.bathrooms != null && <span>{u.bathrooms} ba</span>}
              {u.square_feet && <span>{u.square_feet} sqft</span>}
              <span>${Number(u.rent_amount).toLocaleString()}/mo</span>
            </div>
            {vacancy && <VacancyCostTicker cost={vacancy} className="mt-1" />}
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
        )
      })}
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
    upcoming:   'bg-blue-100 text-blue-700',
    pending:    'bg-yellow-100 text-yellow-700',
    expired:    'bg-gray-100 text-gray-600',
    terminated: 'bg-red-100 text-red-700',
  }

  return (
    <div className="space-y-3">
      {leases.map((l) => {
        const unit = unitMap[l.unit_id]
        // All lessees on the lease, primary first. leases.tenant_id is kept in
        // sync with lease_tenants.is_primary by trigger, so it IS the primary.
        const lessees = (l.all_tenants && l.all_tenants.length > 0)
          ? [...l.all_tenants].sort((a, b) => Number(b.id === l.tenant_id) - Number(a.id === l.tenant_id))
          : (l.profile ? [l.profile] : [])
        // Same header pattern as the main Leases page: avatar stack +
        // "Primary +N" + status pill. Hovering an avatar names that person.
        const primary = lessees[0]
        const primaryName = primary?.full_name ?? primary?.email ?? 'Unknown'
        return (
          <Link
            key={l.id}
            to={`/manager/review-lease/${l.id}`}
            className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {lessees.length > 0 && (
                    <div className="flex -space-x-2 shrink-0">
                      {lessees.slice(0, 5).map((t) => (
                        <span key={t.id} title={t.full_name ?? t.email ?? 'Tenant'} className="inline-block ring-2 ring-white rounded-full">
                          <Avatar name={t.full_name} email={t.email} url={t.avatar_url} size={28} />
                        </span>
                      ))}
                      {lessees.length > 5 && (
                        <span
                          title={lessees.slice(5).map((t) => t.full_name ?? t.email).join(', ')}
                          className="inline-flex items-center justify-center w-7 h-7 ring-2 ring-white rounded-full bg-gray-200 text-[10px] font-semibold text-gray-700"
                        >
                          +{lessees.length - 5}
                        </span>
                      )}
                    </div>
                  )}
                  <h3 className="font-semibold text-ink truncate">
                    {lessees.length > 1 ? `${primaryName} +${lessees.length - 1}` : primaryName}
                  </h3>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[l.status]}`}>{l.status}</span>
                </div>
                <p className="text-sm text-mute mt-0.5">Unit {unit?.unit_number ?? '—'}</p>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs text-mute">
                  <div><span className="text-mute-400">Start:</span> {formatLocalDate(l.start_date)}</div>
                  <div><span className="text-mute-400">End:</span> {formatLocalDate(l.end_date)}</div>
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
            <div className="flex items-start gap-3">
              <Avatar name={t.full_name} email={t.email} url={t.avatar_url} size={40} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-ink truncate">{name}</p>
                <p className="text-xs text-mute truncate">{t.email}</p>
                {unit && <p className="text-xs text-mute mt-0.5">Unit {unit.unit_number} · ${Number(lease!.rent_amount).toLocaleString()}/mo</p>}
                {/* Badges live under the text — full card width on mobile, so
                    names/emails never fight them for room. */}
                {lease && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                    <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                      lease.tenant_id === t.id
                        ? 'text-brand-700 bg-brand-50 border border-brand-200'
                        : 'text-gray-600 bg-gray-100 border border-gray-200'
                    }`}>
                      {lease.tenant_id === t.id ? 'Primary' : 'Co-tenant'}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Active</span>
                  </div>
                )}
              </div>
              {lease && (
                <Link
                  to={`/manager/messages?tenantId=${t.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="p-2 rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors shrink-0"
                  title={`Message ${name}`}
                >
                  <MessageSquare className="w-4 h-4" strokeWidth={1.75} />
                </Link>
              )}
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
function PaymentsTab({ leases, units, leaseStatusFilter }: { leases: ReturnType<typeof useLeases>['leases']; units: Unit[]; leaseStatusFilter: 'all' | 'past' | 'active' | 'upcoming' }) {
  const leaseIds = useMemo(() => leases.map((l) => l.id), [leases])
  const { payments, loading, markPaid, reload } = usePayments(leaseIds)
  const [scheduleTarget, setScheduleTarget] = useState<Lease | null>(null)

  const unitMap = Object.fromEntries(units.map((u) => [u.id, u]))
  const leaseMap = Object.fromEntries(leases.map((l) => [l.id, l]))

  // Rent is split across every primary tenant — each row is billed to its OWN
  // primary (payment.tenant_id), not the lease's single legacy primary. Resolve
  // names per payment, otherwise a 4-way split shows the same name four times.
  const [tenantNameById, setTenantNameById] = useState<Record<string, string>>({})
  const payerTenantIds = useMemo(
    () => Array.from(new Set(payments.map((p) => p.tenant_id).filter(Boolean))),
    [payments],
  )
  const payerKey = payerTenantIds.join(',')
  useEffect(() => {
    if (payerTenantIds.length === 0) { setTenantNameById({}); return }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, email').in('id', payerTenantIds)
      if (cancelled) return
      const map: Record<string, string> = {}
      for (const r of (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
        map[r.id] = r.full_name ?? r.email ?? '—'
      }
      setTenantNameById(map)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payerKey])

  const payerName = (p: Payment) => {
    const lease = leaseMap[p.lease_id]
    // Rent dated before the lease's current term is leftover history (the lease
    // record was reused/renewed) — the tenants then may differ from now, so we
    // don't guess. Also never fall back to a name we can't actually resolve.
    if (lease?.start_date && p.due_date && p.due_date < lease.start_date) return 'Unknown tenant'
    return tenantNameById[p.tenant_id]
      ?? lease?.profile?.full_name
      ?? lease?.profile?.email
      ?? 'Unknown tenant'
  }

  // Distinct primaries each lease's rent is split across (for the "+N" hint).
  const splitCountByLease = useMemo(() => {
    const sets: Record<string, Set<string>> = {}
    for (const p of payments) {
      if (p.type !== 'rent') continue
      ;(sets[p.lease_id] ??= new Set()).add(p.tenant_id)
    }
    const out: Record<string, number> = {}
    for (const k of Object.keys(sets)) out[k] = sets[k].size
    return out
  }, [payments])

  // One collapsible row per monthly charge: group every payment by
  // (lease, due-MONTH, type) — so a lease's primaries collapse into a single
  // month even when their individual payments fall on staggered due dates.
  // Collapsed shows the full month's total + % collected; expand to see each
  // primary's individual share. Covers past, current & upcoming.
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
  const toggle = (k: string) => setExpandedKeys((s) => {
    const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n
  })
  const todayStr = new Date().toISOString().slice(0, 10)
  const chargeGroups = useMemo(() => {
    const map = new Map<string, { key: string; lease_id: string; due_date: string; rows: Payment[] }>()
    for (const p of payments) {
      const dd = (p.due_date ?? paymentAnchor(p)).slice(0, 10)
      const ym = dd.slice(0, 7) // group by the month the charge applies to — all types
      const key = `${p.lease_id}|${ym}`
      if (!map.has(key)) map.set(key, { key, lease_id: p.lease_id, due_date: dd, rows: [] })
      const g = map.get(key)!
      if (dd < g.due_date) g.due_date = dd // earliest day in the month, for display + sort
      g.rows.push(p)
    }
    return Array.from(map.values()).map((g) => {
      const total = g.rows.reduce((s, r) => s + Number(r.amount), 0)
      const paid = g.rows.filter((r) => r.status === 'completed').reduce((s, r) => s + Number(r.amount), 0)
      return { ...g, total, paid, balance: total - paid, pct: total > 0 ? (paid / total) * 100 : 0 }
    }).sort((a, b) => a.due_date.localeCompare(b.due_date))
  }, [payments])
  const monthStatus = (g: { pct: number; rows: Payment[] }) => {
    if (g.pct >= 100) return { label: 'Paid', cls: 'text-blue-700 bg-blue-50 border-blue-200' }
    const pastDue = g.rows.some((r) => r.status === 'pending'
      && (((r as Payment & { scheduled_for?: string | null }).scheduled_for ?? r.due_date ?? '') < todayStr))
    if (pastDue) return { label: 'Past due', cls: 'text-red-700 bg-red-50 border-red-200' }
    if (g.pct > 0) return { label: 'Partial', cls: 'text-amber-700 bg-amber-50 border-amber-200' }
    return { label: 'Upcoming', cls: 'text-gray-600 bg-gray-100 border-gray-200' }
  }

  // Lease-status filter (value lifted to the parent so it sits inline with the
  // Viewing selector). A charge counts as "Past" if its lease has ended OR it
  // predates the lease's current term (leftover history from a reused/renewed
  // lease record) — so old rows don't appear under Active.
  const statusOf =(leaseStatus?: string, dueDate?: string | null, leaseStart?: string | null): 'past' | 'upcoming' | 'active' => {
    if (dueDate && leaseStart && dueDate < leaseStart) return 'past'
    if (leaseStatus === 'expired' || leaseStatus === 'terminated') return 'past'
    if (leaseStatus === 'upcoming' || leaseStatus === 'pending') return 'upcoming'
    return 'active'
  }
  const matchesFilter = (st: string) => leaseStatusFilter === 'all' || st === leaseStatusFilter
  const filteredLeases = leases.filter((l) => matchesFilter(statusOf(l.status)))
  const visibleGroups = chargeGroups.filter((g) => {
    const lease = leaseMap[g.lease_id]
    return matchesFilter(statusOf(lease?.status, g.due_date, lease?.start_date))
  })

  return (
    <div className="flex flex-col gap-6">
      {/* Current-month payment breakdown — same donut as the main Payments screen. */}
      <div className="order-1">
        <MonthlyDonut payments={payments} loading={loading} />
      </div>

      {/* Per-lease payment schedule — pushed below the ledger via flex order. */}
      <section className="order-3 bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-mute">Payment schedules</h2>
            <p className="text-xs text-mute mt-1">
              Rent payments auto-generate when a lease is activated. Click a lease to adjust the due-day.
            </p>
          </div>
        </div>

        {filteredLeases.length === 0 ? (
          <p className="text-sm text-mute">No {leaseStatusFilter === 'all' ? '' : `${leaseStatusFilter} `}leases at this property.</p>
        ) : (
          <div className="space-y-2">
            {filteredLeases.map((l) => {
              const unit = unitMap[l.unit_id]
              const tenantName = l.profile?.full_name ?? l.profile?.email ?? 'Tenant'
              const splitExtra = (splitCountByLease[l.id] ?? 1) - 1
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
                      {splitExtra > 0 && <span className="text-mute font-normal"> +{splitExtra}</span>}
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

      {/* Payments ledger — one collapsible row per monthly charge. */}
      <section className="order-2 bg-white rounded-2xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-mute mb-3">Payments</h2>
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin text-mute" strokeWidth={1.75} />
        ) : visibleGroups.length === 0 ? (
          <p className="text-sm text-mute">No payments for {leaseStatusFilter === 'all' ? 'this property' : `${leaseStatusFilter} leases`}.</p>
        ) : (
          <div className="space-y-2">
            {visibleGroups.map((g) => {
              const l = leaseMap[g.lease_id]
              const unit = l ? unitMap[l.unit_id] : undefined
              const open = expandedKeys.has(g.key)
              const { mon, year, monthYear } = monthDay(g.due_date)
              const st = monthStatus(g)
              // The month rolls up every charge type. Title reflects what's in it.
              const types = new Set(g.rows.map((r) => r.type))
              const title = types.has('rent')
                ? (types.size > 1 ? 'Rent + fees' : 'Rent')
                : (types.size === 1 ? (CHARGE_LABEL[[...types][0]] ?? 'Charge') : 'Charges')
              const sub = `${monthYear} · Unit ${unit?.unit_number ?? '—'}`
              const payerCount = new Set(g.rows.map((r) => r.tenant_id)).size
              return (
                <div key={g.key} className="border border-gray-100 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggle(g.key)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="w-12 text-center shrink-0">
                      <p className="text-[10px] font-medium text-mute leading-none">{year}</p>
                      <p className="text-base font-bold uppercase tracking-wide text-ink leading-tight mt-0.5">{mon}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-ink">{title}</p>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                        {payerCount > 1 && <span className="text-[10px] text-mute">{payerCount} tenants</span>}
                      </div>
                      <p className="text-xs text-mute truncate">{sub}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-ink">{formatUsdCents(g.total)}</p>
                      <p className="text-[11px] text-mute">Balance: {formatUsdCents(g.balance)}</p>
                    </div>
                    <ProgressRing pct={g.pct} />
                    <ChevronDown className={`w-4 h-4 text-mute shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} strokeWidth={1.75} />
                  </button>
                  {open && (
                    <div className="px-3 py-2 bg-gray-50/60 border-t border-gray-100 space-y-1">
                      {g.rows
                        .slice()
                        .sort((a, b) => payerName(a).localeCompare(payerName(b)))
                        .map((p) => {
                          const rs = rowStatus(p)
                          return (
                            <div key={p.id} className="flex items-center justify-between gap-3 text-sm py-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <p className="text-ink truncate">{payerName(p)}</p>
                                <span className="text-[11px] text-mute shrink-0">{CHARGE_LABEL[p.type] ?? 'Charge'}</span>
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${rs.cls}`}>{rs.label}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <p className="font-medium text-ink">{formatUsdCents(Number(p.amount))}</p>
                                {p.status === 'pending' && (
                                  <button
                                    onClick={() => markPaid(p.id).then(() => toast.success('Marked paid')).catch((e) => toast.error(e.message))}
                                    className="text-xs font-medium text-brand-600 border border-brand-200 px-2 py-1 rounded-lg hover:bg-brand-50 transition-colors"
                                  >
                                    Mark paid
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <Modal open={!!scheduleTarget} onClose={() => setScheduleTarget(null)} title="Payment schedule">
        {scheduleTarget && (
          <PaymentScheduleEditor
            lease={scheduleTarget}
            onClose={() => setScheduleTarget(null)}
            onRebuilt={reload}
          />
        )}
      </Modal>
    </div>
  )
}

// ── Payment schedule editor ───────────────────────────────────────────────────
function PaymentScheduleEditor({ lease, onClose, onRebuilt }: { lease: Lease; onClose: () => void; onRebuilt?: () => void }) {
  const [dueDay, setDueDay] = useState<number>((lease as any).payment_due_day ?? 1)
  const [saving, setSaving] = useState(false)
  const [rebuilding, setRebuilding] = useState(false)
  const generated = (lease as any).payment_schedule_generated_at != null

  // Rebuild the future rent schedule from the lease's current start date +
  // primary tenants — used after the start date or the primaries change.
  // Saves the due-day first so the rebuild picks it up. Paid/past rows are kept.
  const handleRebuild = async () => {
    setRebuilding(true)
    try {
      if (dueDay !== ((lease as any).payment_due_day ?? 1)) {
        await supabase.from('leases').update({ payment_due_day: dueDay }).eq('id', lease.id)
      }
      const r = await regenerateRentSchedule(lease.id)
      toast.success(`Rebuilt ${r.created} rent row${r.created === 1 ? '' : 's'} · kept ${r.skippedPaid} paid`)
      onRebuilt?.()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not rebuild schedule')
    } finally {
      setRebuilding(false)
    }
  }

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
        <p>Lease runs {formatLocalDate(lease.start_date)} → {formatLocalDate(lease.end_date)}</p>
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

      <div className="pt-3 mt-1 border-t border-gray-100">
        <p className="text-xs uppercase tracking-wider text-mute font-semibold mb-1">Rebuild schedule</p>
        <p className="text-[11px] text-mute mb-2 leading-relaxed">
          Changed the start date or the primary tenants? Rebuild to re-split future rent across
          the current primaries. Paid and past rows are kept — only future unpaid rent is replaced.
        </p>
        <button
          type="button"
          onClick={handleRebuild}
          disabled={rebuilding}
          className="w-full py-2 border border-brand-300 text-brand-700 rounded-lg text-sm font-medium hover:bg-brand-50 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
        >
          {rebuilding ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} /> : <RefreshCw className="w-4 h-4" strokeWidth={1.75} />}
          Rebuild payment schedule
        </button>
      </div>
    </div>
  )
}


// ── Property edit form (rendered inside Modal in the header) ─────────────────
// Auto-save edit form. Each text field saves on blur if it changed.
// Thumbnail saves immediately when the upload completes. No save button —
// "Done" just closes the modal (changes are already persisted).
function PropertyEditForm({
  property,
  onSaved,
  onCancel,
}: {
  property: Property
  onSaved: (next: Property) => void
  onCancel: () => void
}) {
  type Field = 'name' | 'address' | 'city' | 'state' | 'zip'
  type FormShape = Record<Field, string> & { thumbnail_url: string | null }

  const [form, setForm] = useState<FormShape>({
    name: property.name,
    address: property.address,
    city: property.city,
    state: property.state,
    zip: property.zip,
    thumbnail_url: property.thumbnail_url ?? null,
  })
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  // Last-saved value per field — we only fire an update when the blurred
  // value differs from what's already in the DB (avoids spurious writes
  // every time the user tabs through a field they didn't touch).
  const [savedValues, setSavedValues] = useState<Record<Field, string>>({
    name: property.name,
    address: property.address,
    city: property.city,
    state: property.state,
    zip: property.zip,
  })
  const [savingField, setSavingField] = useState<Field | 'thumbnail' | null>(null)
  const [justSaved, setJustSaved] = useState<Field | 'thumbnail' | null>(null)

  const set = (k: Field) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setErrors((err) => ({ ...err, [k]: undefined }))
  }

  // ── Per-field save ───────────────────────────────────────────────────
  const saveField = async (field: Field, rawValue: string) => {
    const value = rawValue.trim()

    // Required-field check (revert visually on blur with an empty value)
    if (!value) {
      setErrors((e) => ({ ...e, [field]: `${labelFor(field)} is required` }))
      return
    }
    // State must not be in the geo-blocked list
    if (field === 'state' && isBlockedState(value)) {
      setErrors((e) => ({
        ...e,
        state: `${BRAND.name} isn't yet available for properties in ${blockedStateName(value)}.`,
      }))
      return
    }
    if (value === savedValues[field]) return  // no-op

    setSavingField(field)
    const { data, error } = await supabase
      .from('properties')
      .update({ [field]: value })
      .eq('id', property.id)
      .select()
      .single()
    setSavingField(null)

    if (error || !data) {
      toast.error(error?.message ?? 'Could not save')
      // Revert local form value to last-saved so the UI stays consistent
      setForm((f) => ({ ...f, [field]: savedValues[field] }))
      return
    }

    setSavedValues((s) => ({ ...s, [field]: value }))
    onSaved(data as Property)
    setJustSaved(field)
    setTimeout(() => setJustSaved((j) => (j === field ? null : j)), 1500)
  }

  // ── Thumbnail save (fires immediately after upload completes) ────────
  const saveThumbnail = async (nextUrl: string | null) => {
    setForm((f) => ({ ...f, thumbnail_url: nextUrl }))
    setSavingField('thumbnail')
    const { data, error } = await supabase
      .from('properties')
      .update({ thumbnail_url: nextUrl })
      .eq('id', property.id)
      .select()
      .single()
    setSavingField(null)
    if (error || !data) {
      toast.error(error?.message ?? 'Could not save thumbnail')
      // Revert
      setForm((f) => ({ ...f, thumbnail_url: property.thumbnail_url ?? null }))
      return
    }
    onSaved(data as Property)
    setJustSaved('thumbnail')
    setTimeout(() => setJustSaved((j) => (j === 'thumbnail' ? null : j)), 1500)
  }

  const fieldStatus = (field: Field | 'thumbnail') =>
    savingField === field ? 'Saving…'
    : justSaved === field ? 'Saved'
    : ''

  return (
    <div className="space-y-4">
      <div>
        <ImageUploader
          currentUrl={form.thumbnail_url}
          onChange={saveThumbnail}
          pathPrefix={`property-thumbnails/${property.id}`}
          variant="square"
          size={80}
          label="Thumbnail"
        />
        {fieldStatus('thumbnail') && (
          <p className="text-[11px] text-mute mt-1">{fieldStatus('thumbnail')}</p>
        )}
      </div>

      <AutoSavedField
        label="Property name" required
        value={form.name}
        onChange={set('name')}
        onBlur={() => saveField('name', form.name)}
        error={errors.name}
        status={fieldStatus('name')}
      />
      <AutoSavedField
        label="Street address" required
        value={form.address}
        onChange={set('address')}
        onBlur={() => saveField('address', form.address)}
        error={errors.address}
        status={fieldStatus('address')}
      />
      <div className="grid grid-cols-2 gap-3">
        <AutoSavedField
          label="City" required
          value={form.city}
          onChange={set('city')}
          onBlur={() => saveField('city', form.city)}
          error={errors.city}
          status={fieldStatus('city')}
        />
        <AutoSavedField
          label="State" required maxLength={2}
          value={form.state}
          onChange={set('state')}
          onBlur={() => saveField('state', form.state)}
          error={errors.state}
          status={fieldStatus('state')}
        />
      </div>
      <AutoSavedField
        label="ZIP" required maxLength={10}
        value={form.zip}
        onChange={set('zip')}
        onBlur={() => saveField('zip', form.zip)}
        error={errors.zip}
        status={fieldStatus('zip')}
      />

      <div className="pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="w-full py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
        >
          Done
        </button>
        <p className="text-[11px] text-mute text-center mt-2">
          Changes save automatically when you click out of each field.
        </p>
      </div>
    </div>
  )
}

function AutoSavedField({
  label, required, value, onChange, onBlur, error, status, maxLength,
}: {
  label: string
  required?: boolean
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onBlur: () => void
  error?: string
  status: string
  maxLength?: number
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <label className="text-xs uppercase tracking-wider text-mute font-semibold">
          {label}{required && <span className="text-red-500"> *</span>}
        </label>
        {status && <span className="text-[10px] text-mute uppercase tracking-wider">{status}</span>}
      </div>
      <input
        className={`${inputClass} ${error ? 'border-red-400' : ''}`}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        maxLength={maxLength}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

function labelFor(field: 'name' | 'address' | 'city' | 'state' | 'zip'): string {
  return field === 'zip' ? 'ZIP' : field[0].toUpperCase() + field.slice(1)
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

// ── Payments-ledger helpers ───────────────────────────────────────────────────

// Monthly-charge type labels.
const CHARGE_LABEL: Record<string, string> = {
  rent: 'Rent', late_fee: 'Late fee', pet_fee: 'Pet fee', pet_deposit: 'Pet deposit',
  utility: 'Utility', fee: 'Fee', fine: 'Fine', credit: 'Credit', other: 'Other',
}

// Parse a 'YYYY-MM-DD' (or timestamp) into display parts without the UTC shift.
function monthDay(dateStr: string) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(dateStr + 'T00:00:00') : new Date(dateStr)
  return {
    mon: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    day: d.toLocaleDateString('en-US', { day: '2-digit' }),
    year: d.toLocaleDateString('en-US', { year: 'numeric' }),
    monthYear: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  }
}

// Circular collection ring — green when fully collected, brand teal while partial.
function ProgressRing({ pct, size = 30 }: { pct: number; size?: number }) {
  const r = (size - 5) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, pct))
  const full = clamped >= 100
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth="3" />
      {clamped > 0 && (
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={full ? '#16a34a' : brandColor('500')} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (clamped / 100) * c}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
    </svg>
  )
}

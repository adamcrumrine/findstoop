// Portfolio import wizard — bulk-load from Avail / TurboTenant / generic CSV.
//
// Three uploads, three previews, one confirm:
//   Step 1 — Source (Avail / TurboTenant / Generic)
//   Step 2 — Properties CSV    →  parse + preview
//   Step 3 — Tenants CSV       →  parse + preview (units derived from this)
//   Step 4 — Review + Import   →  show counts, run import-portfolio edge fn
//   Step 5 — Done              →  summary + link to dashboard
//
// Designed so a landlord with 30 units can be migrated in <5 minutes.

import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Upload, CheckCircle2, AlertTriangle, FileText,
  Loader2, Building2, Users, Sparkles, Download, type LucideIcon,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { supabase } from '../../lib/supabase'
import {
  parseCsv, PROPERTY_SCHEMA, TENANT_SCHEMA,
  coerceMoney, coerceInt, coerceDateISO, normalizeState,
  type PropertyCsvKey, type TenantCsvKey,
} from '../../lib/csvParser'
import ImportAvail from './ImportAvail'

type Step = 'source' | 'properties' | 'tenants' | 'review' | 'done'
type Source = 'avail' | 'buildium' | 'doorloop' | 'tenantcloud' | 'appfolio' | 'turbotenant' | 'csv'

interface SourceMeta {
  id: Source
  label: string
  sub: string
  // Path to the official logo file in /public/competitor-logos/.
  // If the file is missing we fall back to a clean text monogram.
  logo?: string
  // Brand-recognizable color for the monogram fallback only.
  accent?: string
  // Tested? false = "best-effort, please share feedback".
  tested: boolean
  // Step-by-step instructions specific to this vendor.
  instructions?: string[]
}

interface ParsedProperty {
  raw: Record<PropertyCsvKey, string>
  name: string
  address: string
  city: string
  state: string
  zip: string
  property_type?: string | null
  unit_count?: number | null
  errors: string[]
}

interface ParsedTenant {
  raw: Record<TenantCsvKey, string>
  first_name: string
  last_name: string
  email: string
  phone: string | null
  property_match: string         // text the user typed for property
  property_index: number         // resolved index into properties[]
  unit_number: string
  rent_amount: number | null
  security_deposit: number | null
  lease_start: string | null
  lease_end: string | null
  bedrooms: number | null
  bathrooms: number | null
  errors: string[]
}

interface ImportResult {
  import_id: string | null
  counts: {
    properties_created: number
    properties_total: number
    units_created: number
    units_total: number
    tenants_invited: number
    tenants_linked: number
    leases_created: number
    leases_total: number
  }
  errors: Array<{ scope: string; index: number; message: string }>
}

const SOURCES: SourceMeta[] = [
  {
    id: 'avail',
    label: 'Avail',
    sub: 'Export properties + tenants from Avail Reports',
    logo: '/competitor-logos/avail.svg',
    accent: '#0F2F5C',
    tested: true,
    instructions: [
      'Sign in to Avail and open Settings → Reports.',
      'Click "Export tenants" — saves a CSV with names, emails, units, lease dates, rent.',
      'Click "Export properties" — saves a CSV with addresses + city/state/ZIP.',
      'Drop both files in below and we\'ll do the rest.',
    ],
  },
  {
    id: 'buildium',
    label: 'Buildium',
    sub: 'Export properties, units, and tenant data',
    logo: '/competitor-logos/buildium.svg',
    accent: '#0093D7',
    tested: false,
    instructions: [
      'In Buildium, open Reports → Rental Owner & Tenant Information.',
      'Export the "Tenant Directory" report as CSV.',
      'Export the "Property Directory" report as CSV.',
      'Drop both files in below. (We\'re still polishing the Buildium parser — let us know how it goes.)',
    ],
  },
  {
    id: 'doorloop',
    label: 'DoorLoop',
    sub: 'Export tenants + properties from DoorLoop',
    logo: '/competitor-logos/doorloop.svg',
    accent: '#0066FF',
    tested: false,
    instructions: [
      'In DoorLoop, open People → Tenants and click Export (CSV).',
      'Open Properties and click Export (CSV).',
      'Drop both files in below. (Beta — please share feedback after.)',
    ],
  },
  {
    id: 'tenantcloud',
    label: 'TenantCloud',
    sub: 'Export tenants and properties from TenantCloud',
    logo: '/competitor-logos/tenantcloud.svg',
    accent: '#1E88E5',
    tested: false,
    instructions: [
      'In TenantCloud, open Reports → Custom Reports.',
      'Build a tenant export with name, email, phone, property, unit, rent, lease dates.',
      'Build a property export with name + full address.',
      'Drop both CSVs below. (Beta — feedback welcome.)',
    ],
  },
  {
    id: 'appfolio',
    label: 'AppFolio',
    sub: 'Export tenants + properties from AppFolio',
    logo: '/competitor-logos/appfolio.svg',
    accent: '#22C55E',
    tested: false,
    instructions: [
      'In AppFolio, open Reports → Resident & Lease.',
      'Export the resident roster + a property list as CSV.',
      'Drop both files in below. (Beta — AppFolio formats vary by tenancy size; let us know what you see.)',
    ],
  },
  {
    id: 'turbotenant',
    label: 'TurboTenant',
    sub: 'Export tenants from TurboTenant',
    logo: '/competitor-logos/turbotenant.svg',
    accent: '#7C3AED',
    tested: false,
    instructions: [
      'In TurboTenant, open Settings → Account → Export Data.',
      'Pick the tenants + properties CSV exports.',
      'Drop both files below.',
    ],
  },
  {
    id: 'csv',
    label: 'Generic CSV',
    sub: 'Any CSV with property + tenant columns',
    accent: '#6B7280',
    tested: true,
    instructions: [
      'Two files: one with properties (address, city, state, ZIP), one with tenants (name, email, property, unit, rent, lease dates).',
      'Our parser matches common column names automatically — see the sample CSVs below.',
    ],
  },
]

export default function Import() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('source')
  const [source, setSource] = useState<Source>('avail')
  const [properties, setProperties] = useState<ParsedProperty[]>([])
  const [tenants, setTenants] = useState<ParsedTenant[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  // ── CSV upload handlers ─────────────────────────────────────────────────
  const handlePropertyCsv = async (file: File) => {
    const text = await file.text()
    const { rows, unmatchedHeaders } = parseCsv(text, PROPERTY_SCHEMA)
    if (rows.length === 0) { toast.error('No rows found in the file.'); return }
    if (unmatchedHeaders.length > 0) {
      toast(`Note: ${unmatchedHeaders.length} unrecognized columns were ignored (${unmatchedHeaders.slice(0, 3).join(', ')}${unmatchedHeaders.length > 3 ? '…' : ''}).`)
    }
    const parsed: ParsedProperty[] = rows.map((r) => {
      const errors: string[] = []
      const address = (r.address || '').trim()
      const city = (r.city || '').trim()
      const state = normalizeState(r.state) ?? ''
      const zip = (r.zip || '').replace(/[^0-9-]/g, '').trim()
      if (!address) errors.push('Missing address')
      if (!city)    errors.push('Missing city')
      if (!state)   errors.push('Missing or invalid state')
      if (!zip)     errors.push('Missing ZIP')
      const unit_count = coerceInt(r.unit_count)
      return {
        raw: r,
        name: (r.name || '').trim() || (address ? `${address}, ${city}` : 'Imported property'),
        address, city, state, zip,
        property_type: (r.property_type || '').trim() || null,
        unit_count,
        errors,
      }
    })
    setProperties(parsed)
    setStep('properties')
  }

  const handleTenantCsv = async (file: File) => {
    const text = await file.text()
    const { rows, unmatchedHeaders } = parseCsv(text, TENANT_SCHEMA)
    if (rows.length === 0) { toast.error('No tenant rows found.'); return }
    if (unmatchedHeaders.length > 0) {
      toast(`Note: ${unmatchedHeaders.length} unrecognized columns were ignored.`)
    }

    // Build a property-match index keyed by normalized property text.
    const indexByMatch = new Map<string, number>()
    properties.forEach((p, idx) => {
      indexByMatch.set(normMatch(p.name), idx)
      indexByMatch.set(normMatch(p.address), idx)
      indexByMatch.set(normMatch(`${p.address} ${p.city}`), idx)
    })

    const parsed: ParsedTenant[] = rows.map((r) => {
      const errors: string[] = []
      const propMatchText = (r.property_match || '').trim()
      const idx = indexByMatch.get(normMatch(propMatchText)) ?? -1
      if (idx < 0 && propMatchText) errors.push(`Couldn't match property "${propMatchText}"`)

      const email = (r.email || '').trim().toLowerCase()
      if (!email) errors.push('Missing email')
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Invalid email')

      const unit_number = (r.unit_number || '').trim() || '1'   // default to "1" for single-family
      const rent_amount = coerceMoney(r.rent_amount)
      if (rent_amount == null) errors.push('Missing or invalid rent')

      const lease_start = coerceDateISO(r.lease_start)
      const lease_end   = coerceDateISO(r.lease_end)
      if (!lease_start) errors.push('Missing or invalid lease start date')
      if (!lease_end)   errors.push('Missing or invalid lease end date')

      return {
        raw: r,
        first_name: (r.first_name || '').trim(),
        last_name:  (r.last_name  || '').trim(),
        email,
        phone: (r.phone || '').trim() || null,
        property_match: propMatchText,
        property_index: idx,
        unit_number,
        rent_amount,
        security_deposit: coerceMoney(r.security_deposit),
        lease_start, lease_end,
        bedrooms: coerceInt(r.bedrooms),
        bathrooms: coerceInt(r.bathrooms),
        errors,
      }
    })
    setTenants(parsed)
    setStep('tenants')
  }

  // ── Submit ──────────────────────────────────────────────────────────────
  const propertyErrors  = useMemo(() => properties.filter((p) => p.errors.length > 0), [properties])
  const tenantErrors    = useMemo(() => tenants.filter((t) => t.errors.length > 0), [tenants])
  const validProperties = useMemo(() => properties.filter((p) => p.errors.length === 0), [properties])
  const validTenants    = useMemo(() => tenants.filter((t) => t.errors.length === 0 && t.property_index >= 0), [tenants])

  const submit = async () => {
    if (validProperties.length === 0) { toast.error('At least one valid property is required.'); return }
    setSubmitting(true)

    // Build the units array from tenants (one unit per tenant row,
    // de-duplicated by property_index + unit_number).
    const unitKeys = new Set<string>()
    const units: Array<{ property_index: number; unit_number: string; rent_amount: number; bedrooms: number | null; bathrooms: number | null }> = []
    for (const t of validTenants) {
      const propIdxInValid = mapValidIndex(properties, t.property_index)
      if (propIdxInValid < 0) continue
      const k = `${propIdxInValid}|${t.unit_number.trim().toLowerCase()}`
      if (unitKeys.has(k)) continue
      unitKeys.add(k)
      units.push({
        property_index: propIdxInValid,
        unit_number: t.unit_number,
        rent_amount: t.rent_amount!,
        bedrooms: t.bedrooms,
        bathrooms: t.bathrooms,
      })
    }

    const payload = {
      source,
      properties: validProperties.map((p) => ({
        name: p.name, address: p.address, city: p.city, state: p.state, zip: p.zip,
        property_type: p.property_type ?? null,
      })),
      units,
      tenants: validTenants.map((t) => ({
        property_index: mapValidIndex(properties, t.property_index),
        unit_number: t.unit_number,
        first_name: t.first_name,
        last_name: t.last_name,
        email: t.email,
        phone: t.phone,
        rent_amount: t.rent_amount!,
        security_deposit: t.security_deposit,
        lease_start: t.lease_start!,
        lease_end: t.lease_end!,
      })),
    }

    try {
      const { data, error } = await supabase.functions.invoke('import-portfolio', { body: payload })
      if (error) throw new Error(error.message)
      setResult(data as ImportResult)
      setStep('done')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  if (!profile) {
    return <div className="p-8 text-mute">Loading…</div>
  }

  // Avail has its own deeper flow (two-file join + city/state/zip step +
  // multi-tenant per lease). Hand off entirely once the user has confirmed
  // Avail on the source picker. Coming back uses ImportAvail's own "Different
  // platform" link, which routes back to /manager/import (this page).
  if (step !== 'source' && source === 'avail') {
    return <ImportAvail />
  }

  return (
    <div className="max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Import your portfolio</h1>
        <p className="text-sm text-mute mt-1">
          Bulk-load your properties, units, tenants, and leases from Avail or any other landlord platform.
        </p>
      </header>

      <Stepper step={step} />

      {/* Step 1 — Source */}
      {step === 'source' && (
        <section className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-ink mb-1">Where's your portfolio coming from?</h2>
          <p className="text-sm text-mute mb-5">Pick the platform so we can match its column names automatically.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {SOURCES.map((s) => (
              <SourceCard key={s.id} meta={s} selected={source === s.id} onSelect={() => setSource(s.id)} />
            ))}
          </div>

          {(() => {
            const meta = SOURCES.find((s) => s.id === source)
            if (!meta?.instructions) return null
            return (
              <div className="mt-5 bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-amber-900 inline-flex items-center gap-2">
                  Quick guide — {meta.label}
                  {!meta.tested && (
                    <span className="text-[9px] uppercase tracking-wider bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded-full font-bold">Beta</span>
                  )}
                </p>
                <ol className="list-decimal pl-5 mt-2 text-sm text-amber-900 space-y-1">
                  {meta.instructions.map((line, i) => <li key={i}>{line}</li>)}
                </ol>
                <p className="text-xs text-amber-800 mt-2">
                  Stuck? Email <a href="mailto:support@findstoop.com" className="underline font-medium">support@findstoop.com</a> — we'll help you pull the right files.
                </p>
              </div>
            )
          })()}

          <p className="text-[10px] text-mute mt-5 leading-relaxed">
            Avail, Buildium, DoorLoop, TenantCloud, AppFolio, and TurboTenant are trademarks of their respective owners.
            Stoop is not affiliated with, endorsed by, or sponsored by any of them.
          </p>

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => setStep('properties')}
              className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-medium px-5 py-2.5 rounded-lg"
            >
              Continue
              <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </button>
          </div>
        </section>
      )}

      {/* Step 2 — Properties */}
      {step === 'properties' && (
        <section className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-ink">Upload your properties</h2>
              <p className="text-sm text-mute mt-1">CSV with one row per property. Address, city, state, ZIP required.</p>
            </div>
            <Link to="/sample-properties.csv" target="_blank" className="text-xs text-brand-700 hover:underline inline-flex items-center gap-1">
              <Download className="w-3.5 h-3.5" /> Sample CSV
            </Link>
          </div>

          {properties.length === 0 ? (
            <FileDrop accept=".csv" onFile={handlePropertyCsv} label="Drop your properties CSV here" />
          ) : (
            <>
              <p className="text-xs text-mute mb-3">
                {properties.length} row{properties.length !== 1 ? 's' : ''} parsed
                {propertyErrors.length > 0 && <span className="text-amber-700 font-medium"> · {propertyErrors.length} with errors</span>}
              </p>
              <PreviewTable
                rows={properties.slice(0, 25)}
                columns={[
                  { key: 'name',    label: 'Name' },
                  { key: 'address', label: 'Address' },
                  { key: 'city',    label: 'City' },
                  { key: 'state',   label: 'State' },
                  { key: 'zip',     label: 'ZIP' },
                ]}
              />
              {properties.length > 25 && <p className="text-xs text-mute mt-2">Showing first 25 of {properties.length}.</p>}
            </>
          )}

          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={() => { setProperties([]); setStep('source') }}
              className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink"
            >
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Back
            </button>
            <button
              type="button"
              disabled={properties.length === 0}
              onClick={() => setStep('tenants')}
              className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-medium px-5 py-2.5 rounded-lg"
            >
              Continue
              <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </button>
          </div>
        </section>
      )}

      {/* Step 3 — Tenants */}
      {step === 'tenants' && (
        <section className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-ink">Upload your tenants + leases</h2>
              <p className="text-sm text-mute mt-1">One row per tenant. Units are created automatically from this file.</p>
            </div>
            <Link to="/sample-tenants.csv" target="_blank" className="text-xs text-brand-700 hover:underline inline-flex items-center gap-1">
              <Download className="w-3.5 h-3.5" /> Sample CSV
            </Link>
          </div>

          {tenants.length === 0 ? (
            <FileDrop accept=".csv" onFile={handleTenantCsv} label="Drop your tenants CSV here" />
          ) : (
            <>
              <p className="text-xs text-mute mb-3">
                {tenants.length} row{tenants.length !== 1 ? 's' : ''} parsed
                {tenantErrors.length > 0 && <span className="text-amber-700 font-medium"> · {tenantErrors.length} with errors</span>}
              </p>
              <PreviewTable
                rows={tenants.slice(0, 25)}
                columns={[
                  { key: 'first_name',    label: 'First' },
                  { key: 'last_name',     label: 'Last' },
                  { key: 'email',         label: 'Email' },
                  { key: 'property_match', label: 'Property' },
                  { key: 'unit_number',   label: 'Unit' },
                  { key: 'rent_amount',   label: 'Rent', formatter: (v) => v != null ? `$${Number(v).toLocaleString()}` : '—' },
                  { key: 'lease_start',   label: 'Starts' },
                  { key: 'lease_end',     label: 'Ends' },
                ]}
              />
              {tenants.length > 25 && <p className="text-xs text-mute mt-2">Showing first 25 of {tenants.length}.</p>}
            </>
          )}

          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={() => { setTenants([]); setStep('properties') }}
              className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink"
            >
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Back
            </button>
            <button
              type="button"
              disabled={tenants.length === 0}
              onClick={() => setStep('review')}
              className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-medium px-5 py-2.5 rounded-lg"
            >
              Continue
              <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </button>
          </div>
        </section>
      )}

      {/* Step 4 — Review */}
      {step === 'review' && (
        <section className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-ink">Review and confirm</h2>
          <p className="text-sm text-mute mt-1 mb-5">
            Imported leases land in <strong>Pending</strong> status — you'll review and activate them
            from the Leases tab once tenants accept their invites.
          </p>

          <div className="grid sm:grid-cols-3 gap-3 mb-5">
            <SummaryCard Icon={Building2} label="Properties"          value={validProperties.length} sub={`${propertyErrors.length} skipped`} />
            <SummaryCard Icon={Building2} label="Units"               value={countUniqueUnits(validTenants)} sub="auto-created" />
            <SummaryCard Icon={Users}     label="Tenants + leases"    value={validTenants.length} sub={`${tenantErrors.length} skipped · invites sent`} />
          </div>

          {(propertyErrors.length > 0 || tenantErrors.length > 0) && (
            <details className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
              <summary className="cursor-pointer text-sm font-semibold text-amber-900 inline-flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" strokeWidth={1.75} />
                {propertyErrors.length + tenantErrors.length} rows will be skipped — click to review
              </summary>
              <div className="mt-3 space-y-2 text-xs">
                {propertyErrors.map((p, i) => (
                  <p key={`p-${i}`} className="text-amber-900">
                    <strong>Property row {properties.indexOf(p) + 1}:</strong> {p.address} — {p.errors.join('; ')}
                  </p>
                ))}
                {tenantErrors.map((t, i) => (
                  <p key={`t-${i}`} className="text-amber-900">
                    <strong>Tenant row {tenants.indexOf(t) + 1}:</strong> {t.email || `${t.first_name} ${t.last_name}`} — {t.errors.join('; ')}
                  </p>
                ))}
              </div>
            </details>
          )}

          <div className="bg-brand-50/60 border border-brand-200 rounded-xl p-4 text-sm text-ink">
            <p className="font-semibold inline-flex items-center gap-2"><Sparkles className="w-4 h-4 text-brand-600" />What happens when you click Import</p>
            <ul className="list-disc pl-5 mt-2 text-xs text-mute leading-relaxed space-y-1">
              <li>Properties and units are created in your Stoop dashboard</li>
              <li>Each tenant gets an email invite to claim their Stoop account</li>
              <li>Leases are created in <strong>Pending</strong> — activate from the Leases tab when ready</li>
              <li>Your subscription quantity updates only when you activate leases (not at import)</li>
            </ul>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              disabled={submitting}
              onClick={() => setStep('tenants')}
              className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink"
            >
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Back
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting || validProperties.length === 0}
              className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold px-6 py-3 rounded-lg"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" strokeWidth={2} />}
              {submitting ? 'Importing…' : 'Import portfolio'}
            </button>
          </div>
        </section>
      )}

      {/* Step 5 — Done */}
      {step === 'done' && result && (
        <section className="bg-white rounded-2xl border border-gray-200 p-6 text-center">
          <CheckCircle2 className="w-14 h-14 mx-auto text-emerald-600 mb-3" strokeWidth={1.5} />
          <h2 className="text-2xl font-bold text-ink">Portfolio imported.</h2>
          <p className="text-sm text-mute mt-2 max-w-md mx-auto">
            Your dashboard is ready. Tenants are receiving invites now — once they accept, you can
            activate their leases and we'll sync your subscription.
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
            <DoneStat label="Properties" value={result.counts.properties_created} />
            <DoneStat label="Units"      value={result.counts.units_created} />
            <DoneStat label="Tenants invited" value={result.counts.tenants_invited + result.counts.tenants_linked} />
            <DoneStat label="Leases (pending)" value={result.counts.leases_created} />
          </div>

          {result.errors.length > 0 && (
            <details className="mt-5 bg-amber-50 border border-amber-200 rounded-xl p-4 text-left">
              <summary className="cursor-pointer text-sm font-semibold text-amber-900">
                {result.errors.length} row{result.errors.length !== 1 ? 's' : ''} had errors — review
              </summary>
              <ul className="mt-3 text-xs text-amber-900 space-y-1">
                {result.errors.slice(0, 50).map((e, i) => (
                  <li key={i}><strong>{e.scope} #{e.index + 1}:</strong> {e.message}</li>
                ))}
              </ul>
            </details>
          )}

          {/* Feedback gate — most useful on Beta vendor parsers where we can't
              dogfood the import ourselves. Optional; the manager can ignore. */}
          {result.import_id && (
            <FeedbackBlock importId={result.import_id} source={source} />
          )}

          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/manager/leases')}
              className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-medium px-5 py-2.5 rounded-lg"
            >
              Open Leases
              <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => navigate('/manager/dashboard')}
              className="inline-flex items-center gap-2 border border-gray-300 hover:bg-gray-50 text-ink font-medium px-5 py-2.5 rounded-lg"
            >
              Dashboard
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

// ── Feedback gate ──────────────────────────────────────────────────────────
// Star rating (1-5) + free-text. Writes straight to portfolio_imports via
// the manager's auth — the RLS policy gates ownership. Especially valuable
// on Beta vendor parsers (Buildium / DoorLoop / TenantCloud / AppFolio)
// where we can't dogfood the import ourselves.
function FeedbackBlock({ importId, source }: { importId: string; source: Source }) {
  const [rating, setRating] = useState<number | null>(null)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const submit = async () => {
    if (!rating) return
    setSubmitting(true)
    const { error } = await supabase
      .from('portfolio_imports')
      .update({ rating, feedback_text: text.trim() || null, rated_at: new Date().toISOString() })
      .eq('id', importId)
    setSubmitting(false)
    if (error) { toast.error(error.message); return }
    setSubmitted(true)
    toast.success('Thanks — that helps a lot.')
  }

  if (submitted) {
    return (
      <div className="mt-6 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-900 text-left">
        <CheckCircle2 className="w-4 h-4 inline mr-1.5 -mt-0.5" />
        Feedback recorded. We'll keep tuning the {SOURCES.find((s) => s.id === source)?.label ?? 'import'} parser based on what you (and others) tell us.
      </div>
    )
  }

  return (
    <div className="mt-6 bg-gray-50/70 border border-gray-200 rounded-xl p-5 text-left">
      <p className="text-sm font-semibold text-ink">How did the import go?</p>
      <p className="text-xs text-mute mt-1">
        We're {SOURCES.find((s) => s.id === source)?.tested ? 'always tuning the parser' : 'still polishing this parser'}.
        A 30-second rating helps us improve it for the next landlord.
      </p>
      <div className="mt-3 flex items-center gap-1.5" role="radiogroup" aria-label="Rate your import experience">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            onClick={() => setRating(n)}
            className={`w-9 h-9 rounded-full inline-flex items-center justify-center text-lg transition-colors ${
              rating != null && n <= rating
                ? 'bg-amber-100 text-amber-600'
                : 'bg-gray-100 text-mute hover:bg-gray-200'
            }`}
          >
            ★
          </button>
        ))}
        {rating != null && <span className="ml-2 text-xs text-mute">{rating} / 5</span>}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="What worked? What didn't? Any columns we missed? (optional)"
        className="mt-3 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm placeholder-mute focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!rating || submitting}
        className="mt-3 inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
      >
        {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
        Send feedback
      </button>
    </div>
  )
}

// ── Source card with logo + monogram fallback ─────────────────────────────
// If /public/competitor-logos/{vendor}.svg exists, the <img> loads it. On
// error we fall back to a coloured monogram of the vendor's first letter —
// always readable, never a broken image icon.
function SourceCard({ meta, selected, onSelect }: { meta: SourceMeta; selected: boolean; onSelect: () => void }) {
  const [logoFailed, setLogoFailed] = useState(false)
  const showLogo = meta.logo && !logoFailed

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative text-left rounded-xl border-2 p-4 transition-colors ${
        selected ? 'border-brand-500 bg-brand-50/40' : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      {!meta.tested && (
        <span className="absolute top-2 right-2 text-[9px] uppercase tracking-wider bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full font-bold">
          Beta
        </span>
      )}
      <div className="flex items-center gap-3 mb-1">
        {showLogo ? (
          <img
            src={meta.logo}
            alt={`${meta.label} logo`}
            onError={() => setLogoFailed(true)}
            className="h-7 w-auto max-w-[6rem] object-contain"
          />
        ) : (
          <div
            aria-hidden="true"
            className="w-9 h-9 rounded-lg inline-flex items-center justify-center text-sm font-bold text-white"
            style={{ background: meta.accent ?? '#6B7280' }}
          >
            {meta.label[0]}
          </div>
        )}
        <p className="text-sm font-semibold text-ink">{meta.label}</p>
      </div>
      <p className="text-xs text-mute leading-relaxed">{meta.sub}</p>
    </button>
  )
}

// ── Stepper ────────────────────────────────────────────────────────────────
function Stepper({ step }: { step: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: 'source',     label: 'Source' },
    { id: 'properties', label: 'Properties' },
    { id: 'tenants',    label: 'Tenants' },
    { id: 'review',     label: 'Review' },
    { id: 'done',       label: 'Done' },
  ]
  const currentIdx = steps.findIndex((s) => s.id === step)
  return (
    <nav aria-label="Import progress" className="flex items-center gap-2 mb-5 overflow-x-auto pb-2">
      {steps.map((s, i) => {
        const state = i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'upcoming'
        return (
          <div key={s.id} className="flex items-center gap-2 shrink-0">
            <div className={`w-7 h-7 rounded-full inline-flex items-center justify-center text-xs font-bold ${
              state === 'done'    ? 'bg-emerald-100 text-emerald-700' :
              state === 'current' ? 'bg-brand-600 text-white' :
                                    'bg-gray-100 text-mute'
            }`}>
              {state === 'done' ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
            </div>
            <span className={`text-xs font-medium ${state === 'current' ? 'text-ink' : 'text-mute'}`}>{s.label}</span>
            {i < steps.length - 1 && <div className="w-6 h-px bg-gray-200" aria-hidden="true" />}
          </div>
        )
      })}
    </nav>
  )
}

// ── File drop component ───────────────────────────────────────────────────
function FileDrop({ accept, onFile, label }: { accept: string; onFile: (f: File) => void; label: string }) {
  return (
    <label className="block">
      <input
        type="file"
        accept={accept}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }}
        className="sr-only"
      />
      <div className="border-2 border-dashed border-gray-300 hover:border-brand-400 rounded-xl p-10 text-center cursor-pointer transition-colors">
        <Upload className="w-8 h-8 mx-auto text-mute mb-2" strokeWidth={1.75} />
        <p className="text-sm font-medium text-ink">{label}</p>
        <p className="text-xs text-mute mt-1">or click to browse — CSV only</p>
      </div>
    </label>
  )
}

// ── Preview table ─────────────────────────────────────────────────────────
interface ColumnDef<T> {
  key: keyof T
  label: string
  formatter?: (v: unknown) => string
}

function PreviewTable<T extends { errors: string[] }>({ rows, columns }: { rows: T[]; columns: ColumnDef<T>[] }) {
  return (
    <div className="overflow-x-auto border border-gray-200 rounded-xl">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 text-mute">
          <tr>
            <th className="px-2 py-2 text-left font-semibold w-6"></th>
            {columns.map((c) => (
              <th key={String(c.key)} className="px-2 py-2 text-left font-semibold">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`border-t border-gray-100 ${r.errors.length > 0 ? 'bg-amber-50/50' : ''}`}>
              <td className="px-2 py-1.5">
                {r.errors.length > 0
                  ? <AlertTriangle className="w-3.5 h-3.5 text-amber-600" strokeWidth={2} />
                  : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" strokeWidth={2} />}
              </td>
              {columns.map((c) => {
                const v = (r as Record<string, unknown>)[c.key as string]
                return <td key={String(c.key)} className="px-2 py-1.5 text-ink whitespace-nowrap">{c.formatter ? c.formatter(v) : String(v ?? '—')}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────
function SummaryCard({ Icon, label, value, sub }: { Icon: LucideIcon; label: string; value: number; sub?: string }) {
  return (
    <div className="bg-gray-50/70 border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] uppercase tracking-wider text-mute font-bold">{label}</p>
        <Icon className="w-4 h-4 text-mute" strokeWidth={1.75} />
      </div>
      <p className="text-2xl font-bold text-ink">{value}</p>
      {sub && <p className="text-[10px] text-mute mt-0.5">{sub}</p>}
    </div>
  )
}

function DoneStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
      <p className="text-3xl font-bold text-emerald-700">{value}</p>
      <p className="text-[11px] uppercase tracking-wider text-emerald-700/80 font-bold mt-1">{label}</p>
    </div>
  )
}

function normMatch(s: string): string {
  return (s ?? '').toLowerCase().replace(/[.,#]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Map a property index in the FULL properties array to its index in the
// VALID-only array we send to the server. -1 if the property had errors.
function mapValidIndex(allProps: ParsedProperty[], fullIdx: number): number {
  if (fullIdx < 0) return -1
  let validIdx = -1
  for (let i = 0; i <= fullIdx && i < allProps.length; i++) {
    if (allProps[i].errors.length === 0) validIdx++
  }
  return allProps[fullIdx]?.errors.length === 0 ? validIdx : -1
}

function countUniqueUnits(tenants: ParsedTenant[]): number {
  const set = new Set<string>()
  for (const t of tenants) set.add(`${t.property_index}|${t.unit_number.trim().toLowerCase()}`)
  return set.size
}

// Quietly use FileText so a future toolbar reference can pick it up cheaply.
void FileText

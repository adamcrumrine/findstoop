// Rental Analysis Report — purchase + render a rent estimate built from public
// data (Census/HUD/BLS + county auditor). Two tiers:
//   • Basic (free)  — estimate + band + market context + methodology.
//   • Pro ($19.99)  — adds RentCast comparable rentals + downloadable report.
// Complimentary accounts (e.g. hawk.pig.llc) get Pro free and skip payment.
//
// See the rent-estimate edge function and supabase/functions/_shared/rentEstimate.ts.

import { useEffect, useMemo, useState } from 'react'
import {
  Search, Loader2, Bed, Bath, Ruler, Home, MapPin, Download, Trash2,
  TrendingUp, ChevronDown, Info, CheckCircle2, Building2, Check, Sparkles,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { inputClass, selectClass } from '../../components/shared/FormField'
import ReportPaymentModal from '../../components/manager/ReportPaymentModal'
import {
  getRentEstimate, createReportPayment, listRentReports, deleteRentReport, getReportEntitlement,
  requestParcelCoverage, hasRequestedParcelCoverage, prefillProperty,
  type RentEstimateReport, type SavedRentReport, type ReportTier,
} from '@findstoop/shared'

// Map a county land-use description onto our property-type dropdown.
function dropdownTypeFor(countyType: string | null): string | null {
  const t = (countyType ?? '').toLowerCase()
  if (/single|sfh|1 fam|one fam|dwelling/.test(t)) return 'Single Family Home'
  if (/condo/.test(t)) return 'Condo'
  if (/town|row/.test(t)) return 'Townhome'
  if (/duplex|2 fam|two fam/.test(t)) return 'Duplex'
  if (/apart|multi|3 fam|flat/.test(t)) return 'Multi-Family'
  return null
}

const PROPERTY_TYPES = ['Single Family Home', 'Condo', 'Townhome', 'Apartment', 'Duplex', 'Multi-Family']
const BASIC_PRICE = 5.49

const TIERS: Record<ReportTier, { label: string; price: number; blurb: string; features: string[]; comingSoon?: boolean }> = {
  basic: {
    label: 'Basic', price: BASIC_PRICE, blurb: `$${BASIC_PRICE.toFixed(2)}`,
    features: ['Rent estimate + likely range', 'Confidence rating', 'Market context', 'County record + downloadable PDF'],
  },
  pro: {
    label: 'Pro', price: 19.99, blurb: '$19.99', comingSoon: true,
    features: ['Everything in Basic', 'Nearby comparable rentals', 'Comp-backed pricing', 'Investor yield analysis'],
  },
}

const money = (n: number | null | undefined) => (n == null ? '—' : '$' + Math.round(n).toLocaleString())

const CONFIDENCE: Record<RentEstimateReport['confidence'], { label: string; cls: string }> = {
  high:   { label: 'High confidence',   cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  medium: { label: 'Medium confidence', cls: 'text-blue-700 bg-blue-50 border-blue-200' },
  low:    { label: 'Low confidence',    cls: 'text-amber-700 bg-amber-50 border-amber-200' },
}

interface FormState {
  address: string; zip: string; unitNumber: string; bedrooms: string
  bathrooms: string; sqft: string; yearBuilt: string; propertyType: string
}
const EMPTY: FormState = {
  address: '', zip: '', unitNumber: '', bedrooms: '', bathrooms: '',
  sqft: '', yearBuilt: '', propertyType: 'Single Family Home',
}

export default function RentalAnalysis() {
  const [form, setForm] = useState<FormState>(EMPTY)
  const [tier, setTier] = useState<ReportTier>('basic')
  const [comped, setComped] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [reports, setReports] = useState<SavedRentReport[]>([])
  const [loadingReports, setLoadingReports] = useState(true)
  const [active, setActive] = useState<{ id: string | null; report: RentEstimateReport } | null>(null)
  const [pay, setPay] = useState<{ clientSecret: string; paymentIntentId: string } | null>(null)
  const [prefill, setPrefill] = useState<{ state: 'idle' | 'looking' | 'found' | 'none'; source?: string }>({ state: 'idle' })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [rows, ent] = await Promise.all([listRentReports(), getReportEntitlement()])
        if (cancelled) return
        setReports(rows)
        setComped(ent.comped)
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : 'Could not load reports')
      } finally {
        if (!cancelled) setLoadingReports(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const canSubmit = form.address.trim().length >= 5 && form.bedrooms !== '' && !submitting
  const basicPrice = comped ? 0 : BASIC_PRICE

  function buildInputs(paymentIntentId?: string) {
    return {
      address: form.address.trim(),
      zip: form.zip.trim() || undefined,
      unitNumber: form.unitNumber.trim() || undefined,
      bedrooms: Number(form.bedrooms),
      bathrooms: form.bathrooms ? Number(form.bathrooms) : undefined,
      sqft: form.sqft ? Number(form.sqft) : undefined,
      yearBuilt: form.yearBuilt ? Number(form.yearBuilt) : undefined,
      propertyType: form.propertyType,
      tier: 'basic' as ReportTier, // Pro is the RentCast tier — coming soon.
      paymentIntentId,
      persist: true,
    }
  }

  async function generate(paymentIntentId?: string) {
    setSubmitting(true)
    try {
      const { reportId, report } = await getRentEstimate(buildInputs(paymentIntentId))
      setActive({ id: reportId, report })
      setReports(await listRentReports().catch(() => reports))
      setPay(null)
      toast.success('Your report is ready')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not generate the report')
    } finally {
      setSubmitting(false)
    }
  }

  async function lookupDetails() {
    if (form.address.trim().length < 5) { toast.error('Enter the street address first.'); return }
    setPrefill({ state: 'looking' })
    try {
      const r = await prefillProperty(form.address.trim(), form.zip.trim() || undefined)
      if (r.found && r.parcel) {
        const p = r.parcel
        setForm((f) => ({
          ...f,
          bedrooms: p.bedrooms != null ? String(p.bedrooms) : f.bedrooms,
          bathrooms: p.bathrooms != null ? String(p.bathrooms) : f.bathrooms,
          sqft: p.sqft != null ? String(p.sqft) : f.sqft,
          yearBuilt: p.yearBuilt != null ? String(p.yearBuilt) : f.yearBuilt,
          propertyType: dropdownTypeFor(p.propertyType) ?? f.propertyType,
        }))
        setPrefill({ state: 'found', source: p.source })
        toast.success(`Found it in ${p.source} records`)
      } else {
        setPrefill({ state: 'none' })
      }
    } catch (e) {
      setPrefill({ state: 'none' })
      toast.error(e instanceof Error ? e.message : 'Lookup failed — enter details manually')
    }
  }

  async function startPurchase() {
    if (!canSubmit) { toast.error('Enter at least a street address and bedrooms.'); return }
    if (comped) { await generate(); return } // comp accounts skip payment
    setSubmitting(true)
    try {
      const { free, clientSecret, paymentIntentId } = await createReportPayment()
      if (free) { await generate(); return }
      setPay({ clientSecret: clientSecret!, paymentIntentId: paymentIntentId! })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start checkout')
    } finally {
      setSubmitting(false)
    }
  }

  async function remove(id: string) {
    try {
      await deleteRentReport(id)
      setReports((r) => r.filter((x) => x.id !== id))
      if (active?.id === id) setActive(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete')
    }
  }

  const buttonLabel = submitting
    ? 'Working…'
    : comped ? 'Generate Free Report'
    : `Purchase Basic Report — $${BASIC_PRICE.toFixed(2)}`

  return (
    <div className="max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Rental Analysis Report</h1>
        <p className="text-sm text-mute mt-1">
          A data-backed rent estimate for any address — built from U.S. Census, HUD, and county records.
        </p>
      </header>

      {comped && (
        <div className="mb-4 flex items-center gap-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
          <Sparkles className="w-4 h-4 text-emerald-600" strokeWidth={2} />
          Complimentary reporting is enabled on your account — your reports are free.
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* ── Purchase form ──────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-ink mb-4">Purchase a Rental Analysis Report</h2>

          {/* Tier selector */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            {(['basic', 'pro'] as ReportTier[]).map((t) => {
              const meta = TIERS[t]
              const soon = !!meta.comingSoon
              const selected = tier === t && !soon
              const priceLabel = soon ? 'Coming soon' : comped ? 'Free' : meta.blurb
              return (
                <button
                  key={t}
                  type="button"
                  disabled={soon}
                  onClick={() => !soon && setTier(t)}
                  className={`text-left rounded-xl border p-3 transition-colors ${soon ? 'border-gray-200 opacity-70 cursor-not-allowed' : selected ? 'border-brand-500 ring-1 ring-brand-200 bg-brand-50/40' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-ink">{meta.label}</span>
                    <span className={`font-bold ${soon ? 'text-[11px] text-amber-600' : `text-sm ${selected ? 'text-brand-600' : 'text-mute'}`}`}>{priceLabel}</span>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {meta.features.map((f) => (
                      <li key={f} className="flex items-start gap-1 text-[11px] text-mute">
                        <Check className="w-3 h-3 mt-0.5 shrink-0 text-emerald-500" strokeWidth={2.5} />{f}
                      </li>
                    ))}
                  </ul>
                </button>
              )
            })}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Street address</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" strokeWidth={2} />
                <input className={inputClass + ' pl-9'} placeholder="123 Main Street…" value={form.address} onChange={set('address')} autoComplete="off" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="ZIP code" Icon={MapPin}><input className={inputClass} inputMode="numeric" placeholder="43212" value={form.zip} onChange={set('zip')} /></Field>
              <Field label="Unit number" Icon={Home}><input className={inputClass} placeholder="B" value={form.unitNumber} onChange={set('unitNumber')} /></Field>
            </div>

            {/* County-record lookup — pre-fills beds/baths/sqft/type from the auditor */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={lookupDetails}
                disabled={prefill.state === 'looking' || form.address.trim().length < 5}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 px-3 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {prefill.state === 'looking'
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} /> Checking county records…</>
                  : <><Search className="w-3.5 h-3.5" strokeWidth={2} /> Look up property details</>}
              </button>
              {prefill.state === 'found' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                  <CheckCircle2 className="w-3 h-3" strokeWidth={2} /> Filled from {prefill.source}
                </span>
              )}
              {prefill.state === 'none' && (
                <span className="text-[11px] text-mute">No county record found — enter the details below.</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Beds" Icon={Bed}><input className={inputClass} inputMode="numeric" placeholder="3" value={form.bedrooms} onChange={set('bedrooms')} /></Field>
              <Field label="Baths" Icon={Bath}><input className={inputClass} inputMode="decimal" placeholder="2" value={form.bathrooms} onChange={set('bathrooms')} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Square footage" Icon={Ruler}><input className={inputClass} inputMode="numeric" placeholder="1,100" value={form.sqft} onChange={set('sqft')} /></Field>
              <Field label="Year built" Icon={Home}><input className={inputClass} inputMode="numeric" placeholder="1995" value={form.yearBuilt} onChange={set('yearBuilt')} /></Field>
            </div>
            <Field label="Property type" Icon={Building2}>
              <select className={selectClass} value={form.propertyType} onChange={set('propertyType')}>
                {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>

            <p className="text-[11px] text-mute flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={2} />
              "Look up property details" pulls official county auditor records where we're connected
              (Columbus, Cleveland, Cincinnati metro counties today) — your entries are the fallback.
            </p>

            <div className="border-t border-gray-200 pt-4 space-y-2 text-sm">
              <Row label="Basic report" value={BASIC_PRICE.toFixed(2)} bold />
              {comped && <Row label="Complimentary discount" value={`-${BASIC_PRICE.toFixed(2)}`} />}
              <div className="border-t border-gray-200 pt-2 flex justify-between">
                <span className="font-semibold text-ink">Total</span>
                <span className="font-bold text-brand-600">{basicPrice.toFixed(2)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={startPurchase}
              disabled={!canSubmit}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-brand-600 text-white font-semibold tracking-wide hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />}
              {buttonLabel}
            </button>
          </div>
        </section>

        {/* ── Your Reports ───────────────────────────────────────────── */}
        <section>
          <h2 className="text-lg font-semibold text-ink mb-4">Your Reports</h2>
          {loadingReports ? (
            <div className="flex items-center justify-center py-12 text-mute"><Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.75} /></div>
          ) : reports.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-mute">
              No reports yet. Purchase one to see it here.
            </div>
          ) : (
            <ul className="space-y-2">
              {reports.map((r) => (
                <li key={r.id}>
                  <div className={`bg-white rounded-xl border p-3 flex items-center gap-3 transition-colors ${active?.id === r.id ? 'border-brand-400 ring-1 ring-brand-200' : 'border-gray-200 hover:border-gray-300'}`}>
                    <button type="button" onClick={() => setActive({ id: r.id, report: r.report })} className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-medium text-ink truncate flex items-center gap-1.5">
                        {r.address}{r.unit_number ? ` ${r.unit_number}` : ''}
                        {r.tier === 'pro' && <span className="text-[9px] font-bold uppercase tracking-wide text-brand-700 bg-brand-50 border border-brand-200 rounded px-1">Pro</span>}
                      </p>
                      <p className="text-xs text-mute">
                        {money(r.estimate)}/mo · {money(r.low)}–{money(r.high)} · {new Date(r.created_at).toLocaleDateString()}
                      </p>
                    </button>
                    <button type="button" onClick={() => openReportPdf(r.id)} title="Download PDF" className="p-2 text-gray-400 hover:text-ink"><Download className="w-4 h-4" strokeWidth={1.75} /></button>
                    <button type="button" onClick={() => remove(r.id)} title="Delete" className="p-2 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" strokeWidth={1.75} /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {active && <ReportDetail report={active.report} reportId={active.id} />}

      {pay && (
        <ReportPaymentModal
          open
          clientSecret={pay.clientSecret}
          price={BASIC_PRICE}
          onClose={() => { setPay(null); setSubmitting(false) }}
          onPaid={() => generate(pay.paymentIntentId)}
        />
      )}
    </div>
  )
}

function openReportPdf(id: string) {
  window.open(`/rental-report/${id}?print=1`, '_blank', 'noopener')
}

// ── Result ──────────────────────────────────────────────────────────────────

function ReportDetail({ report, reportId }: { report: RentEstimateReport; reportId?: string | null }) {
  const conf = CONFIDENCE[report.confidence]
  const ctx = report.context
  const prop = report.property
  const trendPct = useMemo(() => Math.round((ctx.rentTrendFactor - 1) * 1000) / 10, [ctx.rentTrendFactor])

  return (
    <section className="mt-6 bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-mute font-semibold">Estimated rent</p>
            <p className="text-4xl font-bold text-ink mt-1">{money(report.estimate)}<span className="text-base font-medium text-mute">/mo</span></p>
            <p className="text-sm text-mute mt-1">Likely range {money(report.low)} – {money(report.high)}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border ${conf.cls}`}>
              <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} />{conf.label}
            </span>
            {reportId && (
              <button type="button" onClick={() => openReportPdf(reportId)} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:text-brand-800">
                <Download className="w-3.5 h-3.5" strokeWidth={2} /> Download PDF
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-6 border-b border-gray-200">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-mute mb-3">Market context</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Stat label="Area median rent" value={money(ctx.medianGrossRent)} />
          <Stat label="12-mo rent trend" value={`${trendPct >= 0 ? '+' : ''}${trendPct}%`} accent={trendPct >= 0 ? 'up' : 'down'} />
          <Stat label="Rental vacancy" value={ctx.rentalVacancyRate != null ? `${ctx.rentalVacancyRate}%` : '—'} />
          <Stat label="Median income" value={money(ctx.medianHouseholdIncome)} />
          <Stat label="Rent-to-income" value={ctx.rentToIncomePct != null ? `${ctx.rentToIncomePct}%` : '—'} />
          <Stat label="Renter share" value={ctx.renterSharePct != null ? `${ctx.renterSharePct}%` : '—'} />
        </div>
      </div>

      {prop && (
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-mute mb-3">
            Property record <span className="text-gray-400 normal-case font-normal">· {prop.source}</span>
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat label="Beds" value={prop.bedrooms != null ? String(prop.bedrooms) : '—'} />
            <Stat label="Baths" value={prop.bathrooms != null ? String(prop.bathrooms) : '—'} />
            <Stat label="Sq ft" value={prop.sqft != null ? prop.sqft.toLocaleString() : '—'} />
            <Stat label="Year built" value={prop.yearBuilt != null ? String(prop.yearBuilt) : '—'} />
            <Stat label="Assessed value" value={money(prop.assessedValue)} />
            <Stat label="Last sale" value={prop.lastSalePrice != null ? money(prop.lastSalePrice) : '—'} />
            <Stat label="Gross yield" value={prop.grossYieldPct != null ? `${prop.grossYieldPct}%` : '—'} />
          </div>
        </div>
      )}

      {/* First-party lease signal */}
      {report.leaseSignal && (
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-mute mb-3">
            Real lease data <span className="text-gray-400 normal-case font-normal">· FindStoop network</span>
          </h3>
          {report.leaseSignal.subject && (
            <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2.5 text-sm">
              <p className="text-ink">
                <strong className="font-semibold">Your current lease at this address:</strong>{' '}
                {money(report.leaseSignal.subject.rent)}/mo since{' '}
                {new Date(report.leaseSignal.subject.startDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                {report.leaseSignal.subject.longTerm && (
                  <> · long-term tenancy, so today's market equivalent is{' '}
                  <strong className="font-semibold">≈{money(report.leaseSignal.subject.grossedRent)}/mo</strong> after
                  rent inflation</>
                )}
              </p>
            </div>
          )}
          <p className="text-xs text-mute">
            This estimate is anchored {Math.round(report.leaseSignal.weight * 100)}% on{' '}
            {report.leaseSignal.n} actual nearby lease{report.leaseSignal.n === 1 ? '' : 's'}
            {report.leaseSignal.medianGrossed != null && (
              <> (inflation-adjusted median {money(report.leaseSignal.medianGrossed)}/mo)</>
            )}
            , weighted by distance and recency.
          </p>
        </div>
      )}

      {/* Pro: comparable rentals */}
      {report.comps && report.comps.length > 0 && (
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-mute mb-3">
            Nearby comparable rentals <span className="text-gray-400 normal-case font-normal">· RentCast</span>
          </h3>
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-mute text-left">
                  <th className="font-semibold px-1 py-1">Address</th>
                  <th className="font-semibold px-1 py-1">Bd/Ba</th>
                  <th className="font-semibold px-1 py-1">Sq ft</th>
                  <th className="font-semibold px-1 py-1 text-right">Rent</th>
                  <th className="font-semibold px-1 py-1 text-right">Dist</th>
                  <th className="font-semibold px-1 py-1 text-right">DOM</th>
                </tr>
              </thead>
              <tbody>
                {report.comps.map((c, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-1 py-1.5 text-ink truncate max-w-[200px]">{c.address ?? '—'}</td>
                    <td className="px-1 py-1.5 text-mute">{c.bedrooms ?? '—'}/{c.bathrooms ?? '—'}</td>
                    <td className="px-1 py-1.5 text-mute">{c.sqft != null ? c.sqft.toLocaleString() : '—'}</td>
                    <td className="px-1 py-1.5 text-ink font-medium text-right">{money(c.rent)}</td>
                    <td className="px-1 py-1.5 text-mute text-right">{c.distanceMi != null ? `${c.distanceMi.toFixed(1)}mi` : '—'}</td>
                    <td className="px-1 py-1.5 text-mute text-right">{c.daysOnMarket ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {report.vendorEstimate?.rent != null && (
            <p className="text-[11px] text-mute mt-2">
              RentCast’s own estimate: <strong className="text-ink">{money(report.vendorEstimate.rent)}/mo</strong>
              {report.vendorEstimate.low != null && <> ({money(report.vendorEstimate.low)}–{money(report.vendorEstimate.high)})</>} — shown as a cross-check.
            </p>
          )}
        </div>
      )}

      <div className="p-6">
        <details className="group">
          <summary className="flex items-center gap-1.5 cursor-pointer text-sm font-semibold text-ink list-none">
            <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" strokeWidth={2} />
            How we calculated this
          </summary>
          <div className="mt-3 space-y-2 text-sm text-mute">
            <FactorRow label={`Area baseline (${baselineLabel(report.baseline.source)}, ${report.baseline.vintageYear})`} value={money(report.baseline.value)} />
            <FactorRow label="Utilities adjustment" value={`×${report.factors.utilities.toFixed(2)}`} />
            <FactorRow label="Size vs. local norm" value={`×${report.factors.size.toFixed(2)}`} />
            <FactorRow label="Bathrooms" value={`×${report.factors.bath.toFixed(2)}`} />
            <FactorRow label="Age of home" value={`×${report.factors.age.toFixed(2)}`} />
            <FactorRow label="Property type" value={`×${report.factors.type.toFixed(2)}`} />
            <FactorRow label="Recency trend (CPI rent)" value={`×${report.factors.recency.toFixed(2)}`} />
            <div className="flex justify-between border-t border-gray-200 pt-2 font-semibold text-ink">
              <span>Estimate</span><span>{money(report.estimate)}/mo</span>
            </div>
          </div>
        </details>

        {report.caveats.length > 0 && (
          <ul className="mt-4 space-y-1">
            {report.caveats.map((c, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                <Info className="w-3 h-3 mt-0.5 shrink-0 text-amber-600" strokeWidth={2} /><span>{c}</span>
              </li>
            ))}
          </ul>
        )}

        <p className="text-[10px] text-mute leading-relaxed mt-4">
          Sources: {report.dataSources.join(' · ')}. Estimate is a statistical model, not an appraisal or a
          guarantee of achievable rent.
        </p>

        {/* Only when we had NO county data at all (Hamilton-style partial
            coverage still renders a property record — no ask needed there). */}
        {report.attributesSource === 'user' && !report.property && report.geography?.county && (
          <CoverageRequestCard geography={report.geography} />
        )}
      </div>
    </section>
  )
}

// Shown when the report ran WITHOUT county auditor data — offers to connect the
// manager's county. Requests rank which county adapters we build next.
function CoverageRequestCard({ geography }: { geography: NonNullable<RentEstimateReport['geography']> }) {
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle')
  const placeLabel = [geography.countyName, geography.stateName].filter(Boolean).join(', ')
    || `county ${geography.county}, state ${geography.state}`

  useEffect(() => {
    let cancelled = false
    hasRequestedParcelCoverage(geography.state, geography.county)
      .then((yes) => { if (!cancelled && yes) setState('done') })
      .catch(() => { /* leave idle */ })
    return () => { cancelled = true }
  }, [geography.state, geography.county])

  async function send() {
    setState('sending')
    try {
      await requestParcelCoverage({
        stateFips: geography.state,
        countyFips: geography.county,
        stateName: geography.stateName,
        countyName: geography.countyName,
        zip: geography.zip || null,
      })
      setState('done')
      toast.success('Request logged — thanks!')
    } catch (e) {
      setState('idle')
      toast.error(e instanceof Error ? e.message : 'Could not log the request')
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50/40 p-4">
      {state === 'done' ? (
        <p className="flex items-start gap-2 text-sm text-emerald-800">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" strokeWidth={2} />
          <span>
            <strong className="font-semibold">Request received for {placeLabel}.</strong>{' '}
            We'll connect its county property records — future reports there will auto-fill beds,
            baths, size, and assessed value from official data.
          </span>
        </p>
      ) : (
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <p className="text-sm text-ink flex-1 min-w-[220px]">
            <strong className="font-semibold">We haven't connected {placeLabel}'s property records yet</strong>
            <span className="text-mute"> — this estimate used the details you entered. Want us to add
            official county data for your area?</span>
          </p>
          <button
            type="button"
            onClick={send}
            disabled={state === 'sending'}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 px-3 py-2 rounded-lg disabled:opacity-50"
          >
            {state === 'sending' && <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} />}
            Request my county
          </button>
        </div>
      )}
    </div>
  )
}

// ── Small pieces ──────────────────────────────────────────────────────────

function Field({ label, Icon, children }: { label: string; Icon: typeof Bed; children: React.ReactNode }) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
        <Icon className="w-3.5 h-3.5 text-gray-400" strokeWidth={2} />{label}
      </label>
      {children}
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={bold ? 'font-semibold text-ink' : 'text-mute'}>{label}</span>
      <span className={bold ? 'font-semibold text-ink' : 'text-ink'}>{value}</span>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: 'up' | 'down' }) {
  const tone = accent === 'up' ? 'text-emerald-700' : accent === 'down' ? 'text-red-600' : 'text-ink'
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-mute font-semibold">{label}</p>
      <p className={`text-sm font-semibold mt-0.5 inline-flex items-center gap-1 ${tone}`}>
        {accent && <TrendingUp className={`w-3.5 h-3.5 ${accent === 'down' ? 'rotate-180' : ''}`} strokeWidth={2} />}
        {value}
      </p>
    </div>
  )
}

function FactorRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span>{label}</span><span className="text-ink font-medium">{value}</span></div>
}

function baselineLabel(source: RentEstimateReport['baseline']['source']): string {
  switch (source) {
    case 'acs_tract': return 'Census tract'
    case 'acs_zip': return 'Census ZIP'
    case 'safmr': return 'HUD SAFMR'
    case 'fmr': return 'HUD FMR'
  }
}


// Branded, print-ready Rental Analysis Report. Standalone route (no app nav) so
// it opens clean in a new tab and saves to PDF via the browser. RLS scopes the
// fetch to the owner. Same print pattern as InvoicePdf. Auto-prints with ?print=1.

import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer, Loader2 } from 'lucide-react'
import { getRentReport, type SavedRentReport } from '@findstoop/shared'

const money = (n: number | null | undefined) => (n == null ? '—' : '$' + Math.round(n).toLocaleString())

const CONFIDENCE: Record<'low' | 'medium' | 'high', { label: string; bg: string; fg: string }> = {
  high:   { label: 'High confidence',   bg: '#ECFDF5', fg: '#047857' },
  medium: { label: 'Medium confidence', bg: '#EFF6FF', fg: '#1D4ED8' },
  low:    { label: 'Low confidence',    bg: '#FFFBEB', fg: '#B45309' },
}

function baselineLabel(s: string) {
  return s === 'acs_tract' ? 'Census tract' : s === 'acs_zip' ? 'Census ZIP' : s === 'safmr' ? 'HUD SAFMR' : 'HUD FMR'
}

export default function RentalReportPdf() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const [row, setRow] = useState<SavedRentReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const r = await getRentReport(id)
        if (cancelled) return
        if (!r) throw new Error('Report not found')
        setRow(r)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load report')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [id])

  useEffect(() => {
    if (!row || searchParams.get('print') !== '1') return
    const t = setTimeout(() => window.print(), 500)
    return () => clearTimeout(t)
  }, [row, searchParams])

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-mute"><Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} /></div>
  }
  if (error || !row) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center">
        <p className="text-mute">{error ?? 'Report not found.'}</p>
        <Link to="/manager/rental-analysis" className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 mt-4">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} /> Back to Rental Analysis
        </Link>
      </div>
    )
  }

  const r = row.report
  const conf = CONFIDENCE[r.confidence]
  const ctx = r.context
  const prop = r.property
  const trendPct = Math.round((ctx.rentTrendFactor - 1) * 1000) / 10

  return (
    <div className="bg-gray-100 min-h-screen">
      {/* Toolbar — hidden on print */}
      <div className="report-toolbar sticky top-0 z-10 bg-white border-b border-gray-200 print:hidden">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/manager/rental-analysis" className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} /> Back
          </Link>
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 px-3 py-2 rounded-lg">
            <Printer className="w-4 h-4" strokeWidth={1.75} /> Print or save as PDF
          </button>
        </div>
      </div>

      {/* Paper */}
      <div className="report-paper max-w-3xl mx-auto bg-white shadow-sm my-6 print:my-0 print:shadow-none">
        <div className="px-10 py-10 print:px-12 print:py-10 text-ink" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          {/* Header */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Rental Analysis Report</h1>
              <p className="text-sm text-mute mt-1">{row.address}{row.unit_number ? ` ${row.unit_number}` : ''}{row.zip ? `, ${row.zip}` : ''}</p>
              <p className="text-xs text-mute mt-0.5">Prepared {new Date(row.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
            <img src="/stoop_logo_horizontal_trans.png" alt="Stoop" className="h-9" />
          </div>

          {/* Hero estimate */}
          <div className="rounded-xl border border-gray-200 p-6 mb-8" style={{ background: 'linear-gradient(135deg,#F0FdFb,#FFFFFF)' }}>
            <div className="flex items-end justify-between flex-wrap gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-mute font-semibold">Estimated monthly rent</p>
                <p className="text-5xl font-bold tracking-tight mt-1" style={{ color: '#007A6C' }}>{money(r.estimate)}</p>
                <p className="text-sm text-mute mt-1">Likely range {money(r.low)} – {money(r.high)}</p>
              </div>
              <span className="inline-flex items-center text-xs font-semibold px-3 py-1 rounded-full" style={{ background: conf.bg, color: conf.fg }}>{conf.label}</span>
            </div>
          </div>

          {/* Market context */}
          <Section title="Market context">
            <Grid>
              <Cell label="Area median rent" value={money(ctx.medianGrossRent)} />
              <Cell label="12-mo rent trend" value={`${trendPct >= 0 ? '+' : ''}${trendPct}%`} />
              <Cell label="Rental vacancy" value={ctx.rentalVacancyRate != null ? `${ctx.rentalVacancyRate}%` : '—'} />
              <Cell label="Median income" value={money(ctx.medianHouseholdIncome)} />
              <Cell label="Rent-to-income" value={ctx.rentToIncomePct != null ? `${ctx.rentToIncomePct}%` : '—'} />
              <Cell label="Renter share" value={ctx.renterSharePct != null ? `${ctx.renterSharePct}%` : '—'} />
            </Grid>
          </Section>

          {/* Property record */}
          {prop && (
            <Section title={`Property record · ${prop.source}`}>
              <Grid>
                <Cell label="Beds" value={prop.bedrooms != null ? String(prop.bedrooms) : '—'} />
                <Cell label="Baths" value={prop.bathrooms != null ? String(prop.bathrooms) : '—'} />
                <Cell label="Sq ft" value={prop.sqft != null ? prop.sqft.toLocaleString() : '—'} />
                <Cell label="Year built" value={prop.yearBuilt != null ? String(prop.yearBuilt) : '—'} />
                <Cell label="Assessed value" value={money(prop.assessedValue)} />
                <Cell label="Gross yield" value={prop.grossYieldPct != null ? `${prop.grossYieldPct}%` : '—'} />
              </Grid>
            </Section>
          )}

          {/* Methodology */}
          <Section title="How this estimate was calculated">
            <table className="w-full text-sm">
              <tbody>
                <FRow label={`Area baseline (${baselineLabel(r.baseline.source)}, ${r.baseline.vintageYear})`} value={money(r.baseline.value)} />
                <FRow label="Utilities adjustment" value={`×${r.factors.utilities.toFixed(2)}`} />
                <FRow label="Size vs. local norm" value={`×${r.factors.size.toFixed(2)}`} />
                <FRow label="Bathrooms" value={`×${r.factors.bath.toFixed(2)}`} />
                <FRow label="Age of home" value={`×${r.factors.age.toFixed(2)}`} />
                <FRow label="Property type" value={`×${r.factors.type.toFixed(2)}`} />
                <FRow label="Recency trend (CPI rent)" value={`×${r.factors.recency.toFixed(2)}`} />
                {r.leaseSignal && (
                  <FRow
                    label={`Anchored on ${r.leaseSignal.n} actual nearby lease${r.leaseSignal.n === 1 ? '' : 's'} (distance + recency weighted)`}
                    value={`${Math.round(r.leaseSignal.weight * 100)}%`}
                  />
                )}
                <tr className="border-t-2 border-gray-300">
                  <td className="py-2 font-bold">Estimated rent</td>
                  <td className="py-2 font-bold text-right">{money(r.estimate)}/mo</td>
                </tr>
              </tbody>
            </table>
          </Section>

          {r.caveats.length > 0 && (
            <div className="mb-6">
              {r.caveats.map((c, i) => (
                <p key={i} className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-1">{c}</p>
              ))}
            </div>
          )}

          {/* Footer / disclaimer */}
          <div className="mt-8 pt-5 border-t border-gray-200 text-[10px] text-mute leading-relaxed">
            <p className="mb-1"><strong>Sources:</strong> {r.dataSources.join(' · ')}.</p>
            <p>
              This Rental Analysis Report is a statistical estimate generated from public data and is provided for
              informational purposes only. It is not an appraisal, a guarantee of achievable rent, or a recommendation
              to set rent at any specific amount. Rent decisions must comply with all applicable fair-housing and
              local rent regulations. © {new Date().getFullYear()} Stoop · findstoop.com
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body { background: white !important; }
          .report-toolbar { display: none !important; }
          .report-paper { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
          @page { margin: 0.5in; size: letter; }
        }
      `}</style>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-7">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-mute mb-3 pb-1 border-b border-gray-200">{title}</h2>
      {children}
    </div>
  )
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-3 gap-x-6 gap-y-4">{children}</div>
}
function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-mute font-semibold">{label}</p>
      <p className="text-base font-semibold text-ink mt-0.5">{value}</p>
    </div>
  )
}
function FRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-t border-gray-100">
      <td className="py-1.5 text-mute">{label}</td>
      <td className="py-1.5 text-right text-ink font-medium">{value}</td>
    </tr>
  )
}

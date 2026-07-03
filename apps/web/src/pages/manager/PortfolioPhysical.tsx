// Annual portfolio physical — the once-a-year health report a small landlord
// never gets: rent vs market, expense ratio, lease-end clustering, deposit
// exposure, compliance gaps, collection health, plus an optional AI-written
// executive summary. Standalone print page (no sidebar) like the rent roll:
// pass ?property=<id> to scope to one property. Every number is computed
// client-side by lib/portfolioPhysical.ts from RLS-scoped queries; the AI
// (portfolio-physical edge function) only narrates and prioritizes.

import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Printer, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { getProperties } from '@findstoop/shared/api/properties'
import { formatUsd, formatUsdCents } from '@findstoop/shared/lib/format'
import { supabase } from '../../lib/supabase'
import { BRAND } from '../../lib/brand'
import {
  propertyPhysical, summarizePortfolio, physicalMetricsForAi,
  PHYSICAL_WINDOW_DAYS, BELOW_MARKET_THRESHOLD_PCT,
  type PhysicalInputs, type PropertyPhysical, type PortfolioSummary,
  type PhysicalLeaseLike, type PhysicalPaymentLike, type PhysicalRentReportLike,
} from '../../lib/portfolioPhysical'
import { addDaysIso } from '../../lib/depositReturn'
import type { LateFeeConfigLike } from '../../lib/complianceRules'

interface Narrative {
  summary: string
  recommendations: Array<{ priority: number; title: string; detail: string }>
}

interface LoadedData {
  perProperty: PropertyPhysical[]
  summary: PortfolioSummary
  metrics: Record<string, unknown>
}

export default function PortfolioPhysicalPage() {
  const { user, profile } = useAuth()
  const [params] = useSearchParams()
  const propertyId = params.get('property') || undefined

  const [data, setData] = useState<LoadedData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [narrative, setNarrative] = useState<Narrative | null>(null)
  const [narrating, setNarrating] = useState(false)

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), [])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    setLoading(true)
    buildPhysical(user.id, propertyId, todayIso)
      .then((d) => { if (!cancelled) setData(d) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not build the report') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user, propertyId, todayIso])

  const generateNarrative = async () => {
    if (!data || narrating) return
    setNarrating(true)
    try {
      const { data: res, error: fnErr } = await supabase.functions.invoke('portfolio-physical', {
        body: { metrics: data.metrics, scope: propertyId ? 'property' : 'portfolio' },
      })
      if (fnErr) throw new Error(fnErr.message)
      if (!res?.ok) throw new Error(res?.message ?? 'Could not produce a narrative just now.')
      setNarrative({ summary: res.summary, recommendations: res.recommendations ?? [] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not produce a narrative just now.')
    } finally {
      setNarrating(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-mute"><Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} /></div>
  }
  if (error || !data) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center">
        <p className="text-mute">{error ?? 'Could not build the report'}</p>
        <Link to="/manager/reports" className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 mt-4">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} /> Back to Reports
        </Link>
      </div>
    )
  }

  const { perProperty, summary } = data
  const scope = propertyId && perProperty[0] ? perProperty[0].propertyName : 'All properties'

  return (
    <div className="bg-gray-100 min-h-screen">
      <div className="pp-toolbar sticky top-0 z-10 bg-white border-b border-gray-200 print:hidden">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
          <Link to="/manager/download-center" className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} /> Back to Download center
          </Link>
          <div className="flex items-center gap-2">
            {!narrative && (
              <button
                type="button"
                onClick={generateNarrative}
                disabled={narrating}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-ink border border-gray-300 hover:bg-gray-50 px-3 py-2 rounded-lg disabled:opacity-50"
              >
                {narrating ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} /> : <Sparkles className="w-4 h-4" strokeWidth={1.75} />}
                {narrating ? 'Writing summary…' : 'Add AI summary'}
              </button>
            )}
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 px-3 py-2 rounded-lg">
              <Printer className="w-4 h-4" strokeWidth={1.75} /> Print or save as PDF
            </button>
          </div>
        </div>
      </div>

      <div className="pp-paper max-w-4xl mx-auto bg-white shadow-sm my-6 print:my-0 print:shadow-none">
        <div className="px-8 py-8 print:px-8 print:py-6 text-ink" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Annual portfolio physical</h1>
              <p className="text-sm text-mute mt-1">
                {scope} · trailing {Math.round(PHYSICAL_WINDOW_DAYS / 30.44)} months · as of{' '}
                {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
              {profile?.full_name && <p className="text-sm text-ink mt-1 font-medium">{profile.full_name}</p>}
            </div>
            <img src={BRAND.logo.horizontal} alt={BRAND.name} className="h-9" />
          </div>

          {/* Vitals */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 text-sm">
            <Stat label="Collected (12 mo)" value={formatUsd(summary.totalCollected)} />
            <Stat label="Expenses (12 mo)" value={formatUsd(summary.totalExpenses)} />
            <Stat label="Expense ratio" value={summary.ratioPct != null ? `${summary.ratioPct}%` : '—'} />
            <Stat label="On-time rent" value={summary.onTimeRatePct != null ? `${summary.onTimeRatePct}%` : '—'} />
          </div>

          {/* AI executive summary */}
          {narrative && (
            <Section title="Executive summary">
              <p className="text-sm leading-relaxed whitespace-pre-line">{narrative.summary}</p>
              {narrative.recommendations.length > 0 && (
                <ol className="mt-3 space-y-2">
                  {narrative.recommendations.map((r) => (
                    <li key={r.priority} className="text-sm flex gap-2">
                      <span className="font-semibold text-brand-700 shrink-0">{r.priority}.</span>
                      <span><span className="font-semibold">{r.title}.</span> {r.detail}</span>
                    </li>
                  ))}
                </ol>
              )}
              <p className="text-[11px] text-mute mt-3">
                Written by AI from the computed figures on this report — it never adds numbers of its own. Verify anything consequential.
              </p>
            </Section>
          )}

          {perProperty.map((p) => <PropertySections key={p.propertyId} p={p} multi={perProperty.length > 1} />)}

          <div className="mt-8 pt-4 border-t border-gray-200 text-[11px] text-mute text-center">
            <p>
              Generated by {BRAND.name} on {new Date().toLocaleDateString()}. Figures come from your recorded leases,
              payments, and expenses. Compliance notes are informational summaries with citations, not legal advice.
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body { background: white !important; }
          .pp-toolbar { display: none !important; }
          .pp-paper { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
          @page { margin: 0.5in; size: letter portrait; }
        }
      `}</style>
    </div>
  )
}

// ── Per-property sections ────────────────────────────────────────────────────

function PropertySections({ p, multi }: { p: PropertyPhysical; multi: boolean }) {
  return (
    <div className="mb-6 break-inside-avoid-page">
      {multi && (
        <h2 className="text-lg font-bold border-b-2 border-gray-300 pb-1 mb-3">
          {p.propertyName} <span className="text-sm font-normal text-mute">— {p.occupiedCount} of {p.unitCount} units occupied</span>
        </h2>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        {/* Rent vs market */}
        <Section title="Rent vs market">
          {p.rentDrift.rows.length === 0 ? (
            <Empty>No occupied units to compare.</Empty>
          ) : (
            <>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-mute border-b border-gray-200">
                    <th className="py-1 pr-2 font-semibold">Unit</th>
                    <th className="py-1 pr-2 font-semibold text-right">Rent</th>
                    <th className="py-1 pr-2 font-semibold text-right">Estimate</th>
                    <th className="py-1 font-semibold text-right">Drift</th>
                  </tr>
                </thead>
                <tbody>
                  {p.rentDrift.rows.map((r) => (
                    <tr key={r.unitId} className="border-b border-gray-100">
                      <td className="py-1 pr-2">{r.unitNumber}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{formatUsdCents(r.currentRent)}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        {r.estimate != null ? formatUsdCents(r.estimate) : <span className="text-mute">none on file</span>}
                        {r.stale && <span className="text-amber-700"> *</span>}
                      </td>
                      <td className={`py-1 text-right tabular-nums font-medium ${driftColor(r.driftPct)}`}>
                        {r.driftPct != null ? `${r.driftPct > 0 ? '+' : ''}${r.driftPct}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {p.rentDrift.belowMarketUnits > 0 && (
                <p className="text-xs mt-2">
                  {p.rentDrift.belowMarketUnits} unit{p.rentDrift.belowMarketUnits === 1 ? ' rents' : 's rent'} more than{' '}
                  {BELOW_MARKET_THRESHOLD_PCT}% below the saved estimate — about{' '}
                  <span className="font-semibold">{formatUsd(p.rentDrift.monthlyGapDollars)}/mo</span> left on the table.
                </p>
              )}
              {p.rentDrift.rows.some((r) => r.stale) && (
                <p className="text-[11px] text-mute mt-1">* Estimate is over a year old — worth refreshing.</p>
              )}
              {p.rentDrift.unitsWithoutEstimate > 0 && (
                <p className="text-xs text-mute mt-2">
                  {p.rentDrift.unitsWithoutEstimate} unit{p.rentDrift.unitsWithoutEstimate === 1 ? ' has' : 's have'} no saved
                  rent estimate — we never guess market rent.{' '}
                  <Link to="/manager/rental-analysis" className="text-brand-700 hover:underline print:hidden">Run a Rental Analysis →</Link>
                </p>
              )}
            </>
          )}
        </Section>

        {/* Expense ratio */}
        <Section title="Expense ratio (12 months)">
          <p className="text-sm">
            <span className="font-semibold">{formatUsd(p.expenses.totalExpenses)}</span> spent against{' '}
            <span className="font-semibold">{formatUsd(p.expenses.totalCollected)}</span> collected
            {p.expenses.ratioPct != null && (
              <> — <span className="font-semibold">{p.expenses.ratioPct}%</span> of income went to operating costs</>
            )}.
          </p>
          {p.expenses.byCategory.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs">
              {p.expenses.byCategory.slice(0, 6).map((c) => (
                <li key={c.category} className="flex justify-between">
                  <span>{c.label}</span>
                  <span className="tabular-nums">{formatUsdCents(c.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No expenses recorded in the window — log them under Expenses to see your true margin.</Empty>
          )}
        </Section>

        {/* Lease-end clustering */}
        <Section title="Lease-end timing">
          {p.leaseClusters.activeLeaseCount === 0 ? (
            <Empty>No active fixed-term leases.</Empty>
          ) : p.leaseClusters.clusters.length === 0 ? (
            <p className="text-sm">Lease ends are spread out — no month has more than one lease ending. Good staggering.</p>
          ) : (
            <>
              {p.leaseClusters.clusters.map((c) => (
                <p key={c.month} className="text-sm">
                  <span className="font-semibold">{c.count} leases end in {monthLabel(c.month)}</span>
                  {' '}(units {c.unitNumbers.join(', ')}) — consider staggering renewals so you aren't
                  turning over multiple units at once.
                </p>
              ))}
            </>
          )}
        </Section>

        {/* Deposit exposure */}
        <Section title="Deposit exposure">
          <p className="text-sm">
            Holding <span className="font-semibold">{formatUsd(p.deposits.totalHeld)}</span> in deposits across{' '}
            {p.deposits.leasesWithDeposit} lease{p.deposits.leasesWithDeposit === 1 ? '' : 's'}.
          </p>
          {p.deposits.atRisk.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {p.deposits.atRisk.map((d) => (
                <li key={d.leaseId} className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                  Unit {d.unitNumber}: tenant moved out {d.moveOut} and the deposit hasn't been settled.{' '}
                  {d.deadline
                    ? d.daysLeft != null && d.daysLeft < 0
                      ? <span className="font-semibold text-red-700">The statutory return deadline ({d.deadline}) has passed.</span>
                      : <span className="font-semibold">Statutory deadline {d.deadline} ({d.daysLeft} days left).</span>
                    : 'We don’t have this state’s return deadline on file — check your statute.'}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Compliance */}
        <Section title="Compliance check">
          {!p.compliance.rulesOnFile && (
            <p className="text-xs text-mute">
              {p.compliance.stateName} isn't in our rules database yet — federal requirements still apply.
            </p>
          )}
          {p.compliance.flags.length === 0 && p.compliance.rulesOnFile && (
            <p className="text-sm">Nothing to check against {p.compliance.stateName}'s rules right now.</p>
          )}
          {p.compliance.flags.map((f, i) => (
            <p
              key={i}
              className={`text-xs rounded-lg border px-2.5 py-1.5 mt-1.5 ${
                f.level === 'warning' ? 'bg-red-50 border-red-200 text-red-800'
                : f.level === 'ok' ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-blue-50 border-blue-200 text-blue-800'
              }`}
            >
              {f.message}{f.statuteCite && <span className="font-mono opacity-80"> ({f.statuteCite})</span>}
            </p>
          ))}
          <p className="text-[11px] text-mute mt-2">Informational summary, not legal advice.</p>
        </Section>

        {/* Collection health */}
        <Section title="Collection health (12 months)">
          {p.collection.dueCount === 0 ? (
            <Empty>No rent came due in the window.</Empty>
          ) : (
            <>
              <p className="text-sm">
                <span className="font-semibold">{p.collection.onTimeRatePct}%</span> of {p.collection.dueCount} rents were
                paid on time. {p.collection.paidLateCount > 0 && `${p.collection.paidLateCount} arrived late.`}
              </p>
              {p.collection.openOverdueCount > 0 && (
                <p className="text-xs text-red-700 font-medium mt-1.5">
                  {p.collection.openOverdueCount} payment{p.collection.openOverdueCount === 1 ? '' : 's'} totaling{' '}
                  {formatUsd(p.collection.openOverdueAmount)} still outstanding past due.
                </p>
              )}
            </>
          )}
        </Section>
      </div>
    </div>
  )
}

// ── Data assembly — the same RLS-scoped queries the app already runs ─────────

async function buildPhysical(managerId: string, propertyId: string | undefined, todayIso: string): Promise<LoadedData> {
  const windowStart = addDaysIso(todayIso, -PHYSICAL_WINDOW_DAYS)

  let properties = await getProperties(managerId)
  if (propertyId) properties = properties.filter((p) => p.id === propertyId)
  if (properties.length === 0) throw new Error('No properties to report on yet.')
  const propIds = properties.map((p) => p.id)

  const { data: units, error: uErr } = await supabase
    .from('units')
    .select('id, property_id, unit_number, bedrooms, rent_amount, status')
    .in('property_id', propIds)
  if (uErr) throw new Error(uErr.message)
  const unitIds = (units ?? []).map((u) => u.id)

  const { data: leaseRows } = unitIds.length
    ? await supabase
        .from('leases')
        .select('id, unit_id, status, start_date, end_date, rent_amount, security_deposit, pet_deposit, month_to_month, tentative_move_out_date')
        .in('unit_id', unitIds)
    : { data: [] }
  const leases: PhysicalLeaseLike[] = (leaseRows ?? []).map((l: Record<string, unknown>) => ({
    id: String(l.id),
    unit_id: String(l.unit_id),
    status: String(l.status),
    start_date: String(l.start_date),
    end_date: String(l.end_date),
    rent_amount: Number(l.rent_amount),
    security_deposit: l.security_deposit != null ? Number(l.security_deposit) : null,
    pet_deposit: l.pet_deposit != null ? Number(l.pet_deposit) : null,
    month_to_month: !!l.month_to_month,
    tentative_move_out_date: (l.tentative_move_out_date as string | null) ?? null,
  }))
  const leaseIds = leases.map((l) => l.id)

  const { data: payments } = leaseIds.length
    ? await supabase
        .from('payments')
        .select('lease_id, type, status, amount, due_date, paid_at')
        .in('lease_id', leaseIds)
        .or(`due_date.gte.${windowStart},paid_at.gte.${windowStart}`)
        .limit(10000)
    : { data: [] }

  const { data: expenses } = await supabase
    .from('property_expenses')
    .select('property_id, category, amount, expense_date')
    .in('property_id', propIds)
    .gte('expense_date', windowStart)
    .limit(10000)

  const { data: reportRows } = await supabase
    .from('rent_reports')
    .select('address, unit_number, zip, bedrooms, estimate, low, high, created_at')
    .order('created_at', { ascending: false })
    .limit(500)

  const { data: depositDocs } = await supabase
    .from('generated_documents')
    .select('lease_id, status')
    .in('property_id', propIds)
    .eq('type', 'security_deposit')

  const { data: feeRow } = await supabase
    .from('profiles')
    .select('late_fee_enabled, late_fee_amount, late_fee_grace_days, late_fee_type, late_fee_percent')
    .eq('id', managerId)
    .single()
  const lateFeeConfig: LateFeeConfigLike | null = feeRow
    ? {
        late_fee_enabled: feeRow.late_fee_enabled ?? false,
        late_fee_amount: Number(feeRow.late_fee_amount ?? 0),
        late_fee_grace_days: Number(feeRow.late_fee_grace_days ?? 0),
        late_fee_type: (feeRow.late_fee_type ?? 'flat') as 'flat' | 'percent',
        late_fee_percent: Number(feeRow.late_fee_percent ?? 0),
      }
    : null

  const perProperty = properties.map((property) => {
    const inputs: PhysicalInputs = {
      property,
      units: (units ?? []) as PhysicalInputs['units'],
      leases,
      payments: (payments ?? []) as PhysicalPaymentLike[],
      expenses: (expenses ?? []) as PhysicalInputs['expenses'],
      rentReports: (reportRows ?? []) as PhysicalRentReportLike[],
      depositDocs: (depositDocs ?? []) as PhysicalInputs['depositDocs'],
      lateFeeConfig,
      todayIso,
    }
    return propertyPhysical(inputs)
  })

  const summary = summarizePortfolio(perProperty)
  return { perProperty, summary, metrics: physicalMetricsForAi(summary, perProperty, todayIso) }
}

// ── Small presentational pieces ──────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 p-4 break-inside-avoid">
      <h3 className="text-[10px] uppercase tracking-wider text-mute font-semibold mb-2">{title}</h3>
      {children}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-mute font-semibold">{label}</p>
      <p className="font-semibold mt-0.5">{value}</p>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-mute">{children}</p>
}

function driftColor(driftPct: number | null): string {
  if (driftPct == null) return 'text-mute'
  if (driftPct <= -BELOW_MARKET_THRESHOLD_PCT) return 'text-amber-700'
  if (driftPct >= BELOW_MARKET_THRESHOLD_PCT) return 'text-emerald-700'
  return 'text-ink'
}

function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-').map(Number)
  return new Date(Date.UTC(y, (m ?? 1) - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

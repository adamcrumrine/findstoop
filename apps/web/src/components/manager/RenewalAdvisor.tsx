// Renewal advisor — sits at the top of the Leases page. For active leases
// ending within 120 days it shows days-to-end, current rent, a market estimate
// (reused from the landlord's saved Rental Analysis reports — never a fresh
// paid lookup), a suggested renewal number with plain-English reasoning, a
// rules-based flight-risk read (renewalRisk.ts — maintenance, payment history,
// market position, tenure), and a one-click "Draft offer letter" that opens
// the Document Builder prefilled with the lease-renewal template.

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, FileText, TrendingUp } from 'lucide-react'
import type { LeaseWithTenant } from '@findstoop/shared/hooks/useLeases'
import type { Unit } from '@findstoop/shared/types/unit'
import type { Property } from '@findstoop/shared/types/property'
import type { Payment } from '@findstoop/shared/types/payment'
import type { MaintenanceRequest } from '@findstoop/shared/types/maintenance'
import {
  listRentReports, getPaymentsByLeaseIds, getMaintenanceRequests, type SavedRentReport,
} from '@findstoop/shared'
import {
  RENEWAL_WINDOW_DAYS, suggestRenewalRent, matchRentReport, defaultRespondBy,
} from '../../lib/renewalAdvisor'
import { assessRenewalRisk, RISK_TIER_LABEL, type RiskTier } from '../../lib/renewalRisk'

interface RenewalAdvisorProps {
  leases: LeaseWithTenant[]
  unitMap: Record<string, Unit>
  propertyMap: Record<string, Property>
}

const money = (n: number) => '$' + Math.round(Number(n)).toLocaleString()

// Badge palette per flight-risk tier — same generic hue family as the lease
// status pills (no brand-specific colors).
const riskPill: Record<RiskTier, string> = {
  low:    'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high:   'bg-red-100 text-red-700',
}

export default function RenewalAdvisor({ leases, unitMap, propertyMap }: RenewalAdvisorProps) {
  const [reports, setReports] = useState<SavedRentReport[]>([])
  // Flight-risk evidence — batched across every upcoming lease (two queries
  // total, no per-row fetches). Null until loaded so rows don't flash a
  // false "low risk" before the data arrives.
  const [riskData, setRiskData] = useState<{ payments: Payment[]; maintenance: MaintenanceRequest[] } | null>(null)

  // Fixed-term active leases ending within the window (month-to-month tenancies
  // have no term to renew, so they're excluded — the M2M card handles those).
  const upcoming = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return leases
      .filter((l) => {
        if (l.status !== 'active' || l.month_to_month) return false
        const daysLeft = Math.ceil((new Date(l.end_date).getTime() - today.getTime()) / 86_400_000)
        return daysLeft > 0 && daysLeft <= RENEWAL_WINDOW_DAYS
      })
      .sort((a, b) => +new Date(a.end_date) - +new Date(b.end_date))
  }, [leases])

  // Saved reports are the landlord's own paid artifacts — loading them is free.
  // A failure here just means "no market estimate", which the rows handle.
  useEffect(() => {
    if (upcoming.length === 0) return
    let cancelled = false
    ;(async () => {
      try {
        const rows = await listRentReports()
        if (!cancelled) setReports(rows)
      } catch { /* panel degrades to current rent + letter CTA */ }
    })()
    return () => { cancelled = true }
  }, [upcoming.length])

  // Flight-risk evidence: payments for each upcoming tenant's lease chain on
  // the unit (renewals included, so tenure/payment history spans the whole
  // tenancy) + maintenance for the upcoming units. Two batched queries.
  const upcomingKey = upcoming.map((l) => l.id).sort().join(',')
  useEffect(() => {
    if (upcoming.length === 0) return
    let cancelled = false
    ;(async () => {
      try {
        const unitIds = [...new Set(upcoming.map((l) => l.unit_id))]
        const chainIds = [...new Set(upcoming.flatMap((u) =>
          leases
            .filter((l) => l.unit_id === u.unit_id && l.tenant_id === u.tenant_id)
            .map((l) => l.id)))]
        const [payments, maintenance] = await Promise.all([
          getPaymentsByLeaseIds(chainIds),
          getMaintenanceRequests(unitIds),
        ])
        if (!cancelled) setRiskData({ payments, maintenance })
      } catch { /* rows simply render without the risk badge */ }
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcomingKey])

  if (upcoming.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <CalendarClock className="w-4 h-4 text-brand-600" strokeWidth={1.75} />
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Renewal advisor</h2>
        <span className="text-xs text-gray-400">
          {upcoming.length} lease{upcoming.length !== 1 ? 's' : ''} ending within {RENEWAL_WINDOW_DAYS} days
        </span>
      </div>
      <div className="divide-y divide-gray-100">
        {upcoming.map((lease) => {
          const unit = unitMap[lease.unit_id]
          const property = unit ? propertyMap[unit.property_id] : undefined
          return (
            <RenewalRow
              key={lease.id}
              lease={lease}
              unit={unit}
              property={property}
              reports={reports}
              allLeases={leases}
              riskData={riskData}
            />
          )
        })}
      </div>
    </div>
  )
}

function RenewalRow({ lease, unit, property, reports, allLeases, riskData }: {
  lease: LeaseWithTenant
  unit?: Unit
  property?: Property
  reports: SavedRentReport[]
  allLeases: LeaseWithTenant[]
  riskData: { payments: Payment[]; maintenance: MaintenanceRequest[] } | null
}) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const daysLeft = Math.ceil((new Date(lease.end_date).getTime() - today.getTime()) / 86_400_000)
  const urgency = daysLeft <= 30 ? 'text-red-600' : daysLeft <= 60 ? 'text-yellow-600' : 'text-gray-600'
  const tenantName = lease.profile?.full_name ?? lease.profile?.email ?? 'Tenant'
  const where = [property?.name ?? property?.address, unit?.unit_number ? `Unit ${unit.unit_number}` : null]
    .filter(Boolean).join(' · ')

  const report = property
    ? matchRentReport(reports, property.address, unit?.unit_number)
    : null
  const currentRent = Number(lease.rent_amount)
  const suggestion = suggestRenewalRent(currentRent, report?.estimate ?? null)

  // Flight-risk read — pure rules over data already fetched above (renewalRisk.ts).
  const risk = riskData
    ? assessRenewalRisk({
        lease,
        allLeases,
        payments: riskData.payments,
        maintenance: riskData.maintenance,
        marketEstimate: report?.estimate ?? null,
        todayIso: today.toISOString().slice(0, 10),
      })
    : null

  // One click opens the Document Builder with tenant + Lease Renewal selected
  // and the suggested numbers pre-seeded (f_* params). The builder's review
  // gate and delivery options stay intact, and the letter lands in Documents.
  const letterParams = new URLSearchParams({
    leaseId: lease.id,
    type: 'lease_renewal',
    f_new_rent: String(suggestion.suggested),
    f_new_term: '12 months',
    f_respond_by: defaultRespondBy(lease.end_date, today.toISOString().slice(0, 10)),
  })

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{tenantName}</p>
          <p className="text-xs text-gray-500 truncate">{where || '—'} · ends {new Date(lease.end_date).toLocaleDateString()}</p>
        </div>
        <span className={`text-sm font-semibold tabular-nums shrink-0 ${urgency}`}>{daysLeft}d left</span>
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-gray-700 tabular-nums">
        <span><span className="text-gray-400 mr-1">Current</span>{money(currentRent)}/mo</span>
        {report ? (
          <span><span className="text-gray-400 mr-1">Market</span>~{money(report.estimate)}/mo</span>
        ) : (
          <span className="text-gray-400">
            No market estimate —{' '}
            <Link to="/manager/rental-analysis" className="text-brand-600 hover:underline">run a rental analysis</Link>
          </span>
        )}
        {report && (
          <span className="font-semibold text-brand-700 inline-flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" strokeWidth={1.75} />
            Suggest {money(suggestion.suggested)}/mo
          </span>
        )}
      </div>

      {report && <p className="mt-1 text-xs text-gray-500 leading-relaxed">{suggestion.reasoning}</p>}

      {/* Flight-risk badge + the signals behind it. Renders once the batched
          payments/maintenance evidence has loaded; the recommendation line is
          the advisor's "so what" for this tenant. */}
      {risk && (
        <div className="mt-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded ${riskPill[risk.tier]}`}>
              {RISK_TIER_LABEL[risk.tier]}
            </span>
            {risk.reasons.length > 0 && (
              <span className="text-gray-500">{risk.reasons.join(' · ')}</span>
            )}
          </div>
          <p className="mt-1 text-gray-600 leading-relaxed">{risk.recommendation}</p>
        </div>
      )}

      <div className="mt-2">
        <Link
          to={`/manager/documents/new?${letterParams.toString()}`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-brand-600 hover:bg-brand-700 px-2.5 py-1.5 rounded-lg transition-colors"
          title={`Draft a renewal offer letter at ${money(suggestion.suggested)}/mo`}
        >
          <FileText className="w-3.5 h-3.5" strokeWidth={1.75} />
          Draft offer letter
        </Link>
      </div>
    </div>
  )
}

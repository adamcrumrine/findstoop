import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { rowStatus } from '@findstoop/shared/lib/paymentRails'
import { formatUsd } from '@findstoop/shared/lib/format'
import type { Payment } from '@findstoop/shared/types/payment'
import { brandColor } from '../../lib/brand'

// Shared monthly-breakdown donut. Used on the manager Dashboard and the
// manager Payments page. Accepts the (already filtered) payments array
// from the parent and slices it by tenant-rail status, using the same
// labels + colors the rest of the app shows.
interface DonutSlice { label: string; value: number; cls: string; color: string }

// Every label rowStatus can return must appear here AND in `order` below —
// anything missing is silently dropped from the chart, so the total quietly
// stops matching the month's charges. 'Due today' was added to rowStatus
// without being added here, which hid every payment due on the current date.
// Two families of colour, plus red for trouble.
//
// Money arriving is brand-coloured: settled at full strength, still clearing
// at a lighter tint of the same hue — processing rent is the same money one
// step earlier, not a different category, and an amber warning tone made a
// normal ACH transfer look like something had gone wrong.
//
// Everything merely owed-but-unpaid is grey; that's the normal state of rent
// for most of a month, and colouring it implies a problem that doesn't
// exist. The grey ramp darkens as the obligation approaches so the legend
// still separates them.
const STATUS_COLORS: Record<string, { cls: string; color: string }> = {
  'Paid':       { cls: 'bg-brand-500',  color: brandColor('500') },
  'Processing': { cls: 'bg-brand-300',  color: brandColor('300') },
  'Scheduled':  { cls: 'bg-gray-500',   color: '#6B7280' },
  'Due today':  { cls: 'bg-gray-400',   color: '#9CA3AF' },
  'Upcoming':   { cls: 'bg-gray-300',   color: '#D1D5DB' },
  'Refunded':   { cls: 'bg-gray-200',   color: '#E5E7EB' },
  // Imported rent on a lease Stoop isn't collecting. Grey, and sorted next to
  // the other non-events — it is disclosed, not treated as a problem.
  'Paused':     { cls: 'bg-gray-200',   color: '#E5E7EB' },
  // Reserved for things that actually need the landlord to act.
  'Past due':   { cls: 'bg-red-500',    color: '#DC2626' },
  'Failed':     { cls: 'bg-red-600',    color: '#B91C1C' },
  'Disputed':   { cls: 'bg-red-700',    color: '#991B1B' },
}

interface Props {
  payments: Payment[]
  loading: boolean
  // Optional override for the header — defaults to "Monthly Payments Breakdown".
  title?: string
  // Leases with collections paused, so their imported rent is charted as
  // "Paused" rather than colouring a red past-due wedge for money Stoop was
  // never asked to collect. See pausedLeaseIds.
  pausedLeases?: Set<string>
}

export default function MonthlyDonut({ payments, loading, title, pausedLeases }: Props) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d
  })

  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const nextMonth = () => { const d = new Date(cursor); d.setMonth(d.getMonth() + 1); setCursor(d) }
  const prevMonth = () => { const d = new Date(cursor); d.setMonth(d.getMonth() - 1); setCursor(d) }

  const { slices, total } = useMemo(() => {
    const start = new Date(cursor)
    const end = new Date(cursor); end.setMonth(end.getMonth() + 1)

    // Bucket by the month the charge is FOR, never by when cash arrived.
    // paymentAnchor falls back to paid_at, so July rent settled on Aug 1 was
    // landing in August's chart — a backfill of last season's tenants showed
    // up as this month's collection. A breakdown headed "August 2026" has to
    // mean August's obligations.
    //
    // Compared as a YYYY-MM string: a DATE column parsed via `new Date` is
    // UTC midnight, which is the previous day locally in the US — and on the
    // 1st of the month, the previous MONTH.
    const monthKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`
    const inMonth = (p: Payment) => {
      const anchor = (p as Payment & { scheduled_for?: string | null }).scheduled_for
        ?? p.due_date ?? p.created_at
      return typeof anchor === 'string' && anchor.slice(0, 7) === monthKey
    }

    // Collapse rows that represent the SAME obligation — a stray duplicate from
    // a rebuilt schedule, or a still-pending row a processing/paid row has
    // superseded. Without this, in-flight/paid money is counted ON TOP of the
    // still-upcoming amount (e.g. $2,100 upcoming + $525 processing = $2,625
    // instead of $525 processing + $1,575 upcoming = $2,100). Keyed by
    // lease+tenant+type+amount; keep the most-advanced status.
    const RANK: Record<string, number> = { completed: 3, processing: 2, pending: 1, failed: 0 }
    const best = new Map<string, Payment>()
    for (const p of payments.filter(inMonth)) {
      const key = `${p.lease_id}|${p.tenant_id}|${p.type}|${Number(p.amount)}`
      const cur = best.get(key)
      if (!cur || (RANK[p.status] ?? 1) > (RANK[cur.status] ?? 1)) best.set(key, p)
    }

    const totals: Record<string, number> = {}
    for (const p of best.values()) {
      const status = rowStatus(p, undefined, !!pausedLeases?.has(p.lease_id)).label
      totals[status] = (totals[status] ?? 0) + Number(p.amount)
    }
    // Least-to-most urgent left to right. Any label rowStatus produces that
    // isn't listed gets appended rather than dropped, so the chart can never
    // silently under-report the month again.
    const order = ['Paid', 'Processing', 'Scheduled', 'Upcoming', 'Due today', 'Past due', 'Failed', 'Disputed', 'Refunded', 'Paused']
    const known = new Set(order)
    const extras = Object.keys(totals).filter((k) => !known.has(k))
    const out: DonutSlice[] = [...order, ...extras]
      .filter((k) => (totals[k] ?? 0) > 0)
      .map((k) => ({
        label: k,
        value: totals[k],
        // Neutral fallback so an unmapped status still renders with its real
        // amount instead of an invisible slice.
        ...(STATUS_COLORS[k] ?? { cls: 'bg-gray-500', color: '#6B7280' }),
      }))
    const tot = Object.values(totals).reduce((a, b) => a + b, 0)
    return { slices: out, total: tot }
  }, [payments, cursor, pausedLeases])

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 h-full">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          {title ?? 'Monthly Payments Breakdown'}
        </h2>
        <div className="flex items-center gap-1 self-center sm:self-auto">
          <button type="button" onClick={prevMonth} className="p-1.5 rounded-md hover:bg-gray-100 text-mute" aria-label="Previous month">
            <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
          </button>
          <span className="text-sm font-medium text-ink px-2 min-w-[10rem] text-center">{monthLabel}</span>
          <button type="button" onClick={nextMonth} className="p-1.5 rounded-md hover:bg-gray-100 text-mute" aria-label="Next month">
            <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-56 w-full animate-pulse bg-gray-100 rounded-lg" />
      ) : slices.length === 0 ? (
        <p className="text-sm text-gray-500 py-12 text-center">No payments this month</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-4 items-center">
          <div className="relative h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="label"
                  innerRadius="60%"
                  outerRadius="90%"
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {slices.map((s) => <Cell key={s.label} fill={s.color} />)}
                </Pie>
                <Tooltip formatter={(value) => formatUsd(Number(value))} wrapperStyle={{ zIndex: 10 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="text-xs text-mute uppercase tracking-wider">Total</p>
              <p className="text-2xl font-bold text-ink">{formatUsd(total)}</p>
            </div>
          </div>
          <ul className="space-y-2">
            {slices.map((s) => (
              <li key={s.label} className="flex items-center justify-between gap-3 text-sm">
                <span className="inline-flex items-center gap-2">
                  <span className={`inline-block w-3 h-3 rounded-sm ${s.cls}`} />
                  <span className="text-ink">{s.label}</span>
                </span>
                <span className="font-semibold text-ink">{formatUsd(s.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

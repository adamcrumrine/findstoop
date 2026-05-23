import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { rowStatus, paymentAnchor } from '@findstoop/shared/lib/paymentRails'
import { formatUsd } from '@findstoop/shared/lib/format'
import type { Payment } from '@findstoop/shared/types/payment'

// Shared monthly-breakdown donut. Used on the manager Dashboard and the
// manager Payments page. Accepts the (already filtered) payments array
// from the parent and slices it by tenant-rail status, using the same
// labels + colors the rest of the app shows.
interface DonutSlice { label: string; value: number; cls: string; color: string }

const STATUS_COLORS: Record<string, { cls: string; color: string }> = {
  'Paid':       { cls: 'bg-blue-500',   color: '#3B82F6' },
  'Processing': { cls: 'bg-amber-500',  color: '#F59E0B' },
  'Scheduled':  { cls: 'bg-brand-500',  color: '#00A896' },
  'Upcoming':   { cls: 'bg-gray-400',   color: '#9CA3AF' },
  'Past due':   { cls: 'bg-red-500',    color: '#DC2626' },
  'Failed':     { cls: 'bg-red-600',    color: '#B91C1C' },
}

interface Props {
  payments: Payment[]
  loading: boolean
  // Optional override for the header — defaults to "Monthly Payments Breakdown".
  title?: string
}

export default function MonthlyDonut({ payments, loading, title }: Props) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d
  })

  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const nextMonth = () => { const d = new Date(cursor); d.setMonth(d.getMonth() + 1); setCursor(d) }
  const prevMonth = () => { const d = new Date(cursor); d.setMonth(d.getMonth() - 1); setCursor(d) }

  const { slices, total } = useMemo(() => {
    const start = new Date(cursor)
    const end = new Date(cursor); end.setMonth(end.getMonth() + 1)

    const inMonth = (p: Payment) => {
      const d = new Date(paymentAnchor(p))
      return d >= start && d < end
    }

    const totals: Record<string, number> = {}
    for (const p of payments.filter(inMonth)) {
      const status = rowStatus(p).label
      totals[status] = (totals[status] ?? 0) + Number(p.amount)
    }
    const order = ['Paid', 'Processing', 'Scheduled', 'Upcoming', 'Past due', 'Failed']
    const out: DonutSlice[] = order
      .filter((k) => (totals[k] ?? 0) > 0)
      .map((k) => ({ label: k, value: totals[k], ...STATUS_COLORS[k] }))
    const tot = Object.values(totals).reduce((a, b) => a + b, 0)
    return { slices: out, total: tot }
  }, [payments, cursor])

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          {title ?? 'Monthly Payments Breakdown'}
        </h2>
        <div className="flex items-center gap-1">
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
        <p className="text-sm text-gray-400 py-12 text-center">No payments this month</p>
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
                <Tooltip formatter={(value) => formatUsd(Number(value))} />
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

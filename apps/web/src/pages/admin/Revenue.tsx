// Admin Revenue — screening MRR + total revenue + margin.

import { useEffect, useState } from 'react'
import { Loader2, DollarSign, TrendingUp, CreditCard, Percent } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface DailyRevenue {
  day: string
  screening_orders_paid: number
  screening_revenue_cents: number
  screening_margin_cents: number
}

interface ScreeningSummary {
  state: string
  tier: string
  count: number
  total_amount_cents: number
  total_margin_cents: number
}

const fmtUsd = (cents: number) =>
  `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

export default function AdminRevenue() {
  const [daily, setDaily] = useState<DailyRevenue[]>([])
  const [byState, setByState] = useState<ScreeningSummary[]>([])
  const [totals, setTotals] = useState<{ revenue: number; margin: number; count: number } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [{ data: dailyData }, { data: ordersData }] = await Promise.all([
        supabase.from('admin_daily_revenue').select('*').limit(90),
        supabase.from('screening_orders').select('amount_cents, margin_cents, tier').eq('payment_status', 'paid'),
      ])
      if (cancelled) return

      setDaily(((dailyData as DailyRevenue[] | null) ?? []).reverse())

      const orders = (ordersData as { amount_cents: number; margin_cents: number; tier: string }[] | null) ?? []
      const totalRev = orders.reduce((s, o) => s + (o.amount_cents ?? 0), 0)
      const totalMgn = orders.reduce((s, o) => s + (o.margin_cents ?? 0), 0)
      setTotals({ revenue: totalRev, margin: totalMgn, count: orders.length })

      // Group by tier for the "tier breakdown" mini-table
      const byTier = orders.reduce<Record<string, ScreeningSummary>>((acc, o) => {
        const key = o.tier
        if (!acc[key]) acc[key] = { state: '', tier: o.tier, count: 0, total_amount_cents: 0, total_margin_cents: 0 }
        acc[key].count += 1
        acc[key].total_amount_cents += o.amount_cents ?? 0
        acc[key].total_margin_cents += o.margin_cents ?? 0
        return acc
      }, {})
      setByState(Object.values(byTier))

      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  if (loading || !totals) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} />
      </div>
    )
  }

  const chartData = daily.map((d) => ({
    day: d.day,
    revenue: d.screening_revenue_cents / 100,
    margin:  d.screening_margin_cents / 100,
    orders:  d.screening_orders_paid,
  }))

  const marginPct = totals.revenue > 0 ? Math.round((totals.margin / totals.revenue) * 100) : 0
  const avgOrder = totals.count > 0 ? Math.round(totals.revenue / totals.count) : 0

  return (
    <div className="p-6 max-w-7xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Revenue</h1>
        <p className="text-sm text-slate-500 mt-1">Screening revenue, margin, and cost analysis.</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Kpi Icon={DollarSign} label="Screening revenue (all-time)" value={fmtUsd(totals.revenue)} />
        <Kpi Icon={TrendingUp} label="Gross margin"               value={fmtUsd(totals.margin)} sub={`${marginPct}% of revenue`} />
        <Kpi Icon={CreditCard} label="Orders completed"           value={totals.count.toLocaleString()} />
        <Kpi Icon={Percent}    label="Average order value"        value={fmtUsd(avgOrder)} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
        <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-4">Daily revenue — last 90 days</h2>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="day" tickFormatter={(d) => new Date(d).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })} fontSize={11} stroke="#94a3b8" />
            <YAxis fontSize={11} stroke="#94a3b8" tickFormatter={(v) => `$${v}`} />
            <Tooltip
              contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: 8, color: '#f1f5f9', fontSize: 12 }}
              formatter={(v) => `$${Number(v).toFixed(2)}`}
              labelFormatter={(d) => new Date(d as string).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="revenue" fill="#0ea5e9" name="Revenue"  radius={[4, 4, 0, 0]} />
            <Bar dataKey="margin"  fill="#10b981" name="Margin"    radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Revenue by tier</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <Th>Tier</Th>
              <Th align="right">Orders</Th>
              <Th align="right">Revenue</Th>
              <Th align="right">Margin</Th>
              <Th align="right">Avg per order</Th>
            </tr>
          </thead>
          <tbody>
            {byState.map((row) => (
              <tr key={row.tier} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2 font-medium text-slate-900">{row.tier}</td>
                <td className="px-4 py-2 text-right tabular-nums">{row.count.toLocaleString()}</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmtUsd(row.total_amount_cents)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmtUsd(row.total_margin_cents)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-600">{fmtUsd(row.count > 0 ? row.total_amount_cents / row.count : 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Kpi({ Icon, label, value, sub }: { Icon: typeof DollarSign; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
        <span className="text-[11px] uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <p className="text-2xl font-bold text-slate-900 mt-2 tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`px-4 py-2.5 text-${align} text-[11px] uppercase tracking-wider text-slate-500 font-semibold`}>
      {children}
    </th>
  )
}

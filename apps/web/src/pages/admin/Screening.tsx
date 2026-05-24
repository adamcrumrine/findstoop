// Admin Screening — funnel, completion rate, flags. Anonymized:
// shows order ids (truncated) + state + tier, never applicant identity.

import { useEffect, useState } from 'react'
import { Loader2, ShieldCheck, AlertCircle, CheckCircle2, Clock, XCircle, Hourglass } from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface OrderSummary {
  total: number
  by_state: Record<string, number>
  by_tier: Record<string, number>
  paid: number
  scored: number
  failed: number
  avg_score: number | null
  flag_counts: {
    tamper_suspected: number
    name_mismatch: number
    expired_dl: number
    income_low: number
  }
  total_margin_cents: number
}

interface RecentOrder {
  id: string
  state: string
  tier: string
  rentability_score: number | null
  created_at: string
  completed_at: string | null
  payment_status: string
}

export default function AdminScreening() {
  const [summary, setSummary] = useState<OrderSummary | null>(null)
  const [recent, setRecent] = useState<RecentOrder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [
        { data: orders },
        { data: recentData },
      ] = await Promise.all([
        supabase.from('screening_orders').select('state, tier, rentability_score, payment_status, dl_flags, income_flags, margin_cents'),
        supabase.from('screening_orders').select('id, state, tier, rentability_score, created_at, completed_at, payment_status').order('created_at', { ascending: false }).limit(50),
      ])
      if (cancelled) return

      const all = (orders ?? []) as { state: string; tier: string; rentability_score: number | null; payment_status: string; dl_flags: Record<string, unknown> | null; income_flags: Record<string, unknown> | null; margin_cents: number }[]

      const byState: Record<string, number> = {}
      const byTier:  Record<string, number> = {}
      const flagCounts = { tamper_suspected: 0, name_mismatch: 0, expired_dl: 0, income_low: 0 }
      let totalMargin = 0
      let scoreSum = 0
      let scoreCount = 0

      for (const o of all) {
        byState[o.state] = (byState[o.state] ?? 0) + 1
        byTier[o.tier]   = (byTier[o.tier]   ?? 0) + 1
        totalMargin += o.margin_cents ?? 0
        if (typeof o.rentability_score === 'number') {
          scoreSum += o.rentability_score
          scoreCount += 1
        }
        if (o.dl_flags?.tamper_suspected || o.income_flags?.tamper_suspected) flagCounts.tamper_suspected += 1
        if (o.dl_flags?.name_match_app === false) flagCounts.name_mismatch += 1
        if (o.dl_flags?.expired === true)         flagCounts.expired_dl += 1
        const ratio = (o as { rentability_flags?: { income_to_rent_ratio?: number } }).rentability_flags?.income_to_rent_ratio
        if (typeof ratio === 'number' && ratio < 2.5) flagCounts.income_low += 1
      }

      setSummary({
        total: all.length,
        by_state: byState,
        by_tier: byTier,
        paid: all.filter((o) => o.payment_status === 'paid').length,
        scored: scoreCount,
        failed: byState['failed'] ?? 0,
        avg_score: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null,
        flag_counts: flagCounts,
        total_margin_cents: totalMargin,
      })
      setRecent((recentData as RecentOrder[] | null) ?? [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  if (loading || !summary) {
    return <div className="flex items-center justify-center h-64 text-slate-400"><Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} /></div>
  }

  return (
    <div className="p-6 max-w-7xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Screening</h1>
        <p className="text-sm text-slate-500 mt-1">Order funnel, completion rates, fraud flags.</p>
      </header>

      {/* Funnel KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Kpi Icon={ShieldCheck}    label="Orders (all)"      value={summary.total.toLocaleString()} />
        <Kpi Icon={CheckCircle2}   label="Paid"              value={summary.paid.toLocaleString()}   sub={pct(summary.paid, summary.total)} />
        <Kpi Icon={CheckCircle2}   label="Scored"            value={summary.scored.toLocaleString()} sub={pct(summary.scored, summary.paid)} />
        <Kpi Icon={XCircle}        label="Failed"            value={summary.failed.toLocaleString()} />
        <Kpi Icon={ShieldCheck}    label="Avg Tenability™"   value={summary.avg_score ? String(summary.avg_score) : '—'} />
      </div>

      {/* Flags */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
        <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">Detection flags raised</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Flag Icon={AlertCircle} color="red"    label="Tamper suspected"    count={summary.flag_counts.tamper_suspected} />
          <Flag Icon={AlertCircle} color="amber"  label="Name mismatch"       count={summary.flag_counts.name_mismatch} />
          <Flag Icon={AlertCircle} color="amber"  label="License expired"     count={summary.flag_counts.expired_dl} />
          <Flag Icon={AlertCircle} color="amber"  label="Low income-to-rent"  count={summary.flag_counts.income_low} />
        </div>
      </div>

      {/* By state */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">By state</h2>
          {Object.entries(summary.by_state).map(([state, count]) => (
            <Bar key={state} label={state} value={count} total={summary.total} />
          ))}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">By tier</h2>
          {Object.entries(summary.by_tier).map(([tier, count]) => (
            <Bar key={tier} label={tier} value={count} total={summary.total} />
          ))}
        </div>
      </div>

      {/* Recent orders */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Most recent 50 orders</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <Th>Ref</Th>
              <Th>State</Th>
              <Th>Tier</Th>
              <Th align="right">Score</Th>
              <Th>Created</Th>
              <Th>Completed</Th>
            </tr>
          </thead>
          <tbody>
            {recent.map((o) => (
              <tr key={o.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-2 font-mono text-xs text-slate-700">{o.id.slice(0, 8)}</td>
                <td className="px-4 py-2"><State value={o.state} /></td>
                <td className="px-4 py-2 text-slate-700 capitalize">{o.tier}</td>
                <td className="px-4 py-2 text-right tabular-nums font-semibold text-slate-900">{o.rentability_score ?? '—'}</td>
                <td className="px-4 py-2 text-slate-600 text-xs whitespace-nowrap">{new Date(o.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-2 text-slate-600 text-xs whitespace-nowrap">{o.completed_at ? new Date(o.completed_at).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function pct(n: number, d: number): string {
  if (d <= 0) return '—'
  return `${Math.round((n / d) * 100)}% of prior step`
}

function Kpi({ Icon, label, value, sub }: { Icon: typeof ShieldCheck; label: string; value: string; sub?: string }) {
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

function Flag({ Icon, color, label, count }: { Icon: typeof AlertCircle; color: 'red' | 'amber'; label: string; count: number }) {
  const cls = color === 'red'
    ? 'text-red-700 bg-red-50 border-red-200'
    : 'text-amber-700 bg-amber-50 border-amber-200'
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${cls}`}>
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
        <span className="text-[11px] uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <p className="text-xl font-bold mt-1 tabular-nums">{count}</p>
    </div>
  )
}

function Bar({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div className="mb-2 last:mb-0">
      <div className="flex justify-between text-xs mb-1">
        <span className="font-medium text-slate-700 capitalize">{label.replace('_', ' ')}</span>
        <span className="text-slate-500 tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded overflow-hidden">
        <div className="h-full bg-slate-700" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function State({ value }: { value: string }) {
  const map: Record<string, { Icon: typeof CheckCircle2; cls: string }> = {
    awaiting_payment: { Icon: Hourglass,    cls: 'bg-gray-100 text-gray-700' },
    collecting:       { Icon: Clock,        cls: 'bg-amber-100 text-amber-700' },
    scoring:          { Icon: Loader2,      cls: 'bg-blue-100 text-blue-700' },
    complete:         { Icon: CheckCircle2, cls: 'bg-emerald-100 text-emerald-700' },
    failed:           { Icon: XCircle,      cls: 'bg-red-100 text-red-700' },
  }
  const cfg = map[value] ?? { Icon: Clock, cls: 'bg-gray-100 text-gray-700' }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${cfg.cls}`}>
      <cfg.Icon className="w-3 h-3" strokeWidth={2} />
      {value.replace('_', ' ')}
    </span>
  )
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`px-4 py-2.5 text-${align} text-[11px] uppercase tracking-wider text-slate-500 font-semibold`}>
      {children}
    </th>
  )
}

// Admin System Health — edge function call counts, error rates, latency,
// cost. Reads admin_api_health view (24h rollup) + recent errors from
// api_call_log.

import { useEffect, useState } from 'react'
import { Loader2, Cpu, AlertCircle, TrendingUp, Zap, DollarSign } from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface ApiHealth {
  function_name: string
  calls_24h: number
  errors_24h: number
  avg_latency_ms: number | null
  p95_latency_ms: number | null
  total_cost_cents_24h: number
}

interface RecentError {
  id: number
  ts: string
  function_name: string
  status_code: number | null
  error_message: string | null
}

const fmtUsd = (cents: number) =>
  `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`

export default function AdminSystem() {
  const [health, setHealth] = useState<ApiHealth[]>([])
  const [errors, setErrors] = useState<RecentError[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [{ data: healthData }, { data: errData }] = await Promise.all([
        supabase.from('admin_api_health').select('*'),
        supabase.from('api_call_log').select('id, ts, function_name, status_code, error_message').gte('status_code', 400).order('ts', { ascending: false }).limit(50),
      ])
      if (cancelled) return
      setHealth((healthData as ApiHealth[] | null) ?? [])
      setErrors((errData as RecentError[] | null) ?? [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-slate-400"><Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} /></div>
  }

  const totalCalls   = health.reduce((s, r) => s + r.calls_24h, 0)
  const totalErrors  = health.reduce((s, r) => s + r.errors_24h, 0)
  const totalCost    = health.reduce((s, r) => s + r.total_cost_cents_24h, 0)
  const errorRate    = totalCalls > 0 ? Math.round((totalErrors / totalCalls) * 1000) / 10 : 0

  return (
    <div className="p-4 sm:p-6 max-w-7xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">System health</h1>
        <p className="text-sm text-slate-500 mt-1">Edge function uptime, latency, and cost — last 24 hours.</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Kpi Icon={Zap}         label="Total calls (24h)" value={totalCalls.toLocaleString()} />
        <Kpi Icon={AlertCircle} label="Errors (24h)"      value={totalErrors.toLocaleString()} sub={`${errorRate}% error rate`} />
        <Kpi Icon={Cpu}         label="Functions active"  value={health.length.toLocaleString()} />
        <Kpi Icon={DollarSign}  label="API cost (24h)"    value={fmtUsd(totalCost)} sub="LLM + vendor calls" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Per-function health (24h)</h2>
        </div>
       <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <Th>Function</Th>
              <Th align="right">Calls</Th>
              <Th align="right">Errors</Th>
              <Th align="right">Error rate</Th>
              <Th align="right">Avg latency</Th>
              <Th align="right">p95 latency</Th>
              <Th align="right">Cost</Th>
            </tr>
          </thead>
          <tbody>
            {health.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400 text-sm">No API calls logged in the last 24 hours.</td>
              </tr>
            ) : health.map((r) => {
              const errRate = r.calls_24h > 0 ? (r.errors_24h / r.calls_24h) * 100 : 0
              return (
                <tr key={r.function_name} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-900">{r.function_name}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.calls_24h.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {r.errors_24h > 0 ? <span className="text-red-700 font-medium">{r.errors_24h}</span> : '0'}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    <span className={errRate > 5 ? 'text-red-700 font-medium' : errRate > 1 ? 'text-amber-700' : 'text-slate-600'}>
                      {errRate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600">{r.avg_latency_ms ?? '—'} ms</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600">{r.p95_latency_ms ?? '—'} ms</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-700">{fmtUsd(r.total_cost_cents_24h)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
       </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Recent errors (latest 50)</h2>
        </div>
        {errors.length === 0 ? (
          <div className="px-5 py-10 text-center text-slate-500 text-sm">
            <TrendingUp className="w-6 h-6 mx-auto mb-2 text-emerald-500" strokeWidth={1.75} />
            No errors logged. Quiet skies.
          </div>
        ) : (
         <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <Th>When</Th>
                <Th>Function</Th>
                <Th align="right">Status</Th>
                <Th>Message</Th>
              </tr>
            </thead>
            <tbody>
              {errors.map((e) => (
                <tr key={e.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2 text-slate-500 tabular-nums whitespace-nowrap text-xs">
                    {new Date(e.ts).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 font-medium text-slate-900">{e.function_name}</td>
                  <td className="px-4 py-2 text-right">
                    <span className="font-mono text-xs text-red-700">{e.status_code ?? '—'}</span>
                  </td>
                  <td className="px-4 py-2 text-slate-600 text-xs truncate max-w-md">{e.error_message ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
         </div>
        )}
      </div>
    </div>
  )
}

function Kpi({ Icon, label, value, sub }: { Icon: typeof Zap; label: string; value: string; sub?: string }) {
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

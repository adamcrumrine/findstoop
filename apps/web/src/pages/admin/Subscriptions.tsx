// Subscription health page. Manager subscriptions + Stripe Connect onboarding
// in one place — they're both "manager financial setup status" and benefit
// from being viewed together.

import { useEffect, useState } from 'react'
import {
  Loader2, DollarSign, Users, TrendingUp, AlertCircle,
  CheckCircle2, Clock, ArrowDownCircle,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'

interface SubHealth {
  paying_managers: number
  comp_managers: number
  past_due_managers: number
  canceled_managers: number
  mrr_cents: number
  paid_units: number
  new_subs_7d: number
  canceled_30d: number
}

interface PlanRow {
  plan: string
  manager_count: number
  unit_count: number
}

interface ConnectRow {
  user_ref: string
  raw_id: string
  connect_state: 'not_started' | 'in_progress' | 'charges_only' | 'completed'
  stripe_connect_onboarded_at: string | null
  signed_up_at: string
  property_count: number
  active_lease_count: number
}

const PLAN_COLORS: Record<string, string> = {
  monthly:        '#0ea5e9',
  annual:         '#10b981',
  comp:           '#a855f7',
  past_due:       '#f59e0b',
  canceled:       '#94a3b8',
  no_subscription:'#cbd5e1',
}

const CONNECT_STATE_CFG: Record<ConnectRow['connect_state'], { label: string; Icon: typeof CheckCircle2; cls: string }> = {
  not_started:   { label: 'Not started',  Icon: ArrowDownCircle, cls: 'bg-slate-100 text-slate-700' },
  in_progress:   { label: 'In progress',  Icon: Clock,           cls: 'bg-amber-100 text-amber-700' },
  charges_only:  { label: 'Charges only', Icon: AlertCircle,     cls: 'bg-blue-100 text-blue-700' },
  completed:     { label: 'Completed',    Icon: CheckCircle2,    cls: 'bg-emerald-100 text-emerald-700' },
}

const fmtUsd = (cents: number) =>
  `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

export default function AdminSubscriptions() {
  const [health, setHealth]   = useState<SubHealth | null>(null)
  const [plans, setPlans]     = useState<PlanRow[]>([])
  const [connect, setConnect] = useState<ConnectRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [{ data: healthData }, { data: plansData }, { data: connectData }] = await Promise.all([
        supabase.from('admin_subscription_health').select('*').single(),
        supabase.from('admin_subscription_plans').select('*'),
        supabase.from('admin_connect_status').select('*').order('property_count', { ascending: false }),
      ])
      if (cancelled) return
      setHealth(healthData as SubHealth | null)
      setPlans((plansData as PlanRow[] | null) ?? [])
      setConnect((connectData as ConnectRow[] | null) ?? [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  if (loading || !health) {
    return <div className="flex items-center justify-center h-64 text-slate-400"><Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} /></div>
  }

  const annualMrr = health.mrr_cents * 12

  // Connect funnel counts
  const connectByState = connect.reduce<Record<string, number>>((acc, c) => {
    acc[c.connect_state] = (acc[c.connect_state] ?? 0) + 1
    return acc
  }, {})

  // Managers stuck without Connect but have active leases — top operational priority
  const stuckWithLeases = connect.filter(
    (c) => c.connect_state !== 'completed' && c.active_lease_count > 0
  )

  return (
    <div className="p-4 sm:p-6 max-w-7xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Subscriptions</h1>
        <p className="text-sm text-slate-500 mt-1">MRR, plan distribution, and Stripe Connect onboarding status.</p>
      </header>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Kpi Icon={DollarSign} label="MRR"             value={fmtUsd(health.mrr_cents)} sub={`${fmtUsd(annualMrr)} annualized`} />
        <Kpi Icon={Users}      label="Paying managers" value={health.paying_managers.toLocaleString()} sub={`${health.paid_units.toLocaleString()} paid units`} />
        <Kpi Icon={TrendingUp} label="New (7d)"        value={`+${health.new_subs_7d}`} />
        <Kpi Icon={AlertCircle} label="Past due"       value={health.past_due_managers.toLocaleString()} sub={`${health.canceled_30d} canceled in 30d`} />
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        {/* Plan distribution */}
        <section className="bg-white rounded-xl border border-slate-200 p-5 md:col-span-1">
          <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">Plan distribution</h2>
          {plans.length === 0 ? (
            <p className="text-sm text-slate-500">No subscriptions yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={plans}
                  dataKey="manager_count"
                  nameKey="plan"
                  innerRadius={45}
                  outerRadius={75}
                  strokeWidth={2}
                  stroke="#ffffff"
                >
                  {plans.map((p) => <Cell key={p.plan} fill={PLAN_COLORS[p.plan] ?? '#cbd5e1'} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: 8, color: '#f1f5f9', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </section>

        {/* Complimentary accounts */}
        <section className="bg-white rounded-xl border border-slate-200 p-5 md:col-span-2">
          <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">Plan breakdown (managers · units)</h2>
          <div className="space-y-1.5">
            {plans.map((p) => (
              <div key={p.plan}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="font-medium text-slate-700 capitalize">{p.plan.replace('_', ' ')}</span>
                  <span className="tabular-nums text-slate-500">{p.manager_count} managers · {p.unit_count} units</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded overflow-hidden">
                  <div
                    className="h-full"
                    style={{
                      width: plans[0].manager_count > 0 ? `${(p.manager_count / plans[0].manager_count) * 100}%` : '0',
                      backgroundColor: PLAN_COLORS[p.plan] ?? '#94a3b8',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Stripe Connect funnel */}
      <section className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
        <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-4">Stripe Connect onboarding</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(['not_started', 'in_progress', 'charges_only', 'completed'] as const).map((s) => {
            const cfg = CONNECT_STATE_CFG[s]
            return (
              <div key={s} className="border border-slate-200 rounded-lg p-3">
                <div className="flex items-center gap-2 text-slate-500">
                  <cfg.Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span className="text-[11px] uppercase tracking-wider font-semibold">{cfg.label}</span>
                </div>
                <p className="text-2xl font-bold text-slate-900 mt-1.5 tabular-nums">
                  {(connectByState[s] ?? 0).toLocaleString()}
                </p>
              </div>
            )
          })}
        </div>

        {stuckWithLeases.length > 0 && (
          <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200">
            <div className="flex items-center gap-2 text-red-800 mb-2">
              <AlertCircle className="w-4 h-4" strokeWidth={2} />
              <p className="text-sm font-semibold">
                {stuckWithLeases.length} manager{stuckWithLeases.length === 1 ? ' has' : 's have'} active leases but haven't completed Connect — they can't collect rent
              </p>
            </div>
            <div className="text-xs text-red-700 space-y-1">
              {stuckWithLeases.slice(0, 10).map((m) => (
                <div key={m.user_ref} className="flex items-center gap-2">
                  <span className="font-mono">{m.user_ref}</span>
                  <span className="opacity-60">·</span>
                  <span>{m.active_lease_count} active lease{m.active_lease_count === 1 ? '' : 's'}</span>
                  <span className="opacity-60">·</span>
                  <span className="capitalize">{m.connect_state.replace('_', ' ')}</span>
                </div>
              ))}
              {stuckWithLeases.length > 10 && (
                <p className="opacity-70 mt-1">+{stuckWithLeases.length - 10} more</p>
              )}
            </div>
          </div>
        )}
      </section>

      {/* All managers Connect table */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Managers — Connect status detail</h2>
        </div>
       <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <Th>Ref</Th>
              <Th>Status</Th>
              <Th align="right">Properties</Th>
              <Th align="right">Active leases</Th>
              <Th>Signed up</Th>
              <Th>Onboarded</Th>
            </tr>
          </thead>
          <tbody>
            {connect.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400 text-sm">No managers yet.</td></tr>
            ) : connect.map((c) => {
              const cfg = CONNECT_STATE_CFG[c.connect_state]
              return (
                <tr key={c.user_ref} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono text-slate-700">{c.user_ref}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${cfg.cls}`}>
                      <cfg.Icon className="w-3 h-3" strokeWidth={2} />
                      {cfg.label}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{c.property_count}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{c.active_lease_count}</td>
                  <td className="px-4 py-2 text-slate-600 text-xs">{new Date(c.signed_up_at).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-slate-600 text-xs">{c.stripe_connect_onboarded_at ? new Date(c.stripe_connect_onboarded_at).toLocaleDateString() : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
       </div>
      </section>
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

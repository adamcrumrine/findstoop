// Admin Dashboard — KPIs + trend charts. Pulls from admin_kpis +
// admin_daily_activity views. No PII anywhere on the page.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users, Building2, FileText, DollarSign, TrendingUp, Activity,
  Loader2, CreditCard, AlertCircle, AlertTriangle, ArrowRight,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts'

interface Kpis {
  total_managers: number
  total_tenants: number
  total_properties: number
  total_units: number
  occupied_units: number
  active_leases: number
  total_applications: number
  completed_screenings: number
  total_rent_collected_dollars: number
  total_screening_revenue_cents: number
  total_screening_margin_cents: number
  total_api_cost_cents: number
  dau: number
  wau: number
  mau: number
  signups_24h: number
  signups_7d: number
  signups_30d: number
}

interface DailyActivity {
  day: string
  sessions: number
  unique_users: number
  page_views: number
  sign_ins: number
  sign_ups: number
  errors: number
}

interface DailyRevenue {
  day: string
  screening_orders_paid: number
  screening_revenue_cents: number
  screening_margin_cents: number
}

interface GeoRow {
  state: string
  city: string
  property_count: number
  unit_count: number
}

interface StuckOrder {
  id: string
  order_ref: string
  tier: string
  state: string
  amount_cents: number
  paid_at: string
  minutes_since_paid: number
  stuck_reason: 'pipeline_jam' | 'applicant_abandoned' | 'failed' | 'other'
}

const fmtUsd = (cents: number) =>
  `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

const fmtPct = (occupied: number, total: number) =>
  total > 0 ? `${Math.round((occupied / total) * 100)}%` : '—'

export default function AdminDashboard() {
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [activity, setActivity] = useState<DailyActivity[]>([])
  const [revenue, setRevenue] = useState<DailyRevenue[]>([])
  const [geo, setGeo] = useState<GeoRow[]>([])
  const [stuck, setStuck] = useState<StuckOrder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [
        { data: kpiData },
        { data: actData },
        { data: revData },
        { data: geoData },
        { data: stuckData },
      ] = await Promise.all([
        supabase.from('admin_kpis').select('*').single(),
        supabase.from('admin_daily_activity').select('*').limit(30),
        supabase.from('admin_daily_revenue').select('*').limit(30),
        supabase.from('admin_property_geo').select('*'),
        supabase.from('admin_stuck_screenings').select('*').limit(20),
      ])
      if (cancelled) return
      setKpis(kpiData as Kpis | null)
      setActivity(((actData as DailyActivity[] | null) ?? []).reverse())
      setRevenue(((revData as DailyRevenue[] | null) ?? []).reverse())
      setGeo((geoData as GeoRow[] | null) ?? [])
      setStuck((stuckData as StuckOrder[] | null) ?? [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  if (loading || !kpis) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Real-time platform metrics — no PII exposed.</p>
      </header>

      {/* Stuck-orders alert banner — only renders when there's something stuck */}
      {stuck.length > 0 && <StuckOrdersAlert orders={stuck} />}

      {/* Top KPI row — users + properties */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Kpi Icon={Users}     label="Total managers" value={kpis.total_managers.toLocaleString()} sub={`${kpis.signups_24h} signed up today`} />
        <Kpi Icon={Users}     label="Total tenants"  value={kpis.total_tenants.toLocaleString()} />
        <Kpi Icon={Building2} label="Properties"     value={kpis.total_properties.toLocaleString()} sub={`${kpis.total_units} units (${fmtPct(kpis.occupied_units, kpis.total_units)} occupied)`} />
        <Kpi Icon={FileText}  label="Active leases"  value={kpis.active_leases.toLocaleString()} />
      </div>

      {/* Engagement row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Kpi Icon={Activity}   label="DAU"          value={kpis.dau.toLocaleString()} sub="Active in last 24h" />
        <Kpi Icon={Activity}   label="WAU"          value={kpis.wau.toLocaleString()} sub="Active in last 7d" />
        <Kpi Icon={Activity}   label="MAU"          value={kpis.mau.toLocaleString()} sub="Active in last 30d" />
        <Kpi Icon={TrendingUp} label="Signups 7d"   value={kpis.signups_7d.toLocaleString()} sub={`${kpis.signups_30d} in 30d`} />
      </div>

      {/* Revenue row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Kpi Icon={DollarSign}   label="Screening revenue" value={fmtUsd(kpis.total_screening_revenue_cents)} sub={`${kpis.completed_screenings} completed`} />
        <Kpi Icon={TrendingUp}   label="Screening margin"  value={fmtUsd(kpis.total_screening_margin_cents)} sub={`${pctOf(kpis.total_screening_margin_cents, kpis.total_screening_revenue_cents)} of revenue`} />
        <Kpi Icon={CreditCard}   label="Rent collected"    value={`$${kpis.total_rent_collected_dollars.toLocaleString()}`} sub="All-time, completed payments" />
        <Kpi Icon={AlertCircle}  label="API costs"         value={fmtUsd(kpis.total_api_cost_cents)} sub="LLM + vendor calls" />
      </div>

      {/* Activity chart */}
      <Card title="Activity — last 30 days">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={activity}>
            <defs>
              <linearGradient id="acUsers" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#0ea5e9" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0}   />
              </linearGradient>
              <linearGradient id="acViews" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#a855f7" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#a855f7" stopOpacity={0}   />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="day" tickFormatter={(d) => new Date(d).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })} fontSize={11} stroke="#94a3b8" />
            <YAxis fontSize={11} stroke="#94a3b8" allowDecimals={false} />
            <Tooltip
              contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: 8, color: '#f1f5f9', fontSize: 12 }}
              labelFormatter={(d) => new Date(d as string).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
            />
            <Area dataKey="page_views"  stroke="#a855f7" fill="url(#acViews)" strokeWidth={1.5} name="Page views" />
            <Area dataKey="unique_users" stroke="#0ea5e9" fill="url(#acUsers)" strokeWidth={1.5} name="Unique users" />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* Revenue chart */}
      <div className="mt-4">
        <Card title="Screening revenue — last 30 days">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={revenue.map((r) => ({ ...r, revenue_dollars: r.screening_revenue_cents / 100, margin_dollars: r.screening_margin_cents / 100 }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="day" tickFormatter={(d) => new Date(d).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })} fontSize={11} stroke="#94a3b8" />
              <YAxis fontSize={11} stroke="#94a3b8" tickFormatter={(v) => `$${v}`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: 8, color: '#f1f5f9', fontSize: 12 }}
                formatter={(v) => `$${Number(v).toFixed(2)}`}
                labelFormatter={(d) => new Date(d as string).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
              />
              <Line dataKey="revenue_dollars" stroke="#0ea5e9" strokeWidth={2} dot={false} name="Revenue" />
              <Line dataKey="margin_dollars"  stroke="#10b981" strokeWidth={2} dot={false} name="Margin"  />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Geographic distribution */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Properties by state">
          <GeoByState rows={geo} />
        </Card>
        <Card title="Top cities">
          <GeoByCity rows={geo} />
        </Card>
      </div>

      <p className="text-[11px] text-slate-400 mt-4">
        Last updated {new Date().toLocaleString()}. Data refreshes on page load.
      </p>
    </div>
  )
}

function GeoByState({ rows }: { rows: GeoRow[] }) {
  // Aggregate the per-city rows up to state level
  const byState = rows.reduce<Record<string, { properties: number; units: number }>>((acc, r) => {
    const s = r.state || 'Unknown'
    if (!acc[s]) acc[s] = { properties: 0, units: 0 }
    acc[s].properties += r.property_count
    acc[s].units += r.unit_count
    return acc
  }, {})
  const sorted = Object.entries(byState).sort((a, b) => b[1].properties - a[1].properties)
  const max = sorted[0]?.[1].properties ?? 0
  if (sorted.length === 0) return <p className="text-sm text-slate-500">No properties yet.</p>
  return (
    <div className="space-y-1.5">
      {sorted.map(([state, { properties, units }]) => (
        <div key={state}>
          <div className="flex justify-between text-xs mb-0.5">
            <span className="font-medium text-slate-700">{state}</span>
            <span className="tabular-nums text-slate-500">{properties} prop · {units} units</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded overflow-hidden">
            <div className="h-full bg-slate-700" style={{ width: max > 0 ? `${(properties / max) * 100}%` : '0' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function GeoByCity({ rows }: { rows: GeoRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-slate-500">No properties yet.</p>
  const sorted = [...rows].sort((a, b) => b.property_count - a.property_count).slice(0, 10)
  const max = sorted[0]?.property_count ?? 0
  return (
    <div className="space-y-1.5">
      {sorted.map((r) => (
        <div key={`${r.state}-${r.city}`}>
          <div className="flex justify-between text-xs mb-0.5">
            <span className="font-medium text-slate-700 truncate">
              {r.city}<span className="text-slate-400">, {r.state}</span>
            </span>
            <span className="tabular-nums text-slate-500 shrink-0 ml-2">{r.property_count}</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded overflow-hidden">
            <div className="h-full bg-slate-500" style={{ width: max > 0 ? `${(r.property_count / max) * 100}%` : '0' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function pctOf(num: number, denom: number): string {
  if (denom <= 0) return '—'
  return `${Math.round((num / denom) * 100)}%`
}

function Kpi({ Icon, label, value, sub }: {
  Icon: typeof Users; label: string; value: string; sub?: string
}) {
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

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5">
      <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-4">{title}</h2>
      {children}
    </section>
  )
}

function StuckOrdersAlert({ orders }: { orders: StuckOrder[] }) {
  const jams       = orders.filter((o) => o.stuck_reason === 'pipeline_jam')
  const abandoned  = orders.filter((o) => o.stuck_reason === 'applicant_abandoned')
  const failed     = orders.filter((o) => o.stuck_reason === 'failed')

  // Pipeline jams are the truly urgent ones — our code didn't finish processing.
  const isUrgent = jams.length > 0 || failed.length > 0
  const cls = isUrgent
    ? 'border-red-200 bg-red-50'
    : 'border-amber-200 bg-amber-50'
  const iconCls = isUrgent ? 'text-red-700' : 'text-amber-700'
  const titleCls = isUrgent ? 'text-red-900' : 'text-amber-900'
  const bodyCls  = isUrgent ? 'text-red-800' : 'text-amber-800'

  return (
    <div className={`rounded-xl border p-4 mb-4 ${cls}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className={`w-5 h-5 mt-0.5 shrink-0 ${iconCls}`} strokeWidth={2} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${titleCls}`}>
            {orders.length} screening order{orders.length === 1 ? '' : 's'} need{orders.length === 1 ? 's' : ''} attention
          </p>
          <ul className={`text-xs ${bodyCls} mt-1 leading-relaxed space-y-0.5`}>
            {jams.length > 0      && <li><strong>{jams.length}</strong> stuck in our pipeline (paid but not scored after 10+ minutes — investigate edge function logs)</li>}
            {failed.length > 0    && <li><strong>{failed.length}</strong> failed outright (check Anthropic / Stripe / Checkr error logs)</li>}
            {abandoned.length > 0 && <li><strong>{abandoned.length}</strong> applicant abandoned mid-upload (paid 24h+ ago, never uploaded docs — consider refund or follow-up)</li>}
          </ul>
        </div>
        <Link
          to="/admin/screening"
          className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md border ${
            isUrgent ? 'border-red-300 text-red-800 bg-white hover:bg-red-100' : 'border-amber-300 text-amber-800 bg-white hover:bg-amber-100'
          }`}
        >
          Review
          <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
        </Link>
      </div>
    </div>
  )
}

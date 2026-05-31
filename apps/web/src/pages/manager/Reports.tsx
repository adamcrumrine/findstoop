import { useEffect, useState } from 'react'
import { Download, FileText, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useReports } from '@findstoop/shared/hooks/useReports'
import { getProperties } from '@findstoop/shared/api/properties'
import { getRentRoll } from '@findstoop/shared/api/rentRoll'
import { supabase } from '../../lib/supabase'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

const BRAND = '#6366f1'
const BRAND_LIGHT = '#a5b4fc'
const GREEN = '#22c55e'
const AMBER = '#f59e0b'
const GRAY = '#e5e7eb'

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color ?? 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Tax center ────────────────────────────────────────────────────────────
// Year-end exports for the landlord's accountant: a full transactions CSV and
// an auto-filled Schedule E worksheet (opens as a print/PDF page).
function csvEscape(v: unknown): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function TaxCenter() {
  const now = new Date().getFullYear()
  const years = [now, now - 1, now - 2]
  const [year, setYear] = useState(now)
  const [exporting, setExporting] = useState(false)

  const downloadCsv = async () => {
    if (exporting) return
    setExporting(true)
    try {
      // RLS scopes payments to this manager's properties automatically.
      const { data, error } = await supabase
        .from('payments')
        .select(`
          amount, type, status, paid_at, due_date, memo,
          lease:leases!payments_lease_id_fkey(unit:units(unit_number, property:properties(name))),
          tenant:profiles!payments_tenant_id_fkey(full_name)
        `)
        .order('due_date', { ascending: true })
        .limit(10000)
      if (error) throw error

      const rows = (data ?? []).filter((p: any) => {
        const d = p.paid_at ?? p.due_date
        return d && new Date(d).getFullYear() === year
      })
      if (rows.length === 0) {
        toast.error(`No transactions found for ${year}.`)
        return
      }

      const header = ['Date', 'Type', 'Status', 'Amount', 'Property', 'Unit', 'Tenant', 'Memo']
      const body = rows.map((p: any) => {
        const lease = Array.isArray(p.lease) ? p.lease[0] : p.lease
        const unit = lease && (Array.isArray(lease.unit) ? lease.unit[0] : lease.unit)
        const property = unit && (Array.isArray(unit.property) ? unit.property[0] : unit.property)
        const tenant = Array.isArray(p.tenant) ? p.tenant[0] : p.tenant
        return [
          (p.paid_at ?? p.due_date ?? '').slice(0, 10),
          String(p.type ?? '').replace(/_/g, ' '),
          p.status ?? '',
          Number(p.amount ?? 0).toFixed(2),
          property?.name ?? '',
          unit?.unit_number ?? '',
          tenant?.full_name ?? '',
          p.memo ?? '',
        ]
      })
      const csv = [header, ...body].map((r) => r.map(csvEscape).join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `findstoop-transactions-${year}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <SectionHeader title="Tax center" subtitle="Year-end exports for your accountant" />
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-600">
          Tax year
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="ml-2 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <button
          type="button"
          onClick={downloadCsv}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink border border-gray-300 hover:bg-gray-50 px-3 py-1.5 rounded-lg disabled:opacity-50"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} /> : <Download className="w-4 h-4" strokeWidth={1.75} />}
          Transactions (CSV)
        </button>
        <a
          href={`/manager/tax/schedule-e/${year}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 px-3 py-1.5 rounded-lg"
        >
          <FileText className="w-4 h-4" strokeWidth={1.75} />
          Schedule E worksheet
        </a>
      </div>
      <p className="text-xs text-gray-500 mt-3">
        Income is auto-filled from rent FindStoop recorded as received. Confirm figures with your tax professional.
      </p>
    </div>
  )
}

// ── Rent roll ───────────────────────────────────────────────────────────────
function RentRollCard() {
  const { user } = useAuth()
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([])
  const [scope, setScope] = useState('all')
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (!user?.id) return
    getProperties(user.id).then((p) => setProperties(p.map((x) => ({ id: x.id, name: x.name })))).catch(() => {})
  }, [user?.id])

  const pdfHref = scope === 'all' ? '/manager/rent-roll' : `/manager/rent-roll?property=${scope}`

  const downloadCsv = async () => {
    if (!user?.id || exporting) return
    setExporting(true)
    try {
      const rows = await getRentRoll(user.id, scope === 'all' ? undefined : scope)
      if (rows.length === 0) { toast.error('No units to export.'); return }
      const header = ['Property', 'Unit', 'Bedrooms', 'Bathrooms', 'Status', 'Tenants', 'Lease start', 'Lease end', 'Monthly rent', 'Security deposit']
      const body = rows.map((r) => [
        r.propertyName, r.unitNumber, r.bedrooms ?? '', r.bathrooms ?? '', r.status, r.tenants,
        r.leaseStart ?? '', r.leaseEnd ?? '', r.monthlyRent.toFixed(2), r.securityDeposit != null ? r.securityDeposit.toFixed(2) : '',
      ])
      const csv = [header, ...body].map((row) => row.map(csvEscape).join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `findstoop-rent-roll-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <SectionHeader title="Rent roll" subtitle="Per-unit snapshot — tenant, term, rent, occupancy" />
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-600">
          Scope
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="ml-2 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">All properties</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <button
          type="button"
          onClick={downloadCsv}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink border border-gray-300 hover:bg-gray-50 px-3 py-1.5 rounded-lg disabled:opacity-50"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} /> : <Download className="w-4 h-4" strokeWidth={1.75} />}
          Rent roll (CSV)
        </button>
        <a
          href={pdfHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 px-3 py-1.5 rounded-lg"
        >
          <FileText className="w-4 h-4" strokeWidth={1.75} /> Rent roll (PDF)
        </a>
      </div>
    </div>
  )
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-base font-semibold text-gray-800">{title}</h2>
      {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  )
}

function ChartCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      {children}
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse">
            <div className="h-3 bg-gray-200 rounded w-2/3 mb-3" />
            <div className="h-7 bg-gray-200 rounded w-1/2" />
          </div>
        ))}
      </div>
      {[1, 2].map((i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-4" />
          <div className="h-52 bg-gray-100 rounded" />
        </div>
      ))}
    </div>
  )
}

const CustomTooltip = ({ active, payload, label, currency }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {currency ? fmt(entry.value) : `${entry.value}%`}
        </p>
      ))}
    </div>
  )
}

export default function ManagerReports() {
  const { user } = useAuth()
  const {
    monthlyRevenue,
    occupancy,
    maintenanceStats,
    collectionRates,
    totalRevenueYTD,
    totalProperties,
    activeLeases,
    loading,
    error,
  } = useReports(user?.id)

  if (loading) return <Skeleton />

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
        Failed to load reports: {error}
      </div>
    )
  }

  const maintenancePieData = [
    { name: 'Open', value: maintenanceStats.open, color: AMBER },
    { name: 'In Progress', value: maintenanceStats.in_progress, color: BRAND },
    { name: 'Resolved', value: maintenanceStats.resolved, color: GREEN },
    { name: 'Closed', value: maintenanceStats.closed, color: GRAY },
  ].filter((d) => d.value > 0)

  const occupancyPieData = [
    { name: 'Occupied', value: occupancy.occupied, color: BRAND },
    { name: 'Vacant', value: occupancy.vacant, color: GRAY },
  ]

  const totalMaintenance = maintenanceStats.open + maintenanceStats.in_progress +
    maintenanceStats.resolved + maintenanceStats.closed

  const avgCollectionRate = collectionRates.length > 0
    ? Math.round(collectionRates.reduce((s, r) => s + r.rate, 0) / collectionRates.filter((r) => r.due > 0).length || 0)
    : 0

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-0.5">Year-to-date performance overview</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Revenue YTD"
          value={fmt(totalRevenueYTD)}
          sub="Collected payments"
          color="text-brand-700"
        />
        <KpiCard
          label="Occupancy Rate"
          value={`${occupancy.rate}%`}
          sub={`${occupancy.occupied} of ${occupancy.total} units`}
          color={occupancy.rate >= 80 ? 'text-green-600' : occupancy.rate >= 60 ? 'text-amber-600' : 'text-red-600'}
        />
        <KpiCard
          label="Collection Rate"
          value={`${avgCollectionRate}%`}
          sub="Avg last 6 months"
          color={avgCollectionRate >= 90 ? 'text-green-600' : avgCollectionRate >= 70 ? 'text-amber-600' : 'text-red-600'}
        />
        <KpiCard
          label="Active Leases"
          value={String(activeLeases)}
          sub={`Across ${totalProperties} propert${totalProperties !== 1 ? 'ies' : 'y'}`}
        />
      </div>

      {/* Rent roll — per-unit snapshot (PDF + CSV) */}
      <RentRollCard />

      {/* Tax center — year-end CSV + Schedule E worksheet */}
      <TaxCenter />

      {/* Monthly Revenue — bar chart */}
      <ChartCard>
        <SectionHeader title="Monthly Revenue" subtitle="Last 6 months — collected vs outstanding" />
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={monthlyRevenue} barSize={20} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
            />
            <Tooltip content={<CustomTooltip currency />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="collected" name="Collected" fill={BRAND} radius={[4, 4, 0, 0]} />
            <Bar dataKey="outstanding" name="Outstanding" fill={BRAND_LIGHT} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Collection Rate — line chart */}
      <ChartCard>
        <SectionHeader title="Collection Rate" subtitle="% of due payments collected per month" />
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={collectionRates}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip content={<CustomTooltip currency={false} />} />
            <Line
              type="monotone"
              dataKey="rate"
              name="Collection Rate"
              stroke={BRAND}
              strokeWidth={2.5}
              dot={{ fill: BRAND, r: 4 }}
              activeDot={{ r: 6 }}
            />
            {/* 100% target line */}
            <Line
              type="monotone"
              dataKey={() => 100}
              name="Target"
              stroke={GREEN}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Occupancy + Maintenance — two pies side by side */}
      <div className="grid md:grid-cols-2 gap-4">
        <ChartCard>
          <SectionHeader title="Occupancy" subtitle={`${occupancy.total} total units`} />
          {occupancy.total === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-gray-500">No units yet</div>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="60%" height={160}>
                <PieChart>
                  <Pie
                    data={occupancyPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    dataKey="value"
                    startAngle={90}
                    endAngle={-270}
                  >
                    {occupancyPieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="text-xl font-bold" fill="#111827" fontSize={20} fontWeight={700}>
                    {occupancy.rate}%
                  </text>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: BRAND }} />
                  <span className="text-gray-600">Occupied</span>
                  <span className="font-semibold text-gray-900 ml-auto">{occupancy.occupied}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: GRAY }} />
                  <span className="text-gray-600">Vacant</span>
                  <span className="font-semibold text-gray-900 ml-auto">{occupancy.vacant}</span>
                </div>
              </div>
            </div>
          )}
        </ChartCard>

        <ChartCard>
          <SectionHeader title="Maintenance" subtitle={`${totalMaintenance} total requests`} />
          {totalMaintenance === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-gray-500">No requests yet</div>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="60%" height={160}>
                <PieChart>
                  <Pie
                    data={maintenancePieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    dataKey="value"
                    startAngle={90}
                    endAngle={-270}
                  >
                    {maintenancePieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle" fill="#111827" fontSize={18} fontWeight={700}>
                    {maintenanceStats.open + maintenanceStats.in_progress}
                  </text>
                  <text x="50%" y="62%" textAnchor="middle" dominantBaseline="middle" fill="#9ca3af" fontSize={10}>
                    open
                  </text>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 text-sm">
                {[
                  { label: 'Open', value: maintenanceStats.open, color: AMBER },
                  { label: 'In Progress', value: maintenanceStats.in_progress, color: BRAND },
                  { label: 'Resolved', value: maintenanceStats.resolved, color: GREEN },
                  { label: 'Closed', value: maintenanceStats.closed, color: GRAY },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-gray-600">{label}</span>
                    <span className="font-semibold text-gray-900 ml-auto">{value}</span>
                  </div>
                ))}
                {maintenanceStats.avgResolutionDays !== null && (
                  <p className="text-xs text-gray-500 pt-1 border-t border-gray-100">
                    Avg resolution: {maintenanceStats.avgResolutionDays}d
                  </p>
                )}
              </div>
            </div>
          )}
        </ChartCard>
      </div>

      {/* No-data nudge */}
      {monthlyRevenue.every((m) => m.collected === 0 && m.outstanding === 0) && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-500 text-center">
          Charts will populate as you record payments and manage leases.
        </div>
      )}
    </div>
  )
}

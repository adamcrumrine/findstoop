import { Link } from 'react-router-dom'
import { Download, Wallet } from 'lucide-react'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useReports } from '@findstoop/shared/hooks/useReports'
import { useScope } from '../../lib/scope'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { brandColor } from '../../lib/brand'

// Brand teal anchors the data-viz palette — same family as the payments
// donut and the status pills, so "money/occupied/healthy" reads as one hue
// across the whole app instead of indigo here and teal elsewhere.
const CHART_ACCENT = brandColor('500')
const CHART_ACCENT_LIGHT = brandColor('200')
const BLUE = '#3b82f6'
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
  const scope = useScope()
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
  } = useReports(user?.id, scope.unitIdsInScope)

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
    { name: 'In Progress', value: maintenanceStats.in_progress, color: BLUE },
    { name: 'Resolved', value: maintenanceStats.resolved, color: GREEN },
    { name: 'Closed', value: maintenanceStats.closed, color: GRAY },
  ].filter((d) => d.value > 0)

  const occupancyPieData = [
    { name: 'Occupied', value: occupancy.occupied, color: CHART_ACCENT },
    { name: 'Vacant', value: occupancy.vacant, color: GRAY },
  ]

  const totalMaintenance = maintenanceStats.open + maintenanceStats.in_progress +
    maintenanceStats.resolved + maintenanceStats.closed

  const avgCollectionRate = collectionRates.length > 0
    ? Math.round(collectionRates.reduce((s, r) => s + r.rate, 0) / collectionRates.filter((r) => r.due > 0).length || 0)
    : 0

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">Year-to-date performance overview</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/manager/expenses"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink border border-gray-300 hover:bg-gray-50 px-3 py-2 rounded-lg"
          >
            <Wallet className="w-4 h-4" strokeWidth={1.75} /> Expenses
          </Link>
          <Link
            to="/manager/download-center"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 px-3 py-2 rounded-lg"
          >
            <Download className="w-4 h-4" strokeWidth={1.75} /> Download center
          </Link>
        </div>
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
            <Bar dataKey="collected" name="Collected" fill={CHART_ACCENT} radius={[4, 4, 0, 0]} />
            <Bar dataKey="outstanding" name="Outstanding" fill={CHART_ACCENT_LIGHT} radius={[4, 4, 0, 0]} />
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
              stroke={CHART_ACCENT}
              strokeWidth={2.5}
              dot={{ fill: CHART_ACCENT, r: 4 }}
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
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: CHART_ACCENT }} />
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
                  { label: 'In Progress', value: maintenanceStats.in_progress, color: BLUE },
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

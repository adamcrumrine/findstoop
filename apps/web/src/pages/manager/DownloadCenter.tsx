// Download Center — the manager's exports in one place: the rent roll
// (per-unit snapshot, PDF + CSV) and the tax center (year-end transactions CSV
// + auto-filled Schedule E worksheet). Linked from Reports.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, FileText, Loader2, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { getProperties } from '@findstoop/shared/api/properties'
import { getRentRoll } from '@findstoop/shared/api/rentRoll'
import { supabase } from '../../lib/supabase'

function csvEscape(v: unknown): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-base font-semibold text-gray-800">{title}</h2>
      {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  )
}

export default function DownloadCenter() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <Link to="/manager/reports" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} /> Back to Reports
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Download center</h1>
        <p className="text-sm text-gray-500 mt-0.5">Export your rent roll and year-end tax documents.</p>
      </div>

      <RentRollCard />
      <TaxCenter />
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

// ── Tax center ──────────────────────────────────────────────────────────────
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
        Income is auto-filled from rent Stoop recorded as received. Confirm figures with your tax professional.
      </p>
    </div>
  )
}

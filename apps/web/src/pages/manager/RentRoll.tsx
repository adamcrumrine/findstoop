// Rent roll — a per-unit snapshot of the portfolio (or one property) the
// manager can print or save as PDF. Standalone page (no sidebar). Pass
// ?property=<id> to scope to one property, ?print=1 to auto-print.

import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer, Loader2 } from 'lucide-react'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { getRentRoll, summarizeRentRoll, type RentRollRow } from '@findstoop/shared/api/rentRoll'
import { formatUsd, formatUsdCents, formatLocalDate } from '@findstoop/shared/lib/format'
import { BRAND } from '../../lib/brand'

export default function RentRoll() {
  const { user, profile } = useAuth()
  const [params] = useSearchParams()
  const propertyId = params.get('property') || undefined

  const [rows, setRows] = useState<RentRollRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    setLoading(true)
    getRentRoll(user.id, propertyId)
      .then((r) => { if (!cancelled) setRows(r) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not build rent roll') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user, propertyId])

  useEffect(() => {
    if (loading || error || params.get('print') !== '1') return
    const t = setTimeout(() => window.print(), 500)
    return () => clearTimeout(t)
  }, [loading, error, params])

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-mute"><Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} /></div>
  }
  if (error) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center">
        <p className="text-mute">{error}</p>
        <Link to="/manager/reports" className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 mt-4">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} /> Back to Reports
        </Link>
      </div>
    )
  }

  const s = summarizeRentRoll(rows)
  const scope = propertyId && rows[0] ? rows[0].propertyName : 'All properties'

  return (
    <div className="bg-gray-100 min-h-screen">
      <div className="rr-toolbar sticky top-0 z-10 bg-white border-b border-gray-200 print:hidden">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/manager/reports" className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} /> Back to Reports
          </Link>
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 px-3 py-2 rounded-lg">
            <Printer className="w-4 h-4" strokeWidth={1.75} /> Print or save as PDF
          </button>
        </div>
      </div>

      <div className="rr-paper max-w-5xl mx-auto bg-white shadow-sm my-6 print:my-0 print:shadow-none">
        <div className="px-8 py-8 print:px-8 print:py-6 text-ink" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Rent roll</h1>
              <p className="text-sm text-mute mt-1">{scope} · as of {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
              {profile?.full_name && <p className="text-sm text-ink mt-1 font-medium">{profile.full_name}</p>}
            </div>
            <img src={BRAND.logo.horizontal} alt={BRAND.name} className="h-9" />
          </div>

          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6 text-sm">
            <Stat label="Units" value={String(s.units)} />
            <Stat label="Occupied" value={`${s.occupied} (${s.occupancyRate}%)`} />
            <Stat label="Vacant" value={String(s.vacant)} />
            <Stat label="Occupied rent / mo" value={formatUsd(s.occupiedRent)} />
            <Stat label="Potential rent / mo" value={formatUsd(s.potentialRent)} />
          </div>

          {rows.length === 0 ? (
            <p className="text-sm text-mute py-8 text-center">No units to report.</p>
          ) : (
            <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full text-xs border border-gray-300 border-collapse min-w-[640px]">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <Th>Property</Th>
                  <Th>Unit</Th>
                  <Th>Bed/Bath</Th>
                  <Th>Status</Th>
                  <Th>Tenant(s)</Th>
                  <Th>Lease start</Th>
                  <Th>Lease end</Th>
                  <Th className="text-right">Rent / mo</Th>
                  <Th className="text-right">Deposit</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.unitId} className="border-t border-gray-200 align-top">
                    <td className="p-2 border-r border-gray-200">{r.propertyName}</td>
                    <td className="p-2 border-r border-gray-200 whitespace-nowrap">{r.unitNumber}</td>
                    <td className="p-2 border-r border-gray-200 whitespace-nowrap">{r.bedrooms ?? '—'}/{r.bathrooms ?? '—'}</td>
                    <td className="p-2 border-r border-gray-200">
                      <span className={r.status === 'occupied' ? 'text-emerald-700 font-medium' : 'text-mute'}>
                        {r.status === 'occupied' ? 'Occupied' : 'Vacant'}
                      </span>
                    </td>
                    <td className="p-2 border-r border-gray-200">{r.tenants || '—'}</td>
                    <td className="p-2 border-r border-gray-200 whitespace-nowrap">{r.leaseStart ? formatLocalDate(r.leaseStart) : '—'}</td>
                    <td className="p-2 border-r border-gray-200 whitespace-nowrap">{r.leaseEnd ? formatLocalDate(r.leaseEnd) : '—'}</td>
                    <td className="p-2 border-r border-gray-200 text-right tabular-nums">{formatUsdCents(r.monthlyRent)}</td>
                    <td className="p-2 text-right tabular-nums">{r.securityDeposit != null ? formatUsdCents(r.securityDeposit) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-400 font-semibold bg-gray-50">
                  <td className="p-2" colSpan={7}>Totals — {s.occupied} occupied of {s.units} units</td>
                  <td className="p-2 text-right tabular-nums">{formatUsdCents(s.occupiedRent)}</td>
                  <td className="p-2"></td>
                </tr>
              </tfoot>
            </table>
            </div>
          )}

          <div className="mt-8 pt-4 border-t border-gray-200 text-[11px] text-mute text-center">
            <p>Generated by {BRAND.name} on {new Date().toLocaleDateString()}. Rent reflects the current active lease (or the unit's market rent when vacant).</p>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body { background: white !important; }
          .rr-toolbar { display: none !important; }
          .rr-paper { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
          @page { margin: 0.5in; size: letter landscape; }
        }
      `}</style>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-mute font-semibold">{label}</p>
      <p className="font-semibold mt-0.5">{value}</p>
    </div>
  )
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`p-2 border-r border-gray-300 font-semibold ${className ?? ''}`}>{children}</th>
}

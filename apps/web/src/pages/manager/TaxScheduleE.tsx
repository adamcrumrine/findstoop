// Annual Schedule E (Form 1040) worksheet — "Supplemental Income and Loss
// from rental real estate." Standalone print page (no sidebar) so the manager
// can print or save-as-PDF and hand it to their accountant.
//
// Part I income is AUTO-FILLED from completed payments for the tax year, per
// property (cash basis — only payments actually received count). Refundable
// deposits (pet_deposit) are excluded since they're liabilities, not income.
// Expense lines (5–19) are a worksheet: Stoop doesn't track landlord
// expenses yet, so the manager/accountant fills those in. Once expense
// tracking ships, they auto-fill here too.

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { formatUsdCents } from '@findstoop/shared/lib/format'
import { getExpenses } from '@findstoop/shared/api/expenses'
import { EXPENSE_CATEGORY_META } from '@findstoop/shared/types/expense'
import type { ExpenseCategory } from '@findstoop/shared/types/expense'
import { categoryTotal } from '../../lib/scheduleE'

interface PropertyRow { id: string; name: string; address: string; city: string; state: string; zip: string }
type IncomeByType = Record<string, number>
interface PropertyIncome {
  property: PropertyRow
  rents: number
  otherIncome: number
  byType: IncomeByType
  expByCat: Partial<Record<ExpenseCategory, number>>
}

// Total tracked expenses for a property (Schedule E line 20).
const totalExpenses = (r: PropertyIncome) => categoryTotal(r.expByCat)

// Payment types that count as rental income (cash basis). pet_deposit excluded
// (refundable liability). Security deposits aren't a payment type here.
const INCOME_TYPES = new Set(['rent', 'late_fee', 'pet_fee', 'utility', 'other'])

export default function TaxScheduleE() {
  const { year: yearParam } = useParams<{ year: string }>()
  const [searchParams] = useSearchParams()
  const { user, profile } = useAuth()
  const year = Number(yearParam) || new Date().getFullYear()

  const [rows, setRows] = useState<PropertyIncome[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        // All of the manager's properties (RLS scopes to owner). We list every
        // property so even those with no income this year appear (for expenses
        // / depreciation lines).
        const { data: props, error: pErr } = await supabase
          .from('properties')
          .select('id, name, address, city, state, zip')
          .order('name')
        if (pErr) throw pErr

        // Completed payments received in the tax year, with their property.
        const { data: pays, error: payErr } = await supabase
          .from('payments')
          .select('amount, type, status, paid_at, lease:leases!payments_lease_id_fkey(unit:units(property_id))')
          .eq('status', 'completed')
          .gte('paid_at', `${year}-01-01`)
          .lt('paid_at', `${year + 1}-01-01`)
        if (payErr) throw payErr
        if (cancelled) return

        const byProp = new Map<string, PropertyIncome>()
        for (const p of (props ?? []) as PropertyRow[]) {
          byProp.set(p.id, { property: p, rents: 0, otherIncome: 0, byType: {}, expByCat: {} })
        }
        for (const pay of (pays ?? []) as any[]) {
          const lease = Array.isArray(pay.lease) ? pay.lease[0] : pay.lease
          const unit = lease && (Array.isArray(lease.unit) ? lease.unit[0] : lease.unit)
          const propId = unit?.property_id
          if (!propId || !byProp.has(propId)) continue
          if (!INCOME_TYPES.has(pay.type)) continue
          const amt = Number(pay.amount) || 0
          const entry = byProp.get(propId)!
          entry.byType[pay.type] = (entry.byType[pay.type] ?? 0) + amt
          if (pay.type === 'rent') entry.rents += amt
          else entry.otherIncome += amt
        }

        // Tracked operating expenses for the year, aggregated per property/category.
        const expenses = await getExpenses([...byProp.keys()], year)
        if (cancelled) return
        for (const ex of expenses) {
          const entry = byProp.get(ex.property_id)
          if (!entry) continue
          entry.expByCat[ex.category] = (entry.expByCat[ex.category] ?? 0) + Number(ex.amount)
        }

        setRows([...byProp.values()])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not build Schedule E')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [user, year])

  useEffect(() => {
    if (loading || error || searchParams.get('print') !== '1') return
    const t = setTimeout(() => window.print(), 500)
    return () => clearTimeout(t)
  }, [loading, error, searchParams])

  // Schedule E reports up to 3 properties per copy (columns A/B/C).
  const chunks = useMemo(() => {
    const out: PropertyIncome[][] = []
    for (let i = 0; i < rows.length; i += 3) out.push(rows.slice(i, i + 3))
    return out.length ? out : [[]]
  }, [rows])

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

  const grandRents = rows.reduce((s, r) => s + r.rents, 0)
  const grandOther = rows.reduce((s, r) => s + r.otherIncome, 0)
  const grandExpenses = rows.reduce((s, r) => s + totalExpenses(r), 0)
  const grandNet = grandRents + grandOther - grandExpenses

  return (
    <div className="bg-gray-100 min-h-screen">
      <div className="tax-toolbar sticky top-0 z-10 bg-white border-b border-gray-200 print:hidden">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/manager/reports" className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} /> Back to Reports
          </Link>
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 px-3 py-2 rounded-lg">
            <Printer className="w-4 h-4" strokeWidth={1.75} /> Print or save as PDF
          </button>
        </div>
      </div>

      <div className="tax-paper max-w-4xl mx-auto bg-white shadow-sm my-6 print:my-0 print:shadow-none">
        <div className="px-10 py-10 print:px-10 print:py-8 text-ink" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Schedule E worksheet — {year}</h1>
              <p className="text-sm text-mute mt-1">Supplemental Income and Loss from rental real estate (Form 1040)</p>
              {profile?.full_name && <p className="text-sm text-ink mt-2 font-medium">{profile.full_name}</p>}
            </div>
            <img src="/stoop_logo_horizontal_trans.png" alt="Stoop" className="h-9" />
          </div>

          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 mb-6 text-xs text-amber-900 leading-relaxed">
            Income is auto-filled from rent Stoop recorded as <strong>received</strong> in {year} (cash basis;
            refundable deposits excluded). Expense lines are auto-filled from the expenses you logged on the Expenses
            page — anything you haven't tracked shows blank to fill in. A convenience worksheet, not tax advice or an
            official IRS form — confirm figures before filing.
          </div>

          {chunks.map((chunk, ci) => {
            const cols = chunk.length || 1
            const letters = ['A', 'B', 'C']
            return (
              <section key={ci} className="mb-10 break-inside-avoid">
                {chunks.length > 1 && <p className="text-xs font-semibold text-mute mb-2">Copy {ci + 1} of {chunks.length}</p>}
                {/* Property headers */}
                <table className="w-full text-sm border border-gray-300 border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left p-2 border border-gray-300 font-semibold w-1/3">Property</th>
                      {chunk.map((r, i) => (
                        <th key={r.property.id} className="text-left p-2 border border-gray-300 font-semibold align-top">
                          <span className="inline-block w-5 text-mute">{letters[i]}</span>
                          {r.property.name}
                          <span className="block font-normal text-xs text-mute mt-0.5">
                            {[r.property.address, r.property.city, r.property.state, r.property.zip].filter(Boolean).join(', ')}
                          </span>
                        </th>
                      ))}
                      {Array.from({ length: 3 - cols }).map((_, i) => (
                        <th key={`pad-${i}`} className="p-2 border border-gray-300 bg-gray-50/50"></th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <Row label="Income" header />
                    <MoneyRow line={3} label="Rents received" values={chunk.map((r) => r.rents)} cols={cols} bold />
                    <MoneyRow line={4} label="Royalties received" values={chunk.map(() => null)} cols={cols} />
                    <Row label="Expenses (auto-filled from your tracked expenses)" header />
                    {EXPENSE_CATEGORY_META.map((c) => (
                      <MoneyRow key={c.line} line={c.line} label={c.label} values={chunk.map((r) => r.expByCat[c.key] ?? null)} cols={cols} />
                    ))}
                    <MoneyRow line={20} label="Total expenses (add lines 5–19)" values={chunk.map((r) => totalExpenses(r) || null)} cols={cols} bold />
                    <MoneyRow
                      line={21}
                      label="Income or (loss) — line 3 + 4 minus line 20"
                      values={chunk.map((r) => {
                        const inc = r.rents + r.otherIncome
                        const exp = totalExpenses(r)
                        return inc === 0 && exp === 0 ? null : inc - exp
                      })}
                      cols={cols}
                      bold
                    />
                  </tbody>
                </table>

                {/* Stoop income breakdown note for these properties */}
                <div className="mt-2 text-[11px] text-mute">
                  {chunk.map((r, i) => {
                    const parts = Object.entries(r.byType).map(([t, v]) => `${t.replace(/_/g, ' ')} ${formatUsdCents(v)}`)
                    return (
                      <p key={r.property.id}>
                        <strong>{letters[i]}</strong> recorded income: {parts.length ? parts.join(' · ') : 'none in ' + year}
                      </p>
                    )
                  })}
                </div>
              </section>
            )
          })}

          {/* Portfolio totals */}
          <div className="mt-6 border-t border-gray-300 pt-4">
            <h2 className="text-sm font-bold mb-2">Portfolio totals — {year}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm max-w-2xl">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-mute font-semibold">Total income</p>
                <p className="font-semibold mt-0.5">{formatUsdCents(grandRents + grandOther)}</p>
                <p className="text-[10px] text-mute mt-0.5">Rent {formatUsdCents(grandRents)} · Other {formatUsdCents(grandOther)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-mute font-semibold">Total expenses</p>
                <p className="font-semibold mt-0.5">{formatUsdCents(grandExpenses)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-mute font-semibold">Net income / (loss)</p>
                <p className={`font-semibold mt-0.5 ${grandNet < 0 ? 'text-red-700' : 'text-ink'}`}>
                  {grandNet < 0 ? `(${formatUsdCents(-grandNet)})` : formatUsdCents(grandNet)}
                </p>
              </div>
            </div>
            <p className="text-[11px] text-mute mt-3">
              "Other income" (late fees, pet fees, billed utilities) is generally reported as rental income on
              Schedule E line 3. Confirm treatment with your tax professional.
            </p>
          </div>

          <div className="mt-10 pt-5 border-t border-gray-200 text-xs text-mute text-center">
            <p>Generated by Stoop on {new Date().toLocaleDateString()} · Not tax advice.</p>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body { background: white !important; }
          .tax-toolbar { display: none !important; }
          .tax-paper { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
          @page { margin: 0.5in; size: letter landscape; }
        }
      `}</style>
    </div>
  )
}

function Row({ label, header }: { label: string; header?: boolean }) {
  return (
    <tr className={header ? 'bg-gray-100' : ''}>
      <td colSpan={4} className="p-2 border border-gray-300 font-semibold text-xs uppercase tracking-wide text-mute">{label}</td>
    </tr>
  )
}

function MoneyRow({ line, label, values, cols, bold }: { line: number; label: string; values: (number | null)[]; cols: number; bold?: boolean }) {
  return (
    <tr className={bold ? 'font-semibold' : ''}>
      <td className="p-2 border border-gray-300">
        <span className="inline-block w-6 text-mute">{line}</span>{label}
      </td>
      {values.map((v, i) => (
        <td key={i} className="p-2 border border-gray-300 text-right tabular-nums">
          {v == null ? <span className="text-gray-300">$</span>
            : v < 0 ? <span className="text-red-700">({formatUsdCents(-v)})</span>
            : formatUsdCents(v)}
        </td>
      ))}
      {Array.from({ length: 3 - cols }).map((_, i) => (
        <td key={`pad-${i}`} className="p-2 border border-gray-300 bg-gray-50/30"></td>
      ))}
    </tr>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Plus, Trash2, FileText, Loader2, Wallet, ArrowLeft } from 'lucide-react'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { getProperties } from '@findstoop/shared/api/properties'
import { getExpenses, createExpense, deleteExpense } from '@findstoop/shared/api/expenses'
import { EXPENSE_CATEGORY_META, EXPENSE_LABEL } from '@findstoop/shared/types/expense'
import type { PropertyExpense, ExpenseCategory } from '@findstoop/shared/types/expense'
import type { Property } from '@findstoop/shared/types/property'
import { formatUsdCents, formatLocalDate } from '@findstoop/shared/lib/format'

const todayStr = () => new Date().toISOString().slice(0, 10)

export default function Expenses() {
  const { profile } = useAuth()
  const nowYear = new Date().getFullYear()
  const years = [nowYear, nowYear - 1, nowYear - 2]

  const [year, setYear] = useState(nowYear)
  const [properties, setProperties] = useState<Property[]>([])
  const [expenses, setExpenses] = useState<PropertyExpense[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    property_id: '', category: 'repairs' as ExpenseCategory, amount: '', expense_date: todayStr(), vendor: '', note: '',
  })

  useEffect(() => {
    if (!profile?.id) return
    getProperties(profile.id)
      .then((p) => {
        setProperties(p)
        setForm((f) => ({ ...f, property_id: f.property_id || p[0]?.id || '' }))
      })
      .catch((e) => toast.error(e.message))
  }, [profile?.id])

  const propIds = useMemo(() => properties.map((p) => p.id), [properties])
  useEffect(() => {
    if (!profile?.id) return
    if (propIds.length === 0) { setLoading(false); return }
    setLoading(true)
    getExpenses(propIds, year)
      .then(setExpenses)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [propIds, year, profile?.id])

  const propName = (id: string) => properties.find((p) => p.id === id)?.name ?? '—'
  const total = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const byCategory = useMemo(() => {
    const m = new Map<ExpenseCategory, number>()
    for (const e of expenses) m.set(e.category, (m.get(e.category) ?? 0) + Number(e.amount))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [expenses])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(form.amount)
    if (!form.property_id) return toast.error('Pick a property')
    if (!(amt > 0)) return toast.error('Enter an amount')
    setSaving(true)
    try {
      const created = await createExpense({
        property_id: form.property_id, category: form.category, amount: amt,
        expense_date: form.expense_date, vendor: form.vendor.trim() || null, note: form.note.trim() || null,
      })
      if (new Date(created.expense_date + 'T00:00:00').getFullYear() === year) {
        setExpenses((x) => [created, ...x].sort((a, b) => b.expense_date.localeCompare(a.expense_date)))
      }
      setForm((f) => ({ ...f, amount: '', vendor: '', note: '' }))
      toast.success('Expense added')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add expense')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    const prev = expenses
    setExpenses((x) => x.filter((e) => e.id !== id))
    try {
      await deleteExpense(id)
    } catch (err) {
      setExpenses(prev)
      toast.error(err instanceof Error ? err.message : 'Could not delete')
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Link to="/manager/reports" className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink mb-2">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} /> Back to Reports
          </Link>
          <h1 className="text-2xl font-semibold text-ink flex items-center gap-2">
            <Wallet className="w-6 h-6 text-brand-600" strokeWidth={1.75} /> Expenses
          </h1>
          <p className="text-sm text-mute mt-1">Track deductible operating expenses — they auto-fill your Schedule E.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <a
            href={`/manager/tax/schedule-e/${year}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 px-3 py-1.5 rounded-lg"
          >
            <FileText className="w-4 h-4" strokeWidth={1.75} /> Schedule E
          </a>
        </div>
      </header>

      {/* Add expense */}
      <form onSubmit={add} className="bg-white rounded-2xl border border-gray-200 p-4">
        <h2 className="text-xs uppercase tracking-wider text-mute font-semibold mb-3">Add an expense</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <label className="text-xs text-mute lg:col-span-2">
            Property
            <select
              value={form.property_id}
              onChange={(e) => setForm((f) => ({ ...f, property_id: e.target.value }))}
              className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {properties.length === 0 && <option value="">No properties</option>}
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-mute lg:col-span-2">
            Category
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ExpenseCategory }))}
              className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {EXPENSE_CATEGORY_META.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </label>
          <label className="text-xs text-mute">
            Amount
            <input
              type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>
          <label className="text-xs text-mute">
            Date
            <input
              type="date" value={form.expense_date}
              onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))}
              className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>
          <label className="text-xs text-mute lg:col-span-3">
            Vendor (optional)
            <input
              type="text" placeholder="e.g. ABC Plumbing"
              value={form.vendor}
              onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))}
              className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>
          <label className="text-xs text-mute lg:col-span-3">
            Note (optional)
            <input
              type="text" placeholder="What was it for?"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="submit" disabled={saving || properties.length === 0}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} /> : <Plus className="w-4 h-4" strokeWidth={2} />}
            Add expense
          </button>
        </div>
      </form>

      {/* Summary */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs uppercase tracking-wider text-mute font-semibold">{year} total</h2>
          <span className="text-lg font-bold text-ink">{formatUsdCents(total)}</span>
        </div>
        {byCategory.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {byCategory.map(([cat, amt]) => (
              <span key={cat} className="inline-flex items-center gap-1.5 text-xs bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1">
                <span className="text-mute">{EXPENSE_LABEL[cat]}</span>
                <span className="font-semibold text-ink">{formatUsdCents(amt)}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-xs uppercase tracking-wider text-mute font-semibold">Expenses · {year}</h2>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-mute"><Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.75} /></div>
        ) : expenses.length === 0 ? (
          <p className="text-sm text-mute text-center py-10">No expenses recorded for {year} yet. Add your first above.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-mute border-b border-gray-100">
                <th className="px-4 py-2 font-semibold">Date</th>
                <th className="px-4 py-2 font-semibold">Property</th>
                <th className="px-4 py-2 font-semibold">Category</th>
                <th className="px-4 py-2 font-semibold">Vendor / note</th>
                <th className="px-4 py-2 font-semibold text-right">Amount</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2.5 text-ink whitespace-nowrap">{formatLocalDate(e.expense_date)}</td>
                  <td className="px-4 py-2.5 text-mute">{propName(e.property_id)}</td>
                  <td className="px-4 py-2.5 text-ink">{EXPENSE_LABEL[e.category]}</td>
                  <td className="px-4 py-2.5 text-mute truncate max-w-[16rem]">{[e.vendor, e.note].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-ink tabular-nums">{formatUsdCents(Number(e.amount))}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button" onClick={() => remove(e.id)} aria-label="Delete expense"
                      className="text-gray-300 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-mute">
        Recorded expenses flow into the <Link to={`/manager/tax/schedule-e/${year}`} className="text-brand-700 hover:underline">Schedule E worksheet</Link> for {year},
        auto-filling lines 5–19 per property. Not tax advice — confirm with your tax professional.
      </p>
    </div>
  )
}

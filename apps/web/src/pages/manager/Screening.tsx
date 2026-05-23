// Manager screening dashboard.
// Lists every screening_order on the manager's properties with the
// applicant's rentability score, verification chips, and a "Request full
// report" CTA (stubbed for now — full report tier ships in a follow-up).

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ShieldCheck, Loader2, CheckCircle2, AlertTriangle, Clock,
  IdCard, FileText, Hourglass, XCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useAuth } from '@findstoop/shared/hooks/useAuth'

interface OrderRow {
  id: string
  application_id: string
  tier: 'prequal' | 'full'
  state: 'awaiting_payment' | 'collecting' | 'scoring' | 'complete' | 'failed'
  payment_status: 'pending' | 'paid' | 'refunded' | 'failed'
  addon_selfie_match: boolean
  addon_credit_check: boolean
  addon_criminal_check: boolean
  addon_eviction_check: boolean
  rentability_score: number | null
  rentability_summary: string | null
  rentability_flags: Record<string, unknown> | null
  dl_match_score: number | null
  dl_flags: Record<string, boolean | string> | null
  income_flags: Record<string, boolean | string | number> | null
  array_data: Record<string, unknown> | null
  vergent_data: Record<string, unknown> | null
  lexisnexis_data: Record<string, unknown> | null
  created_at: string
  completed_at: string | null
  application?: {
    first_name: string
    last_name: string
    email: string
    employer: string | null
    job_title: string | null
    monthly_income: number | null
    unit?: { unit_number: string; rent_amount: number; property?: { name: string } | null } | null
  }
}

const STATE_PILL: Record<OrderRow['state'], { label: string; cls: string; Icon: typeof Clock }> = {
  awaiting_payment: { label: 'Awaiting payment', cls: 'text-gray-700 bg-gray-100 border-gray-200',   Icon: Hourglass },
  collecting:       { label: 'Collecting docs',  cls: 'text-amber-700 bg-amber-50 border-amber-200', Icon: Clock     },
  scoring:          { label: 'Scoring',          cls: 'text-blue-700 bg-blue-50 border-blue-200',    Icon: Loader2   },
  complete:         { label: 'Complete',         cls: 'text-emerald-700 bg-emerald-50 border-emerald-200', Icon: CheckCircle2 },
  failed:           { label: 'Failed',           cls: 'text-red-700 bg-red-50 border-red-200',       Icon: XCircle   },
}

function scoreColor(score: number | null): string {
  if (score == null) return 'text-gray-400 bg-gray-50 border-gray-200'
  if (score >= 90) return 'text-emerald-700 bg-emerald-50 border-emerald-200'
  if (score >= 70) return 'text-blue-700   bg-blue-50    border-blue-200'
  if (score >= 50) return 'text-amber-700  bg-amber-50   border-amber-200'
  return 'text-red-700 bg-red-50 border-red-200'
}

export default function Screening() {
  const { user } = useAuth()
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'complete' | 'in_progress'>('all')

  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('screening_orders')
        .select(`
          id, application_id, tier, state, payment_status,
          addon_selfie_match, addon_credit_check, addon_criminal_check, addon_eviction_check,
          rentability_score, rentability_summary, rentability_flags,
          dl_match_score, dl_flags, income_flags,
          array_data, vergent_data, lexisnexis_data,
          created_at, completed_at,
          application:applications!screening_orders_application_id_fkey (
            first_name, last_name, email, employer, job_title, monthly_income,
            unit:units!applications_unit_id_fkey (
              unit_number, rent_amount,
              property:properties!units_property_id_fkey ( name )
            )
          )
        `)
        .order('created_at', { ascending: false })
      if (cancelled) return
      if (error) toast.error(error.message)
      else setOrders((data ?? []) as unknown as OrderRow[])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [user])

  const filtered = useMemo(() => {
    if (filter === 'complete')    return orders.filter((o) => o.state === 'complete')
    if (filter === 'in_progress') return orders.filter((o) => o.state !== 'complete' && o.state !== 'failed')
    return orders
  }, [orders, filter])

  return (
    <div className="max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Screening</h1>
        <p className="text-sm text-mute mt-1">
          Applicants who completed pre-qualification — verified income, ID, and a private rentability score.
        </p>
      </header>

      <div className="flex gap-2 mb-4">
        {(['all', 'in_progress', 'complete'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
              filter === s ? 'bg-ink text-white' : 'bg-gray-100 text-mute hover:bg-gray-200'
            }`}
          >
            {s.replace('_', ' ')} ({
              s === 'all' ? orders.length :
              s === 'complete' ? orders.filter((o) => o.state === 'complete').length :
              orders.filter((o) => o.state !== 'complete' && o.state !== 'failed').length
            })
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-mute">
          <Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
          <div className="w-14 h-14 mx-auto mb-4 bg-brand-50 rounded-2xl flex items-center justify-center">
            <ShieldCheck className="w-7 h-7 text-brand-600" strokeWidth={1.75} />
          </div>
          <h2 className="text-lg font-semibold text-ink">Nothing here yet</h2>
          <p className="text-sm text-mute mt-2 max-w-md mx-auto">
            Once applicants finish pre-qualification, their verified income and rentability scores show up here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((o) => <OrderCard key={o.id} order={o} />)}
        </div>
      )}
    </div>
  )
}

function OrderCard({ order }: { order: OrderRow }) {
  const pill = STATE_PILL[order.state]
  const app = order.application
  const name = app ? `${app.first_name} ${app.last_name}` : '—'
  const unitLabel = app?.unit ? `${app.unit.property?.name ?? ''} · Unit ${app.unit.unit_number}` : ''
  const rent = app?.unit?.rent_amount ?? 0

  const idFlags = order.dl_flags ?? {}
  const incomeFlags = order.income_flags ?? {}
  const ratio = (order.rentability_flags?.income_to_rent_ratio as number | undefined) ?? null

  return (
    <article className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-start gap-4">
        {/* Score */}
        <div className={`shrink-0 w-16 h-16 rounded-2xl border flex items-center justify-center ${scoreColor(order.rentability_score)}`}>
          <div className="text-center">
            <div className="text-xl font-bold leading-none">{order.rentability_score ?? '—'}</div>
            <div className="text-[10px] uppercase tracking-wider mt-0.5">Score</div>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-ink truncate">{name}</h3>
            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${pill.cls}`}>
              <pill.Icon className={`w-3 h-3 ${order.state === 'scoring' ? 'animate-spin' : ''}`} strokeWidth={2} />
              {pill.label}
            </span>
          </div>
          <p className="text-xs text-mute mt-0.5">
            {unitLabel}
            {rent > 0 && <> · ${Number(rent).toLocaleString()}/mo</>}
            {ratio != null && <> · <strong className="text-ink">{ratio.toFixed(1)}x</strong> income-to-rent</>}
          </p>

          {order.rentability_summary && (
            <p className="text-sm text-ink leading-relaxed mt-2">{order.rentability_summary}</p>
          )}

          {/* Verification chips */}
          <div className="flex gap-1.5 flex-wrap mt-3">
            <Chip
              Icon={IdCard}
              label="ID verified"
              ok={!!idFlags.name_match_app && !!idFlags.dob_match_app && !idFlags.tamper_suspected}
            />
            <Chip
              Icon={FileText}
              label="Income verified"
              ok={!!incomeFlags.employer_match_app && !!incomeFlags.ytd_math_consistent && !incomeFlags.tamper_suspected}
            />
            {order.addon_credit_check && (
              <Chip Icon={FileText} label={order.array_data ? 'Credit pulled' : 'Credit pending'} ok={!!order.array_data} />
            )}
            {order.addon_criminal_check && (
              <Chip Icon={FileText} label={order.vergent_data ? 'Criminal clear' : 'Criminal pending'} ok={!!order.vergent_data} />
            )}
            {order.addon_eviction_check && (
              <Chip Icon={FileText} label={order.lexisnexis_data ? 'Eviction clear' : 'Eviction pending'} ok={!!order.lexisnexis_data} />
            )}
            {!!incomeFlags.tamper_suspected && <Chip Icon={AlertTriangle} label="Tamper suspected" ok={false} warn />}
            {!!idFlags.tamper_suspected && <Chip Icon={AlertTriangle} label="DL tamper suspected" ok={false} warn />}
            {!!idFlags.expired && <Chip Icon={AlertTriangle} label="License expired" ok={false} warn />}
          </div>
        </div>

        <div className="shrink-0 flex flex-col items-end gap-2">
          <Link
            to={`/manager/applications`}
            className="text-xs px-3 py-1.5 rounded-md border border-gray-300 text-ink hover:bg-gray-50"
          >
            Open application
          </Link>
        </div>
      </div>
    </article>
  )
}

function Chip({ Icon, label, ok, warn }: { Icon: typeof IdCard; label: string; ok: boolean; warn?: boolean }) {
  const cls = warn
    ? 'text-amber-700 bg-amber-50 border-amber-200'
    : ok
      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
      : 'text-gray-500 bg-gray-50 border-gray-200'
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${cls}`}>
      <Icon className="w-3 h-3" strokeWidth={2} />
      {label}
    </span>
  )
}

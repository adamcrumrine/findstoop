// Manager screening dashboard.
// Lists every screening_order on the manager's properties with the
// applicant's Tenability™, verification chips, and a "Request full
// report" CTA (stubbed for now — full report tier ships in a follow-up).

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ShieldCheck, Loader2, CheckCircle2, AlertTriangle, Clock,
  IdCard, FileText, Hourglass, XCircle, CreditCard, ExternalLink, Info,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { scoreBand, affordability } from '../../lib/screening'
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
  addon_credit_self_disclosed: boolean
  rentability_score: number | null
  rentability_summary: string | null
  rentability_flags: Record<string, unknown> | null
  dl_match_score: number | null
  dl_flags: Record<string, boolean | string> | null
  income_flags: Record<string, boolean | string | number> | null
  array_data: Record<string, unknown> | null
  vergent_data: Record<string, unknown> | null
  lexisnexis_data: Record<string, unknown> | null
  credit_self_pdf_url: string | null
  credit_self_bureau: string | null
  credit_self_report_date: string | null
  credit_self_extracted: Record<string, unknown> | null
  credit_self_authenticity_score: number | null
  credit_self_authenticity_flags: { flags?: Array<{ severity: string; code: string; message: string }>; summary?: string } | null
  credit_self_processed_at: string | null
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
  if (score == null) return 'text-gray-500 bg-gray-50 border-gray-200'
  if (score >= 90) return 'text-emerald-700 bg-emerald-50 border-emerald-200'
  if (score >= 70) return 'text-blue-700   bg-blue-50    border-blue-200'
  if (score >= 50) return 'text-amber-700  bg-amber-50   border-amber-200'
  return 'text-red-700 bg-red-50 border-red-200'
}

// Decision-support helpers (scoreBand, affordability) live in lib/screening.ts
// so they can be unit-tested independently of this view.

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
          addon_selfie_match, addon_credit_check, addon_criminal_check, addon_eviction_check, addon_credit_self_disclosed,
          rentability_score, rentability_summary, rentability_flags,
          dl_match_score, dl_flags, income_flags,
          array_data, vergent_data, lexisnexis_data,
          credit_self_pdf_url, credit_self_bureau, credit_self_report_date,
          credit_self_extracted, credit_self_authenticity_score,
          credit_self_authenticity_flags, credit_self_processed_at,
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
          Applicants who completed pre-qualification — verified income, ID, and a private Tenability™.
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
            Once applicants finish pre-qualification, their verified income and Tenability™ show up here.
          </p>
          <Link
            to="/manager/applications"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 px-4 py-2 rounded-lg"
          >
            Share your apply link
            <ExternalLink className="w-3.5 h-3.5" strokeWidth={2} />
          </Link>
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

          {(order.state === 'complete' || order.rentability_score != null) && (
            <DecisionSupport order={order} />
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

          {/* Applicant-provided credit report card */}
          {order.addon_credit_self_disclosed && (
            <CreditSelfPanel order={order} />
          )}
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

// ── Decision support ────────────────────────────────────────────────────
// Turns the raw signals into a manager-readable summary: what the score means
// (band + range), affordability vs the 3x guideline, and any concerns worth a
// closer look. Objective signals only — the manager decides.
function DecisionSupport({ order }: { order: OrderRow }) {
  const app = order.application
  const rent = app?.unit?.rent_amount ?? 0
  const income = app?.monthly_income ?? null
  const ratio =
    (order.rentability_flags?.income_to_rent_ratio as number | undefined) ??
    (income && rent ? income / rent : null)

  const band = scoreBand(order.rentability_score)
  const afford = affordability(ratio)

  const idFlags = order.dl_flags ?? {}
  const incFlags = order.income_flags ?? {}
  const credit = order.credit_self_extracted as {
    derogatory_count?: number; collection_count?: number; bankruptcy_count?: number
  } | null

  const concerns: string[] = []
  if (idFlags.tamper_suspected) concerns.push('Possible ID document tampering — review the license image')
  if (idFlags.expired) concerns.push('Driver’s license appears expired')
  if (idFlags.name_match_app === false) concerns.push('Name on ID does not match the application')
  if (idFlags.dob_match_app === false) concerns.push('Date of birth on ID does not match the application')
  if (incFlags.tamper_suspected) concerns.push('Possible income-document tampering — review the uploads')
  if (incFlags.employer_match_app === false) concerns.push('Employer on pay docs does not match the application')
  if (incFlags.ytd_math_consistent === false) concerns.push('Year-to-date income math is inconsistent')
  if (credit?.bankruptcy_count) concerns.push(`${credit.bankruptcy_count} bankruptcy record(s) on the self-provided report`)
  if (credit?.collection_count) concerns.push(`${credit.collection_count} collection(s) on the self-provided report`)
  if (credit?.derogatory_count) concerns.push(`${credit.derogatory_count} derogatory mark(s) on the self-provided report`)
  ;(order.credit_self_authenticity_flags?.flags ?? [])
    .filter((f) => f.severity === 'high')
    .forEach((f) => concerns.push(f.message))

  return (
    <section className="mt-3 rounded-xl border border-gray-200 bg-gray-50/50 p-3.5">
      <div className="flex items-center gap-1.5 mb-2.5">
        <ShieldCheck className="w-3.5 h-3.5 text-brand-700" strokeWidth={2} />
        <h4 className="text-xs font-semibold uppercase tracking-wider text-mute">Decision support</h4>
      </div>

      <div className="grid sm:grid-cols-2 gap-2.5 mb-2.5">
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-mute font-semibold">Tenability™ score</p>
          <p className="text-sm font-semibold text-ink mt-0.5">
            {order.rentability_score ?? '—'}
            <span className={`ml-1.5 font-medium ${band.tone}`}>
              {band.label}{band.range && <span className="text-mute font-normal"> ({band.range})</span>}
            </span>
          </p>
        </div>
        <div className={`rounded-lg border px-3 py-2 ${afford.tone}`}>
          <p className="text-[10px] uppercase tracking-wider font-semibold opacity-80">Affordability</p>
          <p className="text-sm font-semibold mt-0.5">{afford.label}</p>
        </div>
      </div>

      {concerns.length > 0 ? (
        <ul className="space-y-1">
          {concerns.map((c, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0 text-amber-600" strokeWidth={2} />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-1.5 text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
          <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-600" strokeWidth={2} />
          No major concerns flagged in the verified signals.
        </p>
      )}

      <p className="text-[10px] text-mute leading-relaxed mt-2.5">
        Objective signals only — not a recommendation to approve or deny. Screening
        decisions and any adverse action are your responsibility and must comply with
        FCRA and Fair Housing laws. Apply the same criteria to every applicant.
      </p>
    </section>
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

// ── Applicant-provided credit report card ──────────────────────────────
// Shows the OCR'd facts + AI authenticity check on the PDF the applicant
// uploaded from AnnualCreditReport.gov. This is NOT a bureau-pulled report —
// the panel surfaces that distinction prominently so the landlord sets
// expectations correctly.
function CreditSelfPanel({ order }: { order: OrderRow }) {
  const extracted = order.credit_self_extracted as {
    score?: number | null
    score_model?: string | null
    consumer_name?: string
    account_count?: number
    open_account_count?: number
    derogatory_count?: number
    collection_count?: number
    bankruptcy_count?: number
    total_balance?: number
  } | null
  const flagList = order.credit_self_authenticity_flags?.flags ?? []
  const summary = order.credit_self_authenticity_flags?.summary

  if (!order.credit_self_pdf_url) {
    // Add-on selected but no upload yet.
    return (
      <div className="mt-4 rounded-xl border border-dashed border-gray-300 p-4 text-sm text-mute">
        Applicant has not uploaded their credit report yet.
      </div>
    )
  }

  const authScore = order.credit_self_authenticity_score
  const authCls =
    authScore == null      ? 'text-gray-700 bg-gray-50 border-gray-200' :
    authScore >= 90        ? 'text-emerald-700 bg-emerald-50 border-emerald-200' :
    authScore >= 70        ? 'text-blue-700 bg-blue-50 border-blue-200' :
    authScore >= 50        ? 'text-amber-700 bg-amber-50 border-amber-200' :
                              'text-red-700 bg-red-50 border-red-200'

  const openPdf = async () => {
    if (!order.credit_self_pdf_url) return
    const { data, error } = await supabase.storage
      .from('screening-docs')
      .createSignedUrl(order.credit_self_pdf_url, 600)
    if (error || !data?.signedUrl) {
      toast.error('Could not open PDF — try again.')
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <section className="mt-4 rounded-xl border border-gray-200 bg-gray-50/40">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 bg-white rounded-t-xl">
        <CreditCard className="w-4 h-4 text-brand-700" strokeWidth={1.75} />
        <p className="text-sm font-semibold text-ink flex-1">Applicant-provided credit report</p>
        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${authCls}`}>
          <ShieldCheck className="w-3 h-3" strokeWidth={2} />
          {authScore != null ? `${authScore} authenticity` : 'Not yet analyzed'}
        </span>
      </div>

      <div className="px-4 py-3 space-y-2.5">
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" strokeWidth={1.75} />
          <p className="text-[11px] text-amber-900 leading-relaxed">
            This is the applicant's own copy of their AnnualCreditReport.gov report — not a bureau-pulled report.
            Cross-check the PDF against the authenticity score and flags below before relying on the numbers.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <Stat label="Bureau" value={order.credit_self_bureau ?? '—'} />
          <Stat label="Report date" value={order.credit_self_report_date ?? '—'} />
          <Stat
            label={extracted?.score_model ? extracted.score_model : 'Score'}
            value={extracted?.score != null ? String(extracted.score) : 'Not on report'}
          />
          <Stat label="Total balance" value={extracted?.total_balance != null ? `$${Number(extracted.total_balance).toLocaleString()}` : '—'} />
          <Stat label="Open accts" value={extracted?.open_account_count != null ? String(extracted.open_account_count) : '—'} />
          <Stat label="Derogatory" value={extracted?.derogatory_count != null ? String(extracted.derogatory_count) : '—'} />
          <Stat label="Collections" value={extracted?.collection_count != null ? String(extracted.collection_count) : '—'} />
          <Stat label="Bankruptcies" value={extracted?.bankruptcy_count != null ? String(extracted.bankruptcy_count) : '—'} />
        </div>

        {summary && (
          <p className="text-xs text-ink italic leading-relaxed">{summary}</p>
        )}

        {flagList.length > 0 && (
          <ul className="space-y-1">
            {flagList.map((f, i) => {
              const cls =
                f.severity === 'high'   ? 'text-red-700 bg-red-50 border-red-200' :
                f.severity === 'medium' ? 'text-amber-700 bg-amber-50 border-amber-200' :
                f.severity === 'low'    ? 'text-blue-700 bg-blue-50 border-blue-200' :
                                          'text-gray-700 bg-gray-50 border-gray-200'
              return (
                <li key={i} className={`text-[11px] px-2 py-1.5 rounded border ${cls}`}>
                  <span className="font-semibold uppercase tracking-wide text-[10px] mr-1.5">{f.severity}</span>
                  {f.message}
                </li>
              )
            })}
          </ul>
        )}

        <button
          type="button"
          onClick={openPdf}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:text-brand-800"
        >
          Open uploaded PDF
          <ExternalLink className="w-3 h-3" strokeWidth={2} />
        </button>
      </div>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-mute font-semibold">{label}</p>
      <p className="text-sm font-semibold text-ink mt-0.5">{value}</p>
    </div>
  )
}

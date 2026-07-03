// Deposit return wizard — walks a landlord from move-out to a statutorily
// compliant itemized deposit disposition, so the return never blows the
// deadline or charges ordinary wear and tear (the two ways deposits end up in
// small-claims court).
//
// Three steps: context (move-out date → statutory deadline) → itemized
// deductions (with one-click suggestions pulled from the move-in vs move-out
// inspection diff) → summary (refund math + forwarding address), then hands
// off to the existing Document Builder with every field pre-seeded via
// f_<key> params so its review gate and delivery options stay intact.

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import type { LeaseWithTenant } from '@findstoop/shared/hooks/useLeases'
import type { Inspection } from '@findstoop/shared/hooks/useInspection'
import type { Unit } from '@findstoop/shared/types/unit'
import type { Property } from '@findstoop/shared/types/property'
import { checkStateSupport } from '@findstoop/shared/lib/stateGate'
import { inputClass, selectClass } from '../shared/FormField'
import {
  getDepositRule, depositDeadline, daysBetween, deadlineUrgency,
  computeDepositMath, formatDeductionsForLetter, suggestDeductionsFromInspections,
  effectiveMoveOutDate, DEDUCTION_CATEGORIES, UNKNOWN_STATE_DEADLINE_NOTE,
  type DeductionLine, type DeductionCategory, type SuggestedDeduction,
} from '../../lib/depositReturn'
import {
  X, ArrowLeft, ArrowRight, Banknote, CalendarClock, Camera, FileText,
  Plus, Scale, Trash2, TrendingDown,
} from 'lucide-react'
import type { PhotoHashRecord } from '../../lib/photoIntegrity'
import { fetchPhotoHashRecords } from '../../lib/photoIntegrityStore'
import PhotoVerifyBadge from '../shared/PhotoVerifyBadge'

interface Props {
  lease: LeaseWithTenant
  unit?: Unit
  property?: Property
  onClose: () => void
}

const todayIso = () => new Date().toISOString().slice(0, 10)
const usd = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const longDate = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

let lineSeq = 0
const newLineId = () => `dl-${Date.now()}-${lineSeq++}`

export default function DepositReturnWizard({ lease, unit, property, onClose }: Props) {
  const navigate = useNavigate()
  const today = todayIso()

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [moveOut, setMoveOut] = useState<string>(
    () => effectiveMoveOutDate(lease, today) ?? lease.tentative_move_out_date ?? lease.end_date ?? today,
  )
  const [lines, setLines] = useState<DeductionLine[]>([])
  const [forwarding, setForwarding] = useState('')
  const [lineError, setLineError] = useState('')

  // ── Inspection comparison → one-click suggestions ─────────────────────────
  const [suggestions, setSuggestions] = useState<SuggestedDeduction[]>([])
  const [hasComparison, setHasComparison] = useState(false)
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [hashRecords, setHashRecords] = useState<Record<string, PhotoHashRecord>>({})
  const [addedKeys, setAddedKeys] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('inspections')
        .select('*')
        .eq('lease_id', lease.id)
        .in('type', ['move_in', 'move_out'])
      if (cancelled) return
      const list = (data ?? []) as Inspection[]
      const moveIn = list.find((i) => i.type === 'move_in') ?? null
      const moveOutInsp = list.find((i) => i.type === 'move_out') ?? null
      setHasComparison(!!moveIn && !!moveOutInsp)
      const sugg = suggestDeductionsFromInspections(
        moveIn?.checklist_data?.rooms ?? null,
        moveOutInsp?.checklist_data?.rooms ?? null,
      )
      setSuggestions(sugg)
      // Sign the move-out evidence photos so the suggestions show thumbnails,
      // and pull their tamper-evident hash records so each piece of evidence
      // can be verified on the spot (legacy photos have no record — no badge).
      const paths = Array.from(new Set(sugg.flatMap((s) => s.photoPaths))).slice(0, 40)
      if (paths.length > 0) {
        const [{ data: signed }, records] = await Promise.all([
          supabase.storage.from('inspection-photos').createSignedUrls(paths, 3600),
          fetchPhotoHashRecords(paths),
        ])
        if (!cancelled) {
          if (signed) {
            const map: Record<string, string> = {}
            signed.forEach((s, i) => { if (s.signedUrl) map[paths[i]] = s.signedUrl })
            setPhotoUrls(map)
          }
          setHashRecords(records)
        }
      }
    })()
    return () => { cancelled = true }
  }, [lease.id])

  // ── Derived facts ──────────────────────────────────────────────────────────
  const state = property?.state ?? ''
  const rule = getDepositRule(state)
  const deadline = depositDeadline(moveOut, state)
  const daysLeft = deadline ? daysBetween(today, deadline) : null
  const gate = checkStateSupport(state)
  const deposit = lease.security_deposit != null ? Number(lease.security_deposit) : 0
  const math = useMemo(() => computeDepositMath(deposit, lines), [deposit, lines])
  const tenantName = lease.profile?.full_name ?? lease.profile?.email ?? 'Tenant'
  const where = [property?.name ?? property?.address, unit?.unit_number ? `Unit ${unit.unit_number}` : null]
    .filter(Boolean).join(' · ')

  // ── Line-item helpers ─────────────────────────────────────────────────────
  const addSuggestion = (s: SuggestedDeduction) => {
    if (addedKeys.has(s.key)) return
    setAddedKeys((prev) => new Set(prev).add(s.key))
    setLines((prev) => [...prev, { id: newLineId(), description: s.description, category: s.category, amount: 0 }])
  }
  const addBlankLine = () => {
    setLines((prev) => [...prev, { id: newLineId(), description: '', category: 'damage', amount: 0 }])
  }
  const patchLine = (id: string, patch: Partial<DeductionLine>) => {
    setLineError('')
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }
  const removeLine = (id: string) => setLines((prev) => prev.filter((l) => l.id !== id))

  const validateLines = (): boolean => {
    for (const l of lines) {
      if (!l.description.trim()) { setLineError('Every deduction needs a description.'); return false }
      if (!(Number(l.amount) > 0)) { setLineError('Every deduction needs an amount above $0 — remove lines you aren’t charging.'); return false }
    }
    setLineError('')
    return true
  }

  // ── Hand off to the Document Builder ──────────────────────────────────────
  const generateLetter = () => {
    if (!gate.supported) return
    if (!validateLines()) { setStep(2); return }
    const params = new URLSearchParams({
      leaseId: lease.id,
      type: 'security_deposit',
      f_move_out_date: moveOut,
      f_deposit_amount: String(math.deposit),
      f_deductions: formatDeductionsForLetter(lines),
      f_total_deductions: math.totalDeductions.toFixed(2),
      f_amount_returned: math.refund.toFixed(2),
    })
    if (forwarding.trim()) params.set('f_forwarding_address', forwarding.trim())
    navigate(`/manager/documents/new?${params.toString()}`)
  }

  // ── Deadline card (shared by steps 1 + 3) ─────────────────────────────────
  const deadlineCard = deadline && daysLeft != null ? (() => {
    const urgency = deadlineUrgency(daysLeft)
    const tone = urgency === 'overdue' ? 'bg-red-50 border-red-200 text-red-800'
      : urgency === 'urgent' ? 'bg-amber-50 border-amber-200 text-amber-900'
      : 'bg-brand-50 border-brand-200 text-brand-800'
    const countdown = daysLeft < 0 ? `${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? '' : 's'} overdue`
      : daysLeft === 0 ? 'due today'
      : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`
    return (
      <div className={`rounded-xl border p-3 flex items-start gap-2.5 ${tone}`}>
        <CalendarClock className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} />
        <div className="text-sm">
          <p className="font-semibold">Return due by {longDate(deadline)} — {countdown}</p>
          <p className="mt-0.5">
            {rule!.statuteCite} requires the itemized statement and any refund within {rule!.deadlineDays} days
            of the end of the tenancy{rule!.forwardingAddressMatters ? ', once you have the tenant’s forwarding address' : ''}.
            {' '}{rule!.penaltyNote}
          </p>
        </div>
      </div>
    )
  })() : (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 flex items-start gap-2.5">
      <CalendarClock className="w-4 h-4 mt-0.5 shrink-0 text-mute" strokeWidth={1.75} />
      <p className="text-sm text-gray-700">{UNKNOWN_STATE_DEADLINE_NOTE}</p>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-2xl my-8 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Deposit return wizard"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
            <Banknote className="w-5 h-5 text-brand-600" strokeWidth={1.75} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-ink">Deposit return</h2>
            <p className="text-xs text-mute truncate">{tenantName}{where ? ` · ${where}` : ''}</p>
          </div>
          <p className="text-xs uppercase tracking-wider text-mute font-semibold shrink-0">Step {step} of 3</p>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-mute hover:text-ink hover:bg-gray-50">
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* ── Step 1 — context + deadline ── */}
          {step === 1 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-gray-50 px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-mute">Deposit held</p>
                  <p className="text-lg font-bold text-ink mt-0.5">{deposit > 0 ? usd(deposit) : '—'}</p>
                </div>
                <div className="rounded-xl bg-gray-50 px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-mute">Lease term</p>
                  <p className="text-sm font-semibold text-ink mt-1 tabular-nums">
                    {new Date(lease.start_date).toLocaleDateString()} – {new Date(lease.end_date).toLocaleDateString()}
                  </p>
                </div>
              </div>
              {deposit <= 0 && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  This lease has no security deposit on record. You can still document deductions,
                  but the refund math will start from $0 — fix the lease record first if a deposit was collected.
                </p>
              )}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1" htmlFor="deposit-move-out">Move-out date</label>
                <input
                  id="deposit-move-out"
                  type="date"
                  value={moveOut}
                  onChange={(e) => setMoveOut(e.target.value)}
                  className={inputClass}
                />
                <p className="text-[11px] text-mute mt-1">The day the tenant returned possession — the statutory clock runs from here.</p>
              </div>
              {deadlineCard}
            </>
          )}

          {/* ── Step 2 — itemized deductions ── */}
          {step === 2 && (
            <>
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2.5">
                <Scale className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" strokeWidth={1.75} />
                <p className="text-sm text-amber-900">
                  {rule?.wearAndTearNote ?? 'Most states do not allow deductions for ordinary wear and tear — faded paint, worn carpet, and routine cleaning from normal use generally can’t be charged. Check your state’s statute.'}
                </p>
              </div>

              {/* Suggestions from the move-in vs move-out inspection diff */}
              {suggestions.length > 0 && (
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-amber-600" strokeWidth={1.75} />
                    <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide flex-1">
                      From your inspection comparison
                    </p>
                    <Link
                      to={`/manager/lease/${lease.id}/inspection-compare`}
                      className="text-[11px] font-medium text-brand-600 hover:underline"
                    >
                      Open comparison
                    </Link>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {suggestions.map((s) => {
                      const added = addedKeys.has(s.key)
                      return (
                        <div key={s.key} className="px-3 py-2.5 flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-ink">{s.room} — {s.item}</p>
                            <p className="text-xs text-mute mt-0.5">
                              {s.fromCondition} at move-in → <span className="font-medium text-amber-700">{s.toCondition}</span> at move-out
                              {s.notes ? ` · ${s.notes}` : ''}
                            </p>
                            {s.photoPaths.length > 0 && (
                              <div className="flex gap-1.5 mt-1.5 flex-wrap items-start">
                                {s.photoPaths.slice(0, 4).map((path) => (
                                  <div key={path} className="flex flex-col gap-1">
                                    {photoUrls[path]
                                      ? <a href={photoUrls[path]} target="_blank" rel="noopener noreferrer" className="block w-10 h-10 rounded-md overflow-hidden border border-gray-200" title="Move-out photo">
                                          <img src={photoUrls[path]} alt="" className="w-full h-full object-cover" />
                                        </a>
                                      : <span className="w-10 h-10 rounded-md border border-gray-200 bg-gray-100 flex items-center justify-center"><Camera className="w-3.5 h-3.5 text-mute-400" strokeWidth={1.5} /></span>}
                                    <PhotoVerifyBadge record={hashRecords[path]} />
                                  </div>
                                ))}
                                {s.photoPaths.length > 4 && <span className="text-[11px] text-mute self-center">+{s.photoPaths.length - 4} photos</span>}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => addSuggestion(s)}
                            disabled={added}
                            className={`shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg ${
                              added ? 'bg-gray-100 text-mute cursor-default' : 'bg-brand-600 text-white hover:bg-brand-700'
                            }`}
                          >
                            {added ? 'Added' : <><Plus className="w-3.5 h-3.5" strokeWidth={2} /> Add</>}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {!hasComparison && (
                <p className="text-xs text-mute">
                  No completed move-in + move-out inspection pair for this lease, so there are no suggested
                  deductions — photo-documented inspections are what make deductions defensible.{' '}
                  <Link to={`/manager/lease/${lease.id}/inspection/move_out`} className="text-brand-600 hover:underline">Start a move-out inspection</Link>
                </p>
              )}

              {/* Line items */}
              <div className="space-y-2">
                {lines.map((l) => (
                  <div key={l.id} className="rounded-xl border border-gray-200 p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <input
                        value={l.description}
                        onChange={(e) => patchLine(l.id, { description: e.target.value })}
                        placeholder="What it was for — e.g. Bedroom carpet burn repair"
                        className={inputClass}
                        aria-label="Deduction description"
                      />
                      <button type="button" onClick={() => removeLine(l.id)} aria-label="Remove deduction" className="p-2 rounded-lg text-mute hover:text-red-600 hover:bg-red-50 shrink-0">
                        <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <select
                        value={l.category}
                        onChange={(e) => patchLine(l.id, { category: e.target.value as DeductionCategory })}
                        className={selectClass + ' flex-1'}
                        aria-label="Deduction category"
                      >
                        {DEDUCTION_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                      <div className="relative w-32 shrink-0">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-mute">$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={l.amount || ''}
                          onChange={(e) => patchLine(l.id, { amount: Number(e.target.value) })}
                          className={inputClass + ' pl-6'}
                          aria-label="Deduction amount"
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addBlankLine}
                  className="w-full rounded-xl border-2 border-dashed border-gray-200 px-3 py-2.5 text-sm text-mute hover:border-brand-400 hover:text-brand-600 inline-flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" strokeWidth={1.75} /> Add a deduction
                </button>
                {lines.length === 0 && (
                  <p className="text-xs text-mute text-center">No deductions means a full refund — that's a perfectly good outcome. You still send the letter.</p>
                )}
                {lineError && <p className="text-xs text-red-600">{lineError}</p>}
              </div>

              {/* Running math */}
              <div className="rounded-xl bg-gray-50 px-3 py-2.5 flex items-center justify-between text-sm tabular-nums">
                <span className="text-mute">{usd(math.deposit)} deposit − {usd(math.totalDeductions)} deductions</span>
                <span className={`font-bold ${math.balanceOwed > 0 ? 'text-red-600' : 'text-ink'}`}>
                  {math.balanceOwed > 0 ? `${usd(math.balanceOwed)} owed to you` : `${usd(math.refund)} refund`}
                </span>
              </div>
            </>
          )}

          {/* ── Step 3 — summary + forwarding address + generate ── */}
          {step === 3 && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <SummaryStat label="Deposit" value={usd(math.deposit)} />
                <SummaryStat label={`Deductions (${lines.length})`} value={usd(math.totalDeductions)} />
                {math.balanceOwed > 0
                  ? <SummaryStat label="Tenant owes" value={usd(math.balanceOwed)} tone="red" />
                  : <SummaryStat label="Refund" value={usd(math.refund)} tone="brand" />}
              </div>
              {deadlineCard}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1" htmlFor="deposit-forwarding">Tenant's forwarding address (optional)</label>
                <textarea
                  id="deposit-forwarding"
                  rows={2}
                  value={forwarding}
                  onChange={(e) => setForwarding(e.target.value)}
                  placeholder="Where the refund check is going"
                  className={inputClass}
                />
                <p className="text-[11px] text-mute mt-1">
                  {rule?.forwardingAddressMatters
                    ? `Under ${rule.statuteCite}, the return runs from the end of the tenancy once the tenant provides a forwarding address — record it here so it's on the letter.`
                    : 'Recording where the refund went keeps the paper trail complete.'}
                </p>
              </div>
              {!gate.supported && (
                <div className={`rounded-xl border p-3 text-sm ${gate.restricted ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
                  {gate.message}
                </div>
              )}
              <p className="text-xs text-mute">
                Next you'll review the itemization letter before anything is sent — general information, not legal advice.
              </p>
            </>
          )}
        </div>

        {/* Footer nav */}
        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
          {step > 1 ? (
            <button onClick={() => setStep((s) => (s === 3 ? 2 : 1))} className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink px-3 py-2">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} /> Back
            </button>
          ) : <span />}
          {step < 3 ? (
            <button
              onClick={() => {
                if (step === 2 && !validateLines()) return
                if (step === 1 && !moveOut) { toast.error('Pick the move-out date first'); return }
                setStep((s) => (s === 1 ? 2 : 3))
              }}
              className="inline-flex items-center gap-1.5 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
            >
              Continue <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </button>
          ) : (
            <button
              onClick={generateLetter}
              disabled={!gate.supported}
              className="inline-flex items-center gap-1.5 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-40"
              title={gate.supported ? 'Open the pre-filled itemization letter for review' : gate.message}
            >
              <FileText className="w-4 h-4" strokeWidth={1.75} /> Generate itemization letter
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryStat({ label, value, tone }: { label: string; value: string; tone?: 'brand' | 'red' }) {
  const cls = tone === 'brand' ? 'bg-brand-50 border-brand-200 text-brand-700'
    : tone === 'red' ? 'bg-red-50 border-red-200 text-red-700'
    : 'bg-gray-50 border-gray-200 text-ink'
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${cls}`}>
      <p className="text-[11px] uppercase tracking-wide text-mute">{label}</p>
      <p className="text-lg font-bold mt-0.5 tabular-nums">{value}</p>
    </div>
  )
}

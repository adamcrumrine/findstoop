// Renew lease — the manager-facing renewal flow. Opened from a lease card or
// the Renewal advisor, never from "+ Add": a renewal isn't a new lease to set
// up from scratch, it's the current one carried forward. The modal asks only
// what changes (term, rent, who's staying, shares) and copies the rest, then
// drops the manager on the review page to send it for signature.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Loader2, RefreshCw, AlertTriangle } from 'lucide-react'
import type { LeaseWithTenant } from '@findstoop/shared/hooks/useLeases'
import type { Profile } from '@findstoop/shared/types/profile'
import { supabase } from '../../lib/supabase'
import ModalShell from '../shared/ModalShell'
import Avatar from '../shared/Avatar'
import {
  RENEWAL_TERM_OPTIONS, renewalDates, termEnd, shareSummary, scaleShares,
  buildRenewalLease, type RenewalTenantRow,
} from '../../lib/leaseRenewal'

interface Props {
  lease: LeaseWithTenant
  propertyName: string
  unitNumber: string
  onClose: () => void
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'
const money = (n: number) => '$' + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function RenewLeaseModal({ lease, propertyName, unitNumber, onClose }: Props) {
  const navigate = useNavigate()
  const current = lease as unknown as Record<string, unknown>
  const currentRent = Number(lease.rent_amount)
  const selfServe = current.rent_split_mode === 'self_serve'
  const currentPetFee = current.monthly_pet_fee != null ? Number(current.monthly_pet_fee) : null

  const defaults = useMemo(
    () => renewalDates(lease.end_date, new Date().toISOString().slice(0, 10)),
    [lease.end_date],
  )
  const [start, setStart] = useState(defaults.start)
  const [months, setMonths] = useState<number | 'custom'>(12)
  const [customEnd, setCustomEnd] = useState(defaults.end)
  const end = months === 'custom' ? customEnd : (start ? termEnd(start, months) : '')

  const [rent, setRent] = useState(String(currentRent))
  const [petFee, setPetFee] = useState(currentPetFee ? String(currentPetFee) : '')

  // Junction rows carry each tenant's order, share and fee flag.
  const [rows, setRows] = useState<RenewalTenantRow[] | null>(null)
  const [staying, setStaying] = useState<Record<string, boolean>>({})
  const [shares, setShares] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const profilesById = useMemo(() => {
    const m = new Map<string, Profile>()
    for (const p of lease.all_tenants ?? []) m.set(p.id, p)
    if (lease.profile) m.set(lease.profile.id, lease.profile)
    return m
  }, [lease])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('lease_tenants')
        .select('tenant_id, is_primary, sort_order, rent_share, landlord_absorbs_fees')
        .eq('lease_id', lease.id)
      if (cancelled) return
      if (error) { toast.error('Could not load the tenants on this lease'); return }
      const list = ((data ?? []) as RenewalTenantRow[])
        .filter((r) => r.is_primary)
        .sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99))
      // A legacy lease with no junction rows still has its primary pointer.
      const effective = list.length > 0 ? list : [{
        tenant_id: lease.tenant_id, is_primary: true, sort_order: 0, rent_share: null, landlord_absorbs_fees: false,
      }]
      setRows(effective)
      setStaying(Object.fromEntries(effective.map((r) => [r.tenant_id, true])))
      setShares(Object.fromEntries(effective.map((r) => [r.tenant_id, r.rent_share != null ? String(r.rent_share) : ''])))
    })()
    return () => { cancelled = true }
  }, [lease.id, lease.tenant_id])

  const stayingRows = (rows ?? []).filter((r) => staying[r.tenant_id])
  const rentNum = Number(rent)
  const rentDelta = Number.isFinite(rentNum) ? rentNum - currentRent : 0
  const shareValues = stayingRows.map((r) => (shares[r.tenant_id]?.trim() ? Number(shares[r.tenant_id]) : null))
  const summary = shareSummary(shareValues, rentNum || 0)
  const nameOf = (id: string) => {
    const p = profilesById.get(id)
    return p?.full_name ?? p?.email ?? 'Tenant'
  }
  const remainderNames = stayingRows.filter((_, i) => shareValues[i] == null).map((r) => nameOf(r.tenant_id))
  const sharesUnchanged = stayingRows.every((r) => {
    const orig = rows?.find((x) => x.tenant_id === r.tenant_id)?.rent_share ?? null
    const now = shares[r.tenant_id]?.trim() ? Number(shares[r.tenant_id]) : null
    return orig === now
  })
  const hasFixedShares = selfServe && shareValues.some((s) => s != null)

  const applyScaling = () => {
    const scaled = scaleShares(shareValues, currentRent, rentNum)
    setShares((prev) => {
      const next = { ...prev }
      stayingRows.forEach((r, i) => { next[r.tenant_id] = scaled[i] != null ? String(scaled[i]) : '' })
      return next
    })
  }

  const validate = (): string | null => {
    if (!rows) return 'Still loading tenants'
    if (stayingRows.length === 0) return 'At least one tenant has to renew'
    if (!start || !end) return 'Set the new term dates'
    if (start <= lease.start_date) return 'The renewal has to start after the current lease'
    if (end <= start) return 'End date must be after the start date'
    if (!Number.isFinite(rentNum) || rentNum <= 0) return 'Enter the new monthly rent'
    if (selfServe && summary.over) return `Fixed shares add up to ${money(summary.assigned)} — more than the ${money(rentNum)} rent`
    if (selfServe && summary.gap) return `Shares add up to ${money(summary.assigned)}, not the ${money(rentNum)} rent — adjust one or leave one blank to cover the rest`
    return null
  }

  const handleCreate = async () => {
    const err = validate()
    if (err) { toast.error(err); return }
    setSubmitting(true)
    try {
      const tenants: RenewalTenantRow[] = stayingRows.map((r, i) => ({
        ...r,
        sort_order: i,
        rent_share: selfServe ? shareValues[i] : null,
      }))
      const pet = petFee.trim() ? Number(petFee) : null
      // Id minted client-side and no read-back: RETURNING is checked against
      // the SELECT policy, whose lease-id lookup can't see the row inside its
      // own INSERT — so insert().select() is rejected for managers.
      const created = { id: crypto.randomUUID() }
      const { error: insErr } = await supabase
        .from('leases')
        .insert({ id: created.id, ...buildRenewalLease(current, { start, end, rent: rentNum, petFee: pet && pet > 0 ? pet : null, tenants }) })
      if (insErr) throw insErr

      const { error: ltErr } = await supabase.from('lease_tenants').upsert(
        tenants.map((t) => ({
          lease_id: created.id,
          tenant_id: t.tenant_id,
          is_primary: true,
          sort_order: t.sort_order,
          rent_share: t.rent_share,
          landlord_absorbs_fees: t.landlord_absorbs_fees,
        })),
        { onConflict: 'lease_id,tenant_id' },
      )
      if (ltErr) {
        // Don't leave a half-built renewal with no tenants behind.
        await supabase.from('leases').delete().eq('id', created.id)
        throw ltErr
      }

      toast.success('Renewal drafted — review it and send for signature')
      navigate(`/manager/review-lease/${created.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create the renewal')
      setSubmitting(false)
    }
  }

  const carryOver: Array<[string, string]> = [
    ['Security deposit', lease.security_deposit ? `${money(Number(lease.security_deposit))} — already held, not collected again` : 'None'],
    ['Rent due', `Day ${current.payment_due_day ?? 1} of each month`],
    ...(current.is_student ? [['Student lease', 'On'] as [string, string]] : []),
    ...(current.property_built_before_1978 ? [['Lead-paint disclosure', 'Built before 1978 — disclosure re-attached'] as [string, string]] : []),
    ...(lease.utility_notes ? [['Utilities', lease.utility_notes] as [string, string]] : []),
  ]

  return (
    <ModalShell onClose={() => { if (!submitting) onClose() }} maxWidth="max-w-xl" aria-label="Renew lease">
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-brand-600" strokeWidth={1.75} />
            <h2 className="font-semibold text-ink">Renew lease</h2>
          </div>
          <p className="text-xs text-mute mt-0.5 truncate">{propertyName} — Unit {unitNumber}</p>
        </div>
        <button onClick={onClose} disabled={submitting} aria-label="Close" className="p-2.5 -m-2.5 rounded-lg text-mute hover:text-ink text-xl leading-none">×</button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-5 space-y-5">
        <p className="text-sm text-mute">
          Current lease: {fmtDate(lease.start_date)} – {fmtDate(lease.end_date)} at {money(currentRent)}/mo.
          Set the new term and rent; everything else carries over.
        </p>

        {/* New term */}
        <section className="space-y-2">
          <h3 className="text-xs uppercase tracking-wider text-mute font-semibold">New term</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="block text-xs text-mute mb-1">Starts</span>
              <input type="date" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="block">
              <span className="block text-xs text-mute mb-1">Length</span>
              <select
                className={inputCls}
                value={String(months)}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === 'custom') { setCustomEnd(end); setMonths('custom') } else setMonths(Number(v))
                }}
              >
                {RENEWAL_TERM_OPTIONS.map((m) => <option key={m} value={m}>{m} months</option>)}
                <option value="custom">Custom end date</option>
              </select>
            </label>
            <label className="block">
              <span className="block text-xs text-mute mb-1">Ends</span>
              <input
                type="date"
                className={inputCls}
                value={end}
                onChange={(e) => { setCustomEnd(e.target.value); setMonths('custom') }}
              />
            </label>
          </div>
        </section>

        {/* Rent */}
        <section className="space-y-2">
          <h3 className="text-xs uppercase tracking-wider text-mute font-semibold">Monthly rent</h3>
          <div className="flex items-center gap-3">
            <div className="relative w-40">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-mute">$</span>
              <input
                type="number" inputMode="decimal" min="0" step="0.01"
                className={`${inputCls} pl-6`}
                value={rent}
                onChange={(e) => setRent(e.target.value)}
              />
            </div>
            {rentDelta !== 0 && Number.isFinite(rentNum) && rentNum > 0 && (
              <span className={`text-xs font-medium ${rentDelta > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                {rentDelta > 0 ? '+' : '−'}{money(Math.abs(rentDelta))} ({rentDelta > 0 ? '+' : '−'}{Math.abs((rentDelta / currentRent) * 100).toFixed(1)}%) vs. now
              </span>
            )}
          </div>
        </section>

        {/* Tenants + shares */}
        <section className="space-y-2">
          <h3 className="text-xs uppercase tracking-wider text-mute font-semibold">Who’s renewing</h3>
          {!rows ? (
            <div className="flex items-center gap-2 text-sm text-mute"><Loader2 className="w-4 h-4 animate-spin" /> Loading tenants…</div>
          ) : (
            <>
              <div className="space-y-2">
                {rows.map((r) => {
                  const p = profilesById.get(r.tenant_id)
                  const on = !!staying[r.tenant_id]
                  return (
                    <div key={r.tenant_id} className={`flex items-center gap-3 border rounded-lg px-3 py-2 ${on ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => setStaying((s) => ({ ...s, [r.tenant_id]: e.target.checked }))}
                        aria-label={`${nameOf(r.tenant_id)} is renewing`}
                      />
                      <Avatar name={p?.full_name} email={p?.email} url={p?.avatar_url} size={28} />
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-medium truncate ${on ? 'text-ink' : 'text-mute line-through'}`}>{nameOf(r.tenant_id)}</p>
                        {p?.email && <p className="text-xs text-mute truncate">{p.email}</p>}
                      </div>
                      {selfServe && on && (
                        <div className="relative w-28 shrink-0">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-mute">$</span>
                          <input
                            type="number" inputMode="decimal" min="0" step="0.01"
                            className="w-full pl-5 pr-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                            placeholder="Remainder"
                            value={shares[r.tenant_id] ?? ''}
                            onChange={(e) => setShares((s) => ({ ...s, [r.tenant_id]: e.target.value }))}
                            aria-label={`${nameOf(r.tenant_id)}'s rent share`}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {stayingRows.length > 0 && rentNum > 0 && (
                selfServe ? (
                  <div className="text-xs text-mute space-y-1.5">
                    {summary.openCount > 0 && !summary.over && (
                      <p>
                        {remainderNames.join(', ')} {summary.openCount === 1 ? 'covers' : 'split'} the remaining{' '}
                        {money(summary.remainder)}{summary.openCount > 1 ? ` (${money(Math.round((summary.remainder / summary.openCount) * 100) / 100)} each)` : ''}.
                      </p>
                    )}
                    {hasFixedShares && sharesUnchanged && rentDelta !== 0 && summary.openCount > 0 && (
                      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-amber-900">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} />
                        <div>
                          <p>
                            Rent {rentDelta > 0 ? 'goes up' : 'goes down'} {money(Math.abs(rentDelta))}, and with the shares as they are
                            the whole change lands on {remainderNames.join(', ')}.
                          </p>
                          <button type="button" onClick={applyScaling} className="mt-1 font-medium text-brand-700 hover:underline">
                            Scale everyone’s share to the new rent
                          </button>
                        </div>
                      </div>
                    )}
                    {hasFixedShares && sharesUnchanged && rentDelta !== 0 && summary.openCount === 0 && (
                      <button type="button" onClick={applyScaling} className="font-medium text-brand-700 hover:underline">
                        Scale everyone’s share to the new rent
                      </button>
                    )}
                    {summary.over && <p className="text-red-600">Fixed shares add up to {money(summary.assigned)} — more than the rent.</p>}
                    {summary.gap && <p className="text-red-600">Shares add up to {money(summary.assigned)}, not {money(rentNum)}.</p>}
                  </div>
                ) : (
                  <p className="text-xs text-mute">
                    Rent splits evenly — {money(Math.round((rentNum / stayingRows.length) * 100) / 100)} each.
                  </p>
                )
              )}
              <p className="text-[11px] text-mute italic">Adding a new roommate? You can add them on the next screen.</p>
            </>
          )}
        </section>

        {/* Carries over */}
        <section className="space-y-2">
          <h3 className="text-xs uppercase tracking-wider text-mute font-semibold">Carries over</h3>
          <dl className="bg-gray-50 border border-gray-200 rounded-lg divide-y divide-gray-200 text-sm">
            {carryOver.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 px-3 py-2">
                <dt className="text-mute shrink-0">{k}</dt>
                <dd className="text-ink text-right">{v}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <dt className="text-mute shrink-0">Monthly pet fee</dt>
              <dd className="relative w-28">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-mute">$</span>
                <input
                  type="number" inputMode="decimal" min="0" step="0.01"
                  className="w-full pl-5 pr-2 py-1 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="None"
                  value={petFee}
                  onChange={(e) => setPetFee(e.target.value)}
                  aria-label="Monthly pet fee"
                />
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <footer className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-200 shrink-0">
        <button onClick={onClose} disabled={submitting} className="text-sm font-medium text-mute hover:text-ink">Cancel</button>
        <button
          onClick={handleCreate}
          disabled={submitting || !rows}
          className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />}
          Create renewal
        </button>
      </footer>
    </ModalShell>
  )
}

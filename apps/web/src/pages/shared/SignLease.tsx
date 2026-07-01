import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { syncSubscriptionQuantity } from '@findstoop/shared/api/billing'
import { supabase } from '../../lib/supabase'
import SignaturePad, { type SignaturePadHandle } from '../../components/shared/SignaturePad'
import { FileSignature, ShieldCheck, ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { BRAND } from '../../lib/brand'

interface LeaseDetail {
  id: string
  rent_amount: number
  start_date: string
  end_date: string
  security_deposit: number | null
  status: string
  signed_at: string | null
  units: {
    unit_number: string
    properties: { name: string; address: string; city: string; state: string; zip: string }
  } | null
}

interface SignatureRecord {
  id: string
  signer_role: 'manager' | 'tenant' | 'admin'
  signed_at: string
}

async function bestEffortIp(): Promise<string | null> {
  try {
    const c = new AbortController()
    const t = setTimeout(() => c.abort(), 1500)
    const res = await fetch('https://api.ipify.org?format=json', { signal: c.signal })
    clearTimeout(t)
    if (!res.ok) return null
    const data = await res.json()
    return typeof data?.ip === 'string' ? data.ip : null
  } catch {
    return null
  }
}

export default function SignLease() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile, user } = useAuth()
  const padRef = useRef<SignaturePadHandle>(null)

  const [lease, setLease] = useState<LeaseDetail | null>(null)
  const [signatures, setSignatures] = useState<SignatureRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [intent, setIntent] = useState(false)
  const [hasInk, setHasInk] = useState(false)
  const [completed, setCompleted] = useState(false)
  // Per-incremental-unit billing confirmation: when a manager signs and
  // their subscription is already active, show a confirm dialog with the
  // updated monthly total before recording the signature.
  const [confirmingBilling, setConfirmingBilling] = useState(false)
  const [activeUnitCount, setActiveUnitCount] = useState<number | null>(null)
  const [subscriptionActive, setSubscriptionActive] = useState<boolean>(false)
  // After the manager signs the final signature on a lease but doesn't yet
  // have an active subscription, prompt them to set up billing — the lease
  // is now active and most platform features are paywalled.
  const [showBillingPrompt, setShowBillingPrompt] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [leaseRes, sigsRes] = await Promise.all([
        supabase
          .from('leases')
          .select('id, rent_amount, start_date, end_date, security_deposit, status, signed_at, units(unit_number, properties(name, address, city, state, zip))')
          .eq('id', id)
          .single(),
        supabase
          .from('lease_signatures')
          .select('id, signer_role, signed_at')
          .eq('lease_id', id),
      ])
      if (cancelled) return
      if (leaseRes.error) {
        toast.error('Could not load this lease')
      } else {
        setLease(leaseRes.data as unknown as LeaseDetail)
      }
      if (!sigsRes.error && sigsRes.data) {
        setSignatures(sigsRes.data as SignatureRecord[])
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [id])

  // When the signer is the manager, pre-load their active-unit count and
  // subscription status so the pre-sign confirmation modal can show the
  // accurate new monthly total.
  useEffect(() => {
    if (!user?.id || !profile) return
    if (profile.role !== 'manager' && profile.role !== 'admin') return
    let cancelled = false
    ;(async () => {
      const [unitsRes, subRes] = await Promise.all([
        supabase.rpc('count_manager_active_units', { manager_uuid: user.id }),
        supabase
          .from('profiles')
          .select('stripe_subscription_id, subscription_status')
          .eq('id', user.id)
          .maybeSingle(),
      ])
      if (cancelled) return
      setActiveUnitCount(Number(unitsRes.data ?? 0))
      const sub = subRes.data as { stripe_subscription_id?: string | null; subscription_status?: string | null } | null
      setSubscriptionActive(!!sub?.stripe_subscription_id &&
        (sub?.subscription_status === 'active' || sub?.subscription_status === 'trialing'))
    })()
    return () => { cancelled = true }
  }, [user?.id, profile?.role])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-mute">
        <Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} />
      </div>
    )
  }

  if (!lease || !profile || !user) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <p className="text-mute">Lease not found.</p>
      </div>
    )
  }

  const effectiveRole: 'manager' | 'tenant' =
    profile.role === 'tenant' ? 'tenant' : 'manager'
  const backHref = profile.role === 'tenant' ? '/tenant/dashboard' : '/manager/leases'

  const myExistingSignature = signatures.find((s) => {
    if (effectiveRole === 'tenant') return s.signer_role === 'tenant'
    return s.signer_role === 'manager' || s.signer_role === 'admin'
  })
  const counterpartySignature = signatures.find((s) => {
    if (effectiveRole === 'tenant') return s.signer_role !== 'tenant'
    return s.signer_role === 'tenant'
  })

  const alreadySigned = !!myExistingSignature
  const fullySigned = !!lease.signed_at || (signatures.some(s => s.signer_role === 'manager' || s.signer_role === 'admin') && signatures.some(s => s.signer_role === 'tenant'))

  // The actual signature insert + completion handling. Pulled out so both
  // the direct submit path (tenants) and the post-confirmation path
  // (managers, after they confirm the new monthly billing total) can call it.
  const performSignature = async () => {
    const dataUrl = padRef.current?.toDataURL()
    if (!dataUrl) {
      toast.error('Please draw your signature first')
      return
    }
    setSubmitting(true)
    const ip = await bestEffortIp()
    const { error } = await supabase.from('lease_signatures').insert({
      lease_id: lease!.id,
      signer_id: user!.id,
      signer_role: profile!.role,
      signature_data: dataUrl,
      intent_acknowledged: true,
      ip_address: ip,
      user_agent: navigator.userAgent.slice(0, 500),
    })
    setSubmitting(false)
    if (error) {
      toast.error(error.message)
      return
    }
    setCompleted(true)
    toast.success('Signature recorded')
    const isManager = profile!.role === 'manager' || profile!.role === 'admin'
    if (isManager) {
      void syncSubscriptionQuantity()
    }
    // Did this signature complete the lease? Check whether the counterparty
    // had already signed before this insert.
    const counterpartyAlreadySigned = signatures.some((s) =>
      effectiveRole === 'tenant'
        ? s.signer_role !== 'tenant'
        : s.signer_role === 'tenant',
    )
    const leaseNowActive = counterpartyAlreadySigned
    if (isManager && leaseNowActive && !subscriptionActive) {
      // Stash return URL so the user comes back here after billing setup.
      try {
        sessionStorage.setItem('findstoop:billing-return-url', `/lease/sign/${lease!.id}`)
      } catch { /* sessionStorage can throw in private mode */ }
      setShowBillingPrompt(true)
      return
    }
    setTimeout(() => navigate(backHref), 2500)
  }

  const submit = async () => {
    const dataUrl = padRef.current?.toDataURL()
    if (!dataUrl) {
      toast.error('Please draw your signature first')
      return
    }
    if (!intent) {
      toast.error('Please acknowledge the consent statement')
      return
    }
    // Manager-side signing: when their subscription is active, surface the
    // updated monthly bill (this unit's $9 added to the existing total) as
    // a confirmation step. Skip when no subscription yet (the paywall flow
    // upstream catches that case and routes to billing setup first).
    if ((profile.role === 'manager' || profile.role === 'admin') && subscriptionActive) {
      setConfirmingBilling(true)
      return
    }
    // Tenant signing, or admin without subscription, falls through directly.
    await performSignature()
  }

  const property = lease.units?.properties

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <Link to={backHref} className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink transition-colors mb-6">
        <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
        Back
      </Link>

      <header className="mb-6">
        <div className="inline-flex items-center gap-2 text-xs font-medium text-brand-700 bg-brand-50 px-3 py-1.5 rounded-full mb-3">
          <FileSignature className="w-3.5 h-3.5" strokeWidth={1.75} />
          Lease signature
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-ink tracking-tight">Sign your lease</h1>
        <p className="text-sm text-mute mt-1.5">
          {effectiveRole === 'tenant'
            ? 'Review the lease terms below and add your signature to finalize.'
            : 'Add your signature as the landlord. Tenant will sign separately.'}
        </p>
      </header>

      {/* Lease summary */}
      <section className="bg-white border border-gray-200 rounded-2xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-mute uppercase tracking-wider mb-3">Lease summary</h2>
        <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <Row label="Property">
            {property ? <span>{property.name}</span> : <span className="text-mute">—</span>}
          </Row>
          <Row label="Unit">
            <span>{lease.units?.unit_number ?? '—'}</span>
          </Row>
          <Row label="Address">
            {property ? (
              <span>{property.address}, {property.city}, {property.state} {property.zip}</span>
            ) : <span className="text-mute">—</span>}
          </Row>
          <Row label="Term">
            <span>{fmtDate(lease.start_date)} → {fmtDate(lease.end_date)}</span>
          </Row>
          <Row label="Monthly rent">
            <span className="font-semibold">${Number(lease.rent_amount).toLocaleString()}</span>
          </Row>
          <Row label="Security deposit">
            <span>{lease.security_deposit != null ? `$${Number(lease.security_deposit).toLocaleString()}` : '—'}</span>
          </Row>
        </dl>
      </section>

      {/* Signature status */}
      <section className="bg-white border border-gray-200 rounded-2xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-mute uppercase tracking-wider mb-3">Signature status</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <StatusBlock
            label="Landlord"
            signedAt={signatures.find(s => s.signer_role === 'manager' || s.signer_role === 'admin')?.signed_at}
            isMe={effectiveRole === 'manager'}
          />
          <StatusBlock
            label="Tenant"
            signedAt={signatures.find(s => s.signer_role === 'tenant')?.signed_at}
            isMe={effectiveRole === 'tenant'}
          />
        </div>
        {counterpartySignature && (
          <p className="mt-4 text-xs text-mute">
            Counterparty signed on {fmtDateTime(counterpartySignature.signed_at)}.
          </p>
        )}
      </section>

      {/* Sign or completion */}
      {fullySigned ? (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
          <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto mb-2" strokeWidth={1.5} />
          <h3 className="text-lg font-semibold text-green-800">Lease fully signed</h3>
          <p className="text-sm text-green-700 mt-1">Both parties have signed. The lease is active.</p>
        </div>
      ) : alreadySigned || completed ? (
        <div className="bg-brand-50 border border-brand-200 rounded-2xl p-6 text-center">
          <CheckCircle2 className="w-10 h-10 text-brand-600 mx-auto mb-2" strokeWidth={1.5} />
          <h3 className="text-lg font-semibold text-brand-800">You've signed</h3>
          <p className="text-sm text-brand-700 mt-1">
            Waiting on the {effectiveRole === 'tenant' ? 'landlord' : 'tenant'} to add their signature.
          </p>
        </div>
      ) : (
        <section className="bg-white border border-gray-200 rounded-2xl p-6">
          <h2 className="text-base font-semibold text-ink mb-1">Your signature</h2>
          <p className="text-sm text-mute mb-4">
            Draw your signature using your mouse or finger. We'll log the time
            and a record of your acknowledgment for your records.
          </p>

          <SignaturePad ref={padRef} height={180} name={profile.full_name} onChange={setHasInk} />

          <label className="flex items-start gap-2.5 mt-5 cursor-pointer">
            <input
              type="checkbox"
              checked={intent}
              onChange={(e) => setIntent(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
            />
            <span className="text-sm text-ink leading-relaxed">
              I consent to do business electronically and agree that the
              signature above is the legal equivalent of my handwritten signature
              on this lease.
            </span>
          </label>

          <div className="mt-2 inline-flex items-center gap-2 text-xs text-mute">
            <ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.75} />
            We log the date, your IP, and your device for the lease audit trail.
          </div>

          <button
            type="button"
            disabled={!hasInk || !intent || submitting}
            onClick={submit}
            className="mt-5 w-full inline-flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-medium px-6 py-3 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />
                Recording signature…
              </>
            ) : (
              <>Submit signature</>
            )}
          </button>
        </section>
      )}

      {/* Post-sign billing prompt: the manager just completed signing the
          lease (it's now active), but they haven't set up billing yet. The
          formatted PDF, tenant portal, and rent payments are paywalled. */}
      {showBillingPrompt && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-red-700 bg-red-50 px-2.5 py-1 rounded-full mb-3">
              <ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.75} />
              Action required
            </div>
            <h2 className="text-lg font-semibold text-ink">Your lease is active — finish setting up billing</h2>
            <p className="text-sm text-mute mt-1.5 leading-relaxed">
              The lease is signed by both parties. To unlock the formatted lease
              PDF, open the tenant's portal (rent payments, maintenance,
              documents), and collect rent through {BRAND.name}, set up your
              subscription now.
            </p>
            <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-mute">
              $9 per active unit per month, billed only on active units.
              Stripe-secured, cancel anytime.
            </div>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => { setShowBillingPrompt(false); navigate(backHref) }}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium text-mute hover:bg-gray-50"
              >
                Later
              </button>
              <button
                type="button"
                onClick={() => navigate('/manager/billing')}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium"
              >
                Set up billing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Per-incremental-unit billing confirmation (manager only). */}
      {confirmingBilling && (() => {
        const PER_UNIT = 9
        const currentUnits = activeUnitCount ?? 0
        const nextUnits = currentUnits + 1
        const newMonthly = nextUnits * PER_UNIT
        const oldMonthly = currentUnits * PER_UNIT
        return (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !submitting && setConfirmingBilling(false)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-semibold text-ink">Confirm new monthly bill</h2>
              <p className="text-sm text-mute mt-1">
                Signing this lease activates the unit. Your {BRAND.name} subscription will charge $9/unit/month on active units.
              </p>
              <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between text-mute">
                  <span>Current</span>
                  <span>${oldMonthly.toLocaleString()}/mo ({currentUnits} {currentUnits === 1 ? 'unit' : 'units'})</span>
                </div>
                <div className="flex justify-between text-ink font-semibold border-t border-gray-200 pt-1.5 mt-1.5">
                  <span>After this lease activates</span>
                  <span>${newMonthly.toLocaleString()}/mo ({nextUnits} {nextUnits === 1 ? 'unit' : 'units'})</span>
                </div>
              </div>
              <p className="text-xs text-mute mt-3 leading-relaxed">
                Stripe will prorate the increase for the current billing period. You can review billing details any time from the Billing page.
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmingBilling(false)}
                  disabled={submitting}
                  className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium text-mute hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => { setConfirmingBilling(false); await performSignature() }}
                  disabled={submitting}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  Confirm and sign
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-mute font-semibold">{label}</dt>
      <dd className="text-ink mt-0.5">{children}</dd>
    </div>
  )
}

function StatusBlock({ label, signedAt, isMe }: { label: string; signedAt?: string; isMe: boolean }) {
  const signed = !!signedAt
  return (
    <div className={`rounded-xl border p-4 ${signed ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">{label} {isMe && <span className="text-xs text-mute font-normal">(you)</span>}</p>
        {signed ? (
          <CheckCircle2 className="w-5 h-5 text-green-600" strokeWidth={1.75} />
        ) : (
          <span className="text-xs text-mute">Pending</span>
        )}
      </div>
      {signed && <p className="text-xs text-mute mt-1">Signed {fmtDateTime(signedAt!)}</p>}
    </div>
  )
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

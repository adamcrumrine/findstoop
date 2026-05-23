import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { syncSubscriptionQuantity } from '@findstoop/shared/api/billing'
import { supabase } from '../../lib/supabase'
import SignaturePad, { type SignaturePadHandle } from '../../components/shared/SignaturePad'
import { FileSignature, ShieldCheck, ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

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
    setSubmitting(true)
    const ip = await bestEffortIp()
    const { error } = await supabase.from('lease_signatures').insert({
      lease_id: lease.id,
      signer_id: user.id,
      signer_role: profile.role,
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
    // Manager-side sign may have triggered the auto-active flip if the tenant
    // had already signed. Sync subscription quantity in the background; tenant
    // signing also matters but they have no subscription to update.
    if (profile.role === 'manager' || profile.role === 'admin') {
      void syncSubscriptionQuantity()
    }
    setTimeout(() => navigate(backHref), 2500)
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

          <SignaturePad ref={padRef} height={180} onChange={setHasInk} />

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

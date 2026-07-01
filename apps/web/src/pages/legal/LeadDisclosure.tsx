// Federal Lead-Based Paint Disclosure form (24 CFR 35.92).
//
// For ANY residential property built before 1978, both parties must sign:
//   • Landlord declares known LBP / LBP hazards (or that none are known)
//   • Tenant acknowledges receipt of the pamphlet + disclosure
//   • Both sign with name + date
//
// This is the FORM. The informational pamphlet itself is at /legal/lead-paint-pamphlet.
// The bottom of the page links to the pamphlet so tenants can confirm they received it.

import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Printer, CheckCircle2, Loader2, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { BRAND } from '../../lib/brand'

interface LeaseRow {
  id: string
  start_date: string
  property_built_before_1978: boolean | null
  lead_known: boolean | null
  lead_disclosure_details: string | null
  lead_disclosure_landlord_signed_at: string | null
  lead_disclosure_landlord_signature: string | null
  lead_disclosure_tenant_signed_at: string | null
  lead_disclosure_tenant_signature: string | null
}

export default function LeadDisclosure() {
  const { leaseId } = useParams<{ leaseId: string }>()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const isManager = profile?.role === 'manager' || profile?.role === 'admin'
  const isTenant  = profile?.role === 'tenant'

  const [lease, setLease] = useState<LeaseRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Landlord-side editable fields
  const [leadKnown, setLeadKnown] = useState<'yes' | 'no'>('no')
  const [details, setDetails] = useState('')
  const [signature, setSignature] = useState('')

  useEffect(() => {
    if (!leaseId) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('leases')
        .select(`
          id, start_date, property_built_before_1978, lead_known, lead_disclosure_details,
          lead_disclosure_landlord_signed_at, lead_disclosure_landlord_signature,
          lead_disclosure_tenant_signed_at, lead_disclosure_tenant_signature
        `)
        .eq('id', leaseId)
        .single()
      if (cancelled) return
      setLease(data as LeaseRow | null)
      if (data) {
        setLeadKnown(data.lead_known ? 'yes' : 'no')
        setDetails(data.lead_disclosure_details ?? '')
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [leaseId])

  const back = isTenant ? '/tenant/documents' : '/manager/documents'

  const handleLandlordSign = async () => {
    if (!leaseId || !isManager) return
    if (signature.trim().length < 3) { toast.error('Type your full name to sign.'); return }
    setSaving(true)
    const { error } = await supabase
      .from('leases')
      .update({
        lead_known: leadKnown === 'yes',
        lead_disclosure_details: details.trim() || null,
        lead_disclosure_landlord_signed_at: new Date().toISOString(),
        lead_disclosure_landlord_signature: signature.trim(),
      })
      .eq('id', leaseId)
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Disclosure signed.')
    setLease((prev) => prev ? {
      ...prev,
      lead_known: leadKnown === 'yes',
      lead_disclosure_details: details.trim() || null,
      lead_disclosure_landlord_signed_at: new Date().toISOString(),
      lead_disclosure_landlord_signature: signature.trim(),
    } : prev)
  }

  const handleTenantSign = async () => {
    if (!leaseId || !isTenant) return
    if (signature.trim().length < 3) { toast.error('Type your full name to acknowledge.'); return }
    setSaving(true)
    const { error } = await supabase
      .from('leases')
      .update({
        lead_disclosure_tenant_signed_at: new Date().toISOString(),
        lead_disclosure_tenant_signature: signature.trim(),
      })
      .eq('id', leaseId)
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Acknowledgment recorded.')
    setLease((prev) => prev ? {
      ...prev,
      lead_disclosure_tenant_signed_at: new Date().toISOString(),
      lead_disclosure_tenant_signature: signature.trim(),
    } : prev)
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-mute" /></div>
  }
  if (!lease) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-mute">Lease not found.</p>
          <Link to={back} className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline">← Back</Link>
        </div>
      </div>
    )
  }

  // Pre-1978 gate — if the manager has explicitly set built_before_1978 = FALSE,
  // no disclosure is required.
  if (lease.property_built_before_1978 === false) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md text-center bg-white border border-gray-200 rounded-2xl p-8">
          <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-3" strokeWidth={1.5} />
          <h1 className="text-lg font-bold text-ink">Lead disclosure not required</h1>
          <p className="text-sm text-mute mt-2">This property was built after 1978, so the federal lead-based-paint disclosure does not apply.</p>
          <Link to={back} className="mt-5 inline-block text-sm font-medium text-brand-700 hover:underline">← Back</Link>
        </div>
      </div>
    )
  }

  const landlordSigned = !!lease.lead_disclosure_landlord_signed_at
  const tenantSigned   = !!lease.lead_disclosure_tenant_signed_at
  const bothSigned     = landlordSigned && tenantSigned

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="lease-pdf-toolbar sticky top-0 z-10 bg-white border-b border-gray-200 print:hidden">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => navigate(back)} className="inline-flex items-center gap-1.5 text-sm font-medium text-mute hover:text-ink">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Back
          </button>
          {bothSigned && (
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800">
              <Printer className="w-4 h-4" strokeWidth={1.75} />
              Print / Save PDF
            </button>
          )}
        </div>
      </div>

      <div className="lease-pdf-paper max-w-4xl mx-auto bg-white shadow-sm my-6 print:my-0 print:shadow-none p-10 print:p-0">
        <header className="text-center border-b border-gray-300 pb-6 mb-8">
          <p className="text-xs uppercase tracking-widest text-mute">U.S. EPA · U.S. HUD</p>
          <h1 className="mt-2 text-2xl font-bold" style={{ fontFamily: 'Georgia, serif' }}>
            Disclosure of Information on Lead-Based Paint
          </h1>
          <p className="mt-2 text-sm text-mute italic">Required for pre-1978 residential rental housing under 24 CFR 35.92</p>
        </header>

        {/* Lead warning statement */}
        <section className="bg-red-50 border border-red-200 rounded-md p-4 mb-6 text-sm" style={{ fontFamily: 'Georgia, serif' }}>
          <p className="font-semibold mb-2">Lead Warning Statement</p>
          <p>
            Housing built before 1978 may contain lead-based paint. Lead from paint, paint chips, and dust can pose
            health hazards if not managed properly. Lead exposure is especially harmful to young children and
            pregnant women. Before renting pre-1978 housing, lessors must disclose the presence of known
            lead-based paint and/or lead-based paint hazards in the dwelling. Lessees must also receive a federally
            approved pamphlet on lead poisoning prevention.
          </p>
        </section>

        {/* Landlord disclosure */}
        <section className="mb-6" style={{ fontFamily: 'Georgia, serif' }}>
          <h2 className="text-base font-semibold mb-2">Lessor's Disclosure</h2>

          {isManager && !landlordSigned ? (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium mb-1">(a) Presence of lead-based paint and/or lead-based paint hazards (check one):</p>
                <label className="flex items-start gap-2 mb-1 text-sm">
                  <input
                    type="radio"
                    name="lead_known"
                    checked={leadKnown === 'yes'}
                    onChange={() => setLeadKnown('yes')}
                    className="mt-0.5"
                  />
                  Known lead-based paint and/or lead-based paint hazards are present (explain below).
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="lead_known"
                    checked={leadKnown === 'no'}
                    onChange={() => setLeadKnown('no')}
                    className="mt-0.5"
                  />
                  I have no knowledge of lead-based paint and/or lead-based paint hazards in the housing.
                </label>
              </div>
              <div>
                <label htmlFor="lead-details" className="block text-sm font-medium mb-1">
                  (b) Records and reports available (or notes on known hazards):
                </label>
                <textarea
                  id="lead-details"
                  rows={3}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder={leadKnown === 'yes'
                    ? 'Describe known LBP, location, and any reports / abatement history.'
                    : 'Optional — note any prior inspection result, e.g. "2018 inspection found no LBP."'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-sans focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
          ) : (
            <div className="text-sm space-y-1">
              <p>
                <strong>(a)</strong>{' '}
                {lease.lead_known
                  ? 'Known lead-based paint and/or lead-based paint hazards are present.'
                  : 'No knowledge of lead-based paint or lead-paint hazards in the housing.'}
              </p>
              <p><strong>(b)</strong> {lease.lead_disclosure_details || 'No additional records or reports provided.'}</p>
            </div>
          )}
        </section>

        {/* Tenant acknowledgment */}
        <section className="mb-6" style={{ fontFamily: 'Georgia, serif' }}>
          <h2 className="text-base font-semibold mb-2">Lessee's Acknowledgment</h2>
          <ul className="list-[lower-alpha] pl-6 text-sm space-y-1">
            <li>Lessee has received copies of all information listed above.</li>
            <li>
              Lessee has received the pamphlet "Protect Your Family From Lead in Your Home"
              <Link to="/legal/lead-paint-pamphlet" target="_blank" className="ml-1 text-brand-700 hover:underline">
                (view)
              </Link>.
            </li>
            <li>Lessee acknowledges receipt of the lead warning statement above.</li>
          </ul>
        </section>

        {/* Signature block */}
        <section className="border-t border-gray-300 pt-6">
          <div className="grid sm:grid-cols-2 gap-6 text-sm">
            <SignBlock
              label="Lessor (landlord)"
              name={lease.lead_disclosure_landlord_signature}
              signedAt={lease.lead_disclosure_landlord_signed_at}
            />
            <SignBlock
              label="Lessee (tenant)"
              name={lease.lead_disclosure_tenant_signature}
              signedAt={lease.lead_disclosure_tenant_signed_at}
            />
          </div>
        </section>

        {/* Sign actions */}
        {!bothSigned && (
          <section className="mt-8 pt-6 border-t border-gray-300 print:hidden">
            {isManager && !landlordSigned && (
              <SignAction
                heading="Sign as the landlord"
                helper="Your signature confirms the disclosure above. Type your full legal name."
                signature={signature}
                setSignature={setSignature}
                onSign={handleLandlordSign}
                saving={saving}
              />
            )}
            {isTenant && !tenantSigned && landlordSigned && (
              <SignAction
                heading="Acknowledge as the tenant"
                helper="By signing you confirm receipt of this disclosure and the EPA pamphlet. Type your full legal name."
                signature={signature}
                setSignature={setSignature}
                onSign={handleTenantSign}
                saving={saving}
              />
            )}
            {isTenant && !landlordSigned && (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" strokeWidth={1.75} />
                <p className="text-sm text-amber-900">
                  Waiting for the landlord to complete the disclosure. You'll be able to sign once they do.
                </p>
              </div>
            )}
          </section>
        )}

        <div className="mt-12 pt-6 border-t border-gray-200 text-xs text-mute text-center">
          <p>Generated by {BRAND.name} · {BRAND.domain}</p>
        </div>
      </div>

      <style>{`
        @media print {
          body { background: white !important; }
          .lease-pdf-toolbar { display: none !important; }
          .lease-pdf-paper { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
          @page { margin: 0.6in; size: letter; }
        }
      `}</style>
    </div>
  )
}

function SignBlock({ label, name, signedAt }: { label: string; name: string | null; signedAt: string | null }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-mute font-semibold mb-1">{label}</p>
      <div className="border-b border-gray-400 h-8 flex items-end pb-1">
        {name ? (
          <span className="text-sm italic font-serif">{name}</span>
        ) : (
          <span className="text-xs text-mute italic">— not yet signed —</span>
        )}
      </div>
      <p className="text-[10px] text-mute mt-1">
        {signedAt ? new Date(signedAt).toLocaleString() : 'Date pending'}
      </p>
    </div>
  )
}

function SignAction({ heading, helper, signature, setSignature, onSign, saving }: {
  heading: string
  helper: string
  signature: string
  setSignature: (s: string) => void
  onSign: () => void
  saving: boolean
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <p className="text-sm font-semibold text-ink">{heading}</p>
      <p className="text-xs text-mute mt-1">{helper}</p>
      <label htmlFor="lead-disclosure-sig" className="block text-xs uppercase tracking-wider text-mute font-semibold mt-3 mb-1.5">
        Type your full legal name
      </label>
      <input
        id="lead-disclosure-sig"
        type="text"
        value={signature}
        onChange={(e) => setSignature(e.target.value)}
        placeholder="Jane A. Smith"
        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-serif italic focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
      <button
        type="button"
        onClick={onSign}
        disabled={saving || signature.trim().length < 3}
        className="mt-3 inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
        Sign
      </button>
    </div>
  )
}

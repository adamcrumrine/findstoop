// Tenant-facing document signing page (/sign-document/:id).
//
// Reuses the in-house e-signature pattern from SignLease: SignaturePad + a
// consent checkbox, recorded into generated_document_signatures with IP +
// user agent for the ESIGN audit trail. A DB trigger flips the document to
// 'signed' and logs the event. Single-signer (the addressed tenant).

import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { getDocumentForView, getDocumentSignatures, logEvent, type DocViewBundle } from '@findstoop/shared/api/generatedDocuments'
import Letterhead from '../../components/documents/Letterhead'
import DocPageShell from '../../components/documents/DocPageShell'
import DisclaimerBanner from '../../components/documents/DisclaimerBanner'
import SignaturePad, { type SignaturePadHandle } from '../../components/shared/SignaturePad'
import { Loader2, ShieldCheck, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { applyLandlordBrand, clearLandlordBrand } from '../../lib/landlordBrand'
import { useLandlordBranding } from '../../hooks/useLandlordBranding'

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

export default function SignDocument() {
  const { id } = useParams<{ id: string }>()
  const { user, profile, loading: authLoading } = useAuth()
  const padRef = useRef<SignaturePadHandle>(null)
  const opened = useRef(false)

  const [bundle, setBundle] = useState<DocViewBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [intent, setIntent] = useState(false)
  const [hasInk, setHasInk] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [progress, setProgress] = useState<{ signed: number; required: number } | null>(null)

  // The signer is an authed tenant, so their landlord's branding resolves the
  // same way as in TenantLayout (no public RPC needed). Managers previewing
  // their own document keep the build brand.
  const landlord = useLandlordBranding(profile?.role === 'tenant' ? profile.id : undefined)

  // Landlord accent color — layered over the build brand while this page is
  // mounted; cleanup restores the build palette so it never leaks elsewhere.
  useEffect(() => {
    if (!landlord?.brandColor) return
    applyLandlordBrand(landlord.brandColor)
    return () => clearLandlordBrand()
  }, [landlord?.brandColor])

  useEffect(() => {
    if (!id || authLoading) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const b = await getDocumentForView(id)
        if (cancelled) return
        setBundle(b)
        if (b && user?.id && profile?.role === 'tenant' && b.doc.tenant_id === user.id && !opened.current) {
          opened.current = true
          logEvent(id, 'opened', user.id).catch(() => {})
        }
        // Multi-party docs (addenda): show progress, and don't re-prompt a
        // signer who already signed before everyone else finishes.
        const required = ((b?.doc.meta as { required_signer_ids?: string[] })?.required_signer_ids ?? []).length
        if (b && required > 0) {
          try {
            const sigs = await getDocumentSignatures(id)
            if (cancelled) return
            setProgress({ signed: sigs.length, required })
            if (user?.id && sigs.some((s) => s.signer_id === user.id)) setCompleted(true)
          } catch { /* ignore */ }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [id, authLoading, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    const dataUrl = padRef.current?.toDataURL()
    if (!dataUrl) { toast.error('Please add your signature first'); return }
    if (!intent) { toast.error('Please acknowledge the consent statement'); return }
    if (!user || !profile) return
    setSubmitting(true)
    const ip = await bestEffortIp()
    const { error } = await supabase.from('generated_document_signatures').insert({
      document_id: id,
      signer_id: user.id,
      signer_role: profile.role,
      signature_data: dataUrl,
      intent_acknowledged: true,
      ip_address: ip,
      user_agent: navigator.userAgent.slice(0, 500),
    })
    setSubmitting(false)
    if (error) { toast.error(error.message); return }
    setCompleted(true)
    toast.success('Signature recorded')
  }

  if (authLoading || loading) {
    return <div className="flex items-center justify-center min-h-screen text-mute"><Loader2 className="w-6 h-6 animate-spin" /></div>
  }

  if (!user) {
    return (
      <DocPageShell senderName="your landlord">
        <div className="text-center py-16">
          <p className="text-ink">Please sign in to review and sign this document.</p>
          <Link to="/login/renter" className="mt-4 inline-block bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium">Sign in</Link>
        </div>
      </DocPageShell>
    )
  }

  if (!bundle || !bundle.doc.generated_body) {
    return (
      <DocPageShell senderName="your landlord" landlord={landlord}>
        <div className="text-center py-16 text-mute">This document isn't available.</div>
      </DocPageShell>
    )
  }

  const { doc, propertyName, propertyAddress, managerName, managerEmail } = bundle
  const alreadySigned = doc.status === 'signed' || completed

  return (
    <DocPageShell senderName={managerName} propertyAddress={propertyName} contactEmail={managerEmail} landlord={landlord}>
      <div className="space-y-4">
        <DisclaimerBanner />

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 sm:px-10 py-10">
          <Letterhead reference={doc.title} propertyAddress={propertyAddress} bodyHtml={doc.generated_body ?? ''} />
        </div>

        {alreadySigned ? (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
            <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto mb-2" strokeWidth={1.5} />
            <h3 className="text-lg font-semibold text-green-800">You've signed</h3>
            <p className="text-sm text-green-700 mt-1">
              {progress && doc.status !== 'signed'
                ? 'Your signature is recorded. This takes effect once every party has signed.'
                : 'Thanks — your landlord has a record of your signature.'}
            </p>
            <a
              href={`/document-print/${doc.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline"
            >
              Download a copy
            </a>
          </div>
        ) : (
          <section className="bg-white border border-gray-200 rounded-2xl p-6">
            <h2 className="text-base font-semibold text-ink mb-1">Your signature</h2>
            <p className="text-sm text-mute mb-4">
              Draw your signature with your mouse or finger. We'll log the time and your acknowledgment for the record.
            </p>

            <SignaturePad ref={padRef} height={180} name={profile?.full_name} onChange={setHasInk} />

            <label className="flex items-start gap-2.5 mt-5 cursor-pointer">
              <input
                type="checkbox"
                checked={intent}
                onChange={(e) => setIntent(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
              />
              <span className="text-sm text-ink leading-relaxed">
                I consent to do business electronically and agree that the signature above is the legal
                equivalent of my handwritten signature on this document.
              </span>
            </label>

            <div className="mt-2 inline-flex items-center gap-2 text-xs text-mute">
              <ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.75} />
              We log the date, your IP, and your device for the audit trail.
            </div>

            <button
              type="button"
              disabled={!hasInk || !intent || submitting}
              onClick={submit}
              className="mt-5 w-full inline-flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-medium px-6 py-3 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? (<><Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} /> Recording signature…</>) : 'Submit signature'}
            </button>
          </section>
        )}
      </div>
    </DocPageShell>
  )
}

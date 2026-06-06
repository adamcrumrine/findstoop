// Create a lease addendum (manager).
//
// The manager writes the amendment, signs it in-app, and every primary tenant
// gets an email link to sign. The addendum only becomes binding once all
// parties have signed (multi-party finalize). Reuses the generated_documents
// pipeline + the shared Letterhead for a branded, print-ready record.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getLeaseDocContext, getLeaseSigners, buildDocumentContext, createAddendum,
  type LeaseDocBundle, type LeaseSigner,
} from '@findstoop/shared/api/generatedDocuments'
import { renderAddendumLetter } from '@findstoop/shared/lib/documentTemplates/addendum'
import Modal from '../shared/Modal'
import FormField, { inputClass } from '../shared/FormField'
import Letterhead from '../documents/Letterhead'
import SignaturePad, { type SignaturePadHandle } from '../shared/SignaturePad'
import { Loader2, ShieldCheck, Users } from 'lucide-react'
import toast from 'react-hot-toast'

const todayIso = () => new Date().toISOString().slice(0, 10)

export default function CreateAddendumModal({
  leaseId, open, onClose, onCreated,
}: {
  leaseId: string
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const padRef = useRef<SignaturePadHandle>(null)
  const [bundle, setBundle] = useState<LeaseDocBundle | null>(null)
  const [manager, setManager] = useState<LeaseSigner | null>(null)
  const [primaries, setPrimaries] = useState<LeaseSigner[]>([])
  const [loading, setLoading] = useState(true)

  const [title, setTitle] = useState('')
  const [effectiveDate, setEffectiveDate] = useState(todayIso())
  const [body, setBody] = useState('')
  const [hasInk, setHasInk] = useState(false)
  const [intent, setIntent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    Promise.all([getLeaseDocContext(leaseId), getLeaseSigners(leaseId)])
      .then(([b, s]) => {
        if (cancelled) return
        setBundle(b)
        setManager(s.manager)
        setPrimaries(s.primaries)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, leaseId])

  const tenantNames = primaries.map((p) => p.name).join(', ')

  const bodyHtml = useMemo(() => {
    if (!bundle) return ''
    const ctx = buildDocumentContext(bundle.source, {
      title: title || 'Lease Addendum',
      effective_date: effectiveDate,
      body: body || '…',
      tenant_names: tenantNames,
    })
    return renderAddendumLetter(ctx)
  }, [bundle, title, effectiveDate, body, tenantNames])

  const submit = async () => {
    if (!bundle || !manager) return
    if (!title.trim()) { toast.error('Give the addendum a title'); return }
    if (!body.trim()) { toast.error('Describe what is changing'); return }
    if (primaries.length === 0) { toast.error('This lease has no tenant to sign'); return }
    const dataUrl = padRef.current?.toDataURL()
    if (!dataUrl) { toast.error('Add your signature first'); return }
    if (!intent) { toast.error('Acknowledge the consent statement'); return }
    setSubmitting(true)
    try {
      await createAddendum({
        bundle,
        title: title.trim(),
        effectiveDate,
        body: body.trim(),
        generatedBody: bodyHtml,
        manager,
        managerSignatureData: dataUrl,
        primaries,
      })
      toast.success(`Addendum sent to ${primaries.length} ${primaries.length === 1 ? 'tenant' : 'tenants'} to sign`)
      onCreated()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create the addendum')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create a lease addendum">
      {loading ? (
        <div className="flex justify-center py-12 text-mute"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <div className="space-y-4">
          <div className="bg-brand-50 border border-brand-100 rounded-lg px-3 py-2.5 flex items-start gap-2 text-xs text-brand-900">
            <Users className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} />
            <span>
              Once you sign, this goes to {primaries.length > 0 ? <strong>{tenantNames}</strong> : 'the tenant(s)'} to e-sign.
              It becomes part of the lease only after <strong>everyone</strong> signs.
            </span>
          </div>

          <FormField label="Addendum title" required>
            <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Rent Adjustment Addendum" />
          </FormField>
          <FormField label="Effective date" required>
            <input type="date" className={inputClass} value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
          </FormField>
          <FormField label="What is changing" required>
            <textarea rows={4} className={inputClass} value={body} onChange={(e) => setBody(e.target.value)}
              placeholder="Describe the exact change to the lease — e.g. 'Effective Aug 1, 2026, monthly rent increases from $1,900 to $1,975. All other terms unchanged.'" />
          </FormField>

          {/* Live preview */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-mute font-semibold mb-1.5">Preview</p>
            <div className="border border-gray-200 rounded-xl bg-white px-5 py-6 max-h-72 overflow-y-auto">
              <Letterhead reference={title || 'Lease Addendum'} propertyAddress={bundle ? [bundle.source.property_address, `${bundle.source.city}, ${bundle.source.state} ${bundle.source.zip}`].filter(Boolean).join(', ') : ''} bodyHtml={bodyHtml} />
            </div>
          </div>

          {/* Manager signature */}
          <div>
            <p className="text-sm font-semibold text-ink mb-1">Your signature</p>
            <p className="text-xs text-mute mb-2">Sign as the landlord. We log the time and your device for the record.</p>
            <SignaturePad ref={padRef} height={150} name={manager?.name} onChange={setHasInk} />
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" checked={intent} onChange={(e) => setIntent(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500" />
            <span className="text-sm text-ink leading-relaxed">
              I consent to do business electronically and agree this signature is the legal equivalent of my handwritten signature.
            </span>
          </label>
          <div className="inline-flex items-center gap-2 text-xs text-mute">
            <ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.75} /> We log the date, IP, and device for every signer.
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={submitting} className="px-4 py-2 text-sm text-mute hover:text-ink">Cancel</button>
            <button type="button" onClick={submit} disabled={submitting || !hasInk || !intent}
              className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-40">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Sign & send to tenants
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

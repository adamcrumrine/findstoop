// Tenant Documents → Required disclosures + insurance widget.
//
// Surfaces every federally / state-required item the tenant must complete
// post-lease-execution, with status pills and action links/buttons:
//
//   • Fair Housing notice           — informational, view+acknowledge (no LBP gate)
//   • Lead-paint pamphlet           — view-only, gated on pre-1978
//   • Lead disclosure form          — sign, gated on pre-1978 AND landlord signed
//   • Renter's insurance            — upload PDF within 90 days of lease start
//
// We pull from the lease_compliance_status view (one query) so the widget
// stays cheap to mount.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, CheckCircle2, ExternalLink, FileText, ShieldCheck, Upload, Clock, Loader2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { verifyDocMagicBytes, verifyImageMagicBytes } from '../../lib/fileValidation'

interface ComplianceRow {
  lease_id: string
  tenant_id: string
  property_built_before_1978: boolean | null
  lead_disclosure_state: 'not_set' | 'not_required' | 'landlord_pending' | 'tenant_pending' | 'signed'
  fair_housing_state: 'pending' | 'acknowledged'
  insurance_required: boolean
  insurance_proof_url: string | null
  insurance_uploaded_at: string | null
  insurance_expires_at: string | null
  insurance_due_date: string
  insurance_state: 'not_required' | 'pending' | 'uploaded' | 'expired' | 'overdue'
  insurance_days_remaining: number
}

export default function ComplianceWidget({ leaseId }: { leaseId: string }) {
  const [row, setRow] = useState<ComplianceRow | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = async () => {
    const { data } = await supabase
      .from('lease_compliance_status')
      .select('*')
      .eq('lease_id', leaseId)
      .single()
    setRow((data ?? null) as ComplianceRow | null)
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('lease_compliance_status')
        .select('*')
        .eq('lease_id', leaseId)
        .single()
      if (!cancelled) {
        setRow((data ?? null) as ComplianceRow | null)
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [leaseId])

  if (loading) return null
  if (!row) return null

  return (
    <section>
      <h2 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">
        Required disclosures
      </h2>
      <div className="space-y-2">
        {/* Fair Housing — always */}
        <DisclosureRow
          Icon={ShieldCheck}
          title="Fair Housing Notice"
          subtitle="Federal civil-rights protection summary"
          status={row.fair_housing_state === 'acknowledged'
            ? { label: 'Acknowledged', tone: 'ok' }
            : { label: 'Pending acknowledgment', tone: 'warn' }}
          to={`/legal/fair-housing-notice?lease=${row.lease_id}`}
        />

        {/* Lead pamphlet — only for pre-1978 */}
        {row.property_built_before_1978 && (
          <DisclosureRow
            Icon={FileText}
            title="EPA Lead-Paint Pamphlet"
            subtitle='"Protect Your Family From Lead in Your Home"'
            status={{ label: 'View', tone: 'info' }}
            to="/legal/lead-paint-pamphlet"
          />
        )}

        {/* Lead disclosure form — only for pre-1978 */}
        {row.property_built_before_1978 && (
          <DisclosureRow
            Icon={FileText}
            title="Lead-Based Paint Disclosure"
            subtitle={row.lead_disclosure_state === 'landlord_pending'
              ? 'Waiting for landlord to complete'
              : 'Federal disclosure for pre-1978 housing'}
            status={
              row.lead_disclosure_state === 'signed'           ? { label: 'Signed',           tone: 'ok'   } :
              row.lead_disclosure_state === 'tenant_pending'   ? { label: 'Sign now',         tone: 'warn' } :
              row.lead_disclosure_state === 'landlord_pending' ? { label: 'Landlord pending', tone: 'info' } :
                                                                  { label: 'Pending',          tone: 'warn' }
            }
            to={`/legal/lead-disclosure/${row.lease_id}`}
          />
        )}

        {/* Insurance — always unless landlord waived it */}
        {row.insurance_required && (
          <InsuranceRow row={row} onChange={reload} />
        )}
      </div>
    </section>
  )
}

// ── Generic disclosure row ────────────────────────────────────────────────
type StatusTone = 'ok' | 'warn' | 'info'
const TONE_CLS: Record<StatusTone, string> = {
  ok:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  warn: 'bg-amber-50 text-amber-700 border-amber-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
}

function DisclosureRow({ Icon, title, subtitle, status, to }: {
  Icon: typeof ShieldCheck
  title: string
  subtitle: string
  status: { label: string; tone: StatusTone }
  to: string
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 bg-white rounded-xl px-4 py-3.5 border border-gray-100 shadow-sm hover:border-brand-200 transition-colors"
    >
      <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-700 inline-flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5" strokeWidth={1.75} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
      </div>
      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${TONE_CLS[status.tone]}`}>
        {status.label}
      </span>
      <ExternalLink className="w-4 h-4 text-gray-400 shrink-0" strokeWidth={1.75} />
    </Link>
  )
}

// ── Insurance upload row ──────────────────────────────────────────────────
function InsuranceRow({ row, onChange }: { row: ComplianceRow; onChange: () => void }) {
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [carrier, setCarrier] = useState('')
  const [policyNumber, setPolicyNumber] = useState('')
  const [coverage, setCoverage] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const status = row.insurance_state === 'uploaded'  ? { label: 'On file',          tone: 'ok'   as const } :
                 row.insurance_state === 'expired'   ? { label: 'Expired — re-upload', tone: 'warn' as const } :
                 row.insurance_state === 'overdue'   ? { label: 'Overdue',          tone: 'warn' as const } :
                                                       { label: `${row.insurance_days_remaining}d left`, tone: 'info' as const }

  const handleFile = async (picked: File | null) => {
    if (!picked) { setFile(null); return }
    if (picked.size > 15 * 1024 * 1024) { toast.error('File too large — keep under 15 MB.'); return }
    // Accept PDF or image — many tenants will upload a photo of a card or
    // a screenshot from their insurer's app.
    const isPdf = await verifyDocMagicBytes(picked).then((m) => m === 'application/pdf').catch(() => false)
    const isImg = await verifyImageMagicBytes(picked).then((m) => !!m).catch(() => false)
    if (!isPdf && !isImg) { toast.error('Upload a PDF or photo of your insurance proof.'); return }
    setFile(picked)
  }

  const handleSubmit = async () => {
    if (!file) { toast.error('Pick a file first.'); return }
    setSubmitting(true)
    try {
      const ext = file.type.includes('pdf') ? 'pdf'
                : file.type.includes('png') ? 'png'
                :                              'jpg'
      const path = `${row.lease_id}/insurance-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('insurance-documents').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'application/octet-stream',
      })
      if (upErr) throw new Error(upErr.message)

      const { error: updErr } = await supabase
        .from('leases')
        .update({
          insurance_proof_url: path,
          insurance_uploaded_at: new Date().toISOString(),
          insurance_carrier:        carrier.trim() || null,
          insurance_policy_number:  policyNumber.trim() || null,
          insurance_coverage_amount: coverage ? Number(coverage) : null,
          insurance_expires_at:     expiresAt || null,
        })
        .eq('id', row.lease_id)
      if (updErr) throw new Error(updErr.message)

      toast.success('Insurance proof uploaded.')
      setOpen(false)
      setFile(null)
      onChange()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
      >
        <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-700 inline-flex items-center justify-center shrink-0">
          <ShieldCheck className="w-5 h-5" strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">Renter's Insurance</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {row.insurance_uploaded_at
              ? `Uploaded ${new Date(row.insurance_uploaded_at).toLocaleDateString()}${row.insurance_expires_at ? ` · expires ${new Date(row.insurance_expires_at).toLocaleDateString()}` : ''}`
              : `Required within 90 days of lease start (by ${new Date(row.insurance_due_date).toLocaleDateString()})`}
          </p>
        </div>
        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${TONE_CLS[status.tone]}`}>
          {status.tone === 'ok' ? <CheckCircle2 className="w-3 h-3" strokeWidth={2} /> :
            status.tone === 'warn' ? <AlertTriangle className="w-3 h-3" strokeWidth={2} /> :
            <Clock className="w-3 h-3" strokeWidth={2} />}
          {status.label}
        </span>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-3">
          <label className="block">
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/heic"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              className="sr-only"
            />
            <div className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${
              file ? 'border-brand-400 bg-brand-50/50' : 'border-gray-300 hover:border-brand-400'
            }`}>
              {file ? (
                <>
                  <CheckCircle2 className="w-6 h-6 mx-auto mb-1.5 text-brand-600" strokeWidth={1.75} />
                  <p className="text-sm font-semibold">{file.name}</p>
                  <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(0)} KB · Tap to replace</p>
                </>
              ) : (
                <>
                  <Upload className="w-6 h-6 mx-auto mb-1.5 text-gray-500" strokeWidth={1.75} />
                  <p className="text-sm font-medium">Pick a PDF or photo of your declarations page</p>
                  <p className="text-xs text-gray-500">15 MB max</p>
                </>
              )}
            </div>
          </label>

          <div className="grid sm:grid-cols-2 gap-3">
            <LabeledInput label="Carrier (optional)"      value={carrier}      onChange={setCarrier}     placeholder="State Farm" />
            <LabeledInput label="Policy # (optional)"     value={policyNumber} onChange={setPolicyNumber} placeholder="OH-12345-678" />
            <LabeledInput label="Coverage $ (optional)"   value={coverage}     onChange={setCoverage}    placeholder="100000" type="number" />
            <LabeledInput label="Expires (optional)"      value={expiresAt}    onChange={setExpiresAt}   type="date" />
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!file || submitting}
            className="w-full inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-medium px-4 py-2.5 rounded-lg text-sm"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {submitting ? 'Uploading…' : 'Submit insurance proof'}
          </button>
        </div>
      )}
    </div>
  )
}

function LabeledInput({ label, value, onChange, placeholder, type = 'text' }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </label>
  )
}

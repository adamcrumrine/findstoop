// Document Builder wizard.
//
// Four steps: pick a type → confirm prefilled details → review (the hard human
// gate) → deliver. The state gate runs before any template loads. The review
// step cannot be skipped — it's the compliance "a human looked at this" gate.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useProperties } from '@findstoop/shared/hooks/useProperties'
import { useUnits } from '@findstoop/shared/hooks/useUnits'
import { getLeasesWithTenants } from '@findstoop/shared/api/leases'
import { checkStateSupport } from '@findstoop/shared/lib/stateGate'
import {
  DOC_CATALOG, getTemplate, renderDocument,
  type DocCatalogEntry, type TemplateDef, type TemplateField,
} from '@findstoop/shared/lib/documentTemplates'
import {
  getLeaseDocContext, resolvePrefill, buildDocumentContext,
  createDraft, updateDraft, markReviewed, markSent, sendDocumentReady, advanceSeries,
  type LeaseDocBundle,
} from '@findstoop/shared/api/generatedDocuments'
import type { LateSeriesStep } from '@findstoop/shared/types/generatedDocument'
import type { DocType } from '@findstoop/shared/types/generatedDocument'
import { inputClass, selectClass } from '../../components/shared/FormField'
import Letterhead from '../../components/documents/Letterhead'
import DisclaimerBanner from '../../components/documents/DisclaimerBanner'
import toast from 'react-hot-toast'
import {
  ArrowLeft, ArrowRight, Check, Loader2, Lock, Download, Mail, FileSignature,
  TrendingUp, CalendarCheck, AlarmClock, DoorOpen, Wallet, Wrench, AlertTriangle,
  KeyRound, FolderOpen, type LucideIcon,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  TrendingUp, CalendarCheck, AlarmClock, DoorOpen, Wallet, Wrench, AlertTriangle, KeyRound, FolderOpen,
}

// Late-payment series step labels (the series card resolves to one of these).
const LATE_STEPS: Array<{ value: DocType; label: string; day: string }> = [
  { value: 'late_payment_d5', label: 'Friendly reminder', day: 'Day 5' },
  { value: 'late_payment_d10', label: 'Formal notice', day: 'Day 10' },
  { value: 'late_payment_d15', label: 'Pay or Quit', day: 'Day 15' },
]

interface Recipient {
  leaseId: string
  label: string
  state: string
  propertyId: string
  propertyName: string
  unitId: string | null
  unitLabel: string | null
  tenantId: string | null
  tenantName: string
  status: string
}

type Step = 1 | 2 | 3 | 4

export default function DocumentBuilder() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [params] = useSearchParams()

  // ── Recipients (manager's leases) ─────────────────────────────────────────
  const { properties } = useProperties(user?.id)
  const propertyIds = useMemo(() => properties.map((p) => p.id), [properties])
  const { units } = useUnits(propertyIds)
  const unitIds = useMemo(() => units.map((u) => u.id), [units])
  const [recipients, setRecipients] = useState<Recipient[]>([])

  useEffect(() => {
    if (unitIds.length === 0) { setRecipients([]); return }
    let cancelled = false
    ;(async () => {
      const leases = await getLeasesWithTenants(unitIds)
      if (cancelled) return
      const opts: Recipient[] = leases
        .filter((l) => l.status !== 'terminated')
        .map((l) => {
          const unit = units.find((u) => u.id === l.unit_id)
          const prop = properties.find((p) => p.id === unit?.property_id)
          const tenantName = l.profile?.full_name ?? l.profile?.email ?? 'Tenant'
          return {
            leaseId: l.id,
            state: prop?.state ?? '',
            propertyId: prop?.id ?? '',
            propertyName: prop?.name ?? prop?.address ?? 'Property',
            unitId: l.unit_id ?? null,
            unitLabel: unit?.unit_number ?? null,
            tenantId: l.tenant_id ?? null,
            tenantName,
            status: l.status,
            label: `${tenantName} — ${prop?.name ?? 'Property'}${unit?.unit_number ? ` · Unit ${unit.unit_number}` : ''}`,
          }
        })
      setRecipients(opts)
    })()
    return () => { cancelled = true }
  }, [unitIds.join(','), properties.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Wizard state ──────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>(1)
  const [recipientId, setRecipientId] = useState(params.get('leaseId') ?? '')
  const [catalogKey, setCatalogKey] = useState<string>(params.get('type') ?? '')
  const stepParam = params.get('step')
  const [lateStep, setLateStep] = useState<DocType>(
    stepParam === 'day10' ? 'late_payment_d10' : stepParam === 'day15' ? 'late_payment_d15' : 'late_payment_d5'
  )
  const [bundle, setBundle] = useState<LeaseDocBundle | null>(null)
  // Deep links (e.g. the Renewal advisor) can pre-seed field values via
  // `f_<key>` query params — explicit seeds win over the standard prefills.
  const [values, setValues] = useState<Record<string, string>>(() => {
    const seeded: Record<string, string> = {}
    params.forEach((v, k) => { if (k.startsWith('f_')) seeded[k.slice(2)] = v })
    return seeded
  })
  const [seeds, setSeeds] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [docId, setDocId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const recipient = recipients.find((r) => r.leaseId === recipientId) ?? null
  const gate = recipient ? checkStateSupport(recipient.state) : null

  const entry: DocCatalogEntry | undefined = DOC_CATALOG.find((c) => c.key === catalogKey)
  const docType: DocType | null = entry?.series ? lateStep : (entry?.docType ?? null)
  const template: TemplateDef | null = docType && recipient ? getTemplate(docType, recipient.state) : null

  // ── Prefill when entering step 2 ──────────────────────────────────────────
  const loadContext = async () => {
    if (!recipient) return
    setBusy(true)
    try {
      const b = await getLeaseDocContext(recipient.leaseId)
      if (!b) { toast.error("Couldn't load this tenant's details"); return }
      setBundle(b)
      const tpl = docType ? getTemplate(docType, recipient.state) : null
      const seed: Record<string, string> = {}
      tpl?.fields.forEach((f) => {
        seed[f.key] = f.prefill ? resolvePrefill(f.prefill, b.source) : (values[f.key] ?? '')
      })
      setSeeds(seed)
      setValues((prev) => ({ ...seed, ...prev })) // keep anything already typed
      setStep(2)
    } finally {
      setBusy(false)
    }
  }

  const setField = (key: string, val: string) => {
    setValues((v) => ({ ...v, [key]: val }))
    setErrors((e) => { const n = { ...e }; delete n[key]; return n })
  }

  const validate = (): boolean => {
    if (!template) return false
    const e: Record<string, string> = {}
    template.fields.forEach((f) => {
      if (f.required && !String(values[f.key] ?? '').trim()) e[f.key] = 'This field is required'
    })
    setErrors(e)
    return Object.keys(e).length === 0
  }

  // Rendered preview body for step 3.
  const previewBody = useMemo(() => {
    if (!template || !bundle) return ''
    try {
      return renderDocument(template.type, recipient!.state, buildDocumentContext(bundle.source, values))
    } catch { return '' }
  }, [template, bundle, values]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Persist on review + advance ───────────────────────────────────────────
  const confirmReview = async () => {
    if (!template || !bundle || !recipient || !user?.id) return
    setBusy(true)
    try {
      const body = renderDocument(template.type, recipient.state, buildDocumentContext(bundle.source, values))
      const meta = { recipient_name: recipient.tenantName, unit_label: recipient.unitLabel, property_name: recipient.propertyName }
      let id = docId
      if (!id) {
        const created = await createDraft({
          property_id: bundle.property_id,
          unit_id: bundle.unit_id,
          lease_id: bundle.lease_id,
          tenant_id: bundle.tenant_id,
          type: template.type,
          template_key: `${recipient.state}/${template.type}`,
          template_version: template.version,
          title: template.label,
          field_values: values,
          generated_body: body,
          requires_signature: template.requiresSignature,
          created_by: user.id,
          meta,
        })
        id = created.id
        setDocId(id)
      } else {
        await updateDraft(id, { field_values: values, generated_body: body }, user.id)
      }
      await markReviewed(id, user.id)
      setStep(4)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // When the document is a late-payment series step, record it on the series
  // and advance the pointer so the Payments banner surfaces the next step.
  const recordSeriesIfLate = async () => {
    if (!entry?.series || !bundle || !docId) return
    const step: LateSeriesStep = lateStep === 'late_payment_d10' ? 'day10' : lateStep === 'late_payment_d15' ? 'day15' : 'day5'
    await advanceSeries(bundle.lease_id, step, docId).catch(() => {})
  }

  const deliverDownload = async () => {
    if (!docId || !user?.id) return
    setBusy(true)
    try {
      await markSent(docId, 'download', user.id)
      await recordSeriesIfLate()
      window.open(`/document-print/${docId}`, '_blank', 'noopener,noreferrer')
      navigate(`/manager/documents/${docId}`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // Email / e-sign delivery — the edge function stamps sent + logs the event
  // server-side, so we don't call markSent here (it would double-log).
  const deliverVia = async (mode: 'email' | 'esign') => {
    if (!docId || !user?.id || !template) return
    setBusy(true)
    try {
      if (mode === 'esign' && !template.requiresSignature) {
        await updateDraft(docId, { requires_signature: true }, user.id)
      }
      await sendDocumentReady(docId)
      await recordSeriesIfLate()
      toast.success(mode === 'esign' ? 'Sent to the tenant for signature' : 'Emailed to the tenant')
      navigate(`/manager/documents/${docId}`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/manager/documents')} className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} /> Documents
        </button>
        <p className="text-xs uppercase tracking-wider text-mute font-semibold">Step {step} of 4</p>
      </div>

      <Stepper step={step} />

      {/* Step 1 — recipient + type */}
      {step === 1 && (
        <div className="space-y-5">
          <div>
            <p className="text-sm font-semibold text-ink mb-1.5">Who's this for?</p>
            <select value={recipientId} onChange={(e) => { setRecipientId(e.target.value); setBundle(null); setDocId(null) }} className={selectClass}>
              <option value="">Select a tenant…</option>
              {recipients.map((r) => <option key={r.leaseId} value={r.leaseId}>{r.label}</option>)}
            </select>
          </div>

          {recipient && gate && !gate.supported && (
            <div className={`rounded-xl border p-4 text-sm ${gate.restricted ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
              {gate.message}
            </div>
          )}

          <div>
            <p className="text-sm font-semibold text-ink mb-2">What do you need to send?</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {DOC_CATALOG.map((c) => {
                const Icon = ICONS[c.icon] ?? FolderOpen
                const disabled = !recipient || !gate?.supported
                const selected = catalogKey === c.key
                return (
                  <button
                    key={c.key}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (c.tool) { if (recipient) navigate(`/manager/documents/eviction-prep/${recipient.leaseId}`) }
                      else setCatalogKey(c.key)
                    }}
                    title={!recipient ? 'Pick a tenant first' : !gate?.supported ? `Not available in ${recipient?.state}` : c.tool ? 'Open eviction prep' : ''}
                    className={`text-left rounded-xl border p-3 transition-colors ${
                      selected ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                    } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <Icon className="w-5 h-5 text-brand-600 mb-1.5" strokeWidth={1.75} />
                    <p className="text-sm font-semibold text-ink leading-tight">{c.label}</p>
                    <p className="text-[11px] text-mute mt-0.5 leading-snug">{c.description}</p>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              disabled={!recipient || !gate?.supported || !entry || entry.tool || busy}
              onClick={loadContext}
              className="inline-flex items-center gap-1.5 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-40"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Continue <ArrowRight className="w-4 h-4" strokeWidth={2} /></>}
            </button>
          </div>
        </div>
      )}

      {/* Step 2 — confirm details */}
      {step === 2 && template && (
        <div className="space-y-5">
          {entry?.series && (
            <LateTimeline value={lateStep} onChange={(v) => { setLateStep(v); setDocId(null) }} />
          )}
          <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-ink">{template.label}</h2>
              <p className="text-xs text-mute mt-0.5">For {recipient?.tenantName} · {recipient?.propertyName}{recipient?.unitLabel ? ` · Unit ${recipient.unitLabel}` : ''}</p>
            </div>
            {template.fields.map((f) => {
              const isAuto = !!f.prefill && values[f.key] === seeds[f.key] && !!seeds[f.key]
              return (
                <div key={f.key}>
                  <div className="flex items-center gap-2 mb-1">
                    <label className="text-sm font-medium text-gray-700">
                      {f.label}{f.required && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                    {isAuto && <span className="text-[10px] uppercase tracking-wide bg-brand-50 text-brand-700 rounded px-1.5 py-0.5">Auto-filled</span>}
                  </div>
                  <FieldInput field={f} value={values[f.key] ?? ''} onChange={(v) => setField(f.key, v)} />
                  {f.help && !errors[f.key] && <p className="text-[11px] text-mute mt-1">{f.help}</p>}
                  {errors[f.key] && <p className="text-xs text-red-500 mt-1">{errors[f.key]}</p>}
                </div>
              )
            })}
          </div>
          {docType === 'late_payment_d15' && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <p className="text-xs uppercase tracking-wider text-amber-800 font-semibold mb-1.5">What happens after Day 15</p>
              <p className="text-sm text-amber-900 leading-relaxed">
                If {recipient?.tenantName} doesn't pay{values.cure_by ? <> by <strong>{values.cure_by}</strong></> : ''}, you may file
                for eviction (a forcible entry &amp; detainer action){values.county ? <> in the <strong>{values.county} County</strong> Municipal Court</> : ''}.
                Filing fees in Ohio are typically $100–$150.
              </p>
              <p className="text-xs text-amber-800 mt-2">
                This isn't legal advice. <a href="https://www.ohiolegalhelp.org" target="_blank" rel="noopener noreferrer" className="font-semibold underline">Ohio Legal Help</a> has a free guide and referral tool — talk to a local landlord-tenant attorney before filing.
              </p>
            </div>
          )}
          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink px-3 py-2">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} /> Back
            </button>
            <button
              onClick={() => { if (validate()) setStep(3) }}
              className="inline-flex items-center gap-1.5 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
            >
              Review <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — review (hard gate) */}
      {step === 3 && template && (
        <div className="space-y-4">
          <DisclaimerBanner />
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-8 py-10">
            <Letterhead
              reference={template.label}
              propertyAddress={[bundle?.source.property_address, `${bundle?.source.city}, ${bundle?.source.state} ${bundle?.source.zip}`].filter(Boolean).join(' · ')}
              bodyHtml={previewBody}
            />
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink px-3 py-2">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} /> Edit fields
            </button>
            <button
              onClick={confirmReview}
              disabled={busy}
              className="inline-flex items-center gap-1.5 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" strokeWidth={2} />}
              Looks good — continue
            </button>
          </div>
        </div>
      )}

      {/* Step 4 — deliver */}
      {step === 4 && template && (
        <div className="space-y-4">
          <p className="text-sm text-ink">How do you want to get this to {recipient?.tenantName}?</p>
          <div className="space-y-3">
            <DeliveryCard
              icon={Download}
              title="Download PDF"
              subtitle="Save it yourself and send however you like."
              disabled={template.deliveryRule === 'email_or_esign'}
              disabledNote="Pay or Quit notices should have a delivery record."
              onClick={deliverDownload}
              busy={busy}
            />
            <DeliveryCard
              icon={Mail}
              title="Email to tenant"
              subtitle={`We'll send it to ${recipient?.tenantName} now.`}
              onClick={() => deliverVia('email')}
              busy={busy}
            />
            <DeliveryCard
              icon={FileSignature}
              title="Request e-signature"
              subtitle="Tenant gets a signing link via email."
              onClick={() => deliverVia('esign')}
              busy={busy}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Subcomponents ─────────────────────────────────────────────────────────

function Stepper({ step }: { step: Step }) {
  const labels = ['Type', 'Details', 'Review', 'Deliver']
  return (
    <div className="flex items-center gap-2">
      {labels.map((label, i) => {
        const n = (i + 1) as Step
        const active = n === step
        const done = n < step
        return (
          <div key={label} className="flex items-center gap-2 flex-1">
            <div className={`flex items-center gap-1.5 ${active ? 'text-brand-700' : done ? 'text-brand-600' : 'text-mute'}`}>
              <span className={`w-5 h-5 rounded-full text-[11px] font-semibold flex items-center justify-center ${
                active ? 'bg-brand-600 text-white' : done ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-mute'
              }`}>{done ? '✓' : n}</span>
              <span className="text-xs font-medium hidden sm:inline">{label}</span>
            </div>
            {i < labels.length - 1 && <div className={`flex-1 h-px ${done ? 'bg-brand-300' : 'bg-gray-200'}`} />}
          </div>
        )
      })}
    </div>
  )
}

function FieldInput({ field, value, onChange }: { field: TemplateField; value: string; onChange: (v: string) => void }) {
  if (field.type === 'textarea') {
    return <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className={inputClass} />
  }
  if (field.type === 'select') {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        <option value="">Select…</option>
        {field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    )
  }
  return (
    <input
      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
      inputMode={field.type === 'number' ? 'decimal' : undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={inputClass}
    />
  )
}

function LateTimeline({ value, onChange }: { value: DocType; onChange: (v: DocType) => void }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4">
      <p className="text-xs uppercase tracking-wider text-mute font-semibold mb-2">Late-rent series</p>
      <div className="flex items-stretch gap-2">
        {LATE_STEPS.map((s, i) => {
          const active = value === s.value
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => onChange(s.value)}
              className={`flex-1 text-left rounded-lg border p-2.5 transition-colors ${
                active ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <p className="text-[10px] uppercase tracking-wide text-mute">{s.day}</p>
              <p className="text-xs font-semibold text-ink leading-tight mt-0.5">{s.label}</p>
              {i === 2 && <p className="text-[10px] text-amber-700 mt-0.5">State-specific</p>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function DeliveryCard({ icon: Icon, title, subtitle, onClick, disabled, disabledNote, comingSoon, busy }: {
  icon: LucideIcon; title: string; subtitle: string
  onClick?: () => void; disabled?: boolean; disabledNote?: string; comingSoon?: boolean; busy?: boolean
}) {
  const off = disabled || comingSoon
  return (
    <button
      type="button"
      disabled={off || busy}
      onClick={onClick}
      title={comingSoon ? 'Coming soon' : disabled ? disabledNote : ''}
      className={`w-full flex items-center gap-3 rounded-xl border p-4 text-left transition-colors ${
        off ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed' : 'border-gray-200 bg-white hover:border-brand-400 hover:bg-brand-50'
      }`}
    >
      <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0">
        {busy ? <Loader2 className="w-4 h-4 animate-spin text-brand-600" /> : <Icon className="w-5 h-5 text-brand-600" strokeWidth={1.75} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-ink">{title}</p>
          {comingSoon && <span className="text-[10px] uppercase tracking-wide bg-gray-200 text-gray-600 rounded px-1.5 py-0.5">Soon</span>}
          {disabled && !comingSoon && <Lock className="w-3 h-3 text-mute" />}
        </div>
        <p className="text-xs text-mute mt-0.5">{disabled && disabledNote ? disabledNote : subtitle}</p>
      </div>
    </button>
  )
}

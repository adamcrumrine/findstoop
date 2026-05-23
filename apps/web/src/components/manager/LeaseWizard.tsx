// Lease creation wizard with state-specific notes.
// Pulls a state-specific draft from packages/shared/src/lib/leaseTemplates
// and persists the document text + a lease row.

import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useProperties } from '@findstoop/shared/hooks/useProperties'
import { useUnits } from '@findstoop/shared/hooks/useUnits'
import { getProfileByEmail } from '@findstoop/shared/api/profiles'
import {
  SUPPORTED_STATES, generateLeaseText, getStateNotes,
} from '@findstoop/shared/lib/leaseTemplates'
import type { Property } from '@findstoop/shared/types/property'
import type { Unit } from '@findstoop/shared/types/unit'
import { Loader2, FileSignature, ChevronRight, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

interface FormState {
  property_id: string
  unit_id: string
  tenant_email: string
  tenant_name: string
  start_date: string
  end_date: string
  rent_amount: string
  security_deposit: string
  pet_deposit: string
  pets_allowed: boolean
  utility_notes: string
  payment_due_day: string
}

const emptyForm: FormState = {
  property_id: '', unit_id: '', tenant_email: '', tenant_name: '',
  start_date: '', end_date: '',
  rent_amount: '', security_deposit: '', pet_deposit: '',
  pets_allowed: false, utility_notes: '', payment_due_day: '1',
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'

export default function LeaseWizard({ open, onClose, onCreated }: Props) {
  const { profile } = useAuth()
  const { properties } = useProperties(profile?.id)
  const propertyIds = useMemo(() => properties.map((p) => p.id), [properties])
  const { units } = useUnits(propertyIds)

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [submitting, setSubmitting] = useState(false)

  const property = properties.find((p) => p.id === form.property_id)
  const unit = units.find((u) => u.id === form.unit_id)
  const filteredUnits = units.filter((u) => u.property_id === form.property_id)
  const stateCode = property?.state?.toLowerCase() ?? ''
  const notes = getStateNotes(stateCode)

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((s) => ({ ...s, [k]: v }))

  const reset = () => {
    setStep(1); setForm(emptyForm); setSubmitting(false)
  }

  const handleClose = () => {
    if (submitting) return
    reset()
    onClose()
  }

  const leaseText = useMemo(() => {
    if (!property || !unit || step !== 3) return ''
    return generateLeaseText({
      landlord_name: profile?.full_name ?? 'Landlord',
      landlord_address: profile?.company_name ?? property.name,
      tenant_name: form.tenant_name || form.tenant_email,
      tenant_email: form.tenant_email,
      property_address: property.address,
      unit_label: unit.unit_number,
      city: property.city,
      state: property.state,
      zip: property.zip,
      start_date: form.start_date,
      end_date: form.end_date,
      rent_amount: Number(form.rent_amount || 0),
      security_deposit: Number(form.security_deposit || 0),
      pet_deposit: form.pet_deposit ? Number(form.pet_deposit) : null,
      payment_due_day: Math.min(28, Math.max(1, Number(form.payment_due_day) || 1)),
      utility_notes: form.utility_notes || null,
      pets_allowed: form.pets_allowed,
    })
  }, [property, unit, form, profile, step])

  const validateStep1 = (): string | null => {
    if (!form.property_id) return 'Select a property'
    if (!form.unit_id) return 'Select a unit'
    if (!property) return 'Property not found'
    if (!getStateNotes(stateCode) && !SUPPORTED_STATES.find((s) => s.code === stateCode)) {
      // OK — we still allow generation; the generator warns.
    }
    return null
  }

  const validateStep2 = (): string | null => {
    if (!form.tenant_email.trim() || !/\S+@\S+\.\S+/.test(form.tenant_email)) return 'Valid tenant email required'
    if (!form.tenant_name.trim()) return 'Tenant name required'
    if (!form.start_date) return 'Start date required'
    if (!form.end_date) return 'End date required'
    if (form.end_date <= form.start_date) return 'End date must be after start'
    if (!form.rent_amount || Number(form.rent_amount) <= 0) return 'Valid rent required'
    return null
  }

  const handleSubmit = async () => {
    if (!property || !unit) return
    setSubmitting(true)
    try {
      const tenantProfile = await getProfileByEmail(form.tenant_email)
      if (!tenantProfile) {
        toast.error('Tenant has not registered yet. Invite them first from Tenants.')
        setSubmitting(false)
        return
      }

      // Upload document text to storage so we have a stable URL.
      const docPath = `lease-docs/${profile?.id}/${Date.now()}.txt`
      const { error: upErr } = await supabase.storage.from('user-uploads').upload(docPath, new Blob([leaseText], { type: 'text/plain' }), {
        contentType: 'text/plain', upsert: true,
      })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('user-uploads').getPublicUrl(docPath)

      const { error: insErr } = await supabase.from('leases').insert({
        unit_id: form.unit_id,
        tenant_id: tenantProfile.id,
        start_date: form.start_date,
        end_date: form.end_date,
        rent_amount: Number(form.rent_amount),
        security_deposit: form.security_deposit ? Number(form.security_deposit) : null,
        pet_deposit: form.pet_deposit ? Number(form.pet_deposit) : null,
        utility_notes: form.utility_notes || null,
        status: 'pending',
        signed_at: null,
        document_url: pub.publicUrl,
        payment_due_day: Math.min(28, Math.max(1, Number(form.payment_due_day) || 1)),
      })
      if (insErr) throw insErr

      toast.success('Lease created — ready to sign')
      onCreated()
      reset()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create lease')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto" onClick={handleClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <FileSignature className="w-4 h-4 text-brand-600" strokeWidth={1.75} />
            <h2 className="font-semibold text-ink">New lease · step {step} of 3</h2>
          </div>
          <button onClick={handleClose} disabled={submitting} className="text-mute hover:text-ink text-xl leading-none">×</button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-mute">Choose the property and unit. We'll use the property's state to pre-fill state-specific lease notes.</p>

              <Field label="Property">
                <select className={inputCls} value={form.property_id} onChange={(e) => { set('property_id', e.target.value); set('unit_id', '') }}>
                  <option value="">Select…</option>
                  {properties.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.city}, {p.state}</option>)}
                </select>
              </Field>

              <Field label="Unit">
                <select className={inputCls} value={form.unit_id} onChange={(e) => set('unit_id', e.target.value)} disabled={!form.property_id}>
                  <option value="">Select…</option>
                  {filteredUnits.map((u) => <option key={u.id} value={u.id}>Unit {u.unit_number} · ${Number(u.rent_amount).toLocaleString()}/mo</option>)}
                </select>
              </Field>

              {property && (
                <div className="bg-brand-50 border border-brand-100 rounded-lg p-3 text-xs text-brand-900">
                  <p className="font-semibold mb-1">{notes ? `${notes.name} state notes` : `${property.state.toUpperCase()} — limited state notes`}</p>
                  {notes ? (
                    <ul className="space-y-1">
                      <li>• Deposit cap: {notes.security_deposit_cap}</li>
                      <li>• Late fees: {notes.late_fee_rule}</li>
                      <li>• Termination notice: {notes.termination_notice}</li>
                    </ul>
                  ) : (
                    <p>We don't have published notes for this state yet. The generic lease will still be drafted; have it reviewed by a local attorney.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-mute">Lease terms. The tenant must already have a FindStoop account — invite them from Tenants if not.</p>
              <Field label="Tenant full name">
                <input className={inputCls} value={form.tenant_name} onChange={(e) => set('tenant_name', e.target.value)} placeholder="Jane Doe" />
              </Field>
              <Field label="Tenant email">
                <input type="email" className={inputCls} value={form.tenant_email} onChange={(e) => set('tenant_email', e.target.value)} placeholder="jane@example.com" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start date">
                  <input type="date" className={inputCls} value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
                </Field>
                <Field label="End date">
                  <input type="date" className={inputCls} value={form.end_date} onChange={(e) => set('end_date', e.target.value)} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Monthly rent ($)">
                  <input type="number" min="0" className={inputCls} value={form.rent_amount} onChange={(e) => set('rent_amount', e.target.value)} placeholder={unit ? String(unit.rent_amount) : '1500'} />
                </Field>
                <Field label="Rent due-day (1–28)">
                  <input type="number" min={1} max={28} className={inputCls} value={form.payment_due_day} onChange={(e) => set('payment_due_day', e.target.value)} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Security deposit ($)">
                  <input type="number" min="0" className={inputCls} value={form.security_deposit} onChange={(e) => set('security_deposit', e.target.value)} placeholder="0" />
                </Field>
                <Field label="Pet deposit ($)">
                  <input type="number" min="0" className={inputCls} value={form.pet_deposit} onChange={(e) => set('pet_deposit', e.target.value)} placeholder="0" />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-ink mt-1">
                <input type="checkbox" checked={form.pets_allowed} onChange={(e) => set('pets_allowed', e.target.checked)} />
                Pets allowed (with separate pet addendum)
              </label>
              <Field label="Utility notes (optional)">
                <textarea rows={2} className={inputCls} value={form.utility_notes} onChange={(e) => set('utility_notes', e.target.value)} placeholder="Water included; tenant pays electric…" />
              </Field>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} />
                <span>
                  This is original boilerplate. It is not a substitute for legal advice. Have it reviewed by a licensed attorney in the property's state before signing.
                </span>
              </div>
              <p className="text-xs text-mute">Preview of the generated lease draft. The full text is stored as a document on the lease record.</p>
              <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs font-mono text-ink whitespace-pre-wrap leading-relaxed max-h-[50vh] overflow-y-auto">{leaseText}</pre>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
          <button
            onClick={() => (step > 1 ? setStep((step - 1) as 1 | 2) : handleClose())}
            disabled={submitting}
            className="text-sm font-medium text-mute hover:text-ink"
          >
            {step > 1 ? '← Back' : 'Cancel'}
          </button>
          {step < 3 ? (
            <button
              onClick={() => {
                const err = step === 1 ? validateStep1() : validateStep2()
                if (err) { toast.error(err); return }
                setStep((step + 1) as 2 | 3)
              }}
              className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              Continue <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />}
              Create lease
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wider text-mute font-semibold mb-1.5">{label}</label>
      {children}
    </div>
  )
}

// Tree-shaking sanity: ensure types are referenced.
export type { Property, Unit }

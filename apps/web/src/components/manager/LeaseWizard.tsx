// Lease creation wizard with state-specific notes.
// Pulls a state-specific draft from packages/shared/src/lib/leaseTemplates
// and persists the document text + a lease row.

import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { BRAND } from '../../lib/brand'
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
import ModalShell from '../shared/ModalShell'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

interface PickedTenant {
  id: string
  name: string
  email: string
}

interface FormState {
  property_id: string
  unit_id: string
  // First entry is the primary tenant; additional entries are co-tenants.
  tenants: PickedTenant[]
  start_date: string
  end_date: string
  rent_amount: string
  security_deposit: string
  pet_deposit: string
  pets_allowed: boolean
  utility_notes: string
  payment_due_day: string
  use_state_template: boolean
}

const emptyForm: FormState = {
  property_id: '', unit_id: '', tenants: [],
  start_date: '', end_date: '',
  rent_amount: '', security_deposit: '', pet_deposit: '',
  pets_allowed: false, utility_notes: '', payment_due_day: '1',
  use_state_template: false,
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
  const [tenantLookupEmail, setTenantLookupEmail] = useState('')
  const [lookingUpTenant, setLookingUpTenant] = useState(false)

  const addTenantByEmail = async () => {
    const email = tenantLookupEmail.trim().toLowerCase()
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      toast.error('Enter a valid email')
      return
    }
    if (form.tenants.some((t) => t.email.toLowerCase() === email)) {
      toast.error('That tenant is already added')
      return
    }
    setLookingUpTenant(true)
    try {
      const tenantProfile = await getProfileByEmail(email)
      if (!tenantProfile) {
        toast.error(`Tenant isn't in ${BRAND.name} yet — invite them from Tenants first.`)
        return
      }
      setForm((s) => ({
        ...s,
        tenants: [
          ...s.tenants,
          { id: tenantProfile.id, name: tenantProfile.full_name ?? email, email: tenantProfile.email ?? email },
        ],
      }))
      setTenantLookupEmail('')
    } finally {
      setLookingUpTenant(false)
    }
  }

  const removeTenant = (id: string) => {
    setForm((s) => ({ ...s, tenants: s.tenants.filter((t) => t.id !== id) }))
  }

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
    if (!property || !unit || step !== 3 || !form.use_state_template) return ''
    const primary = form.tenants[0]
    return generateLeaseText({
      landlord_name: profile?.full_name ?? 'Landlord',
      landlord_entity: profile?.company_name ?? profile?.full_name ?? 'Landlord',
      landlord_phone: profile?.phone ?? null,
      landlord_email: profile?.email ?? null,
      tenant_name: primary?.name ?? primary?.email ?? '',
      tenant_email: primary?.email ?? '',
      tenants: form.tenants.map((t) => ({ name: t.name, email: t.email })),
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
    if (form.tenants.length === 0) return 'Add at least one tenant'
    if (!form.start_date) return 'Start date required'
    if (!form.end_date) return 'End date required'
    if (form.end_date <= form.start_date) return 'End date must be after start'
    if (!form.rent_amount || Number(form.rent_amount) <= 0) return 'Valid rent required'
    return null
  }

  const handleSubmit = async () => {
    if (!property || !unit) return
    if (form.tenants.length === 0) {
      toast.error('Add at least one tenant')
      return
    }
    setSubmitting(true)
    try {
      const primary = form.tenants[0]

      // Optionally upload the state-specific template as the lease document.
      let documentUrl: string | null = null
      if (form.use_state_template && leaseText) {
        const docPath = `lease-docs/${profile?.id}/${Date.now()}.txt`
        const { error: upErr } = await supabase.storage.from('user-uploads').upload(docPath, new Blob([leaseText], { type: 'text/plain' }), {
          contentType: 'text/plain', upsert: true,
        })
        if (upErr) throw upErr
        const { data: pub } = supabase.storage.from('user-uploads').getPublicUrl(docPath)
        documentUrl = pub.publicUrl
      }

      // Create the lease row. tenant_id is the primary tenant (backward
      // compat); additional co-tenants are inserted into lease_tenants.
      const { data: leaseRow, error: insErr } = await supabase.from('leases').insert({
        unit_id: form.unit_id,
        tenant_id: primary.id,
        start_date: form.start_date,
        end_date: form.end_date,
        rent_amount: Number(form.rent_amount),
        security_deposit: form.security_deposit ? Number(form.security_deposit) : null,
        pet_deposit: form.pet_deposit ? Number(form.pet_deposit) : null,
        utility_notes: form.utility_notes || null,
        status: 'pending',
        signed_at: null,
        document_url: documentUrl,
        payment_due_day: Math.min(28, Math.max(1, Number(form.payment_due_day) || 1)),
      }).select('id').single()
      if (insErr || !leaseRow) throw insErr ?? new Error('Could not create lease')

      // Insert lease_tenants rows (primary already backfilled by the
      // legacy tenant_id; explicitly upsert all rows so order + flag are
      // correct, including the primary).
      const rows = form.tenants.map((t, i) => ({
        lease_id: leaseRow.id,
        tenant_id: t.id,
        is_primary: i === 0,
        sort_order: i,
      }))
      const { error: ltErr } = await supabase.from('lease_tenants').upsert(rows, {
        onConflict: 'lease_id,tenant_id',
      })
      if (ltErr) {
        // Cross-property conflicts surface here as a CHECK violation from the
        // validation trigger. Surface a friendly message.
        if (/active or pending lease at a different property/i.test(ltErr.message)) {
          throw new Error('One of the tenants is already on an active lease at a different property. Remove them from that lease first.')
        }
        throw ltErr
      }

      toast.success(`Lease created with ${form.tenants.length} tenant${form.tenants.length > 1 ? 's' : ''} — ready to sign`)
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
    <ModalShell onClose={handleClose} maxWidth="max-w-2xl" aria-label="New lease wizard">
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2">
          <FileSignature className="w-4 h-4 text-brand-600" strokeWidth={1.75} />
          <h2 className="font-semibold text-ink">New lease · step {step} of 3</h2>
        </div>
        <button onClick={handleClose} disabled={submitting} className="text-mute hover:text-ink text-xl leading-none">×</button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-5">
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
            <p className="text-sm text-mute">Lease terms. All tenants must already be in {BRAND.name} — invite them from Tenants first if not. Add each tenant by their email below.</p>

            <Field label={`Tenants on this lease${form.tenants.length > 0 ? ` (${form.tenants.length})` : ''}`}>
              <div className="space-y-2">
                {form.tenants.length === 0 && (
                  <p className="text-xs text-mute italic">No tenants added yet.</p>
                )}
                {form.tenants.map((t, i) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink truncate">
                        {t.name}
                        {i === 0 && <span className="ml-2 text-[10px] uppercase tracking-wider text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded">Primary</span>}
                      </p>
                      <p className="text-xs text-mute truncate">{t.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeTenant(t.id)}
                      className="text-xs text-red-600 hover:text-red-700 font-medium"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input
                    type="email"
                    className={`${inputCls} flex-1`}
                    value={tenantLookupEmail}
                    onChange={(e) => setTenantLookupEmail(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTenantByEmail() } }}
                    placeholder="jane@example.com"
                    disabled={lookingUpTenant}
                  />
                  <button
                    type="button"
                    onClick={addTenantByEmail}
                    disabled={lookingUpTenant || !tenantLookupEmail.trim()}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 border border-brand-300 hover:bg-brand-50 px-3 py-2 rounded-lg disabled:opacity-50"
                  >
                    {lookingUpTenant ? 'Looking up…' : 'Add tenant'}
                  </button>
                </div>
                <p className="text-[11px] text-mute italic">
                  First tenant added becomes the primary signer. Tenants can't be on an active lease at a different property.
                </p>
              </div>
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

            <div className="border-t border-gray-100 pt-4 mt-1">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.use_state_template}
                  onChange={(e) => set('use_state_template', e.target.checked)}
                  className="mt-0.5"
                />
                <div className="text-sm">
                  <span className="font-medium text-ink">Auto-draft a state-specific lease document</span>
                  <span className="block text-xs text-mute mt-0.5">
                    Generates an original lease draft with {notes ? `${notes.name} ` : ''}state-specific notes (deposit cap, late-fee rules, required disclosures). Off by default — leave the document blank if you're using your own template.
                  </span>
                </div>
              </label>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            {form.use_state_template ? (
              <>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} />
                  <span>
                    This is original boilerplate. It is not a substitute for legal advice. Have it reviewed by a licensed attorney in the property's state before signing.
                  </span>
                </div>
                <p className="text-xs text-mute">Preview of the generated lease draft. The full text is stored as a document on the lease record.</p>
                <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs font-mono text-ink whitespace-pre-wrap leading-relaxed max-h-[50vh] overflow-y-auto">{leaseText}</pre>
              </>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-5 text-sm text-mute">
                <p className="font-medium text-ink mb-1">No lease document will be auto-generated.</p>
                <p className="text-xs leading-relaxed">
                  The lease record will be created without a document. You can attach your own
                  PDF / Word file from the lease detail later, or come back and re-create with
                  "Auto-draft a state-specific lease document" checked.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="flex items-center justify-between px-6 py-4 border-t border-gray-200 shrink-0">
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
    </ModalShell>
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

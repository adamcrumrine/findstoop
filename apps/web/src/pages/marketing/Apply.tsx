// Public rental application form. No auth required.
// Renter lands here from a landlord-shared link: /apply/:unitId

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import {
  Building2, ClipboardList, Briefcase, Users, Loader2, ArrowRight,
} from 'lucide-react'
import ScreeningFlow from '../../components/apply/ScreeningFlow'
import { useSeo } from '../../lib/useSeo'
import { BRAND } from '../../lib/brand'

interface UnitCtx {
  unit_id: string
  unit_number: string
  bedrooms: number | null
  bathrooms: number | null
  rent_amount: number
  property_name: string
  property_address: string
  property_city: string
  property_state: string
  property_zip: string
  unit_status: string
  require_selfie_screening: boolean
  require_credit_check: boolean
  require_criminal_check: boolean
  require_eviction_check: boolean
  require_credit_self_disclosed: boolean
}

interface FormState {
  first_name: string
  last_name: string
  email: string
  phone: string
  date_of_birth: string
  current_address: string
  current_city: string
  current_state: string
  current_zip: string
  current_rent: string
  current_landlord_name: string
  current_landlord_phone: string
  reason_for_leaving: string
  employer: string
  job_title: string
  monthly_income: string
  employment_start_date: string
  desired_move_in_date: string
  household_size: string
  has_pets: boolean
  pets_description: string
}

const emptyForm: FormState = {
  first_name: '', last_name: '', email: '', phone: '', date_of_birth: '',
  current_address: '', current_city: '', current_state: '', current_zip: '',
  current_rent: '', current_landlord_name: '', current_landlord_phone: '', reason_for_leaving: '',
  employer: '', job_title: '', monthly_income: '', employment_start_date: '',
  desired_move_in_date: '', household_size: '', has_pets: false, pets_description: '',
}

const inputClass = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent placeholder-mute'

export default function Apply() {
  const { unitId } = useParams<{ unitId: string }>()
  // Apply pages should NOT be indexed — they're per-unit links shared by
  // landlords, not public landing pages, and they leak unit detail.
  useSeo({
    title: 'Apply',
    description: `Apply for a rental on ${BRAND.name}. One application, instant submission, decision back from the landlord within days.`,
    path: `/apply/${unitId ?? ''}`,
    noindex: true,
  })
  const [unit, setUnit] = useState<UnitCtx | null>(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  // id + status_token from the insert — the token doubles as the applicant's
  // proof-of-ownership for start-screening (the flow has no auth session).
  const [submittedApp, setSubmittedApp] = useState<{ id: string; statusToken: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!unitId) return
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase.rpc('unit_application_context', { unit_uuid: unitId })
      if (cancelled) return
      if (error || !data || data.length === 0) {
        setUnit(null)
      } else {
        setUnit(data[0] as UnitCtx)
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [unitId])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((s) => ({ ...s, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!unitId) return
    setSubmitting(true)
    setError(null)
    const { data: inserted, error: insertError } = await supabase.from('applications').insert({
      unit_id: unitId,
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim() || null,
      date_of_birth: form.date_of_birth || null,
      current_address: form.current_address.trim() || null,
      current_city: form.current_city.trim() || null,
      current_state: form.current_state.trim() || null,
      current_zip: form.current_zip.trim() || null,
      current_rent: form.current_rent ? Number(form.current_rent) : null,
      current_landlord_name: form.current_landlord_name.trim() || null,
      current_landlord_phone: form.current_landlord_phone.trim() || null,
      reason_for_leaving: form.reason_for_leaving.trim() || null,
      employer: form.employer.trim() || null,
      job_title: form.job_title.trim() || null,
      monthly_income: form.monthly_income ? Number(form.monthly_income) : null,
      employment_start_date: form.employment_start_date || null,
      desired_move_in_date: form.desired_move_in_date || null,
      household_size: form.household_size ? Number(form.household_size) : null,
      has_pets: form.has_pets,
      pets_description: form.has_pets ? form.pets_description.trim() || null : null,
    }).select('id, status_token').single()
    setSubmitting(false)
    if (insertError || !inserted) {
      setError(insertError?.message ?? 'Could not submit application')
      return
    }
    setSubmittedApp({ id: inserted.id as string, statusToken: inserted.status_token as string })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-mute">
        <Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} />
      </div>
    )
  }

  if (!unit) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-5 text-center">
        <Building2 className="w-12 h-12 mx-auto mb-4 text-mute-400" strokeWidth={1.5} />
        <h1 className="text-2xl font-bold text-ink">Listing not found</h1>
        <p className="text-mute mt-2">
          This application link doesn't match an active listing. Reach out to the landlord
          who shared the link — they may need to resend it.
        </p>
        <Link to="/" className="mt-6 inline-block text-brand-600 font-medium hover:underline">← Back to {BRAND.name}</Link>
      </div>
    )
  }

  if (submittedApp) {
    return (
      <div className="max-w-3xl mx-auto py-10 px-5">
        <ScreeningFlow
          applicationId={submittedApp.id}
          statusToken={submittedApp.statusToken}
          applicantName={`${form.first_name} ${form.last_name}`.trim()}
          applicantEmail={form.email.trim().toLowerCase()}
          requirements={{
            // v1: pre-qual + selfie + applicant-provided credit history are
            // live (our own Claude pipeline). Bureau-pulled credit / criminal /
            // eviction remain off until vendor onboarding completes.
            selfie:                !!unit?.require_selfie_screening,
            credit_self_disclosed: !!unit?.require_credit_self_disclosed,
            credit:                false,
            criminal:              false,
            eviction:              false,
          }}
        />
      </div>
    )
  }

  const rent = Number(unit.rent_amount).toLocaleString()

  return (
    <div className="max-w-3xl mx-auto py-10 px-5">
      {/* Unit summary header */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5 mb-6 flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
          <Building2 className="w-6 h-6 text-brand-600" strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-wider text-mute font-semibold">Apply for</p>
          <h1 className="text-xl font-bold text-ink mt-0.5">{unit.property_name} — Unit {unit.unit_number}</h1>
          <p className="text-sm text-mute mt-0.5">{unit.property_address}, {unit.property_city}, {unit.property_state} {unit.property_zip}</p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-mute">
            <span><strong className="text-ink">${rent}/mo</strong></span>
            {unit.bedrooms != null && <span>{unit.bedrooms} bed</span>}
            {unit.bathrooms != null && <span>{unit.bathrooms} bath</span>}
          </div>
        </div>
      </section>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Applicant */}
        <Section Icon={ClipboardList} title="About you">
          <Grid>
            <Field label="First name" required>
              <input className={inputClass} value={form.first_name} onChange={(e) => set('first_name', e.target.value)} required />
            </Field>
            <Field label="Last name" required>
              <input className={inputClass} value={form.last_name} onChange={(e) => set('last_name', e.target.value)} required />
            </Field>
            <Field label="Email" required>
              <input type="email" className={inputClass} value={form.email} onChange={(e) => set('email', e.target.value)} required />
            </Field>
            <Field label="Phone">
              <input type="tel" className={inputClass} value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </Field>
            <Field label="Date of birth">
              <input type="date" className={inputClass} value={form.date_of_birth} onChange={(e) => set('date_of_birth', e.target.value)} />
            </Field>
            <Field label="Desired move-in date">
              <input type="date" className={inputClass} value={form.desired_move_in_date} onChange={(e) => set('desired_move_in_date', e.target.value)} />
            </Field>
          </Grid>
        </Section>

        {/* Current address */}
        <Section Icon={Building2} title="Where you live now">
          <Grid>
            <Field label="Street address" full>
              <input className={inputClass} value={form.current_address} onChange={(e) => set('current_address', e.target.value)} />
            </Field>
            <Field label="City">
              <input className={inputClass} value={form.current_city} onChange={(e) => set('current_city', e.target.value)} />
            </Field>
            <Field label="State">
              <input className={inputClass} value={form.current_state} onChange={(e) => set('current_state', e.target.value)} placeholder="CA" maxLength={2} />
            </Field>
            <Field label="ZIP">
              <input className={inputClass} value={form.current_zip} onChange={(e) => set('current_zip', e.target.value)} />
            </Field>
            <Field label="Current monthly rent">
              <input type="number" inputMode="decimal" min="0" className={inputClass} value={form.current_rent} onChange={(e) => set('current_rent', e.target.value)} placeholder="1500" />
            </Field>
            <Field label="Current landlord name">
              <input className={inputClass} value={form.current_landlord_name} onChange={(e) => set('current_landlord_name', e.target.value)} />
            </Field>
            <Field label="Current landlord phone">
              <input type="tel" className={inputClass} value={form.current_landlord_phone} onChange={(e) => set('current_landlord_phone', e.target.value)} />
            </Field>
            <Field label="Why are you moving?" full>
              <textarea rows={2} className={inputClass} value={form.reason_for_leaving} onChange={(e) => set('reason_for_leaving', e.target.value)} />
            </Field>
          </Grid>
        </Section>

        {/* Employment */}
        <Section Icon={Briefcase} title="Employment & income">
          <Grid>
            <Field label="Employer">
              <input className={inputClass} value={form.employer} onChange={(e) => set('employer', e.target.value)} />
            </Field>
            <Field label="Job title">
              <input className={inputClass} value={form.job_title} onChange={(e) => set('job_title', e.target.value)} />
            </Field>
            <Field label="Gross monthly income">
              <input type="number" inputMode="decimal" min="0" className={inputClass} value={form.monthly_income} onChange={(e) => set('monthly_income', e.target.value)} placeholder="6000" />
            </Field>
            <Field label="Employment start date">
              <input type="date" className={inputClass} value={form.employment_start_date} onChange={(e) => set('employment_start_date', e.target.value)} />
            </Field>
          </Grid>
        </Section>

        {/* Household */}
        <Section Icon={Users} title="Household">
          <Grid>
            <Field label="Total household size (incl. you)">
              <input type="number" inputMode="decimal" min="1" className={inputClass} value={form.household_size} onChange={(e) => set('household_size', e.target.value)} />
            </Field>
            <Field label="Any pets?">
              <div className="flex gap-2 mt-1">
                <button type="button" onClick={() => set('has_pets', false)} className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium border ${!form.has_pets ? 'bg-brand-50 border-brand-400 text-brand-800' : 'bg-white border-gray-300 text-ink'}`}>No</button>
                <button type="button" onClick={() => set('has_pets', true)} className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium border ${form.has_pets ? 'bg-brand-50 border-brand-400 text-brand-800' : 'bg-white border-gray-300 text-ink'}`}>Yes</button>
              </div>
            </Field>
            {form.has_pets && (
              <Field label="Tell us about your pets (species, breed, weight)" full>
                <textarea rows={2} className={inputClass} value={form.pets_description} onChange={(e) => set('pets_description', e.target.value)} placeholder="Mixed breed dog, ~30 lbs, well-behaved" />
              </Field>
            )}
          </Grid>
        </Section>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-900 text-sm px-4 py-3 rounded-xl">{error}</div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full inline-flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-medium px-6 py-3 rounded-lg transition-colors disabled:opacity-50"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />}
          {submitting ? 'Submitting…' : 'Submit application'}
          {!submitting && <ArrowRight className="w-4 h-4" strokeWidth={2} />}
        </button>

        <p className="text-center text-xs text-mute">
          By submitting, you authorize the landlord to review your information. You'll be notified
          by email when a decision is made.
        </p>
      </form>
    </div>
  )
}

function Section({ Icon, title, children }: { Icon: typeof Building2; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-brand-600" strokeWidth={1.75} />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-mute">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid sm:grid-cols-2 gap-4">{children}</div>
}

function Field({ label, required, full, children }: { label: string; required?: boolean; full?: boolean; children: React.ReactNode }) {
  // Wrap children inside the <label> so any nested <input>/<select>/<textarea>
  // is implicitly associated — no need to thread htmlFor/id through every call site.
  return (
    <label className={`block ${full ? 'sm:col-span-2' : ''}`}>
      <span className="block text-xs uppercase tracking-wider text-mute font-semibold mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  )
}

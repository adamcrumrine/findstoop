// Review and refine a lease before sending to the tenant for signature.
//
// Design rule from the user: the boilerplate language in the state-specific
// lease body is NEVER hand-edited — it's verbatim state-specific text.
// The manager can only adjust the structured merge fields (names, addresses,
// rent, deposits, pets, dates, due-day, utility notes). Saving re-renders the
// document text from the template using the updated fields, uploads it, and
// stamps the new public URL on the lease.
//
// If the lease was created without "Use state-specific template" checked, it
// has no auto-drafted document and the manager is presumably attaching their
// own. In that case we still let them adjust the structured lease metadata,
// but we don't render a document preview here.

import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { generateLeaseText, getStateNotes } from '@findstoop/shared/lib/leaseTemplates'
import type { Lease } from '@findstoop/shared/types/lease'
import type { Property } from '@findstoop/shared/types/property'
import type { Unit } from '@findstoop/shared/types/unit'
import type { Profile } from '@findstoop/shared/types/profile'
import {
  ArrowLeft, AlertTriangle, Save, Send, FileSignature, Loader2, CheckCircle2,
  FileText, ExternalLink,
} from 'lucide-react'
import toast from 'react-hot-toast'
import FormField, { inputClass } from '../../components/shared/FormField'

interface LeaseWithRefs extends Lease {
  payment_due_day?: number | null
  tenant: Profile | null
  unit: (Unit & { property: Property | null }) | null
}

interface MergeFields {
  start_date: string
  end_date: string
  rent_amount: string
  security_deposit: string
  pet_deposit: string
  utility_notes: string
  payment_due_day: string
  pets_allowed: boolean
  collect_last_months_rent: boolean
  /** null = not yet decided; true/false = manager's choice. Set when end-date
   *  is adjusted to a non-standard term (anything other than 12 months). */
  prorate_rent: boolean | null
  // Landlord-side identity (saved to profiles, not the lease)
  landlord_name: string
  landlord_company: string
}

// "Standard" 12-month lease end date = start + 12 months - 1 day.
// e.g. 2026-06-01 → 2027-05-31.
function addMonthsMinusOneDay(isoStart: string, months: number): string {
  const parts = isoStart?.split('-')
  if (!parts || parts.length !== 3) return ''
  const y = Number(parts[0]); const m = Number(parts[1]); const d = Number(parts[2])
  const dt = new Date(y, m - 1, d)
  dt.setMonth(dt.getMonth() + months)
  dt.setDate(dt.getDate() - 1)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function monthsBetween(startIso: string, endIso: string): number {
  if (!startIso || !endIso) return 0
  const a = new Date(startIso); const b = new Date(endIso)
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + (b.getDate() >= a.getDate() ? 0 : -1)
}

export default function ReviewLease() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [lease, setLease] = useState<LeaseWithRefs | null>(null)
  const [allTenants, setAllTenants] = useState<Profile[]>([])
  const [addTenantEmail, setAddTenantEmail] = useState('')
  const [addingTenant, setAddingTenant] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)

  // Editable structured fields
  const [fields, setFields] = useState<MergeFields>({
    start_date: '', end_date: '', rent_amount: '', security_deposit: '',
    pet_deposit: '', utility_notes: '', payment_due_day: '1', pets_allowed: false,
    collect_last_months_rent: false,
    prorate_rent: null,
    landlord_name: '', landlord_company: '',
  })
  // Tracks whether the manager has been prompted about prorating this session
  // for the current end-date. Resets when the end-date changes.
  const [showProratePrompt, setShowProratePrompt] = useState(false)
  const [initialFields, setInitialFields] = useState<MergeFields>(fields)

  // ── Load lease + tenant + unit + property ────────────────────────────────
  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('leases')
        .select(`
          *,
          tenant:profiles!leases_tenant_id_fkey(*),
          unit:units(*, property:properties(*))
        `)
        .eq('id', id)
        .single()
      if (cancelled) return
      if (error || !data) {
        toast.error('Could not load this lease')
        setLease(null)
      } else {
        const l = data as unknown as LeaseWithRefs
        setLease(l)

        // Load all tenants on this lease (primary + co-tenants) via the
        // lease_tenants join. Primary first, then by added order.
        const { data: ltRows } = await supabase
          .from('lease_tenants')
          .select('tenant_id, is_primary, sort_order, added_at, profile:profiles!lease_tenants_tenant_id_fkey(*)')
          .eq('lease_id', l.id)
          .order('is_primary', { ascending: false })
          .order('sort_order', { ascending: true })
          .order('added_at', { ascending: true })
        if (!cancelled) {
          const profiles = ((ltRows ?? []) as unknown as Array<{ profile?: Profile | null }>)
            .map((r) => r.profile)
            .filter((p): p is Profile => !!p)
          // Fallback: if join table is somehow empty (shouldn't happen post-backfill),
          // fall back to the single primary tenant on the lease row.
          if (profiles.length === 0 && l.tenant) {
            setAllTenants([l.tenant])
          } else {
            setAllTenants(profiles)
          }
        }
        const f: MergeFields = {
          start_date: l.start_date ?? '',
          end_date: l.end_date ?? '',
          rent_amount: String(l.rent_amount ?? ''),
          security_deposit: l.security_deposit != null ? String(l.security_deposit) : '',
          pet_deposit: l.pet_deposit != null ? String(l.pet_deposit) : '',
          utility_notes: l.utility_notes ?? '',
          payment_due_day: String(l.payment_due_day ?? 1),
          pets_allowed: Boolean(l.pet_deposit && l.pet_deposit > 0),
          collect_last_months_rent: Boolean((l as { collect_last_months_rent?: boolean }).collect_last_months_rent),
          prorate_rent: ((l as { prorate_rent?: boolean | null }).prorate_rent ?? null),
          landlord_name: profile?.full_name ?? '',
          landlord_company: profile?.company_name ?? '',
        }
        setFields(f)
        setInitialFields(f)
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [id, profile?.full_name, profile?.company_name])

  const dirty = JSON.stringify(fields) !== JSON.stringify(initialFields)
  const stateCode = lease?.unit?.property?.state ?? ''
  const stateNotes = getStateNotes(stateCode.toLowerCase())
  const fullySigned = !!lease?.signed_at

  // Required fields gate the live preview. End date and rent must be present
  // and valid; landlord name + unit + property must exist (lease has them).
  const requiredFilled = !!(
    fields.start_date &&
    fields.end_date &&
    fields.end_date > fields.start_date &&
    fields.rent_amount &&
    Number(fields.rent_amount) > 0 &&
    fields.landlord_name.trim() &&
    lease?.unit?.property
  )

  const set = <K extends keyof MergeFields>(k: K, v: MergeFields[K]) =>
    setFields((s) => ({ ...s, [k]: v }))

  // Standard lease term is 12 months. When the manager picks a start date,
  // auto-fill end-date to +12 months minus 1 day, unless they've already
  // typed an end-date that doesn't match the previous auto-default (i.e.
  // they intentionally chose a non-standard term).
  const setStartDate = (next: string) => {
    setFields((s) => {
      const wasAutoEnd = !s.end_date || s.end_date === addMonthsMinusOneDay(s.start_date, 12)
      return {
        ...s,
        start_date: next,
        end_date: wasAutoEnd ? addMonthsMinusOneDay(next, 12) : s.end_date,
      }
    })
  }

  // When the manager edits the end-date directly: if the resulting term
  // differs from the 12-month default, prompt about prorating. The prompt
  // only fires once per change, and only if prorate_rent hasn't already
  // been set for this term.
  const setEndDate = (next: string) => {
    setFields((s) => {
      const standard = addMonthsMinusOneDay(s.start_date, 12)
      const isNonStandard = !!s.start_date && !!next && next !== standard
      const needsPrompt = isNonStandard && s.prorate_rent === null
      // If they cleared the prior non-standard state by returning to default,
      // clear prorate_rent so we don't carry a stale answer.
      const nextProrate = isNonStandard ? s.prorate_rent : null
      if (needsPrompt) setShowProratePrompt(true)
      return { ...s, end_date: next, prorate_rent: nextProrate }
    })
  }

  // Build the new document text from current field values + template.
  const renderDocumentText = (l: LeaseWithRefs): string | null => {
    const property = l.unit?.property
    const tenant = l.tenant
    if (!property || !l.unit) return null
    const rentNum = Number(fields.rent_amount || 0)
    const tenantsForDoc = allTenants.length > 0
      ? allTenants.map((t) => ({ name: t.full_name ?? t.email ?? 'Tenant', email: t.email ?? '' }))
      : (tenant ? [{ name: tenant.full_name ?? tenant.email ?? 'Tenant', email: tenant.email ?? '' }] : [])
    const primaryDoc = tenantsForDoc[0]
    return generateLeaseText({
      landlord_name: fields.landlord_name.trim() || 'Landlord',
      landlord_entity: fields.landlord_company.trim() || fields.landlord_name.trim(),
      landlord_phone: profile?.phone ?? null,
      landlord_email: profile?.email ?? null,
      tenant_name: primaryDoc?.name ?? '',
      tenant_email: primaryDoc?.email ?? '',
      tenants: tenantsForDoc,
      property_address: property.address,
      unit_label: l.unit.unit_number,
      city: property.city,
      state: property.state,
      zip: property.zip,
      start_date: fields.start_date,
      end_date: fields.end_date,
      rent_amount: rentNum,
      security_deposit: Number(fields.security_deposit || 0),
      pet_deposit: fields.pet_deposit ? Number(fields.pet_deposit) : null,
      payment_due_day: Math.min(28, Math.max(1, Number(fields.payment_due_day) || 1)),
      utility_notes: fields.utility_notes || null,
      pets_allowed: fields.pets_allowed,
      last_months_prepayment: fields.collect_last_months_rent ? rentNum : 0,
    })
  }

  const uploadDocument = async (text: string): Promise<string | null> => {
    if (!profile) return null
    const docPath = `lease-docs/${profile.id}/${Date.now()}-${lease!.id}.txt`
    const blob = new Blob([text], { type: 'text/plain' })
    const { error: upErr } = await supabase.storage
      .from('user-uploads')
      .upload(docPath, blob, { contentType: 'text/plain', upsert: true })
    if (upErr) {
      toast.error(`Upload failed: ${upErr.message}`)
      return null
    }
    const { data: pub } = supabase.storage.from('user-uploads').getPublicUrl(docPath)
    return pub?.publicUrl ?? null
  }

  const handleSave = async () => {
    if (!lease || !profile || !dirty) return
    if (!fields.start_date || !fields.end_date) {
      toast.error('Start and end dates are required')
      return
    }
    if (fields.end_date <= fields.start_date) {
      toast.error('End date must be after start date')
      return
    }
    if (!fields.rent_amount || Number(fields.rent_amount) <= 0) {
      toast.error('Valid monthly rent required')
      return
    }
    setSaving(true)

    // 1) Update lease structured fields.
    const leaseUpdate: Record<string, unknown> = {
      start_date: fields.start_date,
      end_date: fields.end_date,
      rent_amount: Number(fields.rent_amount),
      security_deposit: fields.security_deposit ? Number(fields.security_deposit) : null,
      pet_deposit: fields.pets_allowed && fields.pet_deposit ? Number(fields.pet_deposit) : null,
      utility_notes: fields.utility_notes.trim() || null,
      payment_due_day: Math.min(28, Math.max(1, Number(fields.payment_due_day) || 1)),
      collect_last_months_rent: fields.collect_last_months_rent,
      prorate_rent: fields.prorate_rent,
    }

    // 2) Always re-render the document from the merge fields and upload.
    //    The boilerplate body never changes; only the merge values do.
    let newDocUrl: string | undefined
    const text = renderDocumentText(lease)
    if (text) {
      const url = await uploadDocument(text)
      if (url) newDocUrl = url
    }
    if (newDocUrl) leaseUpdate.document_url = newDocUrl

    // 3) Update landlord profile fields if changed (name + company).
    const profileUpdates: Record<string, unknown> = {}
    if (fields.landlord_name.trim() !== (profile.full_name ?? '')) {
      profileUpdates.full_name = fields.landlord_name.trim()
    }
    if (fields.landlord_company.trim() !== (profile.company_name ?? '')) {
      profileUpdates.company_name = fields.landlord_company.trim() || null
    }

    const leaseRes = await supabase.from('leases').update(leaseUpdate).eq('id', lease.id)
    if (leaseRes.error) {
      setSaving(false)
      toast.error(leaseRes.error.message)
      return
    }
    if (Object.keys(profileUpdates).length > 0) {
      const profileRes = await supabase.from('profiles').update(profileUpdates).eq('id', profile.id)
      if (profileRes.error) {
        setSaving(false)
        toast.error(profileRes.error.message)
        return
      }
    }
    setSaving(false)

    setLease((prev) => prev ? { ...prev, ...leaseUpdate, document_url: newDocUrl ?? prev.document_url } as LeaseWithRefs : prev)
    setInitialFields(fields)
    toast.success('Lease saved')
  }

  const openFormattedLease = () => {
    if (!lease) return
    window.open(`/lease-pdf/${lease.id}`, '_blank', 'noopener,noreferrer')
  }

  const handleAddTenant = async () => {
    if (!lease) return
    const email = addTenantEmail.trim().toLowerCase()
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      toast.error('Enter a valid email')
      return
    }
    if (allTenants.some((t) => t.email?.toLowerCase() === email)) {
      toast.error('That tenant is already on this lease')
      return
    }
    setAddingTenant(true)
    try {
      const tenantProfile = await (await import('@findstoop/shared/api/profiles')).getProfileByEmail(email)
      if (!tenantProfile) {
        toast.error("Tenant isn't in FindStoop yet — invite them from Tenants first.")
        return
      }
      const { error } = await supabase.from('lease_tenants').insert({
        lease_id: lease.id,
        tenant_id: tenantProfile.id,
        is_primary: false,
        sort_order: allTenants.length,
      })
      if (error) {
        if (/active or pending lease at a different property/i.test(error.message)) {
          toast.error('That tenant is already on an active lease at a different property.')
        } else {
          toast.error(error.message)
        }
        return
      }
      setAllTenants((arr) => [...arr, tenantProfile])
      setAddTenantEmail('')
      toast.success(`Added ${tenantProfile.full_name ?? email} to this lease`)
    } finally {
      setAddingTenant(false)
    }
  }

  const handleRemoveTenant = async (tenantId: string) => {
    if (!lease) return
    if (allTenants.length <= 1) {
      toast.error('A lease must have at least one tenant')
      return
    }
    const isPrimary = lease.tenant_id === tenantId
    if (isPrimary) {
      toast.error('Cannot remove the primary tenant. Terminate this lease and create a new one with different tenants.')
      return
    }
    const { error } = await supabase.from('lease_tenants').delete()
      .eq('lease_id', lease.id).eq('tenant_id', tenantId)
    if (error) { toast.error(error.message); return }
    setAllTenants((arr) => arr.filter((t) => t.id !== tenantId))
    toast.success('Tenant removed from lease')
  }

  const handleSendForSignature = async () => {
    if (!lease) return
    if (dirty) {
      toast.error('Save your edits first — the tenant will be reviewing whatever is currently stored.')
      return
    }
    setSending(true)
    const toastId = toast.loading('Sending lease to tenant…')
    const { data, error } = await supabase.functions.invoke('notify-tenant-lease-ready', {
      body: { leaseId: lease.id },
    })
    setSending(false)
    if (error || data?.error) {
      toast.error((error?.message ?? data?.error) || 'Could not send lease', { id: toastId })
      return
    }
    const who = lease.tenant?.full_name ?? lease.tenant?.email ?? 'tenant'
    toast.success(`Lease sent to ${who} for signature`, { id: toastId })
    setLease((prev) => prev ? { ...prev, sent_for_signature_at: new Date().toISOString() } : prev)
    // Bounce back to the Leases page so the manager sees the updated "Sent"
    // badge in context.
    navigate('/manager/leases')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-mute">
        <Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} />
      </div>
    )
  }

  if (!lease || !profile) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <p className="text-mute">Lease not found.</p>
        <Link to="/manager/leases" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">
          ← Back to leases
        </Link>
      </div>
    )
  }

  const property = lease.unit?.property
  const tenant = lease.tenant

  return (
    <div className="max-w-4xl mx-auto py-6 px-4">
      <Link to="/manager/leases" className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink mb-4">
        <ArrowLeft className="w-4 h-4" strokeWidth={1.75} /> Back to leases
      </Link>

      {/* Header */}
      <header className="bg-white rounded-2xl border border-gray-200 p-6 mb-4">
        <p className="text-xs uppercase tracking-wider text-mute font-semibold">Review lease</p>
        <h1 className="text-2xl font-semibold text-ink mt-1">
          {tenant?.full_name ?? tenant?.email ?? 'Tenant'} · {property?.name ?? '—'} — Unit {lease.unit?.unit_number ?? '—'}
        </h1>
        <div className="mt-2 text-xs text-mute inline-flex items-center gap-3 flex-wrap">
          <span className={`px-2 py-0.5 rounded-full font-medium capitalize ${
            lease.status === 'active' ? 'bg-green-100 text-green-700'
              : lease.status === 'pending' ? 'bg-yellow-100 text-yellow-700'
              : 'bg-gray-100 text-gray-700'
          }`}>{lease.status}</span>
          {lease.sent_for_signature_at && (
            <span className="inline-flex items-center gap-1">
              <Send className="w-3 h-3" strokeWidth={1.75} />
              Sent {new Date(lease.sent_for_signature_at).toLocaleDateString()}
            </span>
          )}
          {fullySigned && (
            <span className="inline-flex items-center gap-1 text-green-700">
              <CheckCircle2 className="w-3 h-3" strokeWidth={1.75} />
              Fully signed
            </span>
          )}
          {!lease.document_url && (
            <span className="text-mute italic">No document saved yet</span>
          )}
        </div>
      </header>

      {/* State notes */}
      {stateNotes && (
        <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 mb-4 text-xs text-brand-900">
          <p className="font-semibold mb-1.5">{stateNotes.name} — key rules</p>
          <ul className="space-y-1">
            <li>• Deposit cap: {stateNotes.security_deposit_cap}</li>
            <li>• Late fees: {stateNotes.late_fee_rule}</li>
            <li>• Termination notice (month-to-month): {stateNotes.termination_notice}</li>
          </ul>
        </div>
      )}

      {/* Stacked layout: editable fields full-width on top, then document. */}
      <div className="space-y-4">
        {/* Editable structured fields — multi-column grid, full width */}
        <section className="bg-white rounded-2xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-mute mb-4">Lease details</h2>

          <fieldset disabled={fullySigned} className={fullySigned ? 'opacity-60 pointer-events-none' : ''}>
            {/* ── Landlord ──────────────────────────────────────────── */}
            <p className="text-[10px] uppercase tracking-wider text-mute font-semibold mb-2">Landlord</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
              <FormField label="Landlord name" required>
                <input className={inputClass} value={fields.landlord_name} onChange={(e) => set('landlord_name', e.target.value)} placeholder={profile?.full_name ?? ''} />
              </FormField>
              <FormField label="Landlord company (optional)">
                <input className={inputClass} value={fields.landlord_company} onChange={(e) => set('landlord_company', e.target.value)} placeholder={profile?.company_name ?? ''} />
              </FormField>
            </div>

            {/* ── Parties ───────────────────────────────────────────── */}
            <p className="text-[10px] uppercase tracking-wider text-mute font-semibold mb-2 pt-4 border-t border-gray-100">Parties</p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-5">
              {/* Tenants — list of all lessees, with add/remove */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-mute font-semibold">
                    Tenants ({allTenants.length})
                  </p>
                </div>
                <div className="space-y-1">
                  {allTenants.length === 0 && (
                    <p className="text-xs text-mute italic">No tenants on this lease.</p>
                  )}
                  {allTenants.map((t) => {
                    const isPrimary = lease.tenant_id === t.id
                    return (
                      <div key={t.id} className="flex items-center justify-between gap-2 bg-white border border-gray-200 rounded px-2 py-1">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-ink truncate">
                            {t.full_name ?? t.email ?? '—'}
                            {isPrimary && <span className="ml-1.5 text-[9px] uppercase tracking-wider text-brand-700 bg-brand-50 px-1 py-0.5 rounded">Primary</span>}
                          </p>
                          <p className="text-[10px] text-mute truncate">{t.email ?? '—'}</p>
                        </div>
                        {!isPrimary && !fullySigned && (
                          <button
                            type="button"
                            onClick={() => handleRemoveTenant(t.id)}
                            className="text-[10px] text-red-600 hover:text-red-700 font-medium shrink-0"
                            title="Remove this tenant from the lease"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
                {!fullySigned && (
                  <div className="flex gap-1.5 mt-2">
                    <input
                      type="email"
                      placeholder="add@example.com"
                      value={addTenantEmail}
                      onChange={(e) => setAddTenantEmail(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTenant() } }}
                      disabled={addingTenant}
                      className="flex-1 text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddTenant}
                      disabled={addingTenant || !addTenantEmail.trim()}
                      className="text-xs font-medium text-brand-700 border border-brand-300 hover:bg-brand-50 px-2 rounded disabled:opacity-50"
                    >
                      {addingTenant ? '…' : '+ Add'}
                    </button>
                  </div>
                )}
              </div>

              {/* Property (read-only) */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-mute font-semibold">Property</p>
                <p className="text-sm text-ink truncate">{property?.name ?? '—'} — Unit {lease.unit?.unit_number ?? '—'}</p>
                <p className="text-xs text-mute truncate">{property ? `${property.address}, ${property.city}, ${property.state} ${property.zip}` : '—'}</p>
              </div>
            </div>

            {/* ── Term & rent ───────────────────────────────────────── */}
            <p className="text-[10px] uppercase tracking-wider text-mute font-semibold mb-2 pt-4 border-t border-gray-100">Term &amp; Rent</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              <FormField label="Start date" required>
                <input type="date" className={inputClass} value={fields.start_date} onChange={(e) => setStartDate(e.target.value)} />
                <p className="text-[10px] text-mute mt-1">End date defaults to +12 months.</p>
              </FormField>
              <FormField label="End date" required>
                <input type="date" className={inputClass} value={fields.end_date} onChange={(e) => setEndDate(e.target.value)} />
                {fields.start_date && fields.end_date && fields.end_date !== addMonthsMinusOneDay(fields.start_date, 12) && (
                  <p className="text-[10px] text-amber-700 mt-1">
                    Non-standard term ({monthsBetween(fields.start_date, fields.end_date)} months)
                    {fields.prorate_rent === true && ' · prorated'}
                    {fields.prorate_rent === false && ' · full months only'}
                  </p>
                )}
              </FormField>
              <FormField label="Monthly rent ($)" required>
                <input type="number" min="0" step="0.01" className={inputClass} value={fields.rent_amount} onChange={(e) => set('rent_amount', e.target.value)} />
              </FormField>
              <FormField label="Rent due-day (1–28)">
                <input type="number" min={1} max={28} className={inputClass} value={fields.payment_due_day} onChange={(e) => set('payment_due_day', e.target.value)} />
              </FormField>
            </div>

            {/* ── Deposits & options ────────────────────────────────── */}
            <p className="text-[10px] uppercase tracking-wider text-mute font-semibold mb-2 pt-4 border-t border-gray-100">Deposits &amp; Options</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              <FormField label="Security deposit ($)">
                <input type="number" min="0" step="0.01" className={inputClass} value={fields.security_deposit} onChange={(e) => set('security_deposit', e.target.value)} />
              </FormField>
              <div>
                <label className="block text-xs uppercase tracking-wider text-mute font-semibold mb-1.5">Pets</label>
                <label className="flex items-center gap-2 cursor-pointer text-sm h-[42px] px-3 border border-gray-300 rounded-lg bg-white">
                  <input
                    type="checkbox"
                    checked={fields.pets_allowed}
                    onChange={(e) => set('pets_allowed', e.target.checked)}
                  />
                  <span className="text-ink">Allowed (addendum)</span>
                </label>
              </div>
              {fields.pets_allowed ? (
                <FormField label="Pet deposit ($)">
                  <input type="number" min="0" step="0.01" className={inputClass} value={fields.pet_deposit} onChange={(e) => set('pet_deposit', e.target.value)} />
                </FormField>
              ) : (
                <div />
              )}
              <div>
                <label className="block text-xs uppercase tracking-wider text-mute font-semibold mb-1.5">Last month's rent</label>
                <label
                  className="flex items-center gap-2 cursor-pointer text-sm h-[42px] px-3 border border-gray-300 rounded-lg bg-white"
                  title="When checked, last month's rent is also due at move-in (added to the first month's rent). When unchecked, only the security deposit is due at signing and first month's rent is due at move-in."
                >
                  <input
                    type="checkbox"
                    checked={fields.collect_last_months_rent}
                    onChange={(e) => set('collect_last_months_rent', e.target.checked)}
                  />
                  <span className="text-ink">Collect at move-in</span>
                </label>
              </div>
            </div>

            {/* ── Notes ─────────────────────────────────────────────── */}
            <p className="text-[10px] uppercase tracking-wider text-mute font-semibold mb-2 pt-4 border-t border-gray-100">Notes</p>
            <FormField label="Utility notes (optional)">
              <textarea rows={2} className={inputClass} value={fields.utility_notes} onChange={(e) => set('utility_notes', e.target.value)} placeholder="Water included, tenant pays electric…" />
            </FormField>
          </fieldset>
        </section>

        {/* Live-rendered lease document preview — full width */}
        <section className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div className="inline-flex items-center gap-2">
              <FileText className="w-4 h-4 text-brand-600" strokeWidth={1.75} />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-mute">Lease document</h2>
              {dirty && requiredFilled && (
                <span className="text-[10px] uppercase tracking-wider text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                  Will save on next click
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={openFormattedLease}
              disabled={!requiredFilled || !fullySigned}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 border border-brand-200 hover:bg-brand-50 px-2.5 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
              title={fullySigned ? 'Open the finalized lease (printable)' : 'Available once both parties have signed and billing is active'}
            >
              <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.75} />
              View finalized lease
            </button>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-3 text-[11px] text-amber-900 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={1.75} />
            <span>
              Boilerplate is verbatim from FindStoop's lease template — not edited here. The document below re-renders live as you change fields above.
            </span>
          </div>

          {requiredFilled ? (
            <pre className="bg-gray-50 border border-gray-200 rounded-lg p-5 text-xs font-mono text-ink whitespace-pre-wrap leading-relaxed max-h-[80vh] overflow-y-auto">
{renderDocumentText(lease)}
            </pre>
          ) : (
            <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-8 text-sm text-mute text-center">
              <p className="font-medium text-ink">Fill in the required fields above to preview the lease</p>
              <p className="text-xs mt-1.5">
                Landlord name, start date, end date, and monthly rent are required.
                As soon as they're filled, the lease will render here.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Action footer */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5 mt-4 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-mute">
          {dirty
            ? 'You have unsaved edits — saving stores the current document text and merge fields.'
            : lease.sent_for_signature_at
              ? 'Already sent to the tenant. Re-send to nudge them again.'
              : 'When the lease is ready, send it to the tenant for review and signature.'}
        </p>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving || fullySigned}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink bg-white border border-gray-300 hover:border-gray-400 hover:bg-gray-50 px-3 py-2 rounded-lg disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} /> : <Save className="w-3.5 h-3.5" strokeWidth={1.75} />}
            Save changes
          </button>
          {!fullySigned && (
            <button
              type="button"
              onClick={handleSendForSignature}
              disabled={sending || dirty}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 px-3 py-2 rounded-lg disabled:opacity-40"
              title={dirty ? 'Save your edits first' : 'Email the tenant a link to review and sign'}
            >
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} /> : <Send className="w-3.5 h-3.5" strokeWidth={1.75} />}
              {lease.sent_for_signature_at ? 'Re-send for signature' : 'Send for signature'}
            </button>
          )}
          {!fullySigned && (
            <button
              type="button"
              onClick={() => navigate(`/manager/sign-lease/${lease.id}`)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 border border-brand-300 hover:bg-brand-50 px-3 py-2 rounded-lg"
            >
              <FileSignature className="w-3.5 h-3.5" strokeWidth={1.75} />
              Sign now
            </button>
          )}
        </div>
      </section>

      {/* Non-standard term → prorate confirmation. Default lease is 12 months;
          if the manager adjusts the end-date to anything else, we ask whether
          they intend to prorate the first/last rent. The answer is saved on
          the lease and used by the Payments screen. */}
      {showProratePrompt && (() => {
        const months = monthsBetween(fields.start_date, fields.end_date)
        return (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowProratePrompt(false)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-semibold text-ink">Non-standard lease term</h2>
              <p className="text-sm text-mute mt-1">
                You set the term to <strong>{months} months</strong> (the standard is 12). Do you want to prorate the first and/or last month's rent so the payment schedule aligns with the actual occupancy days?
              </p>
              <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-mute">
                <p><strong className="text-ink">Prorate yes:</strong> partial-month rent calculated by day for the first and/or last month.</p>
                <p className="mt-1"><strong className="text-ink">Prorate no:</strong> full monthly rent each calendar month — partial periods are absorbed.</p>
              </div>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => { setFields((s) => ({ ...s, prorate_rent: false })); setShowProratePrompt(false) }}
                  className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium text-ink hover:bg-gray-50"
                >
                  No prorate
                </button>
                <button
                  type="button"
                  onClick={() => { setFields((s) => ({ ...s, prorate_rent: true })); setShowProratePrompt(false) }}
                  className="flex-1 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium"
                >
                  Yes, prorate
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

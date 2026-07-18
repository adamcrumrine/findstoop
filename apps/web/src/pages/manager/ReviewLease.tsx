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
import LeaseAddenda from '../../components/manager/LeaseAddenda'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { generateLeaseText, getStateNotes } from '@findstoop/shared/lib/leaseTemplates'
import type { Lease } from '@findstoop/shared/types/lease'
import type { Property } from '@findstoop/shared/types/property'
import type { Unit } from '@findstoop/shared/types/unit'
import type { Profile } from '@findstoop/shared/types/profile'
import {
  ArrowLeft, AlertTriangle, Save, Send, FileSignature, Loader2, CheckCircle2,
  FileText, ExternalLink, ClipboardList, ArrowRight, Check, ShieldCheck,
  Scale, ChevronRight, Lock, GraduationCap,
} from 'lucide-react'
import toast from 'react-hot-toast'
import FormField, { inputClass } from '../../components/shared/FormField'
import { useInspection } from '@findstoop/shared/hooks/useInspection'
import { formatUsdCents } from '@findstoop/shared/lib/format'
import { BRAND } from '../../lib/brand'
import ModalShell from '../../components/shared/ModalShell'

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
  /** When true, the daily cron will auto-extend this lease to month-to-month
   *  when end_date passes, keep generating monthly rent payments, and the
   *  lease template renders explicit auto-rollover language in Section 26. */
  auto_renew_month_to_month: boolean
  /** For month-to-month leases: tentative date the tenant has indicated
   *  they plan to move out. Used by the lifecycle cron to fire move-out
   *  reminders for M2M tenancies (whose original end_date is in the past). */
  tentative_move_out_date: string
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
  // Auto-save status — null = nothing saved this session; otherwise the
  // timestamp of the last successful save. Used by the passive footer tag.
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  // Tenants on this lease, with the is_primary flag from lease_tenants so
  // the UI can show multi-primary state + toggle it. Multiple tenants can
  // be primary simultaneously (the trigger no longer enforces single).
  const [allTenants, setAllTenants] = useState<Array<Profile & { is_primary: boolean }>>([])
  const [addTenantEmail, setAddTenantEmail] = useState('')
  const [addingTenant, setAddingTenant] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  // Set when this lease has a `documents` row of type='lease' (i.e. an
  // externally-signed PDF was attached during portfolio import or via
  // /manager/leases/attach). When present AND lease.document_url is null
  // (no Stoop-drafted body), we treat the lease as ALREADY EXECUTED
  // and skip the draft/send/sign workflow.
  const [attachedSignedDoc, setAttachedSignedDoc] = useState<{ id: string; name: string; storage_url: string } | null>(null)
  const [attachedDocUrl, setAttachedDocUrl] = useState<string | null>(null)
  // "Replace signed PDF" modal — single-PDF drop with auto-extract + confirm.
  const [replaceModalOpen, setReplaceModalOpen] = useState(false)

  // Editable structured fields
  const [fields, setFields] = useState<MergeFields>({
    start_date: '', end_date: '', rent_amount: '', security_deposit: '',
    pet_deposit: '', utility_notes: '', payment_due_day: '1', pets_allowed: false,
    collect_last_months_rent: false,
    auto_renew_month_to_month: false,
    tentative_move_out_date: '',
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
          const rows = (ltRows ?? []) as unknown as Array<{ is_primary: boolean; profile?: Profile | null }>
          const enriched = rows
            .filter((r) => !!r.profile)
            .map((r) => ({ ...(r.profile as Profile), is_primary: !!r.is_primary }))
          // Fallback: if join table is somehow empty (shouldn't happen
          // post-backfill), fall back to the single primary tenant on the
          // lease row and treat them as primary.
          if (enriched.length === 0 && l.tenant) {
            setAllTenants([{ ...l.tenant, is_primary: true }])
          } else {
            setAllTenants(enriched)
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
          auto_renew_month_to_month: Boolean((l as { auto_renew_month_to_month?: boolean }).auto_renew_month_to_month),
          tentative_move_out_date: (l as { tentative_move_out_date?: string | null }).tentative_move_out_date ?? '',
          prorate_rent: ((l as { prorate_rent?: boolean | null }).prorate_rent ?? null),
          landlord_name: profile?.full_name ?? '',
          landlord_company: profile?.company_name ?? '',
        }
        setFields(f)
        setInitialFields(f)

        // Look up the attached signed-lease document (if any). Only consider
        // the most recent type='lease' doc. We surface this so the page can
        // skip the draft/sign workflow when an executed PDF is on file.
        const { data: docRows } = await supabase
          .from('documents')
          .select('id, name, storage_url')
          .eq('lease_id', l.id)
          .eq('type', 'lease')
          .order('created_at', { ascending: false })
          .limit(1)
        if (!cancelled) {
          const doc = (docRows ?? [])[0] as { id: string; name: string; storage_url: string } | undefined
          if (doc) {
            setAttachedSignedDoc(doc)
            // Resolve a signed URL once for viewing/downloading. 1 hour TTL is
            // plenty for a manager who just clicked into this page.
            const { data: signed } = await supabase.storage
              .from('lease-documents')
              .createSignedUrl(doc.storage_url, 3600)
            if (!cancelled && signed?.signedUrl) setAttachedDocUrl(signed.signedUrl)
          } else {
            setAttachedSignedDoc(null)
            setAttachedDocUrl(null)
          }
        }
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [id, profile?.full_name, profile?.company_name])

  const dirty = JSON.stringify(fields) !== JSON.stringify(initialFields)

  // Auto-save: when fields differ from last-saved snapshot AND the form is
  // valid AND no blocking modal (prorate prompt) is open, schedule a save
  // ~800ms after the last change. Validation is duplicated lightly here so
  // we don't fire saves with bad values; handleSave does the strict check.
  useEffect(() => {
    if (loading || !lease || !profile) return
    if (!dirty) return
    if (saving) return
    if (showProratePrompt) return
    if (!fields.start_date || !fields.end_date || fields.end_date <= fields.start_date) return
    if (!fields.rent_amount || Number(fields.rent_amount) <= 0) return
    if (!fields.landlord_name.trim()) return
    const t = window.setTimeout(() => { void handleSave({ silent: true }) }, 800)
    return () => window.clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, fields, loading, saving, showProratePrompt])

  const stateCode = lease?.unit?.property?.state ?? ''
  const stateNotes = getStateNotes(stateCode.toLowerCase())
  const fullySigned = !!lease?.signed_at
  // External signed PDF on file AND no Stoop-drafted body. This is the
  // "migrated lease" case — the agreement is already executed off-platform,
  // we just store the PDF and skip the Stoop draft/sign workflow.
  const hasExternalSignedPdf = !!attachedSignedDoc && !lease?.document_url
  // Either kind of "lease is executed" — both gate the inspections /
  // compliance checklists and the resend buttons.
  const leaseExecuted = fullySigned || hasExternalSignedPdf

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
      auto_renew_month_to_month: fields.auto_renew_month_to_month,
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

  const handleSave = async ({ silent = false }: { silent?: boolean } = {}) => {
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
      auto_renew_month_to_month: fields.auto_renew_month_to_month,
      tentative_move_out_date: fields.tentative_move_out_date || null,
      prorate_rent: fields.prorate_rent,
    }

    // 2) Re-render the Stoop-templated document from the merge fields
    //    — BUT ONLY for leases that are using the Stoop draft as the
    //    authoritative document. For externally-executed leases (an
    //    imported signed PDF lives in the documents table), we must NOT
    //    touch document_url — doing so erases the connection to the
    //    executed PDF and the UI starts showing the Stoop boilerplate
    //    instead of the actual signed lease. The signed PDF stays as the
    //    document of record.
    let newDocUrl: string | undefined
    if (!hasExternalSignedPdf) {
      const text = renderDocumentText(lease)
      if (text) {
        const url = await uploadDocument(text)
        if (url) newDocUrl = url
      }
      if (newDocUrl) leaseUpdate.document_url = newDocUrl
    }

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
    setLastSavedAt(new Date())
    // Quick confirmation toast on every save — silent auto-saves get a
    // short-duration green check so the user has a visual cue without it
    // lingering. Manual saves use the normal duration.
    if (silent) {
      toast.success('Saved', { duration: 1200, icon: '✓' })
    } else {
      toast.success('Lease saved')
    }
  }

  const openFormattedLease = () => {
    if (!lease) return
    window.open(`/lease-pdf/${lease.id}`, '_blank', 'noopener,noreferrer')
  }

  // Two-mode add: first try to attach by email alone (fast path for tenants
  // already in Stoop). If no profile is found, expand the form to ask
  // for a name + phone and auto-invite via the invite-tenant edge function.
  // The new profile is attached to the lease in the same submit.
  const [addTenantStep, setAddTenantStep] = useState<'email' | 'invite'>('email')
  const [addTenantFirstName, setAddTenantFirstName] = useState('')
  const [addTenantLastName, setAddTenantLastName] = useState('')
  const [addTenantPhone, setAddTenantPhone] = useState('')

  // Live preview of the rent split across primary tenants. Mirrors the SQL
  // trigger's penny-exact math (cents-int division with remainder going to
  // the first primary) so what's shown here is exactly what the DB will
  // bill. Empty list when there's no rent yet or zero primaries.
  const splitPreview: Array<{ tenantId: string; name: string; amount: number }> = (() => {
    const rent = Number(fields.rent_amount || 0)
    if (!rent || rent <= 0) return []
    const primaries = allTenants.filter((t) => t.is_primary)
    if (primaries.length === 0) return []
    const totalCents = Math.round(rent * 100)
    const n = primaries.length
    const baseCents = Math.floor(totalCents / n)
    const remainderCents = totalCents - baseCents * n
    return primaries.map((t, i) => ({
      tenantId: t.id,
      name: t.full_name ?? t.email ?? 'Tenant',
      amount: (baseCents + (i === 0 ? remainderCents : 0)) / 100,
    }))
  })()

  // Toggle a tenant's is_primary flag on this lease. Allows multiple
  // primaries simultaneously — the DB trigger keeps leases.tenant_id in
  // sync with whichever primary sorts first.
  const togglePrimary = async (tenantId: string) => {
    if (!lease) return
    const current = allTenants.find((t) => t.id === tenantId)
    if (!current) return
    const next = !current.is_primary
    const { error } = await supabase
      .from('lease_tenants')
      .update({ is_primary: next })
      .eq('lease_id', lease.id)
      .eq('tenant_id', tenantId)
    if (error) { toast.error(error.message); return }
    setAllTenants((arr) => arr.map((t) => t.id === tenantId ? { ...t, is_primary: next } : t))
    toast.success(next ? 'Marked as primary' : 'Removed primary status')
  }

  const attachExistingTenant = async (tenantProfile: Profile) => {
    if (!lease) return false
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
      return false
    }
    setAllTenants((arr) => [...arr, { ...tenantProfile, is_primary: false }])
    return true
  }

  const resetAddTenantForm = () => {
    setAddTenantStep('email')
    setAddTenantEmail('')
    setAddTenantFirstName('')
    setAddTenantLastName('')
    setAddTenantPhone('')
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
        // Not in Stoop yet — expand to invite form.
        setAddTenantStep('invite')
        toast(`${email} isn't in ${BRAND.name} yet — add their name to send an invite.`, { icon: 'ℹ️' })
        return
      }
      const ok = await attachExistingTenant(tenantProfile)
      if (ok) {
        toast.success(`Added ${tenantProfile.full_name ?? email} to this lease`)
        resetAddTenantForm()
      }
    } finally {
      setAddingTenant(false)
    }
  }

  const handleInviteAndAdd = async () => {
    if (!lease) return
    const email = addTenantEmail.trim().toLowerCase()
    const first = addTenantFirstName.trim()
    const last = addTenantLastName.trim()
    if (!first || !last) { toast.error('Enter first and last name'); return }
    setAddingTenant(true)
    try {
      const { data, error } = await supabase.functions.invoke('invite-tenant', {
        body: {
          email,
          full_name: `${first} ${last}`.trim(),
          phone: addTenantPhone.replace(/\D/g, '') || null,
        },
      })
      if (error || !data?.tenantId) {
        toast.error(error?.message ?? data?.error ?? 'Could not send invite')
        return
      }
      // Build a minimal Profile to attach + display optimistically. We
      // refetch on next reload anyway.
      const newProfile: Profile = {
        id: data.tenantId,
        email,
        full_name: `${first} ${last}`.trim(),
        phone: addTenantPhone.replace(/\D/g, '') || null,
      } as unknown as Profile
      const ok = await attachExistingTenant(newProfile)
      if (ok) {
        toast.success(`Invited ${first} ${last} and added them to this lease`)
        resetAddTenantForm()
      }
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
          {hasExternalSignedPdf ? (
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <CheckCircle2 className="w-3 h-3" strokeWidth={1.75} />
              Signed lease on file (imported)
            </span>
          ) : !lease.document_url && (
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

      {/* Executed-lease lock notice — a signed lease is binding, so its terms
          can't be edited. Direct the manager to an addendum or termination. */}
      {leaseExecuted && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
          <div className="flex items-start gap-2.5">
            <Lock className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" strokeWidth={1.75} />
            <div className="text-sm text-amber-900">
              <p className="font-semibold">This lease is fully executed — its terms are locked.</p>
              <p className="mt-1 text-amber-800 leading-relaxed">
                A signed lease is a binding agreement, so the fields below can’t be edited. To change the
                terms, create a written <strong>addendum</strong> that every party on the lease signs — or
                end the lease under your state’s notice rules (see the key rules above) and start a new one.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Addenda — the sanctioned way to amend an executed lease. */}
      {leaseExecuted && (
        <div className="mb-4">
          <LeaseAddenda leaseId={lease.id} />
        </div>
      )}

      {/* Stacked layout: editable fields full-width on top, then document. */}
      <div className="space-y-4">
        {/* Student lease — administrative marking (not a lease term), so it
            stays editable even on an executed lease, like the move-out notice. */}
        <StudentLeaseCard lease={lease} />

        {/* Editable structured fields — multi-column grid, full width */}
        <section className="bg-white rounded-2xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-mute mb-4">Lease details</h2>

          <fieldset disabled={leaseExecuted} className={leaseExecuted ? 'opacity-60 pointer-events-none' : ''}>
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
                    const isPrimary = t.is_primary
                    return (
                      <div key={t.id} className="flex items-center justify-between gap-2 bg-white border border-gray-200 rounded px-2 py-1">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-ink truncate">
                            {t.full_name ?? t.email ?? '—'}
                            {isPrimary && <span className="ml-1.5 text-[9px] uppercase tracking-wider text-brand-700 bg-brand-50 px-1 py-0.5 rounded">Primary</span>}
                          </p>
                          <p className="text-[10px] text-mute truncate">{t.email ?? '—'}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {!leaseExecuted && (
                            <button
                              type="button"
                              onClick={() => togglePrimary(t.id)}
                              className={`text-[10px] font-medium ${
                                isPrimary ? 'text-mute hover:text-ink' : 'text-brand-700 hover:text-brand-800'
                              }`}
                              title={isPrimary ? 'Remove primary status (lease will still be associated with this tenant)' : 'Mark this tenant as a primary signer on the lease'}
                            >
                              {isPrimary ? 'Unmark primary' : 'Mark primary'}
                            </button>
                          )}
                          {!isPrimary && !leaseExecuted && (
                            <button
                              type="button"
                              onClick={() => handleRemoveTenant(t.id)}
                              className="text-[10px] text-red-600 hover:text-red-700 font-medium"
                              title="Remove this tenant from the lease"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {!leaseExecuted && (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex gap-1.5">
                      <input
                        type="email"
                        placeholder="add@example.com"
                        value={addTenantEmail}
                        onChange={(e) => setAddTenantEmail(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && addTenantStep === 'email') { e.preventDefault(); handleAddTenant() } }}
                        disabled={addingTenant || addTenantStep === 'invite'}
                        className="flex-1 text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50"
                      />
                      {addTenantStep === 'email' ? (
                        <button
                          type="button"
                          onClick={handleAddTenant}
                          disabled={addingTenant || !addTenantEmail.trim()}
                          className="text-xs font-medium text-brand-700 border border-brand-300 hover:bg-brand-50 px-2 rounded disabled:opacity-50"
                        >
                          {addingTenant ? '…' : '+ Add'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={resetAddTenantForm}
                          disabled={addingTenant}
                          className="text-xs text-mute hover:text-ink px-2"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                    {addTenantStep === 'invite' && (
                      <div className="bg-blue-50 border border-blue-200 rounded-md p-2 space-y-1.5">
                        <p className="text-[11px] text-blue-900">
                          <strong>{addTenantEmail}</strong> isn't on {BRAND.name} yet — add their name and we'll send an invite email + add them to this lease.
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                          <input
                            type="text"
                            placeholder="First name"
                            value={addTenantFirstName}
                            onChange={(e) => setAddTenantFirstName(e.target.value)}
                            disabled={addingTenant}
                            className="text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-500"
                          />
                          <input
                            type="text"
                            placeholder="Last name"
                            value={addTenantLastName}
                            onChange={(e) => setAddTenantLastName(e.target.value)}
                            disabled={addingTenant}
                            className="text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-500"
                          />
                        </div>
                        <input
                          type="tel"
                          placeholder="Phone (optional)"
                          value={addTenantPhone}
                          onChange={(e) => setAddTenantPhone(e.target.value)}
                          disabled={addingTenant}
                          className="w-full text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                        <button
                          type="button"
                          onClick={handleInviteAndAdd}
                          disabled={addingTenant || !addTenantFirstName.trim() || !addTenantLastName.trim()}
                          className="w-full text-xs font-medium bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-2 py-1.5 rounded"
                        >
                          {addingTenant ? 'Inviting…' : 'Send invite + add to lease'}
                        </button>
                      </div>
                    )}
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

            {/* ── Rent split preview ──────────────────────────────────
                Driven by allTenants[].is_primary + fields.rent_amount.
                Mirrors the DB trigger's per-cent math so what's shown
                here is exactly what gets billed when the lease activates
                (or after Apply primary split on Payments). */}
            {(() => {
              const primaries = allTenants.filter((t) => t.is_primary)
              if (!fields.rent_amount || Number(fields.rent_amount) <= 0) return null
              if (primaries.length === 0) {
                return (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-5 -mt-2">
                    <p className="text-xs font-semibold text-red-800">No primary tenants selected</p>
                    <p className="text-[11px] text-red-700 mt-0.5">
                      Mark at least one tenant as primary — only primaries are billed for rent.
                    </p>
                  </div>
                )
              }
              if (primaries.length === 1) {
                return (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-5 -mt-2">
                    <p className="text-[11px] text-mute">
                      <span className="font-semibold text-ink">{splitPreview[0]?.name}</span>{' '}
                      will be billed the full {formatUsdCents(Number(fields.rent_amount))}/mo.
                    </p>
                  </div>
                )
              }
              return (
                <div className="bg-brand-50 border border-brand-200 rounded-lg px-3 py-2.5 mb-5 -mt-2">
                  <p className="text-[11px] uppercase tracking-wider text-brand-800 font-semibold mb-1.5">
                    Rent split — {primaries.length} primaries
                  </p>
                  <div className="space-y-1">
                    {splitPreview.map((s) => (
                      <div key={s.tenantId} className="flex items-center justify-between text-xs">
                        <span className="text-ink truncate">{s.name}</span>
                        <span className="font-semibold text-ink">{formatUsdCents(s.amount)}/mo</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-brand-700 mt-1.5 pt-1.5 border-t border-brand-200">
                    Total: {formatUsdCents(Number(fields.rent_amount))}/mo
                    {splitPreview.length > 1 && ' · uneven cents go to the first primary'}
                    {lease.status === 'active' && (
                      <> · changes apply to future months — use <strong>Apply primary split</strong> on Payments after saving</>
                    )}
                  </p>
                </div>
              )
            })()}

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
                <input type="number" inputMode="decimal" min="0" step="0.01" className={inputClass} value={fields.rent_amount} onChange={(e) => set('rent_amount', e.target.value)} />
              </FormField>
              <FormField label="Rent due-day (1–28)">
                <input type="number" inputMode="decimal" min={1} max={28} className={inputClass} value={fields.payment_due_day} onChange={(e) => set('payment_due_day', e.target.value)} />
              </FormField>
            </div>

            {/* ── Deposits & options ────────────────────────────────── */}
            <p className="text-[10px] uppercase tracking-wider text-mute font-semibold mb-2 pt-4 border-t border-gray-100">Deposits &amp; Options</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              <FormField label="Security deposit ($)">
                <input type="number" inputMode="decimal" min="0" step="0.01" className={inputClass} value={fields.security_deposit} onChange={(e) => set('security_deposit', e.target.value)} />
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
                  <input type="number" inputMode="decimal" min="0" step="0.01" className={inputClass} value={fields.pet_deposit} onChange={(e) => set('pet_deposit', e.target.value)} />
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

            {/* ── End-of-term behavior ────────────────────────────────── */}
            <p className="text-[10px] uppercase tracking-wider text-mute font-semibold mb-2 pt-4 border-t border-gray-100">End of term</p>
            <div className="mb-5">
              <label
                className="flex items-start gap-2.5 cursor-pointer text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5"
                title="When the lease ends, automatically continue month-to-month at the same rent. The system keeps generating monthly rent payments until you change the lease status."
              >
                <input
                  type="checkbox"
                  checked={fields.auto_renew_month_to_month}
                  onChange={(e) => set('auto_renew_month_to_month', e.target.checked)}
                  className="mt-0.5"
                />
                <div className="min-w-0">
                  <p className="font-medium text-ink">Auto-extend to month-to-month at end of term</p>
                  <p className="text-[11px] text-mute mt-0.5 leading-relaxed">
                    On the day after <strong>{fields.end_date || 'the lease end date'}</strong>, the lease automatically rolls month-to-month at the same rent.
                    Monthly rent payments keep generating until you mark the lease expired or terminated. Section 26 of the lease document
                    reflects this when checked.
                  </p>
                </div>
              </label>
            </div>

            {/* ── Notes ─────────────────────────────────────────────── */}
            <p className="text-[10px] uppercase tracking-wider text-mute font-semibold mb-2 pt-4 border-t border-gray-100">Notes</p>
            <FormField label="Utility notes (optional)">
              <textarea rows={2} className={inputClass} value={fields.utility_notes} onChange={(e) => set('utility_notes', e.target.value)} placeholder="Water included, tenant pays electric…" />
            </FormField>
          </fieldset>
        </section>

        {/* Move-out notice — month-to-month only. Stays editable even on an
            executed lease: recording a tenant's notice to vacate isn't a change
            to the lease terms, and the lifecycle cron fires move-out reminders
            (deposit return prep, inspection scheduling) off this date. */}
        {lease.month_to_month && (
          <section className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-mute mb-3">Move-out notice</h2>
            <FormField label="Tentative move-out date (optional)">
              <input
                type="date"
                className={inputClass}
                value={fields.tentative_move_out_date}
                onChange={(e) => set('tentative_move_out_date', e.target.value)}
              />
            </FormField>
            <p className="text-[11px] text-mute mt-1 leading-relaxed">
              If your tenant has given notice they plan to move out, set the date here. We'll fire
              the same move-out reminders we use for fixed-term leases (deposit return prep,
              move-out inspection scheduling, etc.).
            </p>
          </section>
        )}

        {/* Lease document — either the externally-imported signed PDF (if
            this lease was migrated in with an executed agreement), or the
            live-rendered Stoop template preview. */}
        <section className="bg-white rounded-2xl border border-gray-200 p-5">
          {hasExternalSignedPdf ? (
            <>
              <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                <div className="inline-flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-600" strokeWidth={1.75} />
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-mute">Executed lease — on file</h2>
                  <span className="text-[10px] uppercase tracking-wider text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                    Confirmed
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {attachedDocUrl && (
                    <a
                      href={attachedDocUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 border border-brand-200 hover:bg-brand-50 px-2.5 py-1.5 rounded-lg"
                    >
                      <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.75} />
                      View PDF
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setReplaceModalOpen(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-mute hover:text-ink border border-gray-300 hover:border-gray-400 hover:bg-gray-50 px-2.5 py-1.5 rounded-lg"
                    title="Replace this PDF and update the tenant list"
                  >
                    Replace signed PDF
                  </button>
                </div>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-900 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-700" strokeWidth={1.75} />
                <div className="min-w-0">
                  <p className="font-semibold">
                    {attachedSignedDoc?.name ?? 'Signed lease.pdf'}
                  </p>
                  <p className="mt-1 text-emerald-900/80 leading-relaxed">
                    This lease was already executed before migrating to {BRAND.name}. The signed PDF is stored in
                    {' '}
                    <Link to="/manager/documents" className="underline font-medium">Documents</Link>
                    {' '}as the authoritative agreement. No {BRAND.name} draft or e-signature step is required —
                    when this term ends (or at renewal), you'll generate a new {BRAND.name} lease.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
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
                  Boilerplate is verbatim from {BRAND.name}'s lease template — not edited here. The document below re-renders live as you change fields above.
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
            </>
          )}
        </section>
      </div>

      {/* Inspections — move-in + move-out checklists. Available as soon as
          the lease is executed (Stoop-signed OR externally-signed). */}
      <InspectionsPanel leaseId={lease.id} fullySigned={leaseExecuted} />

      {/* Federal compliance — built-before-1978 toggle + disclosure / insurance status */}
      <CompliancePanel leaseId={lease.id} fullySigned={leaseExecuted} hasExternalSignedPdf={hasExternalSignedPdf} />

      {/* Action footer — Save is automatic now (~0.8s debounce). The
          passive indicator on the left reflects current state; the
          right side only renders the e-sign actions for Stoop-drafted
          leases that still need to be sent. */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5 mt-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-mute inline-flex items-center gap-2">
          {saving ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} /> Saving…</>
          ) : dirty ? (
            <><Save className="w-3.5 h-3.5" strokeWidth={1.75} /> Unsaved — will save in a moment</>
          ) : lastSavedAt ? (
            <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" strokeWidth={1.75} /> All changes saved at {lastSavedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</>
          ) : hasExternalSignedPdf ? (
            <>This lease was executed before migration — no draft or signature required. Edits save automatically.</>
          ) : (
            <>Edits save automatically.</>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {!leaseExecuted && (
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
          {!leaseExecuted && (
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
      {replaceModalOpen && (
        <ReplacePdfModal
          leaseId={lease.id}
          managerId={profile.id}
          currentTenants={allTenants.map((t) => ({
            email: t.email ?? '', name: t.full_name ?? t.email ?? '',
          }))}
          onClose={() => setReplaceModalOpen(false)}
          onReplaced={() => {
            setReplaceModalOpen(false)
            toast.success('Lease PDF and tenants updated')
            // Refresh the page so the new doc + tenants render.
            window.location.reload()
          }}
        />
      )}

      {showProratePrompt && (() => {
        const months = monthsBetween(fields.start_date, fields.end_date)
        return (
          <ModalShell onClose={() => setShowProratePrompt(false)} maxWidth="max-w-md" aria-label="Non-standard lease term">
            <div className="p-6 flex-1 min-h-0 overflow-y-auto overscroll-contain">
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
          </ModalShell>
        )
      })()}
    </div>
  )
}

// ── Student lease toggle ───────────────────────────────────────────────
// Marks this lease a student lease (leases.is_student) — the à-la-carte way a
// manager turns on the student renter tools for one tenant without a
// university subdomain or flipping the whole property to Student Housing mode.
// Mirrors PropertyDetail's Student Housing switch idiom. Administrative, not a
// lease term, so it stays editable regardless of executed status.
//
// Reads `is_student` off the lease tolerantly (loaded via `select('*')`) and
// writes it directly; if the column doesn't exist yet (pre-migration) the
// write simply errors into a toast — the page never breaks.
function StudentLeaseCard({ lease }: { lease: LeaseWithRefs }) {
  const [on, setOn] = useState(Boolean((lease as { is_student?: boolean | null }).is_student))
  const [saving, setSaving] = useState(false)
  const toggle = async () => {
    if (saving) return
    const next = !on
    setOn(next)
    setSaving(true)
    const { error } = await supabase.from('leases').update({ is_student: next }).eq('id', lease.id)
    setSaving(false)
    if (error) {
      setOn(!next)
      toast.error(error.message)
    } else {
      toast.success(next ? 'Marked as a student lease' : 'Student lease marking removed')
    }
  }
  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-brand-600" strokeWidth={1.75} />
            <h2 className="text-sm font-semibold text-ink">Student lease</h2>
          </div>
          <p className="text-xs text-mute mt-1.5 leading-relaxed">
            Mark this a student lease to give this tenant the free renter tools in their portal —
            a plain-English lease explainer, their Ohio tenant rights, move-in documentation, and
            deposit protection. Use this for a student renter when the whole property isn't student
            housing. Powered by {BRAND.name}.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Student lease"
          onClick={toggle}
          className={`shrink-0 mt-1 relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${on ? 'bg-brand-600' : 'bg-gray-300'}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>
    </section>
  )
}

// ── Inspections panel ──────────────────────────────────────────────────
// Renders two cards (move-in + move-out) side-by-side. Each card shows the
// state of the corresponding inspection + a CTA to open or start it.
function InspectionsPanel({ leaseId, fullySigned }: { leaseId: string; fullySigned: boolean }) {
  const moveIn  = useInspection(leaseId, 'move_in')
  const moveOut = useInspection(leaseId, 'move_out')

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5 mt-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-xs uppercase tracking-wider text-mute font-semibold">Move-in / move-out checklists</h2>
          <p className="text-xs text-mute mt-1">
            Walk through the unit with the tenant and document the condition. Both parties sign — the signed PDF lands in Documents.
          </p>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <InspectionCard
          leaseId={leaseId}
          type="move_in"
          label="Move-in"
          subtitle="Document the starting condition"
          loading={moveIn.loading}
          inspection={moveIn.inspection}
          locked={!fullySigned}
        />
        <InspectionCard
          leaseId={leaseId}
          type="move_out"
          label="Move-out"
          subtitle="Compare against move-in at lease end"
          loading={moveOut.loading}
          inspection={moveOut.inspection}
          locked={!fullySigned}
        />
      </div>
      {moveIn.inspection && moveOut.inspection && (
        <Link
          to={`/manager/lease/${leaseId}/inspection-compare`}
          className="mt-3 flex items-center gap-2.5 rounded-xl border border-gray-200 hover:border-brand-300 px-4 py-3 transition-colors group"
        >
          <Scale className="w-4 h-4 text-brand-600 shrink-0" strokeWidth={1.75} />
          <div className="flex-1">
            <p className="text-sm font-semibold text-ink">Compare move-in vs move-out</p>
            <p className="text-xs text-mute">See where the condition changed before deciding on deposit deductions.</p>
          </div>
          <ChevronRight className="w-4 h-4 text-mute-400 group-hover:text-brand-600" strokeWidth={1.75} />
        </Link>
      )}
    </section>
  )
}

function InspectionCard({ leaseId, type, label, subtitle, loading, inspection, locked }: {
  leaseId: string
  type: 'move_in' | 'move_out'
  label: string
  subtitle: string
  loading: boolean
  inspection: ReturnType<typeof useInspection>['inspection']
  locked: boolean
}) {
  if (loading) {
    return (
      <div className="border border-gray-200 rounded-xl p-4 h-32 flex items-center justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-mute" />
      </div>
    )
  }

  // Manager can only START a move-in inspection AFTER the lease is signed
  // (the data model needs a real, signed lease as the anchor). They can
  // EDIT an existing one regardless.
  if (!inspection && locked) {
    return (
      <div className="border border-dashed border-gray-200 rounded-xl p-4 bg-gray-50/50">
        <p className="text-sm font-semibold text-mute">{label} checklist</p>
        <p className="text-xs text-mute mt-1">{subtitle}</p>
        <p className="text-[11px] text-amber-700 mt-2 inline-flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" strokeWidth={2} />
          Available after the lease is fully signed
        </p>
      </div>
    )
  }

  const state = inspection?.state
  const stateLabel =
    state === 'both_signed'    ? 'Signed by both' :
    state === 'manager_signed' ? 'Waiting on tenant' :
    state === 'tenant_signed'  ? 'Waiting on manager' :
    inspection                 ? 'Draft' : 'Not started'

  const stateCls =
    state === 'both_signed'    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
    state === 'manager_signed' || state === 'tenant_signed'
                               ? 'bg-amber-50 text-amber-700 border-amber-200' :
    inspection                 ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                 'bg-gray-50 text-mute border-gray-200'

  return (
    <Link
      to={`/manager/lease/${leaseId}/inspection/${type}`}
      className="block border border-gray-200 hover:border-brand-300 rounded-xl p-4 transition-colors group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-brand-50 text-brand-700 inline-flex items-center justify-center">
            <ClipboardList className="w-4 h-4" strokeWidth={1.75} />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">{label} checklist</p>
            <p className="text-xs text-mute">{subtitle}</p>
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-mute group-hover:text-brand-600 shrink-0" strokeWidth={1.75} />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${stateCls}`}>
          {state === 'both_signed' && <Check className="w-3 h-3" strokeWidth={2.5} />}
          {stateLabel}
        </span>
        {inspection?.updated_at && (
          <span className="text-[11px] text-mute">Updated {new Date(inspection.updated_at).toLocaleDateString()}</span>
        )}
      </div>
    </Link>
  )
}

// ── Federal-compliance panel ───────────────────────────────────────────
// Manager-side card showing federal lease compliance status:
//   • Fair Housing notice acknowledged by tenant
//   • Built-before-1978 toggle → enables / suppresses LBP disclosure
//   • Lead disclosure progress (landlord pending / tenant pending / signed)
//   • Renter's insurance state + due date + uploaded proof link
interface ComplianceStatusRow {
  lease_id: string
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

function CompliancePanel({ leaseId, fullySigned: _fullySigned, hasExternalSignedPdf = false }: { leaseId: string; fullySigned: boolean; hasExternalSignedPdf?: boolean }) {
  const [row, setRow] = useState<ComplianceStatusRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const reload = async () => {
    const { data } = await supabase
      .from('lease_compliance_status')
      .select('*')
      .eq('lease_id', leaseId)
      .single()
    setRow((data ?? null) as ComplianceStatusRow | null)
    setLoading(false)
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaseId])

  const setPre1978 = async (value: boolean) => {
    setSaving(true)
    const { error } = await supabase
      .from('leases')
      .update({ property_built_before_1978: value })
      .eq('id', leaseId)
    setSaving(false)
    if (error) { toast.error(error.message); return }
    await reload()
  }

  const openInsurance = async () => {
    if (!row?.insurance_proof_url) return
    const { data, error } = await supabase.storage
      .from('insurance-documents')
      .createSignedUrl(row.insurance_proof_url, 600)
    if (error || !data?.signedUrl) { toast.error('Could not open proof.'); return }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  if (loading || !row) return null

  // For externally-executed leases (PDF uploaded as the lease), the Fair
  // Housing notice + Lead Disclosure are auto-attached to the documents
  // folder by the trigger and don't need a separate acknowledgment flow —
  // the lease was already executed and the disclosures came with it.
  // Renter's insurance is still tracked separately because the tenant
  // hasn't uploaded a certificate yet regardless of the lease's signed state.
  const fairHousingOk  = row.fair_housing_state === 'acknowledged' || hasExternalSignedPdf
  const leadOk         = row.lead_disclosure_state === 'signed' || row.lead_disclosure_state === 'not_required' || hasExternalSignedPdf
  const insuranceOk    = row.insurance_state === 'uploaded' || row.insurance_state === 'not_required'

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs uppercase tracking-wider text-mute font-semibold">Federal compliance</h2>
        <p className="text-[11px] text-mute">
          {[fairHousingOk, leadOk, insuranceOk].filter(Boolean).length} / 3 complete
        </p>
      </div>

      {/* Built-before-1978 toggle */}
      <div className="bg-gray-50/60 border border-gray-200 rounded-xl p-3 mb-3">
        <p className="text-xs uppercase tracking-wider text-mute font-semibold mb-1">Property built before 1978?</p>
        <p className="text-xs text-mute mb-2">Required by federal law (24 CFR 35.92) for pre-1978 housing — triggers the lead-based-paint disclosure.</p>
        <div className="flex gap-2">
          {(['yes', 'no'] as const).map((v) => {
            const value = v === 'yes'
            const selected = row.property_built_before_1978 === value
            return (
              <button
                key={v}
                type="button"
                disabled={saving}
                onClick={() => setPre1978(value)}
                className={`flex-1 px-3 py-2 rounded-md text-sm font-medium border transition-colors ${
                  selected
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-ink border-gray-300 hover:border-brand-400'
                }`}
              >
                {v === 'yes' ? 'Yes — built before 1978' : 'No — built 1978 or later'}
              </button>
            )
          })}
        </div>
        {row.property_built_before_1978 == null && (
          <p className="text-[11px] text-amber-700 mt-2">
            Set this before sending the lease — it determines whether the LBP disclosure is required.
          </p>
        )}
      </div>

      {/* Status rows */}
      <div className="space-y-2">
        <ComplianceLine
          Icon={ShieldCheck}
          label="Fair Housing Notice"
          status={fairHousingOk ? 'ok' : 'pending'}
          sub={
            hasExternalSignedPdf
              ? 'Previously disclosed with imported lease'
              : fairHousingOk
                ? 'Acknowledged by tenant'
                : 'Awaiting tenant acknowledgment'
          }
        />
        {row.property_built_before_1978 && (
          <ComplianceLine
            Icon={FileText}
            label="Lead-Based Paint Disclosure"
            status={
              // Imported / externally-executed leases came with the
              // disclosure as part of the signed packet — no Stoop
              // signature flow is required. Otherwise fall back to the
              // standard lifecycle states.
              hasExternalSignedPdf                              ? 'ok' :
              row.lead_disclosure_state === 'signed'           ? 'ok' :
              row.lead_disclosure_state === 'landlord_pending' ? 'action' :
              row.lead_disclosure_state === 'tenant_pending'   ? 'pending' :
                                                                  'pending'
            }
            sub={
              hasExternalSignedPdf                              ? 'Previously disclosed with imported lease' :
              row.lead_disclosure_state === 'signed'           ? 'Both parties signed' :
              row.lead_disclosure_state === 'landlord_pending' ? 'Your signature required' :
              row.lead_disclosure_state === 'tenant_pending'   ? 'Awaiting tenant signature' :
                                                                  'Not yet started'
            }
            to={hasExternalSignedPdf ? undefined : `/legal/lead-disclosure/${row.lease_id}`}
          />
        )}
        <ComplianceLine
          Icon={ShieldCheck}
          label="Renter's Insurance"
          status={
            row.insurance_state === 'uploaded'      ? 'ok' :
            row.insurance_state === 'not_required'  ? 'ok' :
            row.insurance_state === 'expired'       ? 'pending' :
            row.insurance_state === 'overdue'       ? 'pending' :
                                                       'pending'
          }
          sub={
            row.insurance_state === 'uploaded'
              ? `On file${row.insurance_expires_at ? ` · expires ${new Date(row.insurance_expires_at).toLocaleDateString()}` : ''}`
              : row.insurance_state === 'expired'
                ? 'Expired — tenant must re-upload'
                : row.insurance_state === 'overdue'
                  ? `Overdue — was due ${new Date(row.insurance_due_date).toLocaleDateString()}`
                  : `Due by ${new Date(row.insurance_due_date).toLocaleDateString()} (${row.insurance_days_remaining}d remaining)`
          }
          onClick={row.insurance_state === 'uploaded' ? openInsurance : undefined}
        />
      </div>
    </section>
  )
}

function ComplianceLine({ Icon, label, status, sub, to, onClick }: {
  Icon: typeof ShieldCheck
  label: string
  status: 'ok' | 'pending' | 'action'
  sub: string
  to?: string
  onClick?: () => void
}) {
  const cls =
    status === 'ok'      ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
    status === 'action'  ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            'bg-gray-50 text-gray-600 border-gray-200'
  const labelText =
    status === 'ok'      ? 'Complete' :
    status === 'action'  ? 'Action required' :
                            'Pending'

  const Body = (
    <div className="flex items-center gap-3 bg-white rounded-lg px-3 py-2.5 border border-gray-200">
      <div className="w-8 h-8 rounded-md bg-brand-50 text-brand-700 inline-flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4" strokeWidth={1.75} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="text-xs text-mute mt-0.5 truncate">{sub}</p>
      </div>
      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
        {labelText}
      </span>
    </div>
  )

  if (to) return <Link to={to}>{Body}</Link>
  if (onClick) return <button type="button" onClick={onClick} className="w-full text-left">{Body}</button>
  return Body
}

// ── Replace signed PDF modal ──────────────────────────────────────────────
// Drop a new PDF → extract-lease-fields runs → show extracted tenants for
// confirmation → on confirm, replace-lease-pdf swaps the documents row +
// tenant list atomically. The OLD storage object is left in place as an
// audit trail (orphaned but recoverable from the bucket).
interface ExtractedTenantRow {
  first_name: string | null; last_name: string | null;
  email: string | null; phone: string | null
}

function ReplacePdfModal({ leaseId, managerId, currentTenants, onClose, onReplaced }: {
  leaseId: string
  managerId: string
  currentTenants: Array<{ email: string; name: string }>
  onClose: () => void
  onReplaced: () => void
}) {
  const [pdf, setPdf] = useState<File | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [extractedPath, setExtractedPath] = useState<string | null>(null)
  const [extractedTenants, setExtractedTenants] = useState<ExtractedTenantRow[] | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onPickFile = async (file: File | null) => {
    setPdf(file)
    setExtractedTenants(null)
    setExtractedPath(null)
    setError(null)
    if (!file) return
    setExtracting(true)
    try {
      // Upload to a temp path under the manager's folder.
      const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
      const path = `${managerId}/replace/${stamp}-${safeName}`
      const { error: upErr } = await supabase.storage.from('lease-documents').upload(path, file, {
        contentType: 'application/pdf', upsert: false,
      })
      if (upErr) { setError(`Upload failed: ${upErr.message}`); return }
      setExtractedPath(path)
      // Extract.
      const { data, error: exErr } = await supabase.functions.invoke('extract-lease-fields', {
        body: { storage_path: path },
      })
      if (exErr || !data?.ok || !data?.extracted) {
        setError(exErr?.message ?? data?.message ?? 'Could not read the lease — try a clearer PDF.')
        return
      }
      const ex = data.extracted as { tenants?: ExtractedTenantRow[] }
      const list = (ex.tenants ?? []).filter((t) => t.first_name && t.last_name && t.email)
      if (list.length === 0) {
        setError("No tenant info found in the PDF. Make sure it's a typed (not scanned) lease document.")
        return
      }
      setExtractedTenants(list)
    } finally {
      setExtracting(false)
    }
  }

  const submit = async () => {
    if (!pdf || !extractedPath || !extractedTenants || extractedTenants.length === 0) return
    setSubmitting(true)
    setError(null)
    try {
      const { data, error: err } = await supabase.functions.invoke('replace-lease-pdf', {
        body: {
          lease_id: leaseId,
          new_storage_path: extractedPath,
          new_filename: pdf.name,
          tenants: extractedTenants.map((t) => ({
            email: (t.email ?? '').trim().toLowerCase(),
            first_name: t.first_name ?? '',
            last_name: t.last_name ?? '',
            phone: t.phone ?? null,
          })),
        },
      })
      if (err || !data?.ok) {
        setError(err?.message ?? data?.message ?? 'Replacement failed')
        return
      }
      onReplaced()
    } finally {
      setSubmitting(false)
    }
  }

  // Tenant-diff highlighting: which extracted emails are NOT already on
  // the lease (to surface "we'll add these") vs. which currentTenants are
  // missing from the extraction (to surface "these will be removed").
  const currentEmails = new Set(currentTenants.map((t) => t.email.toLowerCase()).filter(Boolean))
  const extractedEmails = new Set((extractedTenants ?? []).map((t) => (t.email ?? '').toLowerCase()))
  const willAdd = (extractedTenants ?? []).filter((t) => !currentEmails.has((t.email ?? '').toLowerCase()))
  const willRemove = currentTenants.filter((t) => t.email && !extractedEmails.has(t.email.toLowerCase()))

  return (
    <ModalShell onClose={onClose} maxWidth="max-w-xl" aria-label="Replace signed lease PDF">
        <header className="px-5 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
          <h2 className="text-base font-semibold text-ink">Replace signed lease PDF</h2>
          <button type="button" onClick={onClose} disabled={submitting} aria-label="Close" className="p-2.5 -m-2.5 rounded-lg text-mute hover:text-ink text-xl leading-none">×</button>
        </header>

        <div className="p-5 space-y-4 flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <p className="text-xs text-mute leading-relaxed">
            Drop the correct signed lease PDF here. We'll read the tenant list out of it and replace both the PDF
            and the tenant list on this lease in one step. The previous PDF is detached but kept in your storage
            bucket as an audit trail.
          </p>

          {/* File picker */}
          <label className="block w-full rounded-lg border-2 border-dashed border-gray-300 p-6 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/40">
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
              className="sr-only"
            />
            {pdf ? (
              <div className="text-sm font-medium text-ink">{pdf.name}</div>
            ) : (
              <div className="text-sm text-mute">Click to pick a PDF</div>
            )}
            {extracting && (
              <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-brand-700">
                <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />
                Reading lease — extracting tenants…
              </div>
            )}
          </label>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg p-3">
              {error}
            </div>
          )}

          {/* Extracted preview + diff */}
          {extractedTenants && extractedTenants.length > 0 && (
            <div className="bg-emerald-50/40 border border-emerald-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-emerald-900 mb-2">
                Extracted {extractedTenants.length} tenant{extractedTenants.length === 1 ? '' : 's'} from the PDF — review before confirming
              </p>
              <ul className="space-y-1 text-xs">
                {extractedTenants.map((t, i) => {
                  const isNew = !currentEmails.has((t.email ?? '').toLowerCase())
                  return (
                    <li key={i} className="flex items-center gap-2">
                      <span className={`inline-block w-2 h-2 rounded-full ${isNew ? 'bg-emerald-500' : 'bg-gray-400'}`} title={isNew ? 'New on this lease' : 'Already on this lease'} />
                      <span className="font-medium text-ink">{t.first_name} {t.last_name}</span>
                      <span className="text-mute">·</span>
                      <span className="text-mute">{t.email}</span>
                      {t.phone && <><span className="text-mute">·</span><span className="text-mute">{t.phone}</span></>}
                    </li>
                  )
                })}
              </ul>
              {willRemove.length > 0 && (
                <p className="mt-2 pt-2 border-t border-emerald-200 text-[11px] text-amber-900">
                  <strong>Will be removed:</strong> {willRemove.map((t) => t.name).join(', ')}
                </p>
              )}
              {willAdd.length > 0 && (
                <p className="text-[11px] text-emerald-900">
                  <strong>Will be added:</strong> {willAdd.map((t) => `${t.first_name} ${t.last_name}`).join(', ')} (no invite email sent)
                </p>
              )}
            </div>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-gray-200 flex justify-between items-center gap-2 shrink-0">
          <button type="button" onClick={onClose} disabled={submitting} className="text-sm text-mute hover:text-ink px-3">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!extractedTenants || extractedTenants.length === 0 || submitting || extracting}
            className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-lg text-sm"
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {submitting ? 'Replacing…' : 'Confirm replacement'}
          </button>
        </footer>
    </ModalShell>
  )
}

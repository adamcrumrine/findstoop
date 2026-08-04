// Formatted, print-ready lease document.
//
// Renders the lease in a legal-document style — serif typography, Stoop
// logo header, § section dividers, a Terms/Lessees/Lessor block, the
// auto-generated boilerplate as flowing prose, and any captured e-signatures.
// Available at any lease stage including post-signing.
//
// The "Print" button uses window.print(); the @media print CSS hides chrome
// so the user can save the page as PDF from the browser print dialog.

import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { generateLeaseText, getStateNotes } from '@findstoop/shared/lib/leaseTemplates'
import { getSignedUrl } from '@findstoop/shared/api/documents'
import type { Lease } from '@findstoop/shared/types/lease'
import type { Property } from '@findstoop/shared/types/property'
import type { Unit } from '@findstoop/shared/types/unit'
import type { Profile } from '@findstoop/shared/types/profile'
import { ArrowLeft, Printer, Loader2, FileSignature } from 'lucide-react'
import { BRAND } from '../../lib/brand'

interface LeaseWithRefs extends Lease {
  payment_due_day?: number | null
  tenant: Profile | null
  unit: (Unit & { property: Property | null }) | null
}

interface SignatureRecord {
  id: string
  signer_role: 'manager' | 'tenant' | 'admin'
  signer_id: string
  signed_at: string
  signature_data: string | null
  ip_address: string | null
}

export default function LeasePdf() {
  const { id } = useParams<{ id: string }>()
  const { profile, loading: authLoading } = useAuth()
  const [lease, setLease] = useState<LeaseWithRefs | null>(null)
  const [allTenants, setAllTenants] = useState<Profile[]>([])
  const [signatures, setSignatures] = useState<SignatureRecord[]>([])
  const [signerProfiles, setSignerProfiles] = useState<Record<string, Profile>>({})
  const [billingActive, setBillingActive] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  // Storage path of an uploaded/externally-signed lease PDF, if one exists.
  // When set, THAT document is the executed lease and the generated template
  // below is not — see the redirect effect.
  const [uploadedLeasePath, setUploadedLeasePath] = useState<string | null>(null)
  const [uploadedLeaseFailed, setUploadedLeaseFailed] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [leaseRes, sigsRes, ltRes, docRes] = await Promise.all([
        supabase
          .from('leases')
          .select(`
            *,
            tenant:profiles!leases_tenant_id_fkey(*),
            unit:units(*, property:properties(*))
          `)
          .eq('id', id)
          .single(),
        supabase
          .from('lease_signatures')
          .select('id, signer_role, signer_id, signed_at, signature_data, ip_address')
          .eq('lease_id', id)
          .order('signed_at', { ascending: true }),
        supabase
          .from('lease_tenants')
          .select('tenant_id, is_primary, sort_order, profile:profiles!lease_tenants_tenant_id_fkey(*)')
          .eq('lease_id', id)
          .order('is_primary', { ascending: false })
          .order('sort_order', { ascending: true }),
        // Most recent uploaded lease document. Standard legal notices store an
        // `app://` route rather than a storage path — those are not the lease.
        supabase
          .from('documents')
          .select('storage_url')
          .eq('lease_id', id)
          .eq('type', 'lease')
          .order('created_at', { ascending: false })
          .limit(1),
      ])
      if (cancelled) return
      const docPath = ((docRes.data ?? [])[0] as { storage_url?: string } | undefined)?.storage_url ?? ''
      setUploadedLeasePath(docPath && !docPath.startsWith('app://') ? docPath : null)
      if (leaseRes.error || !leaseRes.data) {
        setLease(null)
      } else {
        setLease(leaseRes.data as unknown as LeaseWithRefs)
      }
      const sigs = (sigsRes.data ?? []) as SignatureRecord[]
      setSignatures(sigs)
      const profiles = ((ltRes.data ?? []) as unknown as Array<{ profile?: Profile | null }>)
        .map((r) => r.profile)
        .filter((p): p is Profile => !!p)
      setAllTenants(profiles)

      // Resolve manager profile by lookup of property.manager_id; tenant is already in lease.
      let managerId: string | null = null
      if (leaseRes.data?.unit?.property?.manager_id) {
        managerId = leaseRes.data.unit.property.manager_id as string
        const { data: managerProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', managerId)
          .maybeSingle()
        if (managerProfile && !cancelled) {
          setSignerProfiles((prev) => ({ ...prev, [managerId!]: managerProfile as Profile }))
        }
      }

      // Check landlord billing — formatted PDF is gated on both signed AND
      // active subscription. Uses a SECURITY DEFINER RPC so both managers
      // and tenants can verify the landlord's subscription status without
      // needing direct read access to the landlord's billing fields.
      if (managerId && !cancelled) {
        const { data: activeRes } = await supabase.rpc('manager_subscription_active', { manager_uuid: managerId })
        if (!cancelled) setBillingActive(Boolean(activeRes))
      } else if (!cancelled) {
        setBillingActive(false)
      }

      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [id])

  // When the lease was imported from (or signed on) another platform, the
  // uploaded PDF is the agreement the parties actually executed. Rendering the
  // Stoop template instead would show boilerplate — a generic utility split,
  // generic clauses — that was never part of their deal. Send the viewer to
  // the real document.
  useEffect(() => {
    if (!uploadedLeasePath) return
    let cancelled = false
    ;(async () => {
      try {
        // Same bucket + signing path the Documents tab uses, so this inherits
        // the storage RLS that already governs tenant lease downloads.
        const url = await getSignedUrl(uploadedLeasePath, 60)
        if (cancelled) return
        window.location.replace(url)
      } catch {
        if (!cancelled) setUploadedLeaseFailed(true)
      }
    })()
    return () => { cancelled = true }
  }, [uploadedLeasePath])

  const leaseText = useMemo(() => {
    if (!lease) return ''
    const property = lease.unit?.property
    const tenant = lease.tenant
    if (!property || !lease.unit) return ''
    const manager = lease.unit?.property?.manager_id ? signerProfiles[lease.unit.property.manager_id] : undefined
    const tenantsForDoc = allTenants.length > 0
      ? allTenants.map((t) => ({ name: t.full_name ?? t.email ?? 'Tenant', email: t.email ?? '' }))
      : (tenant ? [{ name: tenant.full_name ?? tenant.email ?? 'Tenant', email: tenant.email ?? '' }] : [])
    return generateLeaseText({
      landlord_name: manager?.full_name ?? 'Landlord',
      landlord_entity: manager?.company_name ?? manager?.full_name ?? 'Landlord',
      landlord_phone: manager?.phone ?? null,
      landlord_email: manager?.email ?? null,
      tenant_name: tenantsForDoc[0]?.name ?? '',
      tenant_email: tenantsForDoc[0]?.email ?? '',
      tenants: tenantsForDoc,
      property_address: property.address,
      unit_label: lease.unit.unit_number,
      city: property.city,
      state: property.state,
      zip: property.zip,
      start_date: lease.start_date,
      end_date: lease.end_date,
      rent_amount: Number(lease.rent_amount),
      security_deposit: Number(lease.security_deposit ?? 0),
      pet_deposit: lease.pet_deposit ?? null,
      payment_due_day: Math.min(28, Math.max(1, Number(lease.payment_due_day ?? 1))),
      utility_notes: lease.utility_notes,
      pets_allowed: !!(lease.pet_deposit && Number(lease.pet_deposit) > 0),
    })
  }, [lease, signerProfiles])

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-mute">
        <Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} />
      </div>
    )
  }

  // Not signed in → send to manager login (the more common case for this view).
  if (!profile) {
    return <Navigate to="/login" replace />
  }

  if (!lease) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <p className="text-mute">Lease not found.</p>
        <Link to="/manager/leases" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">
          ← Back to leases
        </Link>
      </div>
    )
  }

  const property = lease.unit?.property
  const tenant = lease.tenant
  const manager = lease.unit?.property?.manager_id ? signerProfiles[lease.unit.property.manager_id] : undefined

  // Access check — manager who owns the property, the tenant on the lease,
  // or admin. RLS would normally already block disallowed reads, but defending
  // here gives a clean message instead of "Lease not found".
  const canView =
    profile.role === 'admin' ||
    (property?.manager_id && property.manager_id === profile.id) ||
    (lease.tenant_id && lease.tenant_id === profile.id)

  if (!canView) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <p className="text-mute">You don't have access to this lease.</p>
        <Link to="/" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">
          ← Home
        </Link>
      </div>
    )
  }

  // Uploaded lease → we are handing off to the real PDF. Deliberately placed
  // ahead of the signature/billing gate: an externally-executed lease belongs
  // to the parties regardless of the landlord's subscription state, and the
  // Documents tab already lets tenants download it directly.
  if (uploadedLeasePath && !uploadedLeaseFailed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-mute gap-3">
        <Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} />
        <p className="text-sm">Opening the signed lease…</p>
      </div>
    )
  }

  // Couldn't produce a link to the executed document. Show that plainly rather
  // than falling through to the generated template, which would present
  // boilerplate as if it were their agreement.
  if (uploadedLeasePath && uploadedLeaseFailed) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8">
          <FileSignature className="w-10 h-10 text-amber-700 mx-auto mb-3" strokeWidth={1.5} />
          <h1 className="text-lg font-semibold text-amber-900">Couldn't open the signed lease</h1>
          <p className="text-sm text-amber-800 mt-2">
            The executed lease for this tenancy is an uploaded document and we couldn't
            generate a link to it just now. Try again, or open it from the Documents tab.
          </p>
          <Link
            to={profile.role === 'tenant' ? '/tenant/documents' : `/manager/review-lease/${lease.id}`}
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-amber-900 bg-white border border-amber-300 hover:bg-amber-100 px-4 py-2 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            {profile.role === 'tenant' ? 'Back to documents' : 'Back to review'}
          </Link>
        </div>
      </div>
    )
  }

  // PDF is only available once both parties have signed AND the landlord's
  // Stoop subscription is active. Admin bypasses both gates for support.
  const isAdmin = profile.role === 'admin'
  if (!isAdmin && (!lease.signed_at || billingActive === false)) {
    const backTo = profile.role === 'tenant' ? '/tenant/dashboard' : `/manager/review-lease/${lease.id}`
    const reason = !lease.signed_at
      ? 'The finalized PDF is generated once both the landlord and the tenant have signed.'
      : `The finalized PDF will be available once the landlord completes ${BRAND.name} billing setup.`
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8">
          <FileSignature className="w-10 h-10 text-amber-700 mx-auto mb-3" strokeWidth={1.5} />
          <h1 className="text-lg font-semibold text-amber-900">Finalized lease not available yet</h1>
          <p className="text-sm text-amber-800 mt-2">{reason}</p>
          <Link
            to={backTo}
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-amber-900 bg-white border border-amber-300 hover:bg-amber-100 px-4 py-2 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            {profile.role === 'tenant' ? 'Back to dashboard' : 'Back to review'}
          </Link>
        </div>
      </div>
    )
  }
  const stateNotes = getStateNotes((property?.state ?? '').toLowerCase())

  const managerSig = signatures.find((s) => s.signer_role === 'manager' || s.signer_role === 'admin')

  const cityHeader = property ? `${property.city} Residential Lease` : 'Residential Lease'
  const createdOn = lease.created_at
    ? new Date(lease.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : ''

  return (
    <div className="bg-gray-100 min-h-screen">
      {/* Toolbar — hidden when printing */}
      <div className="lease-pdf-toolbar sticky top-0 z-10 bg-white border-b border-gray-200 print:hidden">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            to={profile.role === 'tenant' ? '/tenant/dashboard' : `/manager/review-lease/${lease.id}`}
            className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            {profile.role === 'tenant' ? 'Back to dashboard' : 'Back to review'}
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 px-3 py-2 rounded-lg"
          >
            <Printer className="w-4 h-4" strokeWidth={1.75} />
            Print or save as PDF
          </button>
        </div>
      </div>

      {/* Paper */}
      <div className="lease-pdf-paper max-w-4xl mx-auto bg-white shadow-sm my-6 print:my-0 print:shadow-none">
        <div className="px-10 py-12 print:px-16 print:py-12 text-ink" style={{ fontFamily: 'Georgia, "Times New Roman", serif', lineHeight: 1.6 }}>
          {/* Header — Stoop brand */}
          <div className="flex items-center justify-between border-b border-gray-200 pb-4 mb-8">
            <img src={BRAND.logo.horizontal} alt={BRAND.name} className="h-10" />
            <p className="text-xs text-mute font-sans tracking-wider uppercase">
              Lease {String(lease.id).slice(0, 8).toUpperCase()}
            </p>
          </div>

          {/* Title */}
          <div className="text-center mb-10">
            <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Georgia, serif' }}>
              {cityHeader}
            </h1>
            {createdOn && <p className="text-sm text-mute mt-2 italic">Created on {createdOn}</p>}
          </div>

          {/* Premises */}
          <SectionHeader title="Premises" />
          <p>{property?.address}</p>
          <p>{property ? `${property.city}, ${property.state} ${property.zip}` : ''}</p>
          {lease.unit?.unit_number && <p>Unit {lease.unit.unit_number}</p>}

          {/* Terms */}
          <SectionHeader title="Terms" />
          <div className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm">
            <TermRow label="Start date" value={fmtDate(lease.start_date)} />
            <TermRow label="Security deposit" value={money(lease.security_deposit)} />
            <TermRow label="End date" value={fmtDate(lease.end_date)} />
            <TermRow label="Pet deposit" value={money(lease.pet_deposit)} />
            <TermRow label="Monthly rent" value={money(lease.rent_amount)} />
            <TermRow label="Rent due-day" value={String(lease.payment_due_day ?? 1)} />
            <TermRow label="Status" value={lease.status} />
          </div>

          {/* Lessees */}
          <SectionHeader title="Lessees" />
          <PartyBlock
            name={tenant?.full_name ?? 'Tenant'}
            email={tenant?.email ?? ''}
            phone={tenant?.phone ?? null}
          />

          {/* Lessor */}
          <SectionHeader title="Lessor" />
          <PartyBlock
            name={manager?.company_name?.trim() || manager?.full_name || 'Landlord'}
            email={manager?.email ?? ''}
            phone={manager?.phone ?? null}
          />

          {/* Body — verbatim from generateLeaseText, formatted as flowing document */}
          <SectionHeader title="Agreement" />
          <pre className="whitespace-pre-wrap text-[13px]" style={{ fontFamily: 'Georgia, "Times New Roman", serif', lineHeight: 1.7 }}>
{leaseText}
          </pre>

          {/* State-specific notes — separate styled block */}
          {stateNotes && (
            <>
              <SectionHeader title={`${stateNotes.name} state-specific notes`} />
              <div className="text-sm space-y-1.5">
                <p><strong>Security-deposit rule:</strong> {stateNotes.security_deposit_cap}</p>
                <p><strong>Late-fee rule:</strong> {stateNotes.late_fee_rule}</p>
                <p><strong>Termination notice (month-to-month):</strong> {stateNotes.termination_notice}</p>
                <div className="mt-3">
                  <p><strong>Required disclosures:</strong></p>
                  <ul className="list-disc pl-6 mt-1 space-y-1">
                    {stateNotes.required_disclosures.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          )}

          {/* Signatures — one card per lessee plus the lessor */}
          <SectionHeader title="Signatures" />
          <div className="grid grid-cols-2 gap-6 mt-2 print:break-inside-avoid">
            <SignatureCard
              label="Lessor"
              name={manager?.full_name ?? 'Landlord'}
              email={manager?.email ?? ''}
              record={managerSig}
            />
            {(allTenants.length > 0 ? allTenants : (tenant ? [tenant] : [])).map((t, i, arr) => {
              // Match the signature by signer_id when possible — falls back to
              // the first tenant signature for legacy single-tenant data.
              const ownSig = signatures.find((s) => s.signer_role === 'tenant' && s.signer_id === t.id)
                ?? (arr.length === 1 ? signatures.find((s) => s.signer_role === 'tenant') : undefined)
              return (
                <SignatureCard
                  key={t.id}
                  label={arr.length > 1 ? `Lessee #${i + 1}` : 'Lessee'}
                  name={t.full_name ?? t.email ?? 'Tenant'}
                  email={t.email ?? ''}
                  record={ownSig}
                />
              )
            })}
          </div>

          {/* Footer */}
          <div className="mt-12 pt-6 border-t border-gray-200 text-xs text-mute text-center font-sans">
            <p>Generated by {BRAND.name} · {BRAND.domain}</p>
          </div>
        </div>
      </div>

      {/* Print CSS — minimize browser headers, paper-style page */}
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

// ── Subcomponents ────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="mt-8 mb-3 text-lg font-semibold italic border-b border-gray-300 pb-1.5" style={{ fontFamily: 'Georgia, serif' }}>
      § {title}
    </h2>
  )
}

function TermRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-gray-100 py-1.5">
      <span className="font-semibold">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}

function PartyBlock({ name, email, phone }: { name: string; email: string; phone: string | null }) {
  return (
    <div className="text-sm bg-gray-50 border border-gray-200 rounded p-3 max-w-md">
      <div className="grid grid-cols-[80px_1fr] gap-y-1">
        <span className="font-semibold">Name</span><span>{name}</span>
        {email && (<><span className="font-semibold">E-mail</span><span>{email}</span></>)}
        {phone && (<><span className="font-semibold">Phone</span><span>{phone}</span></>)}
      </div>
    </div>
  )
}

function SignatureCard({
  label, name, email, record,
}: {
  label: string
  name: string
  email: string
  record: SignatureRecord | undefined
}) {
  if (record?.signature_data) {
    return (
      <div className="border border-gray-300 rounded-lg p-3 bg-white">
        <p className="text-xs uppercase tracking-wider text-mute font-semibold font-sans mb-2">{label}</p>
        <img src={record.signature_data} alt={`${name} signature`} className="h-14 mb-2 object-contain" />
        <p className="text-sm font-semibold">{name}</p>
        <p className="text-xs text-mute font-sans mt-1">
          Secure electronic signature
        </p>
        <p className="text-xs text-mute font-sans">
          {email}
        </p>
        <p className="text-xs text-mute font-sans mt-1">
          {new Date(record.signed_at).toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </p>
        {record.ip_address && (
          <p className="text-[10px] text-mute font-sans mt-1">IP {record.ip_address}</p>
        )}
      </div>
    )
  }
  return (
    <div className="border border-dashed border-gray-300 rounded-lg p-3 bg-gray-50">
      <p className="text-xs uppercase tracking-wider text-mute font-semibold font-sans mb-2">{label}</p>
      <div className="h-14 border-b border-gray-400 mb-2" />
      <p className="text-sm font-semibold">{name}</p>
      <p className="text-xs text-mute font-sans italic">Awaiting signature</p>
    </div>
  )
}

function fmtDate(d: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function money(v: number | string | null | undefined) {
  if (v == null || v === '') return '$0.00'
  return `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

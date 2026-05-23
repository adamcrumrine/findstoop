import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, UserCircle, Phone, Mail, BadgeCheck, AlertCircle, Briefcase, ShieldAlert, Home, Calendar, FileText, MessageSquare, type LucideIcon } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatUsd } from '@findstoop/shared/lib/format'
import type { Profile } from '@findstoop/shared/types/profile'
import type { Lease } from '@findstoop/shared/types/lease'

interface LeaseWithProperty extends Lease {
  unit?: {
    unit_number: string | null
    properties?: { name: string | null; address: string | null; city: string | null; state: string | null; zip: string | null } | null
  } | null
}

export default function TenantDetail() {
  const { id } = useParams<{ id: string }>()
  const [tenant, setTenant] = useState<Profile | null>(null)
  const [leases, setLeases] = useState<LeaseWithProperty[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [profileRes, leasesRes] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', id).eq('role', 'tenant').maybeSingle(),
          supabase.from('leases').select('*, unit:units(unit_number, properties(name, address, city, state, zip))').eq('tenant_id', id).order('created_at', { ascending: false }),
        ])
        if (cancelled) return
        if (profileRes.error) throw profileRes.error
        if (!profileRes.data) throw new Error('Tenant not found or you don\'t have permission to view this profile.')
        setTenant(profileRes.data as Profile)
        if (leasesRes.error) throw leasesRes.error
        setLeases((leasesRes.data ?? []) as unknown as LeaseWithProperty[])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load tenant')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-mute">
        <Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} />
      </div>
    )
  }

  if (error || !tenant) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <AlertCircle className="w-8 h-8 text-mute mx-auto mb-2" strokeWidth={1.5} />
        <p className="text-mute">{error ?? 'Tenant not found.'}</p>
        <Link to="/manager/tenants" className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 mt-4">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
          Back to tenants
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Link to="/manager/tenants" className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink mb-4">
        <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
        Back to tenants
      </Link>

      {/* Header card with avatar */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6 mb-4">
        <div className="flex items-start gap-4">
          <div className="shrink-0">
            {tenant.avatar_url ? (
              <img
                src={tenant.avatar_url}
                alt={tenant.full_name ?? 'Tenant'}
                className="w-20 h-20 rounded-full object-cover border-2 border-gray-200"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-brand-50 border-2 border-gray-200 inline-flex items-center justify-center">
                <UserCircle className="w-10 h-10 text-brand-500" strokeWidth={1.5} />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-ink">{tenant.full_name ?? '—'}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-mute">
              {tenant.email && (
                <a href={`mailto:${tenant.email}`} className="inline-flex items-center gap-1 hover:text-ink">
                  <Mail className="w-3.5 h-3.5" strokeWidth={1.75} /> {tenant.email}
                </a>
              )}
              {tenant.phone && (
                <a href={`tel:${tenant.phone}`} className="inline-flex items-center gap-1 hover:text-ink">
                  <Phone className="w-3.5 h-3.5" strokeWidth={1.75} /> {tenant.phone}
                </a>
              )}
            </div>
            {tenant.about_me && (
              <p className="text-sm text-ink mt-3 leading-relaxed whitespace-pre-line">{tenant.about_me}</p>
            )}
          </div>
          <Link
            to={`/manager/messages?tenantId=${tenant.id}`}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium"
            title="Open 1:1 chat"
          >
            <MessageSquare className="w-4 h-4" strokeWidth={1.75} />
            Message
          </Link>
        </div>
      </section>

      {/* Bio */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6 mb-4">
        <h2 className="text-xs uppercase tracking-wider text-mute font-semibold mb-4">Tenant bio</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
          <InfoRow Icon={Calendar} label="Date of birth" value={fmtDate(tenant.date_of_birth ?? null)} />
          <InfoRow Icon={BadgeCheck} label="Monthly income" value={tenant.monthly_income != null ? formatUsd(Number(tenant.monthly_income)) : null} />
          <InfoRow Icon={Briefcase} label="Employer" value={tenant.employer ?? null} />
          <InfoRow Icon={Phone} label="Employer phone" value={tenant.employer_phone ?? null} />
          <InfoRow Icon={ShieldAlert} label="Emergency contact" value={tenant.emergency_contact_name ?? null}
            sub={tenant.emergency_contact_relationship ?? null} />
          <InfoRow Icon={Phone} label="Emergency phone" value={tenant.emergency_contact_phone ?? null} />
          <InfoRow Icon={Home} label="Previous address" value={tenant.previous_address ?? null} fullWidth />
        </dl>
        {!hasAnyBio(tenant) && (
          <p className="text-sm text-mute italic mt-2">
            This tenant hasn't filled in any bio fields yet. They can add details from their tenant Settings page.
          </p>
        )}
      </section>

      {/* Leases */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-xs uppercase tracking-wider text-mute font-semibold mb-3">Leases</h2>
        {leases.length === 0 ? (
          <p className="text-sm text-mute">No leases yet.</p>
        ) : (
          <div className="space-y-2">
            {leases.map((l) => {
              const prop = l.unit?.properties
              return (
                <Link
                  key={l.id}
                  to={`/manager/review-lease/${l.id}`}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-gray-100 hover:bg-gray-50 hover:border-gray-200"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink truncate">
                      {prop?.name ?? 'Property'} · Unit {l.unit?.unit_number ?? '—'}
                    </p>
                    <p className="text-xs text-mute mt-0.5">
                      {fmtDate(l.start_date)} → {fmtDate(l.end_date)} · {formatUsd(Number(l.rent_amount))}/mo · {l.status}
                    </p>
                  </div>
                  <FileText className="w-4 h-4 text-mute shrink-0" strokeWidth={1.75} />
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function InfoRow({
  Icon,
  label,
  value,
  sub,
  fullWidth,
}: {
  Icon: LucideIcon
  label: string
  value: string | null | undefined
  sub?: string | null
  fullWidth?: boolean
}) {
  return (
    <div className={fullWidth ? 'sm:col-span-2' : ''}>
      <dt className="text-xs uppercase tracking-wider text-mute font-semibold inline-flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
        {label}
      </dt>
      <dd className="text-ink mt-1">
        {value ? (
          <>
            {value}
            {sub && <span className="text-mute text-xs ml-1.5">({sub})</span>}
          </>
        ) : (
          <span className="text-mute italic">—</span>
        )}
      </dd>
    </div>
  )
}

function hasAnyBio(p: Profile): boolean {
  return !!(p.date_of_birth || p.employer || p.employer_phone || p.monthly_income ||
    p.emergency_contact_name || p.emergency_contact_phone || p.previous_address || p.about_me)
}

function fmtDate(d: string | null): string | null {
  if (!d) return null
  // Treat YYYY-MM-DD as a local date, not UTC, so we don't drift a day.
  const [y, m, day] = d.split('-').map(Number)
  if (!y || !m || !day) return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

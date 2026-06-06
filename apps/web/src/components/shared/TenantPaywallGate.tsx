// Tenant-side paywall gate.
//
// When a tenant has any fully-signed lease but their landlord's Stoop
// subscription is not active, the tenant portal is locked behind this gate.
// Tenant features tied to the executed lease (pay rent, sign documents,
// maintenance, messages, documents) are blocked until the landlord
// completes billing setup.
//
// If the tenant has no signed lease yet (typical for new accounts before a
// landlord invites them onto a lease), the gate does not fire — the portal
// renders normally.

import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { Loader2, Mail, RefreshCw } from 'lucide-react'

interface GateState {
  loading: boolean
  hasSignedLease: boolean
  landlordBillingActive: boolean
  landlordName: string | null
  landlordEmail: string | null
  propertyName: string | null
}

const initial: GateState = {
  loading: true,
  hasSignedLease: false,
  landlordBillingActive: true,
  landlordName: null,
  landlordEmail: null,
  propertyName: null,
}

export default function TenantPaywallGate({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()
  const [state, setState] = useState<GateState>(initial)

  const refresh = async () => {
    if (!profile?.id) { setState({ ...initial, loading: false }); return }
    setState((s) => ({ ...s, loading: true }))

    // Pull the tenant's signed leases. Include landlord contact + property
    // name so the gate can show "your landlord is finalizing billing" with
    // names, not anonymous text.
    const { data: leaseRows } = await supabase
      .from('leases')
      .select(`
        id,
        signed_at,
        unit:units(unit_number, property:properties(name, manager_id))
      `)
      .eq('tenant_id', profile.id)
      .not('signed_at', 'is', null)
      .limit(1)

    const hasSignedLease = (leaseRows?.length ?? 0) > 0

    if (!hasSignedLease) {
      setState({ ...initial, loading: false, hasSignedLease: false, landlordBillingActive: true })
      return
    }

    // Resolve landlord billing status + landlord contact for messaging.
    const lease = (leaseRows![0] as unknown as {
      id: string
      unit?: { unit_number?: string; property?: { name?: string; manager_id?: string } } | null
    })
    const managerId = lease.unit?.property?.manager_id
    const propertyName = lease.unit?.property?.name ?? null

    const [billingRes, mgrRes] = await Promise.all([
      supabase.rpc('tenant_landlord_subscription_active'),
      managerId
        ? supabase.from('profiles').select('full_name, email, company_name').eq('id', managerId).maybeSingle()
        : Promise.resolve({ data: null }),
    ])
    const mgrProfile = (mgrRes as { data?: { full_name?: string | null; email?: string | null; company_name?: string | null } | null }).data

    setState({
      loading: false,
      hasSignedLease: true,
      landlordBillingActive: Boolean(billingRes.data),
      landlordName: mgrProfile?.company_name?.trim() || mgrProfile?.full_name || null,
      landlordEmail: mgrProfile?.email ?? null,
      propertyName,
    })
  }

  useEffect(() => {
    refresh()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  // Initial load — render children to avoid a flash; their own loading states
  // will handle the spin.
  if (state.loading) return <>{children}</>

  // No signed lease, or landlord billing is active — portal renders normally.
  if (!state.hasSignedLease || state.landlordBillingActive) return <>{children}</>

  // Gate fires.
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-lg w-full bg-white rounded-2xl border border-gray-200 p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-amber-50 border border-amber-200 mx-auto flex items-center justify-center mb-4">
          <Loader2 className="w-6 h-6 text-amber-700 animate-spin" strokeWidth={1.75} />
        </div>
        <h1 className="text-xl font-semibold text-ink">
          {state.landlordName ?? 'Your landlord'} is finishing Stoop setup
        </h1>
        <p className="text-sm text-mute mt-2 leading-relaxed">
          Your lease{state.propertyName ? ` at ${state.propertyName}` : ''} has been signed, but
          {' '}{state.landlordName ? state.landlordName : 'your landlord'} still needs to complete their Stoop
          billing setup before the rest of the portal opens up. As soon as they do, you'll get access to rent
          payments, your lease document, and maintenance requests.
        </p>

        {state.landlordEmail && (
          <div className="mt-5 inline-flex items-center gap-2 text-xs text-mute bg-gray-50 border border-gray-200 px-3 py-2 rounded-lg">
            <Mail className="w-3.5 h-3.5" strokeWidth={1.75} />
            Reach your landlord: <a href={`mailto:${state.landlordEmail}`} className="text-brand-700 hover:underline">{state.landlordEmail}</a>
          </div>
        )}

        <div className="mt-6 flex gap-3 justify-center flex-wrap">
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink bg-white border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-lg"
          >
            <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} />
            Check again
          </button>
          <button
            type="button"
            onClick={() => signOut().catch(() => {})}
            className="text-sm font-medium text-mute hover:text-ink px-4 py-2"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}

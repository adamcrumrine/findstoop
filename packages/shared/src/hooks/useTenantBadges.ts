import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { getUnreadMessageCount } from '../api/messages'

// Aggregates the small "unread" signals the tenant bottom-nav needs:
//   • messages   — any conversation has new messages since last_read_at
//   • documents  — any documents.created_at > profiles.documents_seen_at
// Realtime-subscribed so the dot disappears the moment the tenant lands on
// the page that clears it.
export interface TenantBadges {
  messages: boolean
  documents: boolean
  refresh: () => Promise<void>
}

export function useTenantBadges(tenantId: string | undefined): TenantBadges {
  const [messages, setMessages] = useState(false)
  const [documents, setDocuments] = useState(false)

  const refresh = useCallback(async () => {
    if (!tenantId) { setMessages(false); setDocuments(false); return }

    const unreadMsgs = await getUnreadMessageCount(tenantId)
    setMessages(unreadMsgs > 0)

    // Documents: compare documents on leases the tenant is on vs. seen_at.
    const { data: profile } = await supabase
      .from('profiles')
      .select('documents_seen_at')
      .eq('id', tenantId)
      .maybeSingle()
    const seenAt = (profile as { documents_seen_at: string | null } | null)?.documents_seen_at ?? '1970-01-01'

    // Both routes onto a lease: the legacy primary column AND the junction
    // table. Reading only leases.tenant_id meant a roommate never saw a
    // document badge — on a four-person lease that is three tenants told
    // nothing. Same gap the RLS policies closed with is_lease_party.
    const [primaryRes, coTenantRes] = await Promise.all([
      supabase.from('leases').select('id').eq('tenant_id', tenantId),
      supabase.from('lease_tenants').select('lease_id').eq('tenant_id', tenantId),
    ])
    const leaseIds = Array.from(new Set([
      ...((primaryRes.data ?? []) as Array<{ id: string }>).map((l) => l.id),
      ...((coTenantRes.data ?? []) as Array<{ lease_id: string }>).map((r) => r.lease_id),
    ]))
    if (leaseIds.length === 0) { setDocuments(false); return }

    const { count } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .in('lease_id', leaseIds)
      .gt('created_at', seenAt)
    setDocuments((count ?? 0) > 0)
  }, [tenantId])

  useEffect(() => { void refresh() }, [refresh])

  // Realtime: refresh on any new message or any new document.
  useEffect(() => {
    if (!tenantId) return
    const channel = supabase
      .channel(`tenant-badges:${tenantId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => { void refresh() })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'documents' }, () => { void refresh() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [tenantId, refresh])

  return { messages, documents, refresh }
}

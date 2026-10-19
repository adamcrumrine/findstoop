// Multi-tenant lease signing: who was emailed, and who still has to sign.
// A lease with roommates needs every one of them to sign (see
// 20261019000003_all_tenants_sign.sql), not just the legacy primary.

import { supabase } from './supabase'

/** What notify-tenant-lease-ready returns on success. */
export interface SendForSignatureResult {
  sent?: string[]
  failed?: string[]
  noEmail?: string[]
}

/**
 * Toast copy for a send. The function emails each tenant who hasn't signed;
 * an older deployment returns no `sent` list, so fall back to the one name
 * the caller knows.
 */
export function sendForSignatureMessages(
  result: SendForSignatureResult | null | undefined,
  fallbackName: string,
): { success: string; warning: string | null } {
  const sent = result?.sent ?? []
  const who = sent.length === 0 ? fallbackName
    : sent.length <= 2 ? sent.join(' and ')
    : `${sent.length} tenants`
  const problems = [
    ...(result?.noEmail ?? []).map((n) => `${n} has no email on file`),
    ...(result?.failed ?? []).map((f) => `couldn't email ${f}`),
  ]
  return {
    success: `Lease sent to ${who} for signature`,
    warning: problems.length > 0 ? `Not sent to everyone: ${problems.join('; ')}` : null,
  }
}

export interface SignerStatus {
  tenant_id: string
  full_name: string | null
  email: string | null
  signed_at: string | null
}

/**
 * Required tenant signers per lease, with whether each has signed. Null when
 * the lookup fails, so callers can fall back to role-only signature checks.
 */
export async function fetchSigningStatus(leaseIds: string[]): Promise<Record<string, SignerStatus[]> | null> {
  if (leaseIds.length === 0) return {}
  const { data, error } = await supabase.rpc('lease_signing_status', { p_lease_ids: leaseIds })
  if (error) return null
  const byLease: Record<string, SignerStatus[]> = {}
  for (const row of (data ?? []) as Array<SignerStatus & { lease_id: string }>) {
    const { lease_id, ...signer } = row
    ;(byLease[lease_id] ??= []).push(signer)
  }
  return byLease
}

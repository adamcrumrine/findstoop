// Landlord co-brand for the public renter tools.
//
// A manager gets one shareable ?ref=<code> link (Renter Check / Deposit Check).
// Branding reads through to the manager's profile (company_name + logo), so the
// only thing stored here is the code, an optional tagline, and an on/off switch.
// The public pages resolve a code to branding via get_referral_brand (anon-safe).

import { supabase } from '../lib/supabase'

export interface ReferralPartnerRow {
  code: string
  manager_id: string
  tagline: string | null
  active: boolean
  created_at: string
}

export interface ReferralBrand {
  name: string
  tagline: string | null
  logoUrl: string | null
}

/** Get (or lazily create) the signed-in manager's referral code. */
export async function ensureReferralPartner(): Promise<ReferralPartnerRow> {
  const { data, error } = await supabase.rpc('ensure_referral_partner')
  if (error) throw new Error(error.message)
  // SECURITY DEFINER function returning a table row comes back as a single object.
  return (Array.isArray(data) ? data[0] : data) as ReferralPartnerRow
}

/** Update the caller's tagline / active flag (RLS scopes to their own row). */
export async function updateReferralPartner(
  code: string,
  patch: { tagline?: string | null; active?: boolean },
): Promise<void> {
  const { error } = await supabase.from('referral_partners').update(patch).eq('code', code)
  if (error) throw new Error(error.message)
}

/** Resolve a ref code to public branding. Returns null if unknown/inactive. */
export async function getReferralBrand(code: string): Promise<ReferralBrand | null> {
  const { data, error } = await supabase.rpc('get_referral_brand', { p_code: code })
  if (error) return null
  const row = (Array.isArray(data) ? data[0] : data) as
    | { name: string; tagline: string | null; logo_url: string | null }
    | undefined
  if (!row) return null
  return { name: row.name, tagline: row.tagline, logoUrl: row.logo_url }
}

import { supabase } from '../lib/supabase'
import type { Profile } from '../types/profile'

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  return data
}

export async function getProfiles(userIds: string[]): Promise<Profile[]> {
  if (userIds.length === 0) return []
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .in('id', userIds)
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getProfileByEmail(email: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', email)
    .single()
  return data
}

export async function inviteTenant(email: string, fullName: string, applyUnitId?: string): Promise<void> {
  // Calls the invite-tenant edge function (manager JWT verified there).
  // The function admin-creates the auth user, generates a magic invite link,
  // and sends a branded email via Resend. If applyUnitId is provided, the
  // email also includes a rental-application link for that unit.
  const { data, error } = await supabase.functions.invoke('invite-tenant', {
    body: { email, fullName, applyUnitId },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
}

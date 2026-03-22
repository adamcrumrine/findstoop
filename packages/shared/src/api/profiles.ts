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

export async function inviteTenant(email: string, fullName: string): Promise<void> {
  // Uses Supabase Admin invite — calls signUp with a temporary password
  // The tenant receives an email to set their password
  const { error } = await supabase.auth.signUp({
    email,
    password: Math.random().toString(36).slice(-12) + 'Aa1!',
    options: {
      data: { role: 'tenant', full_name: fullName },
      emailRedirectTo: `${window.location.origin}/login`,
    },
  })
  if (error && !error.message.includes('already registered')) {
    throw new Error(error.message)
  }
}

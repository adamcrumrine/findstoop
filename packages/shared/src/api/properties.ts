import { supabase } from '../lib/supabase'
import type { Property } from '../types/property'

export async function getProperties(managerId: string): Promise<Property[]> {
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .eq('manager_id', managerId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

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

export async function createProperty(
  managerId: string,
  data: Omit<Property, 'id' | 'manager_id' | 'created_at' | 'require_selfie_screening' | 'require_credit_check' | 'require_criminal_check' | 'require_eviction_check'>
): Promise<Property> {
  const { data: result, error } = await supabase
    .from('properties')
    .insert({ ...data, manager_id: managerId })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return result
}

export async function updateProperty(
  id: string,
  data: Partial<Omit<Property, 'id' | 'manager_id' | 'created_at'>>
): Promise<Property> {
  const { data: result, error } = await supabase
    .from('properties')
    .update(data)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return result
}

export async function deleteProperty(id: string): Promise<void> {
  const { error } = await supabase.from('properties').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

import { supabase } from '../lib/supabase'
import type { Unit } from '../types/unit'

export async function getUnits(propertyIds: string[]): Promise<Unit[]> {
  if (propertyIds.length === 0) return []
  const { data, error } = await supabase
    .from('units')
    .select('*')
    .in('property_id', propertyIds)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getUnitsByProperty(propertyId: string): Promise<Unit[]> {
  const { data, error } = await supabase
    .from('units')
    .select('*')
    .eq('property_id', propertyId)
    .order('unit_number', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function createUnit(
  data: Omit<Unit, 'id' | 'created_at'>
): Promise<Unit> {
  const { data: result, error } = await supabase
    .from('units')
    .insert(data)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return result
}

export async function updateUnit(
  id: string,
  data: Partial<Omit<Unit, 'id' | 'created_at'>>
): Promise<Unit> {
  const { data: result, error } = await supabase
    .from('units')
    .update(data)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return result
}

export async function deleteUnit(id: string): Promise<void> {
  const { error } = await supabase.from('units').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

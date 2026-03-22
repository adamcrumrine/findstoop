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

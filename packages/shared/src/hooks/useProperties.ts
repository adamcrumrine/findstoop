import { useState, useEffect, useCallback } from 'react'
import { getProperties, createProperty, updateProperty, deleteProperty } from '../api/properties'
import type { Property } from '../types/property'

export function useProperties(managerId: string | undefined) {
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!managerId) { setLoading(false); return }
    try {
      setLoading(true)
      setError(null)
      const data = await getProperties(managerId)
      setProperties(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load properties')
    } finally {
      setLoading(false)
    }
  }, [managerId])

  useEffect(() => { load() }, [load])

  const add = async (data: Omit<Property, 'id' | 'manager_id' | 'created_at' | 'require_selfie_screening' | 'require_credit_check' | 'require_criminal_check' | 'require_eviction_check' | 'require_credit_self_disclosed'>) => {
    if (!managerId) return
    const property = await createProperty(managerId, data)
    setProperties((prev) => [property, ...prev])
    return property
  }

  const update = async (id: string, data: Partial<Omit<Property, 'id' | 'manager_id' | 'created_at'>>) => {
    const property = await updateProperty(id, data)
    setProperties((prev) => prev.map((p) => (p.id === id ? property : p)))
    return property
  }

  const remove = async (id: string) => {
    await deleteProperty(id)
    setProperties((prev) => prev.filter((p) => p.id !== id))
  }

  return { properties, loading, error, add, update, remove, reload: load }
}

import { useState, useEffect, useCallback } from 'react'
import { getUnits, getUnitsByProperty, createUnit, updateUnit, deleteUnit } from '../api/units'
import type { Unit } from '../types/unit'

export function useUnits(propertyIds: string[]) {
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const key = propertyIds.join(',')

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getUnits(propertyIds)
      setUnits(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load units')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => { load() }, [load])

  const add = async (data: Omit<Unit, 'id' | 'created_at'>) => {
    const unit = await createUnit(data)
    setUnits((prev) => [...prev, unit])
    return unit
  }

  const update = async (id: string, data: Partial<Omit<Unit, 'id' | 'created_at'>>) => {
    const unit = await updateUnit(id, data)
    setUnits((prev) => prev.map((u) => (u.id === id ? unit : u)))
    return unit
  }

  const remove = async (id: string) => {
    await deleteUnit(id)
    setUnits((prev) => prev.filter((u) => u.id !== id))
  }

  return { units, loading, error, add, update, remove, reload: load }
}

export function useUnitsByProperty(propertyId: string | null) {
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!propertyId) { setUnits([]); return }
    let cancelled = false
    setLoading(true)
    getUnitsByProperty(propertyId).then((data) => {
      if (!cancelled) { setUnits(data); setLoading(false) }
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [propertyId])

  return { units, loading }
}

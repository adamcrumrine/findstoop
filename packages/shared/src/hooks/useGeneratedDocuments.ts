import { useState, useEffect, useCallback } from 'react'
import {
  listGeneratedDocuments,
  voidDocument,
} from '../api/generatedDocuments'
import type { GeneratedDocument } from '../types/generatedDocument'

interface UseGeneratedDocumentsResult {
  documents: GeneratedDocument[]
  loading: boolean
  error: string | null
  voidDoc: (id: string, actorId: string) => Promise<void>
  reload: () => void
}

// Manager-side list of generated letters & notices, scoped by property.
export function useGeneratedDocuments(propertyIds: string[]): UseGeneratedDocumentsResult {
  const [documents, setDocuments] = useState<GeneratedDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listGeneratedDocuments(propertyIds)
      setDocuments(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [propertyIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const voidDoc = async (id: string, actorId: string) => {
    await voidDocument(id, actorId)
    setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, status: 'voided', voided_at: new Date().toISOString() } : d)))
  }

  return { documents, loading, error, voidDoc, reload: load }
}
